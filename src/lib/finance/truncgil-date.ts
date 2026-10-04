// Saf yardımcı — "use server" dosyalarından ayrı (orada yalnız async export olur).

/**
 * Truncgil Update_Date → İstanbul saatli ISO ("2026-05-17T10:30:00+03:00").
 * "17-05-2026 10:30" biçimini `new Date()` ayrıştıramıyordu ("NaN gün önce");
 * ofsetsiz ISO ise UTC sanılıp 3 saat kayıyordu.
 */
export function normalizeTruncgilDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{2})[-.\/](\d{2})[-.\/](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+03:00`;
  m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+03:00`;
  return Number.isNaN(new Date(s).getTime()) ? null : s;
}
