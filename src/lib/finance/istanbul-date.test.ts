import { describe, expect, it } from "vitest";

import { istanbulHour, istanbulToday, istanbulYesterday, istanbulDateFromUnix } from "./istanbul-date";

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
});
