/**
 * Vercel Cron — sabah TEFAS NAV ingest'i.
 *
 * TEFAS günün fiyatını sabah (~09:30 TR) yayınlıyor. Yalnız akşam koşusu
 * (`/api/cron/tefas-prices`, UTC 16:00) olduğu için Portföy ve Özet gün boyu
 * bir önceki günün NAV'ını gösteriyordu. Hobby planda bir cron günde bir kez
 * çalışabildiğinden aynı iş ayrı bir path üzerinden sabah da çalışır
 * (vercel.json: "0 7 * * *" → TR 10:00–11:00). Akşam koşusu geç yayınlanan
 * fonlar için kalır; upsert (fund_code, as_of) üzerinde olduğundan iki koşu
 * çakışmaz.
 */
import type { NextRequest } from "next/server";

import { GET as ingestTefasPrices } from "../tefas-prices/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export function GET(req: NextRequest) {
  return ingestTefasPrices(req);
}
