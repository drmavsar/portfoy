import { describe, expect, it } from "vitest";

import { parseCanlidovizHistory } from "./canlidoviz-adapter";

// 2026-07-28 .. 07-30 (UTC gün başları). Gerçek canlidoviz yanıt şekli.
const D = (iso: string) => String(Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000));

describe("parseCanlidovizHistory", () => {
  it("OHLC dizisinden kapanışı alır, artan sıralar", () => {
    const raw = {
      [D("2026-07-30")]: "6250.0|6260.0|6240.0|6253.317",
      [D("2026-07-28")]: "6130.0|6150.0|6120.0|6138.734",
      [D("2026-07-29")]: "6190.0|6200.0|6180.0|6196.357",
    };
    const pts = parseCanlidovizHistory(raw);
    expect(pts.map((p) => p.as_of)).toEqual(["2026-07-28", "2026-07-29", "2026-07-30"]);
    expect(pts.map((p) => p.value)).toEqual([6138.734, 6196.357, 6253.317]);
  });

  it("geçersiz/sıfır kapanışları ve ts'leri atlar", () => {
    const raw: Record<string, string> = {
      [D("2026-07-28")]: "1|2|3|0", // close 0 → atla
      [D("2026-07-29")]: "1|2|3|abc", // NaN → atla
      [D("2026-07-30")]: "1|2|3|6253.3", // geçerli
      "not-a-ts": "1|2|3|100",
    };
    const pts = parseCanlidovizHistory(raw);
    expect(pts).toEqual([{ as_of: "2026-07-30", value: 6253.3 }]);
  });

  it("aynı güne birden çok ts gelirse sonuncu kazanır", () => {
    const raw = {
      [String(Number(D("2026-07-30")) + 100)]: "1|2|3|10",
      [String(Number(D("2026-07-30")) + 200)]: "1|2|3|20",
    };
    const pts = parseCanlidovizHistory(raw);
    expect(pts).toEqual([{ as_of: "2026-07-30", value: 20 }]);
  });

  it("boş yanıt → boş", () => {
    expect(parseCanlidovizHistory({})).toEqual([]);
  });
});
