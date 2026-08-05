"use server";

// Ekonomik takvim — /api/economic-calendar (borsapy → doviz.com) endpoint'i.
// Python serverless fonksiyonu borsapy.EconomicCalendar ile veriyi çeker;
// bu server action onu tipli olarak sarar.

export interface EconomicEvent {
  date: string; // YYYY-MM-DD
  time: string | null; // "HH:MM"
  country: string | null; // "Türkiye", "ABD", ...
  importance: "low" | "mid" | "high" | string | null;
  event: string | null;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  period: string | null;
}

export interface EconomicCalendarResult {
  events: EconomicEvent[];
  range: { start: string; end: string } | null;
  countries: string[];
  ok: boolean;
  diag?: string; // hata/teşhis (doviz http durumu, parse sayısı) — UI'da gösterilir
}

const EMPTY: EconomicCalendarResult = { events: [], range: null, countries: [], ok: false };

export async function getEconomicCalendar(opts?: {
  days?: number;
  countries?: string[];
}): Promise<EconomicCalendarResult> {
  const days = Math.max(1, Math.min(45, opts?.days ?? 14));
  const countries = opts?.countries?.length ? opts.countries.join(",") : "TR,US,EU";

  // VERCEL_URL deployment'a özel korumalı olabilir; herkese açık production
  // alias tercih edilir (market-indices.ts ile aynı desen).
  const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const host = prodHost ? `https://${prodHost}` : "http://localhost:3000";

  try {
    const res = await fetch(
      `${host}/api/economic-calendar?days=${days}&countries=${encodeURIComponent(countries)}`,
      { next: { revalidate: 1800, tags: ["economic-calendar"] } },
    );
    const json = (await res.json().catch(() => null)) as {
      status?: string;
      events?: EconomicEvent[];
      range?: { start: string; end: string };
      countries?: string[];
      message?: string;
      _diag?: { doviz_status?: number; containers_found?: number; parsed?: number };
    } | null;

    if (!res.ok || !json || json.status !== "ok" || !json.events) {
      const d = json?._diag;
      const diag = json?.message
        ? `hata: ${json.message.slice(0, 200)}`
        : d
          ? `doviz http ${d.doviz_status}, container ${d.containers_found}, parse ${d.parsed}`
          : `HTTP ${res.status}`;
      console.error("[economic-calendar]", diag);
      return { ...EMPTY, diag };
    }
    return {
      events: json.events,
      range: json.range ?? null,
      countries: json.countries ?? [],
      ok: true,
      diag: json._diag
        ? `doviz http ${json._diag.doviz_status} · parse ${json._diag.parsed}`
        : undefined,
    };
  } catch (err) {
    const diag = `fetch error: ${err instanceof Error ? err.message : String(err)}`;
    console.error("getEconomicCalendar", diag);
    return { ...EMPTY, diag };
  }
}
