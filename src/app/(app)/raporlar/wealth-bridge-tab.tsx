"use client";

import { useState } from "react";

import {
  BridgeBars,
  BridgeVerdict,
  PeriodButtons,
  UntrackedNote,
  money,
  signedMoney,
  trDate,
} from "@/app/(app)/_components/wealth-bridge-view";
import type { WealthBridgeReport } from "@/app/(app)/_lib/wealth-bridge-actions";
import type { BridgeWindow } from "@/app/(app)/_lib/wealth-bridge";
import { fmt } from "@/lib/finance/fmt";

const MONTHS_LONG = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function tone(n: number): string {
  return n > 0.5 ? "delta-pos" : n < -0.5 ? "delta-neg" : "";
}

function Kpi({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="hint" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div className={`tabular ${cls ?? ""}`} style={{ fontSize: 22, fontWeight: 750, marginTop: 6 }}>
        {value}
      </div>
      {sub && (
        <div className="hint" style={{ fontSize: 12, marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Cell({ v }: { v: number }) {
  return <td className={`num tabular ${tone(v)}`}>{signedMoney(v)}</td>;
}

export function WealthBridgeTab({ data, initial = "year" }: { data: WealthBridgeReport; initial?: string }) {
  const [key, setKey] = useState(data.periods.some((p) => p.key === initial) ? initial : (data.periods[0]?.key ?? ""));
  const period = data.periods.find((p) => p.key === key) ?? data.periods[0];
  if (!period) {
    return (
      <div className="empty">
        <div className="title">Henüz yeterli servet kaydı yok</div>
        <div>Servet köprüsü için en az iki günlük servet kaydı gerekiyor; kayıtlar her gün otomatik alınıyor.</div>
      </div>
    );
  }
  const w: BridgeWindow = period.window;
  const savingsRate = w.income > 0 ? w.parts.savings / (w.income - w.dividends) : null;

  return (
    <div className="bridge-tab">
      <PeriodButtons periods={data.periods} active={period.key} onPick={setKey} />

      <div className="grid-base grid-4" style={{ gap: 12 }}>
        <Kpi label="Başlangıç" value={money(w.start.value)} sub={`${trDate(w.start.date)}${w.start.source === "manual" ? " · elle girilen yıl sonu" : ""}`} />
        <Kpi label="Bitiş" value={money(w.end.value)} sub={trDate(w.end.date)} />
        <Kpi label="Servet değişimi" value={signedMoney(w.delta)} cls={tone(w.delta)} sub={w.start.value > 0 ? `%${fmt.tr((w.delta / w.start.value) * 100, 1)}` : undefined} />
        <Kpi
          label="Net tasarruf"
          value={signedMoney(w.parts.savings)}
          cls={tone(w.parts.savings)}
          sub={savingsRate != null ? `Gelirin %${fmt.tr(savingsRate * 100, 1)} kadarı` : undefined}
        />
      </div>

      <section className="card" aria-labelledby="bridge-tab-title">
        <div className="card-head">
          <div className="card-title" id="bridge-tab-title">
            Zenginleşmenin sebebi: tasarruf mu, yatırım mı?
          </div>
        </div>
        <div className="bridge-body">
          <BridgeVerdict window={w} />
          <BridgeBars window={w} />
          <UntrackedNote window={w} />
          <p className="hint bridge-note">
            Gelir {money(w.income - w.dividends)} · gider {money(w.expense)}
            {w.dividends > 0 ? ` · temettü ${money(w.dividends)} (yatırım getirisine dahil)` : ""}
          </p>
        </div>
      </section>

      <section className="card" aria-labelledby="bridge-monthly-title">
        <div className="card-head">
          <div className="card-title" id="bridge-monthly-title">
            Ay ay kaynaklar
          </div>
          <div className="card-sub">Yeni → eski · her ay kendi başlangıç ve bitiş servetiyle</div>
        </div>
        <div className="bridge-table-wrap">
          <table className="dg bridge-table">
            <thead>
              <tr>
                <th>Dönem</th>
                <th className="num">Net tasarruf</th>
                <th className="num">Hisse ve fon</th>
                <th className="num">Döviz</th>
                <th className="num">Altın</th>
                <th className="num">Diğer</th>
                <th className="num">Değişim</th>
                <th className="num">Dönem sonu servet</th>
              </tr>
            </thead>
            <tbody>
              {data.monthly.map((r) => {
                const m = r.window;
                const label = r.pre
                  ? `Takip öncesi (${trDate(m.start.date)} → ${trDate(m.end.date)})`
                  : `${MONTHS_LONG[Number(r.key.slice(5, 7)) - 1]} ${r.key.slice(0, 4)}`;
                return (
                  <tr key={r.key}>
                    <td>
                      {label}
                      {!r.pre && m.start.date.slice(0, 7) === r.key && <div className="hint">{trDate(m.start.date)} itibarıyla</div>}
                    </td>
                    <Cell v={m.parts.savings} />
                    {r.pre ? (
                      <td colSpan={4} className="num pre-span">
                        Piyasa ve diğer, ayrıştırılamadı: <span className={`tabular ${tone(m.parts.untracked)}`}>{signedMoney(m.parts.untracked)}</span>
                      </td>
                    ) : (
                      <>
                        <Cell v={m.parts.invest} />
                        <Cell v={m.parts.fx} />
                        <Cell v={m.parts.metal} />
                        <Cell v={m.parts.other} />
                      </>
                    )}
                    <td className={`num tabular ${tone(m.delta)}`} style={{ fontWeight: 700 }}>
                      {signedMoney(m.delta)}
                    </td>
                    <td className="num tabular">{money(m.end.value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <details className="card card-pad">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Nasıl hesaplanıyor?</summary>
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "grid", gap: 6, fontSize: 13, lineHeight: 1.55 }}>
          <li>
            <b>Net tasarruf:</b> kayıtlı gelirler eksi giderler. Transferler ve temettü hariç. Maaş avansı gibi geri ödenecek
            tutarlar gelir olarak girildiyse tasarruf o kadar yüksek görünür.
          </li>
          <li>
            <b>Hisse ve fon:</b> portföyün piyasa değeri değişimi; alımlar ve satışlar düşülür, temettü eklenir. Yani yalnız
            fiyat hareketi ve temettü. Fonlar günlük kayıtta maliyetle değerlendiği için fon getirisi burada görünmez.
          </li>
          <li>
            <b>Döviz ve altın:</b> her gün, bir önceki günün döviz ve altın değeri ile o günkü kur değişimi çarpılır. Döviz
            alıp satmak kur etkisi sayılmaz.
          </li>
          <li>
            <b>Diğer:</b> kalan fark. Kayda girmemiş gelir veya harcama, mevduat faizi, bakiye düzeltmeleri, kredi kartı borcunun
            zamanlaması ve alımı girilmemiş hisselerin satış geliri buraya düşer. Büyükse bakiyeleri güncellemek iyi olur.
          </li>
          <li>
            <b>Takip öncesi:</b> günlük servet kaydı {data.trackedSince ? trDate(data.trackedSince) : "—"} tarihinde başladı.
            Öncesi için yalnız elle girilen yıl sonu serveti var; o aralıkta tasarruf ölçülür, piyasa etkisi sınıflara ayrılamaz.
          </li>
        </ul>
      </details>
    </div>
  );
}
