import { describe, expect, it } from "vitest";

import { pickNavOnOrBefore } from "./nav-lookup";

describe("pickNavOnOrBefore", () => {
  it("Boş liste → null", () => {
    expect(pickNavOnOrBefore([], "2026-05-31")).toBeNull();
  });

  it("Tek satır + tam tarih → nav", () => {
    const rows = [{ as_of: "2026-05-31", nav: 12.34 }];
    expect(pickNavOnOrBefore(rows, "2026-05-31")).toBe(12.34);
  });

  it("Tek satır + sonraki tarih sorgusu → null (geçmiş yok)", () => {
    const rows = [{ as_of: "2026-06-15", nav: 9.99 }];
    expect(pickNavOnOrBefore(rows, "2026-05-31")).toBeNull();
  });

  it("Birden çok satır → en yakın geçmiş tarih", () => {
    const rows = [
      { as_of: "2026-05-25", nav: 11.0 },
      { as_of: "2026-05-30", nav: 12.5 },
      { as_of: "2026-06-02", nav: 13.0 },
    ];
    expect(pickNavOnOrBefore(rows, "2026-05-31")).toBe(12.5);
  });

  it("Sıralanmamış input → doğru sonuç", () => {
    const rows = [
      { as_of: "2026-05-30", nav: 12.5 },
      { as_of: "2026-05-25", nav: 11.0 },
    ];
    expect(pickNavOnOrBefore(rows, "2026-05-31")).toBe(12.5);
  });

  it("Tüm tarihler gelecekte → null", () => {
    const rows = [
      { as_of: "2026-06-01", nav: 13.0 },
      { as_of: "2026-06-15", nav: 14.0 },
    ];
    expect(pickNavOnOrBefore(rows, "2026-05-31")).toBeNull();
  });

  it("ISO timestamp formatlı input → ilk 10 char date kabul", () => {
    const rows = [{ as_of: "2026-05-30T00:00:00Z", nav: 7.7 }];
    expect(pickNavOnOrBefore(rows, "2026-05-31T15:30:00Z")).toBe(7.7);
  });

  it("Geçersiz format → null veya skip", () => {
    const rows = [{ as_of: "garbage", nav: 1 } as { as_of: string; nav: number }];
    expect(pickNavOnOrBefore(rows, "2026-05-31")).toBeNull();
  });

  it("NaN nav skip", () => {
    const rows = [
      { as_of: "2026-05-30", nav: Number.NaN },
      { as_of: "2026-05-25", nav: 9.0 },
    ];
    expect(pickNavOnOrBefore(rows, "2026-05-31")).toBe(9.0);
  });
});
