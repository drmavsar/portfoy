"use client";

import { useEffect, useMemo, useState } from "react";

import { depositAlternativeValue, type SavingsReport } from "@/app/(app)/_lib/savings-analysis";
import { fmt } from "@/lib/finance/fmt";
import { parseLooseNumber } from "@/lib/finance/position-size";

const RATE_KEY = "savings-tab:deposit-rate";
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function money(n: number | null | undefined): string {
  return n == null ? "—" : `${fmt.tr(n, 0)} ₺`;
}

function signedMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : "−"}${fmt.tr(Math.abs(n), 0)} ₺`;
}

function pct(n: number | null | undefined, d = 1): string {
  return n == null ? "—" : `%${fmt.tr(n * 100, d)}`;
}

function color(n: number | null | undefined): string | undefined {
  if (n == null || Math.abs(n) < 0.5) return undefined;
  return n > 0 ? "var(--positive)" : "var(--negative)";
}

function trDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function Kpi({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="hint" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div className="tabular" style={{ fontSize: 22, fontWeight: 750, marginTop: 6, color: valueColor }}>
        {value}
      </div>
      {sub && (
        <div className="hint" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Bar({ share, tone }: { share: number; tone: string }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, height: "100%", background: tone }} />
    </div>
  );
}

export function SavingsTab({ data }: { data: SavingsReport }) {
  const [rateText, setRateText] = useState("40");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(RATE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage yalnız istemcide okunabilir
      if (saved) setRateText(saved);
    } catch {
      /* depolama kapalı */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(RATE_KEY, rateText);
    } catch {
      /* depolama kapalı */
    }
  }, [hydrated, rateText]);

  const p = data.portfolio;
  const rate = parseLooseNumber(rateText) / 100;
  const alternatives = useMemo(() => {
    if (!p) return [];
    const list = [...p.alternatives];
    if (Number.isFinite(rate) && rate > -1) {
      const v = depositAlternativeValue(p.cashflows, rate, p.end.date);
      list.push({ key: "DEPOSIT", label: `TL mevduat (yıllık %${fmt.tr(rate * 100, 1)})`, endValue: v, diff: p.end.value - v });
    }
    return list.sort((a, b) => b.endValue - a.endValue);
  }, [p, rate]);
  const best = alternatives[0];

  const topExpense = data.expense.byCategory[0];
  const maxMonth = Math.max(1, ...data.monthly.map((m) => Math.max(m.income, m.expense)));

  // Kısa yorum: veriden türetilen birkaç cümle
  const insights: string[] = [];
  if (data.savingsRate != null) {
    insights.push(`Birikim oranın: %${fmt.tr(data.savingsRate * 100, 0)} (${money(data.net)}).`);
  }
  if (topExpense && topExpense.share >= 0.25) {
    insights.push(
      `En büyük gider kalemi ${topExpense.name}: ${money(topExpense.amount)} (toplam giderin %${fmt.tr(topExpense.share * 100, 0)} kadarı).`,
    );
  }
  if (data.bridge) {
    insights.push(
      data.bridge.market >= 0
        ? `Servet değişimi ${signedMoney(data.bridge.delta)}: birikimden ${signedMoney(data.bridge.savings)}, piyasa ve değerlemeden ${signedMoney(data.bridge.market)}.`
        : `Servet değişimi ${signedMoney(data.bridge.delta)}: birikim ${signedMoney(data.bridge.savings)} olsa da piyasa ve değerleme ${signedMoney(data.bridge.market)} götürdü.`,
    );
  }
  if (p && best) {
    const own = p.end.value;
    if (best.endValue > own) {
      insights.push(
        `Portföyüne koyduğun para aynı günlerde en iyi seçeneğe (${best.label}) konsaydı bugün ${money(best.endValue - own)} daha fazla olurdu.`,
      );
    } else {
      insights.push(`Portföyün karşılaştırılan tüm alternatiflerden iyi gitti.`);
    }
    const xu = p.alternatives.find((a) => a.key === "XU100");
    if (xu) {
      insights.push(
        xu.diff >= 0
          ? `Hisse seçimin BIST 100 endeksinden ${money(xu.diff)} iyi; sonucu büyük ölçüde piyasanın yönü belirledi.`
          : `Hisse seçimin BIST 100 endeksinin ${money(-xu.diff)} gerisinde.`,
      );
    }
    if (p.shareOfWealth != null && p.shareOfWealth >= 0.5) {
      insights.push(`Hisse/fon portföyünün servetteki payı: %${fmt.tr(p.shareOfWealth * 100, 0)}.`);
    }
  }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
          {data.year}: {trDate(data.start)} → {trDate(data.end)}
        </div>
        {insights.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
            {insights.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        ) : (
          <div className="hint" style={{ fontSize: 12 }}>
            Bu dönem için yeterli kayıt yok.
          </div>
        )}
      </div>

      <div className="grid-base grid-4" style={{ gap: 16, marginBottom: 18 }}>
        <Kpi label="Gelir" value={money(data.income.total)} sub={data.income.byCategory.slice(0, 2).map((c) => c.name).join(" · ")} />
        <Kpi label="Gider" value={money(data.expense.total)} sub={topExpense ? `en büyük: ${topExpense.name} ${pct(topExpense.share, 0)}` : undefined} />
        <Kpi
          label="Net birikim"
          value={signedMoney(data.net)}
          valueColor={color(data.net)}
          sub={data.savingsRate != null ? `birikim oranı ${pct(data.savingsRate, 0)}` : undefined}
        />
        <Kpi
          label="Hiç harcamasaydın"
          value={money(data.noSpendWealth)}
          sub={data.wealthEnd ? `bugünkü servet ${money(data.wealthEnd.value)} + gider` : "günlük servet kaydı yok"}
        />
      </div>

      {/* Servet köprüsü */}
      {data.bridge && data.wealthStart && data.wealthEnd && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <div className="card-title">Servet Köprüsü</div>
            <div className="card-sub">
              {trDate(data.wealthStart.date)} → {trDate(data.wealthEnd.date)}
              {data.wealthStart.source === "manual" ? " · başlangıç elle girilen yıl sonu" : ""}
            </div>
          </div>
          <table className="dg">
            <tbody>
              <tr>
                <td>Yıl başı servet</td>
                <td className="num tabular">{money(data.wealthStart.value)}</td>
              </tr>
              <tr>
                <td>+ Net birikim (gelir − gider)</td>
                <td className="num tabular" style={{ color: color(data.bridge.savings) }}>
                  {signedMoney(data.bridge.savings)}
                </td>
              </tr>
              <tr>
                <td>
                  ± Piyasa ve değerleme
                  <div className="hint">hisse, altın, döviz değişimi; kayda girmemiş hareketler de burada</div>
                </td>
                <td className="num tabular" style={{ color: color(data.bridge.market) }}>
                  {signedMoney(data.bridge.market)}
                </td>
              </tr>
              <tr style={{ fontWeight: 700 }}>
                <td>Bugünkü servet</td>
                <td className="num tabular">{money(data.wealthEnd.value)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Portföy vs alternatifler */}
      {p && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head" style={{ flexWrap: "wrap", gap: 8 }}>
            <div className="card-title">Hisse ve Fon Portföyü — Alternatiflerle</div>
            <div className="card-sub">
              {trDate(p.start.date)} → {trDate(p.end.date)} · aynı paranın aynı günlerde girip çıktığı varsayımıyla
            </div>
          </div>
          <div className="grid-base grid-4" style={{ gap: 12, padding: "12px 16px 4px" }}>
            <Kpi label="Başlangıç değeri" value={money(p.start.value)} sub={`+ sonradan eklenen net ${money(p.netInvested - p.start.value)}`} />
            <Kpi label="Bugünkü değer" value={money(p.end.value)} sub={p.shareOfWealth != null ? `servetteki payı ${pct(p.shareOfWealth, 0)}` : undefined} />
            <Kpi label="Kâr / zarar" value={signedMoney(p.pnl)} valueColor={color(p.pnl)} sub="temettü dahil" />
            <Kpi
              label="Dönem getirisi"
              value={p.periodReturn == null ? "—" : `${p.periodReturn >= 0 ? "+" : "−"}%${fmt.tr(Math.abs(p.periodReturn) * 100, 1)}`}
              valueColor={color(p.periodReturn)}
              sub={p.xirrAnnual != null ? `yıllık ${p.xirrAnnual >= 0 ? "+" : "−"}%${fmt.tr(Math.abs(p.xirrAnnual) * 100, 1)} (para ağırlıklı)` : undefined}
            />
          </div>
          <table className="dg">
            <thead>
              <tr>
                <th>Para buraya gitseydi</th>
                <th className="num">Bugünkü değer</th>
                <th className="num">Senin portföyüne göre</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ fontWeight: 700 }}>
                <td>Senin portföyün (gerçek)</td>
                <td className="num tabular">{money(p.end.value)}</td>
                <td className="num tabular hint">—</td>
              </tr>
              {alternatives.map((a) => (
                <tr key={a.key}>
                  <td>{a.label}</td>
                  <td className="num tabular">{money(a.endValue)}</td>
                  <td className="num tabular" style={{ color: color(a.diff), fontWeight: 600 }}>
                    {a.diff >= 0 ? `sen ${money(a.diff)} önde` : `${money(-a.diff)} daha iyi olurdu`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "10px 16px 14px" }}>
            <span className="hint">Mevduat faizi (yıllık, brüt %)</span>
            <input
              inputMode="decimal"
              value={rateText}
              onChange={(e) => setRateText(e.target.value)}
              style={{
                width: 70,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                padding: "4px 8px",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <span className="hint">stopaj öncesi; kendi bankanın oranını gir</span>
          </label>
        </div>
      )}

      <div className="grid-base grid-2" style={{ gap: 16, marginBottom: 18, alignItems: "start" }}>
        {/* Gider dağılımı */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Gider Dağılımı</div>
            <div className="card-sub">{money(data.expense.total)}</div>
          </div>
          <div style={{ padding: "8px 16px 14px", display: "grid", gap: 10 }}>
            {data.expense.byCategory.slice(0, 10).map((c) => (
              <div key={c.name}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span>{c.name}</span>
                  <span className="tabular">
                    {money(c.amount)} <span className="hint">{pct(c.share, 0)}</span>
                  </span>
                </div>
                <Bar share={c.share} tone="var(--negative)" />
              </div>
            ))}
          </div>
        </div>

        {/* Gelir dağılımı */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Gelir Dağılımı</div>
            <div className="card-sub">{money(data.income.total)}</div>
          </div>
          <div style={{ padding: "8px 16px 14px", display: "grid", gap: 10 }}>
            {data.income.byCategory.slice(0, 10).map((c) => (
              <div key={c.name}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span>{c.name}</span>
                  <span className="tabular">
                    {money(c.amount)} <span className="hint">{pct(c.share, 0)}</span>
                  </span>
                </div>
                <Bar share={c.share} tone="var(--positive)" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Aylık */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div className="card-title">Aylık Birikim ve Servet</div>
          <div className="card-sub">piyasa etkisi = ay içi servet değişimi − birikim</div>
        </div>
        <table className="dg">
          <thead>
            <tr>
              <th>Ay</th>
              <th className="num">Gelir</th>
              <th className="num">Gider</th>
              <th className="num">Birikim</th>
              <th className="num">Ay sonu servet</th>
              <th className="num">Piyasa etkisi</th>
            </tr>
          </thead>
          <tbody>
            {data.monthly.map((m) => (
              <tr key={m.month}>
                <td>
                  <div style={{ fontWeight: 600 }}>{MONTHS[Number(m.month.slice(5, 7)) - 1]}</div>
                  <div style={{ display: "grid", gap: 2, marginTop: 4, width: 90 }}>
                    <Bar share={m.income / maxMonth} tone="var(--positive)" />
                    <Bar share={m.expense / maxMonth} tone="var(--negative)" />
                  </div>
                </td>
                <td className="num tabular">{money(m.income)}</td>
                <td className="num tabular">{money(m.expense)}</td>
                <td className="num tabular" style={{ color: color(m.savings), fontWeight: 600 }}>
                  {signedMoney(m.savings)}
                </td>
                <td className="num tabular">{money(m.wealthEnd)}</td>
                <td className="num tabular" style={{ color: color(m.market) }}>
                  {signedMoney(m.market)}
                </td>
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
        <b>Nasıl hesaplanır.</b> Gelir ve gider, transfer olmayan kesinleşmiş hareketlerdir. Servet, her gece
        alınan günlük kayıttan gelir; yıl başı için önceki yılın Aralık kaydı, yoksa elle girilen yıl sonu serveti
        kullanılır. Portföy karşılaştırmasında başlangıç, portföyün o günkü piyasa değeridir; sonraki her alım/satım
        aynı gün alternatife girip çıkmış sayılır, temettüler portföyden çıkan getiridir. Alım kaydı olmayan satışlar
        (veri girişi eksikliği) yalnız eşleşmeyen kısmıyla karşılaştırmadan çıkarılır. Mevduat brüt faizle bileşik hesaplanır; stopaj sonrası
        biraz düşer. Bu bir yatırım tavsiyesi değildir.
      </div>
    </div>
  );
}
