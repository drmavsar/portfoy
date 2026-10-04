// İstanbul (Europe/Istanbul, UTC+3) takvim günü hesaplayıcıları.
// `daily_snapshots.snapshot_date` ve "bugünkü değişim" kontrolleri kullanıcının
// TR yerel günüyle hizalı olmalı; ham `new Date().toISOString()` UTC döner ve
// gece yarısı civarında bir gün kayar.

const TR_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const TR_HOUR_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Istanbul",
  hour: "2-digit",
  hour12: false,
});

export function istanbulToday(now: Date = new Date()): string {
  return TR_DATE_FMT.format(now);
}

export function istanbulYesterday(now: Date = new Date()): string {
  const todayIso = istanbulToday(now);
  const d = new Date(`${todayIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function istanbulHour(now: Date = new Date()): number {
  return Number(TR_HOUR_FMT.format(now));
}

export function istanbulDateFromUnix(unixSec: number): string {
  return TR_DATE_FMT.format(new Date(unixSec * 1000));
}

/** İstanbul takvimine göre bu ayın ilk günü ("YYYY-MM-01"). */
export function istanbulMonthStart(now: Date = new Date()): string {
  return `${istanbulToday(now).slice(0, 7)}-01`;
}

/** İstanbul takvimine göre bu yılın ilk günü ("YYYY-01-01"). */
export function istanbulYearStart(now: Date = new Date()): string {
  return `${istanbulToday(now).slice(0, 4)}-01-01`;
}

/**
 * İstanbul'da bu aydan `months` ay önceki ayın ilk günü. Yıl/ay aritmetiğiyle
 * hesaplanır: `setMonth` önce çağrılıp sonra gün 1'e çekilince ayın 31'inde
 * taşma oluyor, "son 3 ay" 2 ay dönüyordu.
 */
export function istanbulMonthsAgoStart(months: number, now: Date = new Date()): string {
  const [y, m] = istanbulToday(now).split("-").map(Number);
  const idx = y * 12 + (m - 1) - months;
  const yy = Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}-01`;
}

/** "YYYY-MM-DD" tarihine gün ekle (takvim günü, saat dilimi bağımsız). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
