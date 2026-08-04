import { describe, expect, it } from "vitest";

import { buildBars, priorCloseFromBars } from "./stock-prices-util";

// Yardımcı: YYYY-MM-DD → BIST seansı içi UTC epoch (saniye).
const day = (iso: string) => Math.floor(new Date(`${iso}T07:00:00Z`).getTime() / 1000);

describe("priorCloseFromBars", () => {
  it("piyasa açık + Yahoo serisinde bugünün mumu YOK (son mum = dün) → dünü döndürür", () => {
    // Bu, üretimdeki asıl hata senaryosu: eski 0.5% heuristiği canlı fiyat düne
    // yakınken yanlışlıkla 2 gün önceki kapanışı (308) baz alıyordu.
    const bars = buildBars(
      [day("2026-07-16"), day("2026-07-17"), day("2026-07-20"), day("2026-07-21")],
      [300, 305, 308, 317], // son mum = dün (07-21); bugün (07-22) seride yok
    );
    const marketTime = day("2026-07-22") + 3600; // seans içi, bugün
    expect(priorCloseFromBars(bars, marketTime)).toBe(317); // dün, 2 gün önce (308) değil
  });

  it("piyasa açık + bugünün canlı mumu VAR → yine dünü döndürür", () => {
    const bars = buildBars(
      [day("2026-07-17"), day("2026-07-20"), day("2026-07-21"), day("2026-07-22")],
      [305, 308, 317, 316], // son mum = bugün (canlı)
    );
    expect(priorCloseFromBars(bars, day("2026-07-22") + 3600)).toBe(317);
  });

  it("piyasa kapalı (son mum = bugünün kapanışı) → dünü döndürür", () => {
    const bars = buildBars(
      [day("2026-07-15"), day("2026-07-16"), day("2026-07-17")],
      [300, 310, 320],
    );
    expect(priorCloseFromBars(bars, day("2026-07-17") + 3600 * 8)).toBe(310);
  });

  it("marketTime yoksa serinin son mumu 'bugün' kabul edilir → bir öncesini döndürür", () => {
    const bars = buildBars([day("2026-07-20"), day("2026-07-21")], [310, 320]);
    expect(priorCloseFromBars(bars, null)).toBe(310);
  });

  it("yalnızca bugünün mumu varsa önceki kapanış bulunamaz → null", () => {
    const bars = buildBars([day("2026-07-22")], [316]);
    expect(priorCloseFromBars(bars, day("2026-07-22") + 3600)).toBeNull();
  });

  it("boş seri → null", () => {
    expect(priorCloseFromBars([], day("2026-07-22"))).toBeNull();
  });

  it("null close değerleri atlanır ama tarih hizası korunur", () => {
    const bars = buildBars(
      [day("2026-07-20"), day("2026-07-21"), day("2026-07-22")],
      [308, null, 316], // dünün (07-21) close'u null → atlanır
    );
    // 07-21 düştüğünden bir önceki geçerli işlem günü 07-20 (308) baz alınır.
    expect(priorCloseFromBars(bars, day("2026-07-22") + 3600)).toBe(308);
    expect(bars.map((b) => b.date)).toEqual(["2026-07-20", "2026-07-22"]);
  });
});
