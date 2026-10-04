import { describe, expect, it } from "vitest";

import { normalizeTruncgilDate } from "./truncgil-date";

describe("normalizeTruncgilDate", () => {
  it("'DD-MM-YYYY HH:mm' → İstanbul ofsetli ISO", () => {
    const iso = normalizeTruncgilDate("17-05-2026 10:30");
    expect(iso).toBe("2026-05-17T10:30:00+03:00");
    expect(new Date(iso!).toISOString()).toBe("2026-05-17T07:30:00.000Z");
  });

  it("ofsetsiz ISO → +03:00 eklenir (UTC sanılmaz)", () => {
    expect(normalizeTruncgilDate("2026-05-17 10:30:15")).toBe("2026-05-17T10:30:15+03:00");
  });

  it("ofsetli ISO olduğu gibi kalır; ayrıştırılamayan → null", () => {
    expect(normalizeTruncgilDate("2026-05-17T07:30:00Z")).toBe("2026-05-17T07:30:00Z");
    expect(normalizeTruncgilDate("bozuk")).toBeNull();
  });
});
