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
