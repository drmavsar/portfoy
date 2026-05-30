/**
 * Manuel veya cron tetiklemeli — fund_returns_cache refresh endpoint.
 *
 * Sprint-3 PR-2: Endpoint hazır, vercel.json'a cron schedule eklenmedi.
 * Sprint-3 PR-4'te daily cron schedule (NAV ingest sonrası) eklenecek.
 *
 * Manuel:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://<host>/api/cron/fund-returns-refresh
 *
 * Yanıt: { ok, processed, upserted, skipped[], duration_ms, error? }
 */

import { NextResponse, type NextRequest } from "next/server";

import { refreshAllFundReturns } from "@/app/(app)/_lib/tefas/returns-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshAllFundReturns();
  const status = result.ok ? 200 : 500;
  return NextResponse.json(result, { status });
}
