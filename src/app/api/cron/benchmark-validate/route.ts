/**
 * Manual diagnostic — EVDS benchmark series candidate auto-discovery.
 *
 * Tüm benchmark series için 3+ aday EVDS kodu sırayla denenir; hangisi
 * veri döndürüyorsa raporlanır. Backfill (PR-A devam) öncesi sanity check.
 *
 * Authorization: Bearer ${CRON_SECRET}.
 *
 * Kullanım:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "$URL/api/cron/benchmark-validate"
 *
 *   ?start=2024-01-01&end=2024-12-31  (override test window)
 *
 * Response: { ok, summary, results: [...] }
 */

import { NextResponse, type NextRequest } from "next/server";

import { validateAllSeries } from "@/app/(app)/_lib/benchmark/series-validator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const WRAPPER_VERSION = "2026-05-31-pr-a-benchmark-framework";

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
  const start = Date.now();
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return tag({ error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.EVDS_API_KEY ?? "";
  if (!apiKey) {
    return tag({ error: "EVDS_API_KEY missing" }, { status: 500 });
  }

  const sp = req.nextUrl.searchParams;
  const startDate = sp.get("start") ?? undefined;
  const endDate = sp.get("end") ?? undefined;
  const baseUrl = process.env.EVDS_BASE_URL ?? undefined;

  const validation = await validateAllSeries({
    apiKey,
    startDate,
    endDate,
    baseUrl,
  });

  return tag(
    {
      stage: "benchmark_validate",
      ok: validation.ok,
      summary: validation.summary,
      required_failures: validation.required_failures,
      results: validation.results,
      duration_ms: Date.now() - start,
    },
    { status: validation.ok ? 200 : 422 },
  );
}
