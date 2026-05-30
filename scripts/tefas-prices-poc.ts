/**
 * TEFAS NAV POC — Sprint-2 PR-1 acceptance test (PR-B sonrası güncellendi).
 *
 * Önceden `/api/tefas-prices` (Python) endpoint'ini çağırıyordu; artık doğrudan
 * Node TS port'unu (`fetchTefasNav`) test eder. Vercel deploy gerekmez.
 *
 * Çalıştırma:
 *   npm run tefas:prices:poc
 *
 * Opsiyonel: TEFAS_PERIOD_MONTHS=1|3|6|12|36|60 (default 1).
 *
 * Beklenen davranış:
 *   - HFI, KMF, KPI, KIS, GUK için NAV ve tarih döner
 *   - Bilinmeyen fon kodu (XYZ_FAKE) failed[] içine düşer, hata atmaz
 *   - ok=true
 */

import { fetchTefasNav, type TefasPeriod } from "../src/app/(app)/_lib/tefas/tefas-nav-fetch";

const POC_CODES = ["HFI", "KMF", "KPI", "KIS", "GUK"];
const INVALID_CODE = "XYZ_FAKE"; // hata davranışı testi

function parsePeriod(raw: string | undefined): TefasPeriod {
  const valid = new Set<TefasPeriod>([1, 3, 6, 12, 36, 60]);
  const n = Number(raw ?? "1");
  if (valid.has(n as TefasPeriod)) return n as TefasPeriod;
  console.error(`Geçersiz TEFAS_PERIOD_MONTHS=${raw}, default 1 kullanılıyor.`);
  return 1;
}

async function main() {
  const periodMonths = parsePeriod(process.env.TEFAS_PERIOD_MONTHS);
  const codes = [...POC_CODES, INVALID_CODE];
  console.log(`fetchTefasNav(${JSON.stringify(codes)}, { periodMonths: ${periodMonths} })`);

  const data = await fetchTefasNav(codes, { periodMonths });
  console.log(JSON.stringify(data, null, 2));

  const expected = new Set(POC_CODES);
  const fetchedCodes = new Set(data.prices.map((p) => p.code));
  const missing = [...expected].filter((c) => !fetchedCodes.has(c));
  const failedSet = new Set(data.failed);

  let exit = 0;
  if (data.ok !== true) {
    console.error("FAIL: ok != true");
    exit = 3;
  }
  if (missing.length > 0) {
    console.error(`WARN: NAV alınamayan beklenen fon(lar): ${missing.join(", ")}`);
  }
  if (!failedSet.has(INVALID_CODE)) {
    console.error(`FAIL: ${INVALID_CODE} failed[] içinde olmalıydı`);
    exit = 4;
  }
  if (exit === 0) {
    console.log(`✅ POC OK — ${data.succeeded}/${data.requested} fon için NAV alındı`);
  }
  process.exit(exit);
}

main().catch((err) => {
  console.error("POC failed:", err);
  process.exit(99);
});
