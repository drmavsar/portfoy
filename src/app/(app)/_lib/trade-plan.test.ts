import { describe, expect, it } from "vitest";

import { buildTradePlan } from "./trade-plan";

describe("buildTradePlan", () => {
  describe("seviyeler pozisyona (WAC) çapalı", () => {
    it("T1 = WAC + 2·ATR, T2 = WAC + 4·ATR — anlık fiyattan bağımsız", () => {
      const a = buildTradePlan(100, 105, 5, 130, null);
      const b = buildTradePlan(100, 90, 5, 130, null);
      expect(a.t1).toBe(110);
      expect(a.t2).toBe(120);
      expect(b.t1).toBe(110); // fiyat düşünce hedef de düşmüyor
      expect(b.s1).toBe(a.s1); // ...stop da düşmüyor (eski hata)
    });

    it("S1 = WAC − 1.5·ATR (iz yoksa)", () => {
      const plan = buildTradePlan(100, 105, 5, 130, null);
      expect(plan.s1).toBe(92.5);
      expect(plan.trailing).toBe(false);
    });

    it("MA20 maliyetin üstündeyse S1 = MA20 − 1·ATR'ye yükselir (iz süren stop)", () => {
      const plan = buildTradePlan(100, 140, 5, 150, 135);
      expect(plan.s1).toBe(130); // max(92.5, 135 − 5)
      expect(plan.trailing).toBe(true);
    });

    it("S2 her zaman ≤ S1 ve maliyetin en az %5 altında", () => {
      const small = buildTradePlan(100, 110, 1, 130, null);
      expect(small.s1).toBe(98.5);
      expect(small.s2).toBe(95); // min(97.5, 95, 98.5)
      const big = buildTradePlan(100, 110, 20, 130, null);
      expect(big.s1).toBe(70);
      expect(big.s2).toBe(50); // min(50, 95, 70) — S1'in altında
    });

    it("kalan RR = (T − fiyat) / (fiyat − S1); hedef aşıldıysa 0", () => {
      const plan = buildTradePlan(100, 105, 5, 130, null);
      expect(plan.rr1).toBeCloseTo(0.4, 5); // (110 − 105) / (105 − 92.5)
      expect(plan.rr2).toBeCloseTo(1.2, 5); // (120 − 105) / 12.5
      const passed = buildTradePlan(100, 115, 5, 130, null);
      expect(passed.rr1).toBe(0);
    });
  });

  describe("health durumu", () => {
    it("fiyat stopun altında → below_stop (eskiden hiç oluşamıyordu)", () => {
      const plan = buildTradePlan(100, 80, 5, 130, 95);
      expect(plan.health).toBe("below_stop");
      expect(plan.health_label).toBe("Stop Altı");
      expect(plan.health_color).toBe("var(--negative)");
    });

    it("iz süren stop kırılınca kârdaki pozisyon da below_stop olur", () => {
      const plan = buildTradePlan(100, 128, 5, 150, 135); // S1 = 130 > fiyat > WAC
      expect(plan.health).toBe("below_stop");
    });

    it("stopa 0.5 ATR'den yakın → warn_stop (maliyet altından önce)", () => {
      const plan = buildTradePlan(100, 94, 5, 130, 98); // S1 92.5, mesafe 0.3 ATR
      expect(plan.health).toBe("warn_stop");
      expect(plan.health_label).toBe("Stop Yakın");
    });

    it("current < WAC (stoptan uzak) → below_wac", () => {
      const plan = buildTradePlan(100, 97, 5, 130, 98);
      expect(plan.health).toBe("below_wac");
      expect(plan.health_label).toBe("Maliyet Altı");
      expect(plan.health_color).toBe("var(--warning)");
    });

    it("T1'e < 0.5 ATR → near_target 'Hedef Yakın'", () => {
      const plan = buildTradePlan(100, 109, 5, 130, 102);
      expect(plan.health).toBe("near_target");
      expect(plan.health_label).toBe("Hedef Yakın");
    });

    it("T1 aşıldı → near_target 'Hedef 1 Aşıldı'", () => {
      const plan = buildTradePlan(100, 112, 5, 130, 104);
      expect(plan.health).toBe("near_target");
      expect(plan.health_label).toBe("Hedef 1 Aşıldı");
    });

    it("T2 aşıldı → target_hit", () => {
      const plan = buildTradePlan(100, 140, 5, 150, 135);
      expect(plan.health).toBe("target_hit");
      expect(plan.health_label).toBe("Hedef 2 Aşıldı");
    });

    it("MA20 + %10 üstü → extended", () => {
      // ATR 15 → T1 130, T2 160 (uzak); MA20 100 → %21 extension
      const plan = buildTradePlan(100, 121, 15, 200, 100);
      expect(plan.ma20_extension_pct).toBeCloseTo(21, 0);
      expect(plan.health).toBe("extended");
    });

    it("normal durumda → healthy", () => {
      const plan = buildTradePlan(100, 110, 10, 130, 105);
      // T1 120 (1 ATR uzak), S1 = max(85, 95) = 95 (1.5 ATR uzak), ext %4.8
      expect(plan.health).toBe("healthy");
    });
  });

  describe("52W mesafe", () => {
    it("high_52w_distance_pct doğru hesaplanır", () => {
      const plan = buildTradePlan(100, 110, 5, 132, 105);
      expect(plan.high_52w_distance_pct).toBeCloseTo(20, 0); // (132-110)/110
    });

    it("high_52w null ise null döner", () => {
      const plan = buildTradePlan(100, 110, 5, null, 105);
      expect(plan.high_52w_distance_pct).toBeNull();
    });
  });

  describe("MA20 extension", () => {
    it("MA20 null → null döner", () => {
      const plan = buildTradePlan(100, 110, 5, 130, null);
      expect(plan.ma20_extension_pct).toBeNull();
    });

    it("MA20 üstünde pozitif extension", () => {
      const plan = buildTradePlan(100, 105, 5, 130, 100);
      expect(plan.ma20_extension_pct).toBeCloseTo(5, 0);
    });
  });
});
