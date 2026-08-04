/**
 * Zamanlanmış günlük cron — benchmark_points tazeliği.
 *
 * benchmark-backfill yalnızca MANUEL ve EVDS tabanlı; EVDS gram altın/BIST100
 * için günlük veri vermediğinden bu seriler bayatlıyordu. Bu cron günlük çalışıp
 * son ~10 günü güncel kaynaklardan UPSERT eder:
 *   XAUTRY, USDTRY, EURTRY → canlidoviz (a.canlidoviz.com, token'sız)
 *   XU100                  → TradingView scanner (BIST:XU100 anlık kapanış)
 *
 * Güvenlik: her seri için akıl-sınırı (yanlış birim yazmasını engeller) ve
 * seri-başına zarif hata yönetimi. ?dry=1 → UPSERT yapmadan değerleri döndürür.
 *
 * Authorization: Bearer ${CRON_SECRET}. Idempotent (UPSERT).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { fetchCanlidovizSeries } from "@/app/(app)/_lib/benchmark/canlidoviz-adapter";
import { fetchTradingViewQuotes } from "@/app/(app)/_lib/tradingview-quotes";
import type { BenchmarkPoint } from "@/app/(app)/_lib/benchmark/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// Seri başına makul değer aralığı — birim hatası/bozuk veriyi reddeder.
const SANITY: Record<string, { min: number; max: number; source: "canlidoviz" | "tradingview" }> = {
  XAUTRY: { min: 100, max: 500_000, source: "canlidoviz" },
  USDTRY: { min: 1, max: 100_000, source: "canlidoviz" },
  EURTRY: { min: 1, max: 100_000, source: "canlidoviz" },
  XU100: { min: 100, max: 100_000_000, source: "tradingview" },
};

interface SeriesResult {
  series_code: string;
  source: string;
  ok: boolean;
  fetched: number;
  upserted: number;
  rejected: number;
  sample?: BenchmarkPoint[];
  error?: string;
}

/** benchmark_series'den UUID; yoksa null (yeni seri oluşturmayız — mevcutlar var). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seriesId(code: string, supabase: any): Promise<string | null> {
  const { data } = await supabase.from("benchmark_series").select("id").eq("code", code).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Missing Supabase env" }, { status: 500 });
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sp = req.nextUrl.searchParams;
  const dry = sp.get("dry") === "1";
  // Varsayılan 35 gün: kaçırılan çalışmalar veya CSV↔cron ek yerindeki boşluklar
  // (ör. 2026-07-18…07-24 gram altın) her çalışmada kendiliğinden iyileşsin.
  const days = Math.min(120, Math.max(1, Number(sp.get("days") ?? "35")));
  const triggeredBy = req.headers.get("x-triggered-by") ?? "cron";

  const today = new Date();
  const startDate = new Date(today.getTime() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  // 1) Kaynaklardan çek
  const canliCodes = ["XAUTRY", "USDTRY", "EURTRY"];
  const [canliResults, tvQuotes] = await Promise.all([
    Promise.all(
      canliCodes.map((code) => fetchCanlidovizSeries({ code, startDate, endDate }).then((r) => ({ code, r }))),
    ),
    fetchTradingViewQuotes(["XU100"]),
  ]);

  const rawByCode: Record<string, { points: BenchmarkPoint[]; error?: string }> = {};
  for (const { code, r } of canliResults) {
    rawByCode[code] = { points: r.ok ? r.points : [], error: r.ok ? undefined : r.error };
  }
  // XU100 — TradingView anlık kapanış → bugünün noktası
  const xu = tvQuotes["XU100"];
  rawByCode["XU100"] = xu
    ? { points: [{ as_of: endDate, value: xu.close }] }
    : { points: [], error: "TradingView XU100 verisi yok" };

  // 2) Akıl-sınırı + UPSERT (dry değilse)
  const results: SeriesResult[] = [];
  for (const code of Object.keys(SANITY)) {
    const bounds = SANITY[code];
    const raw = rawByCode[code] ?? { points: [] };
    const valid = raw.points.filter((p) => p.value >= bounds.min && p.value <= bounds.max);
    const rejected = raw.points.length - valid.length;

    if (valid.length === 0) {
      results.push({
        series_code: code,
        source: bounds.source,
        ok: false,
        fetched: raw.points.length,
        upserted: 0,
        rejected,
        error: raw.error ?? (raw.points.length > 0 ? "tüm noktalar akıl-sınırı dışı" : "veri yok"),
      });
      continue;
    }

    let upserted = 0;
    let error: string | undefined;
    if (!dry) {
      const sid = await seriesId(code, supabase);
      if (!sid) {
        error = "benchmark_series UUID yok";
      } else {
        const payload = valid.map((p) => ({ series_id: sid, as_of: p.as_of, value: p.value }));
        const { error: upErr, count } = await supabase
          .from("benchmark_points")
          .upsert(payload as never, { onConflict: "series_id,as_of", count: "exact" });
        if (upErr) error = upErr.message;
        else upserted = count ?? payload.length;
      }
      await supabase.from("benchmark_ingest_log").insert({
        series_code: code,
        evds_series_code: null,
        fetched_periods: raw.points.length,
        upserted,
        succeeded: !error && upserted > 0,
        error: error ?? null,
        duration_ms: Date.now() - t0,
        triggered_by: `${triggeredBy}:${bounds.source}`,
      } as never);
    }

    results.push({
      series_code: code,
      source: bounds.source,
      ok: !error && valid.length > 0,
      fetched: raw.points.length,
      upserted,
      rejected,
      sample: valid.slice(-3),
      error,
    });
  }

  const requiredOk = ["XAUTRY", "USDTRY", "EURTRY"].every((c) => results.find((r) => r.series_code === c)?.ok);
  return NextResponse.json(
    { stage: "benchmark_daily", dry, ok: requiredOk, window: { start: startDate, end: endDate }, results, duration_ms: Date.now() - t0 },
    { status: requiredOk ? 200 : 207 },
  );
}
