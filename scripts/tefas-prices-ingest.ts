/**
 * TEFAS NAV ingest — YEREL/TR makineden çalıştırılır.
 *
 * Neden: Vercel sunucuları TEFAS'a ulaşamıyor (egress "other side closed");
 * bu yüzden ne günlük cron ne de "Güncelle" butonu NAV'ı tazeleyebiliyor.
 * Bu script, TEFAS'ın kabul ettiği bir TR IP'den (kendi makinen) çalışıp
 * aktif fonların güncel NAV'ını çeker ve doğrudan Supabase `fund_prices`'a yazar.
 *
 * Kullanım:
 *   npm run tefas:prices:ingest                 # tüm aktif fonlar
 *   npm run tefas:prices:ingest -- PUK YHK      # sadece verilen kodlar
 *
 * Gerekli env (örn. .env.local içinde):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * Env dosyasıyla çalıştırmak için:
 *   npx tsx --env-file=.env.local scripts/tefas-prices-ingest.ts
 * (npm script zaten --env-file=.env.local kullanır.)
 *
 * Opsiyonel: TEFAS_PERIOD_MONTHS=1|3|6|12|36|60 (default 1).
 */

import { createClient } from "@supabase/supabase-js";

import {
  fetchTefasNav,
  type NavPriceRow,
  type TefasPeriod,
} from "../src/app/(app)/_lib/tefas/tefas-nav-fetch";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Eksik env: NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.\n" +
      "İpucu: npx tsx --env-file=.env.local scripts/tefas-prices-ingest.ts",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function parsePeriod(raw: string | undefined): TefasPeriod {
  const valid = new Set<TefasPeriod>([1, 3, 6, 12, 36, 60]);
  const n = Number(raw ?? "1");
  return valid.has(n as TefasPeriod) ? (n as TefasPeriod) : 1;
}

const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Aktif fon kodlarını DB'den çek (CLI argümanı verilmişse onları kullan). */
async function resolveCodes(): Promise<string[]> {
  const argCodes = process.argv.slice(2).map((c) => c.toUpperCase()).filter(Boolean);
  if (argCodes.length > 0) return Array.from(new Set(argCodes));

  const { data, error } = await supabase
    .from("funds")
    .select("code")
    .eq("is_active", true)
    .order("code");
  if (error) {
    console.error("funds sorgusu başarısız:", error.message);
    process.exit(2);
  }
  return ((data ?? []) as Array<{ code: string }>).map((r) => r.code);
}

/** fetchTefasNav + basit retry (TEFAS rate-limit/geçici reject'lerine karşı). */
async function fetchWithRetry(
  codes: string[],
  periodMonths: TefasPeriod,
): Promise<{ prices: NavPriceRow[]; failed: string[] }> {
  const prices: NavPriceRow[] = [];
  let remaining = [...codes];
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS && remaining.length > 0; attempt++) {
    const res = await fetchTefasNav(remaining, { periodMonths });
    prices.push(...res.prices);
    remaining = res.failed;
    if (remaining.length > 0 && attempt < RETRY_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  return { prices, failed: remaining };
}

async function main() {
  const periodMonths = parsePeriod(process.env.TEFAS_PERIOD_MONTHS);
  const codes = await resolveCodes();
  if (codes.length === 0) {
    console.error("Çekilecek fon kodu yok.");
    process.exit(0);
  }
  console.log(`TEFAS NAV çekiliyor — ${codes.length} fon (periyod ${periodMonths} ay)…`);

  const { prices, failed } = await fetchWithRetry(codes, periodMonths);

  if (prices.length > 0) {
    const payload = prices.map((p) => ({
      fund_code: p.code,
      as_of: p.as_of,
      nav: p.nav,
      source: "tefas",
      fetched_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("fund_prices")
      .upsert(payload, { onConflict: "fund_code,as_of" });
    if (error) {
      console.error("fund_prices upsert başarısız:", error.message);
      process.exit(3);
    }
  }

  console.log(`\n✅ ${prices.length}/${codes.length} fon için NAV yazıldı.`);
  if (failed.length > 0) {
    console.warn(`⚠️  NAV alınamayan ${failed.length} fon: ${failed.join(", ")}`);
  }
  // PUK gibi izlenen fonların değerini hemen göster
  for (const p of prices) {
    if (codes.length <= 10 || p.code === "PUK") {
      console.log(`   ${p.code}  NAV=${p.nav}  (${p.as_of})`);
    }
  }

  if (prices.length === 0) {
    console.error(
      "\nHİÇ NAV alınamadı. TEFAS'a bu ağdan ulaşılamıyor olabilir " +
        "(yurt dışı/bulut IP engeli). TR bir ağdan çalıştırmayı deneyin.",
    );
    process.exit(4);
  }
}

main().catch((err) => {
  console.error("ingest failed:", err);
  process.exit(99);
});
