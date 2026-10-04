import { fmt } from "@/lib/finance/fmt";
import type { XirrMeasure, XirrReport, XirrRow } from "@/app/(app)/_lib/xirr-report";

/** Bir yıldan kısa sürede yıllıklandırılmış oran yanıltıcı büyür/küçülür. */
const SHORT_HORIZON_DAYS = 365;

function pctColor(v: number | null | undefined): string | undefined {
  if (v == null) return undefined;
  return v >= 0 ? "var(--positive)" : "var(--negative)";
}

/** Oran → "+12,3%" (fmt.pct işareti kendisi ekler). */
function signedPct(v: number): string {
  return fmt.pct(v * 100, 1);
}

/** Hücre: dönem getirisi büyük, yıllık oran küçük (kısa vadede ikincil). */
function MeasureCell({ m, days, title }: { m: XirrMeasure | null; days: number; title?: string }) {
  if (!m) {
    return (
      <td className="num tabular hint" title={title}>
        —
      </td>
    );
  }
  const short = days < SHORT_HORIZON_DAYS;
  return (
    <td className="num tabular" title={title}>
      <div style={{ fontWeight: 650, color: pctColor(short ? m.period : m.annual) }}>
        {signedPct(short ? m.period : m.annual)}
      </div>
      <div className="hint" style={{ fontSize: 10 }}>
        {short ? `yıllık ${signedPct(m.annual)}` : `dönem ${signedPct(m.period)}`}
      </div>
    </td>
  );
}

function kindLabel(r: XirrRow): string {
  if (r.kind === "total") return "";
  return r.kind === "person" ? "kişi" : "portföy";
}

export function XirrTab({ data }: { data: XirrReport }) {
  const { rows, cpiStale, cpiLatest } = data;
  const total = rows.find((r) => r.kind === "total");
  const short = total ? total.days < SHORT_HORIZON_DAYS : true;
  const realTitle = cpiStale
    ? `TÜFE verisi güncel değil (son dönem: ${cpiLatest ?? "yok"}). TÜFE güncellenince reel getiri hesaplanır.`
    : "Her akış o ayın TÜFE endeksine bölünür (bir ay yayın gecikmesiyle).";

  return (
    <div>
      {data.unmatchedSells.length > 0 && (
        <div
          className="card"
          style={{ padding: 16, marginBottom: 18, borderLeft: "3px solid var(--warning)" }}
        >
          <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 6 }}>
            Eşleşmeyen satış ({data.unmatchedSells.length}) — veri girişini kontrol et
          </div>
          <div className="hint" style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>
            Bu satışlardan önce aynı portföyde yeterli alım kaydı yok (alım hiç girilmemiş, başka portföye
            girilmiş ya da bedelsiz hisse/yazım hatası nedeniyle fazla satış). Gerçekleşen K/Z raporuna
            girmezler ve aşağıdaki getirileri çarpıtırlar. Eksik alımı girince otomatik düzelir.
          </div>
          <table className="dg">
            <thead>
              <tr>
                <th>Sembol</th>
                <th>Portföy</th>
                <th>Tarih</th>
                <th className="num">Satılan</th>
                <th className="num">Önceden eldeki</th>
                <th className="num">Satış tutarı</th>
              </tr>
            </thead>
            <tbody>
              {data.unmatchedSells.map((u, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{u.symbol}</td>
                  <td>{u.portfolio}</td>
                  <td className="tabular">{u.date}</td>
                  <td className="num tabular">{fmt.tr(u.soldQty, 0)}</td>
                  <td className="num tabular" style={{ color: "var(--negative)" }}>
                    {fmt.tr(u.availableQty, 0)}
                  </td>
                  <td className="num tabular">{fmt.tr(u.proceedsTry, 0)} ₺</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total && (
        <div className="grid-base grid-4" style={{ gap: 16, marginBottom: 18 }}>
          {(
            [
              ["TL (nominal)", total.tl, undefined],
              ["TÜFE'ye göre reel", total.real, realTitle],
              ["Dolar bazında", total.usd, "Her akış o günkü USD/TRY kuruyla dolara çevrilir."],
              ["Gram altın bazında", total.gold, "Her akış o günkü gram altın fiyatıyla grama çevrilir."],
            ] as const
          ).map(([label, m, title]) => (
            <div key={label} className="card" style={{ padding: 16 }} title={title}>
              <div className="hint" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {label}
              </div>
              <div
                className="tabular"
                style={{ fontSize: 24, fontWeight: 750, marginTop: 6, color: m ? pctColor(short ? m.period : m.annual) : "var(--muted)" }}
              >
                {m ? signedPct(short ? m.period : m.annual) : "—"}
              </div>
              <div className="hint" style={{ fontSize: 11, marginTop: 4 }}>
                {m
                  ? short
                    ? `${total.days} günde · yıllık ${signedPct(m.annual)}`
                    : `yıllık · ${total.days} günde ${signedPct(m.period)}`
                  : label.startsWith("TÜFE") && cpiStale
                    ? `TÜFE verisi güncel değil (son: ${cpiLatest ?? "yok"})`
                    : "veri yok"}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div className="card-title">Para Ağırlıklı Getiri (XIRR)</div>
          <div className="card-sub">İlk işlemden bugüne · {rows.length} satır</div>
        </div>
        <table className="dg">
          <thead>
            <tr>
              <th>Grup</th>
              <th className="num">Yatırılan</th>
              <th className="num">Çekilen</th>
              <th className="num">Güncel Değer</th>
              <th className="num">K/Z</th>
              <th className="num">Süre</th>
              <th className="num">TL</th>
              <th className="num" title={realTitle}>Reel (TÜFE)</th>
              <th className="num">USD</th>
              <th className="num">Gram Altın</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={r.kind === "total" ? { fontWeight: 700 } : undefined}>
                <td>
                  <div style={{ fontSize: 13, fontWeight: r.kind === "total" ? 700 : 600, paddingLeft: r.kind === "portfolio" ? 14 : 0 }}>
                    {r.label}
                  </div>
                  {kindLabel(r) && <div className="hint">{kindLabel(r)}</div>}
                </td>
                <td className="num tabular">{fmt.tr(r.invested, 0)} ₺</td>
                <td className="num tabular">{r.withdrawn > 0 ? `${fmt.tr(r.withdrawn, 0)} ₺` : "—"}</td>
                <td className="num tabular">{fmt.tr(r.currentMv, 0)} ₺</td>
                <td className="num tabular" style={{ color: pctColor(r.profit), fontWeight: 600 }}>
                  {r.profit >= 0 ? "+" : ""}
                  {fmt.tr(r.profit, 0)} ₺
                </td>
                <td className="num tabular hint">{r.days} gün</td>
                <MeasureCell m={r.tl} days={r.days} />
                <MeasureCell m={r.real} days={r.days} title={realTitle} />
                <MeasureCell m={r.usd} days={r.days} />
                <MeasureCell m={r.gold} days={r.days} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          padding: "12px 16px",
          fontSize: 11,
          color: "var(--muted)",
          lineHeight: 1.7,
          background: "var(--surface-2)",
          borderRadius: 8,
        }}
      >
        <b>Nasıl hesaplanır.</b> Her alım bir para çıkışı, her satış bir para girişi, bugünkü piyasa değeri de
        son giriş sayılır; bu akışların iç verim oranı (XIRR) <b>para ağırlıklı getiridir</b>. Sonradan eklenen
        tasarruf getiriyi şişirmez (basit &quot;değer artışı&quot; ölçüsünün aksine). Reel, dolar ve altın
        sütunlarında aynı akışlar işlem günündeki TÜFE endeksi, USD kuru ve gram altın fiyatıyla çevrilir: örneğin
        &quot;dolar bazında +%5&quot;, aynı parayı aynı günlerde dolara yatırmaya göre %5 daha iyi demektir.
        {short && (
          <>
            {" "}
            <b>Not:</b> İlk işlemden bu yana bir yıldan az geçtiği için büyük rakam <i>dönem</i> getirisidir;
            yıllıklandırılmış oran kısa sürede yanıltıcı derecede büyük/küçük görünebilir.
          </>
        )}{" "}
        Temettüler akışlara dahil değildir; güncel fiyatı bulunamayan varlıklar maliyetinden değerlenir.
      </div>
    </div>
  );
}
