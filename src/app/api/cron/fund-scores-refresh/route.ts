/**
 * Manuel veya cron tetiklemeli — fund_scores_cache refresh endpoint.
 *
 * Sprint-4 PR-3: endpoint hazır. vercel.json'a cron schedule eklenmedi —
 * Sprint-4 PR-4'te eklenecek (TR 21:00, returns refresh sonrası).
 *
 * Manuel:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://<host>/api/cron/fund-scores-refresh
 *
 * Yanıt: { ok, processed_funds, processed_personas, upserted,
 *          skipped[], duration_ms, error? }
 */

import { NextResponse, type NextRequest } from "next/server";

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
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
