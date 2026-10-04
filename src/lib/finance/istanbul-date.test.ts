import { describe, expect, it } from "vitest";

import {
  addDaysIso,
  istanbulDateFromUnix,
  istanbulHour,
  istanbulMonthStart,
  istanbulMonthsAgoStart,
  istanbulToday,
  istanbulYearStart,
  istanbulYesterday,
} from "./istanbul-date";

describe("istanbul-date", () => {
  it("UTC gece yarısından önce ama TR bir sonraki gündeyse TR tarihi döner", () => {
    // 2026-05-26 22:30 UTC = 2026-05-27 01:30 TR
    const now = new Date("2026-05-26T22:30:00Z");
    expect(istanbulToday(now)).toBe("2026-05-27");
    expect(istanbulYesterday(now)).toBe("2026-05-26");
  });

  it("UTC öğleden sonra ama TR aynı gün", () => {
    // 2026-05-26 14:00 UTC = 2026-05-26 17:00 TR
    const now = new Date("2026-05-26T14:00:00Z");
    expect(istanbulToday(now)).toBe("2026-05-26");
    expect(istanbulYesterday(now)).toBe("2026-05-25");
  });

  it("UTC ay sonu ve TR ay başında doğru atlar", () => {
    // 2026-05-31 22:00 UTC = 2026-06-01 01:00 TR
    const now = new Date("2026-05-31T22:00:00Z");
    expect(istanbulToday(now)).toBe("2026-06-01");
    expect(istanbulYesterday(now)).toBe("2026-05-31");
  });

  it("istanbulHour TR yerel saatini döner", () => {
    // 2026-05-26 20:00 UTC = 2026-05-26 23:00 TR
    expect(istanbulHour(new Date("2026-05-26T20:00:00Z"))).toBe(23);
    // 2026-05-26 06:00 UTC = 2026-05-26 09:00 TR
    expect(istanbulHour(new Date("2026-05-26T06:00:00Z"))).toBe(9);
  });

  it("istanbulDateFromUnix unix saniyesinden TR tarihi çıkarır", () => {
    // 2026-05-26 22:00 UTC = 2026-05-27 01:00 TR
    const unix = new Date("2026-05-26T22:00:00Z").getTime() / 1000;
    expect(istanbulDateFromUnix(unix)).toBe("2026-05-27");
  });

  it("ay başı/yıl başı İstanbul takvimine göre (UTC gece 00-03 kayması yok)", () => {
    // 2026-09-30 22:30 UTC = 2026-10-01 01:30 TR → "Bu Ay" Ekim olmalı
    const now = new Date("2026-09-30T22:30:00Z");
    expect(istanbulMonthStart(now)).toBe("2026-10-01");
    // 2025-12-31 21:30 UTC = 2026-01-01 00:30 TR
    expect(istanbulYearStart(new Date("2025-12-31T21:30:00Z"))).toBe("2026-01-01");
  });

  it("N ay önceki ay başı — ayın 31'inde taşma yok", () => {
    // 31 Ağustos: "son 3 ay" = Haziran başı (setMonth taşmasıyla Temmuz çıkıyordu)
    const aug31 = new Date("2026-08-31T09:00:00Z");
    expect(istanbulMonthsAgoStart(2, aug31)).toBe("2026-06-01");
    // 31 Ekim: 11 ay önce = 2025-11-01
    const oct31 = new Date("2026-10-31T09:00:00Z");
    expect(istanbulMonthsAgoStart(11, oct31)).toBe("2025-11-01");
    // Yıl geçişi
    expect(istanbulMonthsAgoStart(3, new Date("2026-02-15T09:00:00Z"))).toBe("2025-11-01");
    expect(istanbulMonthsAgoStart(0, oct31)).toBe("2026-10-01");
  });

  it("addDaysIso takvim günü ekler", () => {
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });
});
