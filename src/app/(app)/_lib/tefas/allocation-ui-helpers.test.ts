import { describe, expect, it } from "vitest";

import {
  actionChipConfig,
  buildTradePrefillHref,
  flagSeverityStyle,
  suggestQuantityFromDelta,
} from "./allocation-ui-helpers";

describe("actionChipConfig", () => {
  it("EKLEME → chip-acc", () => {
    const c = actionChipConfig("EKLEME");
    expect(c.label).toBe("EKLEME");
    expect(c.className).toContain("chip-acc");
  });
  it("AZALTMA → chip-warn", () => {
    const c = actionChipConfig("AZALTMA");
    expect(c.label).toBe("AZALTMA");
    expect(c.className).toContain("chip-warn");
  });
  it("TUT → chip-pos", () => {
    const c = actionChipConfig("TUT");
    expect(c.label).toBe("TUT");
    expect(c.className).toContain("chip-pos");
  });
  it("Yasaklı kelime içermez (al/sat/tavsiye)", () => {
    for (const a of ["EKLEME", "AZALTMA", "TUT"] as const) {
      const c = actionChipConfig(a);
      // Türkçe çekim guard'ı buradaki "al" → "alma" tipi kelimeleri kapsamaz.
      // Direct kelime testi:
      expect(c.label).not.toBe("AL");
      expect(c.label).not.toBe("SAT");
      expect(c.label.toLowerCase()).not.toContain("tavsiye");
    }
  });
});

describe("flagSeverityStyle", () => {
  it("critical → negative", () => {
    const s = flagSeverityStyle("critical");
    expect(s.bg).toContain("negative");
    expect(s.fg).toContain("negative");
  });
  it("warn → warning", () => {
    const s = flagSeverityStyle("warn");
    expect(s.bg).toContain("warning");
  });
  it("info → surface-2/muted", () => {
    const s = flagSeverityStyle("info");
    expect(s.fg).toContain("muted");
  });
});

describe("buildTradePrefillHref", () => {
  it("Sadece side ile minimal link", () => {
    const href = buildTradePrefillHref({ fundCode: "HFI", side: "buy" });
    expect(href).toBe("/fonlar/HFI/trade?side=buy");
  });

  it("qty + price ile tam prefill", () => {
    const href = buildTradePrefillHref({
      fundCode: "hfi",
      side: "sell",
      quantity: 123.456789,
      price: 2.345678,
    });
    expect(href).toContain("/fonlar/HFI/trade?");
    expect(href).toContain("side=sell");
    expect(href).toContain("qty=123.456789");
    expect(href).toContain("price=2.345678");
  });

  it("Negatif/0/null qty düşer", () => {
    const href = buildTradePrefillHref({
      fundCode: "HFI",
      side: "buy",
      quantity: -10,
      price: 0,
    });
    expect(href).toBe("/fonlar/HFI/trade?side=buy");
  });

  it("Boş fund_code → /fonlar fallback", () => {
    expect(buildTradePrefillHref({ fundCode: "  ", side: "buy" })).toBe("/fonlar");
  });

  it("UPPERCASE normalize", () => {
    const href = buildTradePrefillHref({ fundCode: "hfi", side: "buy" });
    expect(href).toContain("/fonlar/HFI/trade");
  });

  it("Yasaklı kelime URL'de yok (al/sat literal kelime)", () => {
    // side=buy/sell English; UI dilinde forbidden değil
    const buyHref = buildTradePrefillHref({ fundCode: "HFI", side: "buy" });
    const sellHref = buildTradePrefillHref({ fundCode: "HFI", side: "sell" });
    // /fonlar yolu fonlar contain ediyor ama "tavsiye" yok:
    expect(buyHref).not.toContain("tavsiye");
    expect(sellHref).not.toContain("tavsiye");
  });
});

describe("suggestQuantityFromDelta", () => {
  it("Basit bölme", () => {
    expect(suggestQuantityFromDelta(1000, 10)).toBe(100);
  });
  it("price null → null", () => {
    expect(suggestQuantityFromDelta(1000, null)).toBeNull();
  });
  it("price 0 → null", () => {
    expect(suggestQuantityFromDelta(1000, 0)).toBeNull();
  });
  it("delta 0 → null", () => {
    expect(suggestQuantityFromDelta(0, 10)).toBeNull();
  });
  it("Negatif delta → null (caller mutlak değer geçmeli)", () => {
    expect(suggestQuantityFromDelta(-500, 10)).toBeNull();
  });
});
