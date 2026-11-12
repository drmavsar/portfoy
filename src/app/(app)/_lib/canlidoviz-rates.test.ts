import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  combineRate,
  fetchCanlidovizRates,
  parseCanlidovizLiveHtml,
  parseTrNumber,
  prevCloseFromDaily,
  validateLiveQuote,
  type CanlidovizLiveQuote,
} from "./canlidoviz-rates";

// canlidoviz.com/altin-fiyatlari yanıtından kırpılmış gerçek örnek (2026-11-12 17:46)
const FIXTURE = readFileSync(
  path.resolve(__dirname, "../../../../test-fixtures/canlidoviz-altin-fiyatlari.html"),
  "utf8",
);

describe("parseTrNumber", () => {
  it("binlik nokta, ondalık virgül", () => {
    expect(parseTrNumber("6.305,38")).toBe(6305.38);
    expect(parseTrNumber("100.984,48")).toBe(100984.48);
    expect(parseTrNumber("81,4837")).toBe(81.4837);
    expect(parseTrNumber(" 50,2631 ")).toBe(50.2631);
    expect(parseTrNumber("6.305")).toBe(6305);
    expect(parseTrNumber("%-2,09")).toBe(-2.09);
  });
  it("biçim dışı → null", () => {
    expect(parseTrNumber("")).toBeNull();
    expect(parseTrNumber("6,305.38")).toBeNull();
    expect(parseTrNumber("17:46:39")).toBeNull();
    expect(parseTrNumber("—")).toBeNull();
    expect(parseTrNumber("63.05,38")).toBeNull();
  });
});

describe("parseCanlidovizLiveHtml (gerçek sayfa örneği)", () => {
  const q = parseCanlidovizLiveHtml(FIXTURE);

  it("gram: satış amount, alış bA, önceki kapanış cp, saat", () => {
    expect(q[32]).toEqual({ selling: 6305.03, buying: 6304.06, prevClose: 6439.68, lastUpdate: "17:46:39" });
    // Sitedeki %DEĞ: %-2,09
    expect(((q[32].selling - 6439.68) / 6439.68) * 100).toBeCloseTo(-2.09, 2);
  });

  it("sikkeler: itemprop cid'den önce gelse de satış okunur", () => {
    expect(q[11]).toEqual({ selling: 10330.93, buying: 10170.09, prevClose: 10589.43, lastUpdate: "17:46:40" });
    expect(q[47].selling).toBe(20693.26);
    expect(q[14].selling).toBe(41198.12);
    expect(q[27].selling).toBe(42202.95);
    expect(q[43]).toMatchObject({ selling: 42391.36, buying: 41747.59, prevClose: 43452.07 });
  });

  it("gümüş, ons ve alış alanı olmayan USD", () => {
    expect(q[20]).toMatchObject({ selling: 81.4353, buying: 81.3545, prevClose: 83.59 });
    expect(q[81]).toMatchObject({ selling: 102601.71, lastUpdate: "17:01:27" });
    expect(q[1]).toEqual({ selling: 50.263, buying: null, prevClose: 50.2368, lastUpdate: null });
  });

  it("satışı olmayan cid atlanır; tekrar eden alanlarda ilk değer kazanır", () => {
    const html = `
      <span cid="32" dt="bA">6.304,00</span>
      <span cid="11" dt="amount">10.000,00</span><span cid="11" dt="amount">99,00</span>
      <span cid="11" cp="9.900,00" dt="changeAmount">100,00</span>
      <span cid="11" dt="lastUpdate">dün</span>`;
    const r = parseCanlidovizLiveHtml(html);
    expect(r[32]).toBeUndefined();
    expect(r[11]).toEqual({ selling: 10000, buying: null, prevClose: 9900, lastUpdate: null });
  });

  it("boş / ilgisiz HTML → boş", () => {
    expect(parseCanlidovizLiveHtml("<html><body>Bakımdayız</body></html>")).toEqual({});
  });
});

describe("validateLiveQuote", () => {
  const base: CanlidovizLiveQuote = { selling: 6305, buying: 6304, prevClose: 6440, lastUpdate: "17:46:39" };

  it("geçerli kotasyon aynen döner", () => {
    expect(validateLiveQuote("XAU", base)).toEqual(base);
  });
  it("aralık dışı satış → reddedilir (DAILY'ye düşer)", () => {
    expect(validateLiveQuote("XAU", { ...base, selling: 63.05, prevClose: null })).toBeNull();
    expect(validateLiveQuote("CEYREK", { ...base, selling: 900_000 })).toBeNull();
  });
  it("önceki kapanıştan %15'ten fazla sapma → reddedilir", () => {
    expect(validateLiveQuote("XAU", { ...base, selling: 7_500 })).toBeNull();
  });
  it("aralık dışı cp yalnız cp'yi düşürür", () => {
    expect(validateLiveQuote("XAU", { ...base, prevClose: 64.4 })).toEqual({ ...base, prevClose: null });
  });
  it("alış ≥ satış ya da çok düşük alış → makas verisi yok", () => {
    expect(validateLiveQuote("XAG", { selling: 81.48, buying: 81.48, prevClose: 83.59, lastUpdate: null })?.buying).toBeNull();
    expect(validateLiveQuote("XAU", { ...base, buying: 6400 })?.buying).toBeNull();
    expect(validateLiveQuote("XAU", { ...base, buying: 3000 })?.buying).toBeNull();
  });
});

describe("önceki kapanış ve günlük değişim", () => {
  const daily = [
    { as_of: "2026-11-09", value: 6675.77 },
    { as_of: "2026-11-10", value: 6511.259 },
    { as_of: "2026-11-11", value: 6439.675 },
  ];

  it("gün kapanmadı (son mum dün) → son mum; kapandı (son mum bugün) → sondan ikinci", () => {
    expect(prevCloseFromDaily(daily, "2026-11-12")).toBe(6439.675);
    expect(prevCloseFromDaily(daily, "2026-11-11")).toBe(6511.259);
    expect(prevCloseFromDaily([], "2026-11-12")).toBeNull();
  });

  it("canlı + cp → değişim cp'ye göre (sitedeki %DEĞ)", () => {
    const r = combineRate(
      { selling: 6305.03, buying: 6304.06, prevClose: 6439.68, lastUpdate: "17:46:39" },
      daily,
      "2026-11-12",
    );
    expect(r).toMatchObject({ rate: 6305.03, source: "live", buying: 6304.06, lastUpdate: "17:46:39" });
    expect(r?.change).toBeCloseTo(-2.0909, 3);
  });

  it("canlı, cp yok → DAILY'den önceki kapanış (gün kapanmamış / kapanmış)", () => {
    const live = { selling: 6305, buying: null, prevClose: null, lastUpdate: null };
    expect(combineRate(live, daily, "2026-11-12")?.change).toBeCloseTo(((6305 - 6439.675) / 6439.675) * 100, 6);
    expect(combineRate(live, daily, "2026-11-11")?.change).toBeCloseTo(((6305 - 6511.259) / 6511.259) * 100, 6);
    expect(combineRate(live, null, "2026-11-12")).toMatchObject({ rate: 6305, change: null, source: "live" });
  });

  it("canlı yok → DAILY son kapanış ve son iki kapanıştan değişim", () => {
    const r = combineRate(undefined, daily, "2026-11-12");
    expect(r).toMatchObject({ rate: 6439.675, source: "daily", buying: null, lastUpdate: null });
    expect(r?.change).toBeCloseTo(((6439.675 - 6511.259) / 6511.259) * 100, 6);
    expect(combineRate(undefined, null, "2026-11-12")).toBeNull();
  });
});

describe("fetchCanlidovizRates — kaynak sırası", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** DAILY yanıtı: dün ve evvelsi gün (UTC gece yarısı damgalı) */
  function dailyBody(prev: number, last: number): string {
    const day = Math.floor(Date.now() / 86_400_000) * 86_400;
    return JSON.stringify({
      [day - 2 * 86_400]: `1|1|1|${prev}`,
      [day - 86_400]: `1|1|1|${last}`,
    });
  }

  function stubFetch(live: () => Promise<Response>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("https://canlidoviz.com/")) return live();
        return new Response(dailyBody(6511.259, 6439.675), { status: 200 });
      }),
    );
  }

  it("canlı sayfa varsa fiyat canlı, alış/satış ve saat döner", async () => {
    stubFetch(async () => new Response(FIXTURE, { status: 200 }));
    const r = await fetchCanlidovizRates(["XAU", "CEYREK"]);
    expect(r.rates).toEqual({ XAU: 6305.03, CEYREK: 10330.93 });
    expect(r.sources).toEqual({ XAU: "live", CEYREK: "live" });
    expect(r.changes.XAU).toBeCloseTo(-2.0909, 3);
    expect(r.changes.CEYREK).toBeCloseTo(-2.44, 2);
    expect(r.quotes.CEYREK).toEqual({ buying: 10170.09, selling: 10330.93 });
    expect(r.lastUpdate.XAU).toBe("17:46:39");
  });

  it("canlı sayfa HTTP hatası → dünkü kapanış, uyarı loglanır", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(async () => new Response("", { status: 503 }));
    const r = await fetchCanlidovizRates(["XAU"]);
    expect(r.rates.XAU).toBe(6439.675);
    expect(r.sources.XAU).toBe("daily");
    expect(r.quotes).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("HTTP 503"));
  });

  it("canlı sayfa ağ hatası / bozuk içerik → çökmez, dünkü kapanış", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch(async () => {
      throw new Error("timeout");
    });
    expect((await fetchCanlidovizRates(["XAU"])).sources.XAU).toBe("daily");

    stubFetch(async () => new Response("<html>captcha</html>", { status: 200 }));
    const r = await fetchCanlidovizRates(["XAU"]);
    expect(r.rates.XAU).toBe(6439.675);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("eksik/geçersiz"));
  });

  it("yalnız FX istenirse canlı sayfa hiç çekilmez", async () => {
    const live = vi.fn(async () => new Response(FIXTURE, { status: 200 }));
    stubFetch(live);
    await fetchCanlidovizRates(["USD"]);
    expect(live).not.toHaveBeenCalled();
  });
});
