// XIRR — düzensiz tarihli nakit akışlarının iç verim oranı (yıllık).
//
// NPV(r) = Σ cf_i / (1 + r)^((t_i − t_0) / 365) = 0 denklemini çözer.
// Newton-Raphson hızlıdır ama kötü başlangıçta ıraksayabilir; bu yüzden önce
// işaret değişimi olan bir aralık bulunur ve Newton adımı aralık dışına
// çıkarsa ikiye bölmeye (bisection) düşülür — her zaman yakınsar.
//
// Sözleşme: yatırılan para NEGATİF, çekilen/kalan değer POZİTİF akıştır.

export interface CashFlow {
  /** "YYYY-MM-DD" */
  date: string;
  amount: number;
}

const DAY_MS = 86_400_000;

function yearFrac(from: number, to: number): number {
  return (to - from) / DAY_MS / 365;
}

/**
 * Yıllık XIRR (ör. 0.25 = %25). Hesaplanamazsa null: en az bir negatif ve
 * bir pozitif akış gerekir; tüm akışlar aynı gündeyse anlamsızdır.
 */
export function xirr(flows: CashFlow[]): number | null {
  const pts = flows
    .filter((f) => Number.isFinite(f.amount) && f.amount !== 0)
    .map((f) => ({ t: Date.parse(`${f.date}T00:00:00Z`), a: f.amount }))
    .filter((p) => Number.isFinite(p.t))
    .sort((x, y) => x.t - y.t);
  if (pts.length < 2) return null;
  if (!pts.some((p) => p.a < 0) || !pts.some((p) => p.a > 0)) return null;
  const t0 = pts[0].t;
  if (pts[pts.length - 1].t === t0) return null;

  const npv = (r: number) =>
    pts.reduce((s, p) => s + p.a / Math.pow(1 + r, yearFrac(t0, p.t)), 0);
  const dnpv = (r: number) =>
    pts.reduce((s, p) => {
      const y = yearFrac(t0, p.t);
      return s - (y * p.a) / Math.pow(1 + r, y + 1);
    }, 0);

  // İşaret değişimi olan aralığı bul (r > −1). Kısa vadede yıllık oranlar
  // çok büyük olabilir (ör. 2 haftada %10 → yıllık ~%1100), üst sınırı genişlet.
  let lo = -0.9999;
  let hi = 1;
  let fLo = npv(lo);
  let fHi = npv(hi);
  let guard = 0;
  while (fLo * fHi > 0 && guard < 60) {
    hi = hi * 2 + 1;
    fHi = npv(hi);
    guard++;
  }
  if (!(fLo * fHi <= 0) || !Number.isFinite(fHi)) return null;

  // Newton, aralık içinde kaldığı sürece; aksi halde ikiye bölme.
  let r = 0.1 < hi && 0.1 > lo ? 0.1 : (lo + hi) / 2;
  for (let i = 0; i < 200; i++) {
    const f = npv(r);
    if (Math.abs(f) < 1e-9) return r;
    if (f * fLo < 0) {
      hi = r;
    } else {
      lo = r;
      fLo = f;
    }
    const d = dnpv(r);
    let next = d !== 0 ? r - f / d : NaN;
    if (!Number.isFinite(next) || next <= lo || next >= hi) next = (lo + hi) / 2;
    if (Math.abs(next - r) < 1e-12) return next;
    r = next;
  }
  return r;
}

/** Yıllık orandan `days` günlük dönem getirisi: (1 + r)^(days/365) − 1. */
export function periodReturn(annualRate: number, days: number): number {
  return Math.pow(1 + annualRate, days / 365) - 1;
}
