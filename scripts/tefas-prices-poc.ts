/**
 * TEFAS NAV POC — Sprint-2 PR-1 acceptance test.
 *
 * Vercel preview deploy edilince çalıştırılır:
 *   TEFAS_BASE_URL="https://<preview>.vercel.app" npm run tefas:prices:poc
 *
 * Lokal Next dev için:
 *   TEFAS_BASE_URL="http://localhost:3000" npm run tefas:prices:poc
 *
 * 5 örnek fon için NAV çeker; sonucu konsola yazar.
 *
 * Beklenen davranış:
 *   - HFI, KMF, KPI, KIS, GUK için NAV ve tarih döner
 *   - Bilinmeyen fon kodu (XYZ_FAKE) failed[] içine düşer, hata atmaz
 *   - Yanıt 200 OK, ok=true
 */

const POC_CODES = ["HFI", "KMF", "KPI", "KIS", "GUK"];
const INVALID_CODE = "XYZ_FAKE"; // hata davranışı testi

const baseUrl = process.env.TEFAS_BASE_URL;
if (!baseUrl) {
  console.error("TEFAS_BASE_URL env var gerekli (örn. http://localhost:3000)");
  process.exit(1);
}
const base: string = baseUrl;

async function main() {
  const codes = [...POC_CODES, INVALID_CODE].join(",");
  const url = `${base.replace(/\/$/, "")}/api/tefas-prices?codes=${codes}`;
  console.log(`GET ${url}`);

  const res = await fetch(url);
  console.log(`HTTP ${res.status}`);

  if (!res.ok) {
    const body = await res.text();
    console.error("Beklenmedik statü:", body.slice(0, 500));
    process.exit(2);
  }

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  const expected = new Set(POC_CODES);
  const fetchedCodes = new Set((data.prices ?? []).map((p: { code: string }) => p.code));
  const missing = [...expected].filter((c) => !fetchedCodes.has(c));
  const failedSet = new Set(data.failed ?? []);

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
