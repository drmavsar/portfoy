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
    if (!res.ok) {
      console.error(`[economic-calendar] HTTP ${res.status}`);
      return EMPTY;
    }
    const json = (await res.json()) as {
      status: string;
      events?: EconomicEvent[];
      range?: { start: string; end: string };
      countries?: string[];
      message?: string;
    };
    if (json.status !== "ok" || !json.events) {
      console.error("[economic-calendar] error:", json.message);
      return EMPTY;
    }
    return {
      events: json.events,
      range: json.range ?? null,
      countries: json.countries ?? [],
      ok: true,
    };
  } catch (err) {
    console.error("getEconomicCalendar error", err);
    return EMPTY;
  }
}
