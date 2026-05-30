/**
 * Manuel CPI seed/import — EVDS down olduğunda fallback.
 *
 * Bearer auth. POST body: { rows: [{period_month, index_value, ...}] }
 * veya CSV (text/csv): "YYYY-MM,index_value\n2025-01,2196.96\n..."
 *
 * Manuel kullanım:
 *   curl -X POST \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"series":"CPI_TR_GENERAL","rows":[{"period_month":"2025-01","index_value":2196.96}]}' \
 *     https://<host>/api/cron/cpi-manual-import
 *
 * UPSERT: aynı (series_code, period_month) ezilir; m/m otomatik hesaplanır.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

interface CpiRow {
  period_month: string;
  index_value: number;
  is_final?: boolean;
  notes?: string;
}

function parseBody(
  contentType: string,
  body: string,
): { series_code: string; rows: CpiRow[]; error?: string } {
  const seriesDefault = "CPI_TR_GENERAL";

  if (contentType.includes("text/csv")) {
    const lines = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    const rows: CpiRow[] = [];
    for (const line of lines) {
      // ilk satır başlık olabilir
      if (/^period|month|date/i.test(line)) continue;
      const [period, idxStr] = line.split(",").map((s) => s.trim());
      const idx = Number(idxStr);
      if (!period || !Number.isFinite(idx) || idx <= 0) continue;
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
        return { series_code: seriesDefault, rows: [], error: `Geçersiz period: ${period}` };
      }
      rows.push({ period_month: period, index_value: idx });
    }
    return { series_code: seriesDefault, rows };
  }

  // JSON
  try {
    const parsed = JSON.parse(body) as {
      series?: string;
      rows?: Array<{ period_month: string; index_value: number; is_final?: boolean; notes?: string }>;
    };
    if (!Array.isArray(parsed.rows)) {
      return { series_code: seriesDefault, rows: [], error: "rows[] eksik" };
    }
    return {
      series_code: (parsed.series ?? seriesDefault).toUpperCase(),
      rows: parsed.rows.map((r) => ({
        period_month: r.period_month,
        index_value: Number(r.index_value),
        is_final: r.is_final !== false,
        notes: r.notes,
      })),
    };
  } catch (e) {
    return {
      series_code: seriesDefault,
      rows: [],
      error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Period sıralı satırlardan m/m değişimi hesapla. */
function computeMonthlyChanges(
  rows: CpiRow[],
): Array<CpiRow & { monthly_change_pct: number | null }> {
  const sorted = [...rows].sort((a, b) => a.period_month.localeCompare(b.period_month));
  const out: Array<CpiRow & { monthly_change_pct: number | null }> = [];
  let prev: number | null = null;
  for (const r of sorted) {
    const change = prev !== null && prev > 0
      ? ((r.index_value / prev) - 1) * 100
      : null;
    out.push({ ...r, monthly_change_pct: change });
    prev = r.index_value;
  }
  return out;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Missing env: SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL" },
      { status: 500 },
    );
  }

  const contentType = req.headers.get("content-type") ?? "application/json";
  const body = await req.text();
  const { series_code, rows, error } = parseBody(contentType, body);

  if (error) return NextResponse.json({ ok: false, error }, { status: 400 });
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "rows[] boş" }, { status: 400 });
  }

  const enriched = computeMonthlyChanges(rows);
  const payload = enriched.map((r) => ({
    series_code,
    period_month: r.period_month,
    index_value: r.index_value,
    monthly_change_pct: r.monthly_change_pct,
    is_final: r.is_final ?? true,
    notes: r.notes ?? null,
    source: "MANUAL",
    fetched_at: new Date().toISOString(),
  }));

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: upsertErr, count } = await supabase
    .from("cpi_monthly")
    .upsert(payload as never, {
      onConflict: "series_code,period_month",
      count: "exact",
    });

  if (upsertErr) {
    return NextResponse.json(
      { ok: false, stage: "upsert", error: upsertErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    source: "MANUAL",
    series_code,
    received: rows.length,
    upserted: count ?? payload.length,
    first_period: enriched[0]?.period_month,
    last_period: enriched[enriched.length - 1]?.period_month,
  });
}
