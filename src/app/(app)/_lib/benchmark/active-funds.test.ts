import { describe, expect, it } from "vitest";

import {
  getActiveFundsAtDateInMemory,
  isActiveAtDate,
} from "./active-funds";
import type { FundStatusEntry } from "./types";

const FIXTURE: FundStatusEntry[] = [
  // KRA: 2010 → 2026-02 aktif, sonra delisted
  { fund_code: "KRA", effective_from: "2010-01-01", effective_to: "2026-02-28", status: "active", reason: null },
  { fund_code: "KRA", effective_from: "2026-03-01", effective_to: null, status: "delisted", reason: "test" },

  // HFI: 2010'dan beri aktif (effective_to null)
  { fund_code: "HFI", effective_from: "2010-01-01", effective_to: null, status: "active", reason: null },

  // NEW: 2025-06'da yeni listing
  { fund_code: "NEW", effective_from: "2025-06-01", effective_to: null, status: "active", reason: "new_listing" },

  // SUS: 2024-01 → 2024-06 active, sonra suspended (delisted DEĞİL)
  { fund_code: "SUS", effective_from: "2024-01-01", effective_to: "2024-06-30", status: "active", reason: null },
  { fund_code: "SUS", effective_from: "2024-07-01", effective_to: null, status: "suspended", reason: "test" },
];

describe("isActiveAtDate", () => {
  it("Aktif aralıkta TRUE", () => {
    expect(isActiveAtDate(FIXTURE[0], "2024-06-15")).toBe(true);
  });

  it("Aktif aralık dışı (sonra) FALSE", () => {
    expect(isActiveAtDate(FIXTURE[0], "2026-03-15")).toBe(false);
  });

  it("Aktif aralık dışı (önce) FALSE", () => {
    expect(isActiveAtDate(FIXTURE[3], "2025-05-01")).toBe(false); // NEW (effective_from 2025-06) henüz başlamadı
  });

  it("status != active → FALSE", () => {
    expect(isActiveAtDate(FIXTURE[1], "2026-06-01")).toBe(false); // KRA delisted
    expect(isActiveAtDate(FIXTURE[5], "2024-08-01")).toBe(false); // SUS suspended
  });

  it("effective_to null + tarih effective_from'dan sonra → TRUE", () => {
    expect(isActiveAtDate(FIXTURE[1], "2030-01-01")).toBe(false); // KRA delisted
    expect(isActiveAtDate(FIXTURE[2], "2030-01-01")).toBe(true); // HFI hâlâ aktif
  });
});

describe("getActiveFundsAtDateInMemory", () => {
  it("2022-01-03: KRA aktif, HFI aktif, NEW yok, SUS aktif", () => {
    const r = getActiveFundsAtDateInMemory("2022-01-03", FIXTURE);
    expect(r).toContain("KRA");
    expect(r).toContain("HFI");
    expect(r).not.toContain("NEW");
    expect(r).not.toContain("SUS"); // SUS başlangıcı 2024-01-01
  });

  it("2024-04-01: KRA + HFI + SUS aktif", () => {
    const r = getActiveFundsAtDateInMemory("2024-04-01", FIXTURE);
    expect(r).toContain("KRA");
    expect(r).toContain("HFI");
    expect(r).toContain("SUS");
    expect(r).not.toContain("NEW");
  });

  it("2025-08-01: KRA + HFI + NEW (SUS suspended)", () => {
    const r = getActiveFundsAtDateInMemory("2025-08-01", FIXTURE);
    expect(r).toContain("KRA");
    expect(r).toContain("HFI");
    expect(r).toContain("NEW");
    expect(r).not.toContain("SUS");
  });

  it("2026-05-01: KRA delisted, HFI + NEW aktif", () => {
    const r = getActiveFundsAtDateInMemory("2026-05-01", FIXTURE);
    expect(r).not.toContain("KRA");
    expect(r).toContain("HFI");
    expect(r).toContain("NEW");
  });

  it("Boş statusHistory → []", () => {
    expect(getActiveFundsAtDateInMemory("2024-01-01", [])).toEqual([]);
  });

  it("Sıralı + unique döner", () => {
    const r = getActiveFundsAtDateInMemory("2024-04-01", FIXTURE);
    expect(r).toEqual([...r].sort());
    expect(new Set(r).size).toBe(r.length);
  });
});
