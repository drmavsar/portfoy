/**
 * Vercel Cron — fund_scores_cache günlük refresh.
 *
 * vercel.json: { schedule: "0 18 * * *" } — UTC 18:00 = TR 21:00.
 * Returns refresh TR 20:00'da; bir saat sonra skorlar.
 *
 * Authorization: Bearer ${CRON_SECRET} (cron + manuel curl).
 *
 * Akış:
 *  1. refreshAllFundScores() çağrısı
 *  2. Sonucu fund_scores_ingest_log'a INSERT (best-effort)
 *  3. Yanıt: { ok, processed_funds, processed_personas, upserted,
 *             skipped[], duration_ms, error? }
 *
 * Manuel tetikleme:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        -H "x-triggered-by: manuel" \
 *        https://<host>/api/cron/fund-scores-refresh
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { refreshAllFundScores } from "@/app/(app)/_lib/tefas/scoring-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshAllFundScores();
  const triggeredBy = req.headers.get("x-triggered-by") ?? "cron";

  // Best-effort: log yazma başarısız olursa ana sonucu bozma
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supaUrl && serviceKey) {
    const supabase = createClient(supaUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: logErr } = await supabase
      .from("fund_scores_ingest_log")
      .insert({
        duration_ms: result.duration_ms,
        processed_funds: result.processed_funds,
        processed_personas: result.processed_personas,
        upserted: result.upserted,
        skipped_count: result.skipped.length,
        skipped_codes: result.skipped,
        error: result.error ?? null,
        triggered_by: triggeredBy,
      } as never);
    if (logErr) {
      console.error("fund_scores_ingest_log insert failed:", logErr.message);
    }
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
