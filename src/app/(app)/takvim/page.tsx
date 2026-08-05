import { Icon } from "@/components/ui/icon";
import { getEconomicCalendar, type EconomicEvent } from "@/app/(app)/_lib/economic-calendar";

export const dynamic = "force-dynamic";

const IMPORTANCE_META: Record<string, { label: string; color: string; order: number }> = {
  high: { label: "Yüksek", color: "var(--negative)", order: 0 },
  mid: { label: "Orta", color: "var(--warning)", order: 1 },
  low: { label: "Düşük", color: "var(--muted)", order: 2 },
};

function importanceMeta(imp: string | null) {
  return (imp && IMPORTANCE_META[imp]) || { label: imp ?? "—", color: "var(--muted)", order: 3 };
}

function formatDateHeader(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
}

function isTodayIso(iso: string): boolean {
  return iso === new Date().toISOString().slice(0, 10);
}

export default async function TakvimPage() {
  const { events, range, ok, diag } = await getEconomicCalendar({ days: 14 });

  // Tarihe göre grupla (girişler zaten tarih+saat sıralı gelir)
  const byDate = new Map<string, EconomicEvent[]>();
  for (const e of events) {
    if (!e.date) continue;
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  }
  const dates = [...byDate.keys()].sort();

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Ekonomik Takvim</div>
          <div className="page-sub">
            Önümüzdeki 14 gün · TR · ABD · Euro Bölgesi · kaynak doviz.com
            {range && (
              <>
                {" · "}
                {formatDateHeader(range.start)} – {formatDateHeader(range.end)}
              </>
            )}
          </div>
        </div>
      </div>

      {!ok || events.length === 0 ? (
        <div className="empty">
          <div className="title">
            <Icon name="calendar" size={20} /> {ok ? "Bu dönemde kayıtlı olay yok" : "Takvim verisi alınamadı"}
          </div>
          <div style={{ marginTop: 8, lineHeight: 1.6 }} className="hint">
            {ok
              ? "Seçili aralıkta ekonomik olay bulunamadı."
              : "doviz.com ekonomik takvim servisi şu an yanıt vermiyor. Biraz sonra tekrar dene."}
          </div>
          {diag && (
            <div
              className="hint"
              style={{ marginTop: 8, fontSize: 11, fontFamily: "var(--font-mono, monospace)", opacity: 0.8 }}
            >
              teşhis: {diag}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          {dates.map((date) => {
            const dayEvents = byDate.get(date)!;
            const today = isTodayIso(date);
            return (
              <div key={date} className="card">
                <div className="card-head">
                  <div className="card-title" style={{ textTransform: "capitalize" }}>
                    {formatDateHeader(date)}
                    {today && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          color: "var(--accent)",
                          background: "color-mix(in srgb, var(--accent) 14%, transparent)",
                          padding: "2px 7px",
                          borderRadius: 100,
                        }}
                      >
                        BUGÜN
                      </span>
                    )}
                  </div>
                  <div className="card-sub">{dayEvents.length} olay</div>
                </div>
                <table className="dg">
                  <thead>
                    <tr>
                      <th style={{ width: 56 }}>Saat</th>
                      <th style={{ width: 110 }}>Ülke</th>
                      <th style={{ width: 70 }}>Önem</th>
                      <th>Olay</th>
                      <th className="num">Gerçekleşen</th>
                      <th className="num">Beklenti</th>
                      <th className="num">Önceki</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayEvents.map((e, i) => {
                      const meta = importanceMeta(e.importance);
                      return (
                        <tr key={i}>
                          <td className="tabular hint" style={{ fontSize: 12 }}>{e.time ?? "—"}</td>
                          <td style={{ fontSize: 12 }}>{e.country ?? "—"}</td>
                          <td>
                            <span
                              title={meta.label}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 11,
                                color: meta.color,
                                fontWeight: 600,
                              }}
                            >
                              <span
                                style={{ width: 8, height: 8, borderRadius: 50, background: meta.color, display: "inline-block" }}
                              />
                              {meta.label}
                            </span>
                          </td>
                          <td style={{ fontSize: 13 }}>{e.event ?? "—"}</td>
                          <td className="num tabular" style={{ fontWeight: 600 }}>{e.actual ?? "—"}</td>
                          <td className="num tabular hint">{e.forecast ?? "—"}</td>
                          <td className="num tabular hint">{e.previous ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      <div
        className="hint"
        style={{ marginTop: 18, padding: 12, background: "var(--surface-2)", borderRadius: 8, lineHeight: 1.6 }}
      >
        Kaynak: doviz.com ekonomik takvim. Önem: <b style={{ color: "var(--negative)" }}>Yüksek</b> ·{" "}
        <b style={{ color: "var(--warning)" }}>Orta</b> · <b style={{ color: "var(--muted)" }}>Düşük</b>. Saatler
        Türkiye saatiyle. 30 dk cache.
      </div>
    </div>
  );
}
