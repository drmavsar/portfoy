/**
 * Sprint-6 PR-D — realized_lots historical backfill.
 *
 * Mevcut sell trade'lerden realized_lots kaydı olmayanlar için
 * processSellTrade çağırır. Idempotent (processor zaten skip eder).
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 *
 * Query params:
 *   - dryRun=1     → kayıt yazma; sadece kaç sell işlenecek raporla
 *   - userId=<uuid>  → tek kullanıcıya scoped
 *   - assetId=<uuid> → tek asset'e scoped
 *   - limit=N      → max kaç sell işlensin (default 200)
 *
 * Kullanım:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "$URL/api/admin/realized-lots-backfill?dryRun=1"
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "$URL/api/admin/realized-lots-backfill"
 */

import { NextResponse, type NextRequest } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import {
  processSellTrade,
  type ProcessSellTradeResult,
} from "@/app/(app)/_lib/tefas/realized-lots-processor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const WRAPPER_VERSION = "2026-05-31-sprint-6-pr-d-realized-lots-backfill";

function tag<T extends Record<string, unknown>>(
  body: T,
  init: { status?: number } = {},
): NextResponse<T & { wrapper_version: string }> {
  return NextResponse.json(
    { ...body, wrapper_version: WRAPPER_VERSION },
    { status: init.status, headers: { "x-wrapper-version": WRAPPER_VERSION } },
  );
}

export async function GET(req: NextRequest) {
  const startTs = Date.now();
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return tag({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const dryRun = sp.get("dryRun") === "1";
  const userId = sp.get("userId") ?? null;
  const assetId = sp.get("assetId") ?? null;
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 200, 1), 1000);

  const supabase = await createServiceClient();

  // 1. Tüm sell trade'lerini çek
  let q = supabase
    .from("trades")
    .select("id, user_id, asset_id, executed_at")
    .eq("side", "sell")
    .order("executed_at", { ascending: true })
    .limit(limit);
  if (userId) q = q.eq("user_id", userId);
  if (assetId) q = q.eq("asset_id", assetId);

  const { data: sellsRaw, error: sellsErr } = await q;
  if (sellsErr) {
    return tag(
      { stage: "backfill", error: sellsErr.message, duration_ms: Date.now() - startTs },
      { status: 500 },
    );
  }
  const sells = (sellsRaw ?? []) as Array<{
    id: string;
    user_id: string;
    asset_id: string;
    executed_at: string;
  }>;

  // 2. Mevcut realized_lots olan sell ID'lerini çıkar
  const sellIds = sells.map((s) => s.id);
  const existing = new Set<string>();
  if (sellIds.length > 0) {
    const { data: existingRaw } = await supabase
      .from("realized_lots")
      .select("sell_trade_id")
      .in("sell_trade_id", sellIds);
    for (const row of (existingRaw ?? []) as Array<{ sell_trade_id: string }>) {
      existing.add(row.sell_trade_id);
    }
  }

  const pending = sells.filter((s) => !existing.has(s.id));

  if (dryRun) {
    return tag({
      stage: "backfill_dry_run",
      total_sells_scanned: sells.length,
      already_processed: sells.length - pending.length,
      pending: pending.length,
      pending_ids: pending.map((p) => p.id),
      duration_ms: Date.now() - startTs,
    });
  }

  // 3. Sırayla process et — idempotent processor zaten skip eder
  const results: ProcessSellTradeResult[] = [];
  for (const s of pending) {
    const r = await processSellTrade(supabase, s.id);
    results.push(r);
  }

  const okCount = results.filter((r) => r.ok && !r.skipped).length;
  const skippedCount = results.filter((r) => r.skipped).length;
  const errorCount = results.filter((r) => !r.ok).length;
  const totalLots = results.reduce((s, r) => s + (r.lots_written ?? 0), 0);
  const totalWithholding = results.reduce(
    (s, r) => s + (r.total_withholding_try ?? 0),
    0,
  );
  const totalPnl = results.reduce(
    (s, r) => s + (r.total_realized_pnl_try ?? 0),
    0,
  );

  return tag({
    stage: "backfill",
    total_sells_scanned: sells.length,
    already_processed: sells.length - pending.length,
    processed_now: okCount,
    skipped: skippedCount,
    errors: errorCount,
    total_lots_written: totalLots,
    total_withholding_try: Math.round(totalWithholding * 100) / 100,
    total_realized_pnl_try: Math.round(totalPnl * 100) / 100,
    results,
    duration_ms: Date.now() - startTs,
  });
}
