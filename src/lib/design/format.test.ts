import { describe, expect, it } from "vitest";

import { MINUS, dateShort, dateTR, direction, money, moneyShort, monthLong, pct } from "./format";

describe("money", () => {
  it("TL, iki hane, nokta binlik ayracı", () => {
    expect(money(1234567.89)).toBe("₺1.234.567,89");
  });
  it("negatif gerçek eksi işaretiyle", () => {
    expect(money(-1234.56)).toBe(`${MINUS}₺1.234,56`);
  });
  it("değişimde artı işareti", () => {
    expect(money(18450, { decimals: 0, sign: true })).toBe("+₺18.450");
    expect(money(0, { sign: true })).toBe("₺0,00");
  });
  it("diğer birimler", () => {
    expect(money(12345, { cur: "USD" })).toBe("$12.345,00");
    expect(money(9870.5, { cur: "EUR" })).toBe("€9.870,50");
    expect(money(125.4, { cur: "XAU" })).toBe("125,40 gr");
  });
  it("boş değer", () => {
    expect(money(null)).toBe("—");
  });
});

describe("moneyShort", () => {
  it("milyon ve bin kısaltması", () => {
    expect(moneyShort(5214300)).toBe("₺5,21 Mn");
    expect(moneyShort(-70673.25)).toBe(`${MINUS}₺70,7 B`);
    expect(moneyShort(886000)).toBe("₺886 B");
    expect(moneyShort(950)).toBe("₺950");
  });
});

describe("pct", () => {
  it("yüzde işareti sayının önünde", () => {
    expect(pct(12.4)).toBe("%12,4");
    expect(pct(3.2, { sign: true })).toBe("+%3,2");
    expect(pct(-1.8, { sign: true })).toBe(`${MINUS}%1,8`);
    expect(pct(0.35, { decimals: 2, sign: true })).toBe("+%0,35");
  });
  it("yuvarlanınca sıfır olan değer işaretsiz", () => {
    expect(pct(-0.001, { sign: true })).toBe("%0,0");
  });
});

describe("direction", () => {
  it("yön", () => {
    expect(direction(2)).toBe("up");
    expect(direction(-2)).toBe("down");
    expect(direction(0)).toBe("flat");
    expect(direction(null)).toBe("flat");
  });
});

describe("tarih", () => {
  it("biçimler", () => {
    expect(dateTR("2026-10-04")).toBe("04.10.2026");
    expect(dateShort("2026-10-04")).toBe("4 Eki");
    expect(monthLong("2026-10-04")).toBe("Ekim 2026");
  });
});
