"use client";

import { useMemo, useState } from "react";

import {
  computeTaxYearReport,
  taxIncomeKindForCategory,
  type TaxIncome,
  type TaxLot,
} from "@/app/(app)/_lib/tax-year-report";
import type { RawRealizedLot, RawTxn } from "@/app/(app)/_lib/reports-actions";
import type { CategoryRow } from "@/app/(app)/ayarlar/actions";
import type { BeneficiaryLite } from "@/app/(app)/hesaplar/actions";
import { fmt } from "@/lib/finance/fmt";
import { istanbulToday } from "@/lib/finance/istanbul-date";

interface Props {
  realized: RawRealizedLot[];
  txns: RawTxn[];
  categories: CategoryRow[];
  beneficiaries: BeneficiaryLite[];
}

const ALL = "__all__";

function money(n: number): string {
  return `${fmt.tr(n, 0)} ₺`;
}

function pnlColor(n: number): string | undefined {
  if (Math.abs(n) < 0.5) return undefined;
  return n > 0 ? "var(--positive)" : "var(--negative)";
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="hint" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div className="tabular" style={{ fontSize: 22, fontWeight: 750, marginTop: 6, color }}>
        {value}
      </div>
      {sub && (
        <div className="hint" style={{ fontSize: 11, marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Row({ k, v, strong, color }: { k: string; v: string; strong?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", fontSize: 13 }}>
      <span className={strong ? undefined : "hint"} style={strong ? { fontWeight: 650 } : undefined}>
        {k}
      </span>
      <span className="tabular" style={{ fontWeight: strong ? 700 : 550, color }}>
        {v}
      </span>
    </div>
  );
}

function StatusPill({ must }: { must: boolean | null }) {
  const [bg, fg, text] =
    must == null
      ? ["var(--surface-2)", "var(--muted)", "Parametre yok"]
      : must
        ? ["var(--warning-soft)", "var(--warning)", "Beyan gerekir"]
        : ["var(--positive-soft)", "var(--positive)", "Beyan gerekmez"];
  return (
    <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 650, padding: "2px 8px", borderRadius: 999 }}>
      {text}
    </span>
  );
}

export function TaxYearTab({ realized, txns, categories, beneficiaries }: Props) {
  const today = istanbulToday();
  const currentYear = Number(today.slice(0, 4));
  // Gerçekleşen lotlar 24 ay geriye yükleniyor: cari ve önceki yıl her zaman tam.
  const years = [currentYear, currentYear - 1];

  const lots: TaxLot[] = useMemo(
    () =>
      realized.map((l) => ({
        closed_at: l.closed_at,
        asset_symbol: l.asset_symbol,
        asset_class: l.asset_class,
        portfolio_id: l.portfolio_id,
        beneficiary_id: l.beneficiary_id,
        proceeds_try: l.proceeds_try,
        cost_basis_try: l.cost_basis_try,
        realized_pnl_try: l.realized_pnl_try,
        withholding_try: l.withholding_try,
        applied_tax_kind: l.applied_tax_kind,
        applied_tax_rate: l.applied_tax_rate,
        manual_tax_override: l.manual_tax_override,
      })),
    [realized],
  );

  const { incomes, skippedForeign } = useMemo(() => {
    const kindByCat = new Map<string, TaxIncome["kind"]>();
    for (const c of categories) {
      const k = taxIncomeKindForCategory(c.name);
      if (k) kindByCat.set(c.id, k);
    }
    const out: TaxIncome[] = [];
    let skipped = 0;
    for (const t of txns) {
      if (t.direction !== "inflow" || !t.category_id) continue;
      const kind = kindByCat.get(t.category_id);
      if (!kind) continue;
      if (t.currency !== "TRY") {
        skipped += 1;
        continue;
      }
      out.push({ occurred_on: t.occurred_on, amount: Number(t.amount), kind, beneficiary_id: t.beneficiary_id });
    }
    return { incomes: out, skippedForeign: skipped };
  }, [txns, categories]);

  const [year, setYear] = useState<number>(currentYear);

  // Vergi kişiseldir: verisi olan kişiler; varsayılan ilk kişi.
  const persons = useMemo(() => {
    const prefix = String(year);
    const ids = new Set<string>();
    for (const l of lots) if (l.beneficiary_id && l.closed_at.startsWith(prefix)) ids.add(l.beneficiary_id);
    for (const i of incomes) if (i.beneficiary_id && i.occurred_on.startsWith(prefix)) ids.add(i.beneficiary_id);
    return beneficiaries.filter((b) => ids.has(b.id));
  }, [lots, incomes, beneficiaries, year]);
  const [personPick, setPersonPick] = useState<string | null>(null);
  const person = personPick && (personPick === ALL || persons.some((p) => p.id === personPick))
    ? personPick
    : (persons[0]?.id ?? ALL);

  const [overCap, setOverCap] = useState(false);

  const r = useMemo(
    () =>
      computeTaxYearReport({
        year,
        today,
        lots,
        incomes,
        beneficiaryId: person === ALL ? null : person,
        konutIstisnaEligible: !overCap,
      }),
    [year, today, lots, incomes, person, overCap],
  );

  const p = r.params;
  const hasAnything = r.buckets.length > 0 || r.dividend.count > 0 || r.rent.count > 0;
  const projNote = r.partialYear ? " (yıl sonu tahmini)" : "";

  return (
    <div>
      {/* Kontroller */}
      <div className="card card-pad" style={{ marginBottom: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {years.map((y) => (
            <button key={y} className={`btn btn-sm ${year === y ? "btn-prim" : ""}`} onClick={() => setYear(y)}>
              {y}
              {y === currentYear ? " (devam ediyor)" : ""}
            </button>
          ))}
        </div>
        <select
          aria-label="Kişi"
          value={person}
          onChange={(e) => setPersonPick(e.currentTarget.value)}
          style={{ fontSize: 13, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border-soft)", background: "var(--surface-2)", color: "inherit" }}
        >
          {persons.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          <option value={ALL}>Tüm kişiler (toplam)</option>
        </select>
        {person === ALL && (
          <span className="hint" style={{ fontSize: 11 }}>
            Beyan sınırları kişi başınadır; toplam görünüm yalnız bilgi amaçlı.
          </span>
        )}
      </div>

      {!hasAnything ? (
        <div className="empty">
          <div className="title">{year} için gerçekleşen satış, temettü veya kira kaydı yok</div>
        </div>
      ) : (
        <>
          {/* Beyan özeti */}
          <div
            className="card"
            style={{
              padding: 16,
              marginBottom: 18,
              borderLeft: `3px solid ${r.declarations.length > 0 ? "var(--warning)" : "var(--positive)"}`,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {!p
                ? `${year} için vergi parametreleri tanımlı değil`
                : r.declarations.length > 0
                  ? `Beyanname gerekir${r.partialYear ? " (tahmini)" : ""}: ${r.declarations.join(" · ")}`
                  : `Bu kayıtlara göre ${year} için beyanname gerekmiyor${r.partialYear ? " (şimdilik)" : ""}`}
            </div>
            {p && (
              <div className="hint" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
                {r.declarations.length > 0
                  ? `Yıllık gelir vergisi beyannamesi 1–31 Mart ${year + 1}; vergi Mart ve Temmuz'da iki eşit taksitle ödenir.`
                  : "Hisse ve fon alım-satım kazançları stopajla nihai vergilenir; beyan edilmez."}
              </div>
            )}
          </div>

          <div className="grid-base grid-4" style={{ gap: 16, marginBottom: 18 }}>
            <Kpi
              label="Alım-satım net K/Z"
              value={money(r.tradingTotals.net)}
              color={pnlColor(r.tradingTotals.net)}
              sub={`${r.buckets.reduce((s, b) => s + b.lots, 0)} kapanan lot · satış ${fmt.k(r.tradingTotals.proceeds)} ₺`}
            />
            <Kpi
              label="Tahmini stopaj"
              value={money(r.tradingTotals.withholdingNetted)}
              sub={
                Math.abs(r.tradingTotals.withholdingLot - r.tradingTotals.withholdingNetted) >= 1
                  ? `lot bazında ${money(r.tradingTotals.withholdingLot)} · zarar mahsubuyla düşer`
                  : "alım-satım kazançları"
              }
            />
            <Kpi
              label="Temettü (brüt)"
              value={money(r.dividend.gross)}
              sub={r.dividend.count > 0 ? `net ${money(r.dividend.netReceived)} · stopaj ${money(r.dividend.withheld)}` : "kayıt yok"}
            />
            <Kpi
              label={`Kira geliri${r.rent.projected ? " (tahmini yıl)" : ""}`}
              value={money(r.rent.annualBasis)}
              sub={
                r.rent.count > 0
                  ? r.rent.projected
                    ? `şu ana kadar ${money(r.rent.received)}`
                    : `${r.rent.count} tahsilat`
                  : "kayıt yok"
              }
            />
          </div>

          {/* Alım-satım */}
          {r.buckets.length > 0 && (
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-head">
                <div className="card-title">Alım-Satım Kazançları (FIFO)</div>
                <div className="card-sub">{year} içinde kapanan lotlar · vergi türüne göre</div>
              </div>
              <table className="dg">
                <thead>
                  <tr>
                    <th>Tür</th>
                    <th className="num">Lot</th>
                    <th className="num">Satış</th>
                    <th className="num">Kâr</th>
                    <th className="num">Zarar</th>
                    <th className="num">Net</th>
                    <th className="num">Stopaj</th>
                  </tr>
                </thead>
                <tbody>
                  {r.buckets.map((b) => (
                    <tr key={b.key}>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{b.label}</div>
                        <div className="hint">{b.rule}</div>
                      </td>
                      <td className="num tabular">{b.lots}</td>
                      <td className="num tabular">{money(b.proceeds)}</td>
                      <td className="num tabular" style={{ color: b.gains > 0 ? "var(--positive)" : undefined }}>
                        {money(b.gains)}
                      </td>
                      <td className="num tabular" style={{ color: b.losses > 0 ? "var(--negative)" : undefined }}>
                        {b.losses > 0 ? `−${fmt.tr(b.losses, 0)} ₺` : money(0)}
                      </td>
                      <td className="num tabular" style={{ fontWeight: 650, color: pnlColor(b.net) }}>
                        {money(b.net)}
                      </td>
                      <td className="num tabular">
                        {money(b.withholdingNetted)}
                        {Math.abs(b.withholdingLot - b.withholdingNetted) >= 1 && (
                          <div className="hint" style={{ fontSize: 10 }}>
                            lot bazında {money(b.withholdingLot)}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.symbols.length > 0 && (
                <div style={{ padding: "10px 16px 14px" }}>
                  <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>Sembol bazında net K/Z</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {r.symbols.map((s) => (
                      <span
                        key={s.symbol}
                        className="tabular"
                        style={{
                          fontSize: 12,
                          padding: "3px 8px",
                          borderRadius: 6,
                          background: s.net >= 0 ? "var(--positive-soft)" : "var(--negative-soft)",
                          color: s.net >= 0 ? "var(--positive)" : "var(--negative)",
                        }}
                      >
                        <b>{s.symbol}</b> {s.net >= 0 ? "+" : "−"}
                        {fmt.tr(Math.abs(s.net), 0)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid-base grid-2" style={{ gap: 16, marginBottom: 18 }}>
            {/* Kâr payı */}
            <div className="card card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div className="card-title">Kâr Payı (Temettü)</div>
                {r.dividend.count > 0 && <StatusPill must={r.dividend.mustDeclare} />}
              </div>
              {r.dividend.count === 0 ? (
                <div className="hint" style={{ fontSize: 12 }}>
                  {year} içinde &quot;Temettü&quot; kategorisinde gelir kaydı yok.
                </div>
              ) : (
                <>
                  <Row k="Hesaba geçen (net)" v={money(r.dividend.netReceived)} />
                  <Row k="Kesilen stopaj" v={money(r.dividend.withheld)} />
                  <Row k="Brüt kâr payı" v={money(r.dividend.gross)} strong />
                  <Row k="Beyana tabi kısım (brütün yarısı)" v={money(r.dividend.declarablePart)} />
                  {r.dividend.threshold != null && (
                    <Row k={`Beyan sınırı (${year})`} v={money(r.dividend.threshold)} />
                  )}
                  <div className="hint" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
                    Brütün yarısı sınırı aşarsa beyan edilir; kesilen stopajın tamamı hesaplanan vergiden düşülür.
                  </div>
                </>
              )}
            </div>

            {/* Kira */}
            <div className="card card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div className="card-title">Konut Kira Geliri</div>
                {r.rent.count > 0 && <StatusPill must={r.rent.mustDeclare} />}
              </div>
              {r.rent.count === 0 ? (
                <div className="hint" style={{ fontSize: 12 }}>
                  {year} içinde &quot;Kira Geliri&quot; kategorisinde kayıt yok.
                </div>
              ) : (
                <>
                  <Row k="Tahsil edilen" v={money(r.rent.received)} />
                  {r.rent.projected && <Row k="Yıl sonu tahmini (son kirayla)" v={money(r.rent.annualBasis)} strong />}
                  {r.rent.istisna != null && (
                    <Row k={r.rent.eligible ? "Konut istisnası" : "Konut istisnası (uygulanmaz)"} v={`−${money(r.rent.istisna)}`} />
                  )}
                  {r.rent.mustDeclare && (
                    <>
                      <Row k="Götürü gider (%15)" v={`−${money(r.rent.gotururGider)}`} />
                      <Row k="Vergi matrahı" v={money(r.rent.matrah)} />
                    </>
                  )}
                  {r.rent.estTax != null && (
                    <Row
                      k={`Tahmini gelir vergisi${projNote}`}
                      v={money(r.rent.estTax)}
                      strong
                      color={r.rent.estTax > 0 ? "var(--warning)" : undefined}
                    />
                  )}
                  {p && (
                    <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, marginTop: 10, lineHeight: 1.5, cursor: "pointer" }}>
                      <input type="checkbox" checked={overCap} onChange={(e) => setOverCap(e.currentTarget.checked)} />
                      <span className="hint">
                        Ücret, menkul/gayrimenkul sermaye iradı ve diğer gelirlerimin brüt toplamı{" "}
                        {money(p.konutIstisnaUstSinir)}&apos;yi aşıyor (bu durumda konut istisnası uygulanmaz).
                      </span>
                    </label>
                  )}
                </>
              )}
            </div>
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
            <b>Varsayımlar.</b> Hesaplar tahminidir; kesin beyan için mali müşavire danış.
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              <li>
                BIST hisseleri (menkul kıymet yatırım ortaklıkları hariç) ve TEFAS&apos;taki hisse senedi yoğun fonlar
                geçici 67 kapsamında %0 stopajlıdır. Hisse zararları başka gelirden düşülemez.
              </li>
              <li>
                Stopajlı fonlarda yıl içi zararlar aynı aracı kurumdaki kazançlardan mahsup edilir; burada her portföy
                ayrı bir aracı kurum sayıldı. Alış bedeli Yİ-ÜFE artışı %10&apos;u aşınca endekslenir; bu hesapta
                endeksleme yok, yani gerçek kesinti daha düşük olabilir.
              </li>
              <li>
                &quot;Temettü&quot; kayıtları hesaba geçen <b>net</b> tutar kabul edildi: 22.12.2024&apos;ten itibaren
                %15, öncesinde %10 stopajla brüte çevrildi.
              </li>
              <li>
                &quot;Kira Geliri&quot; kayıtları <b>konut</b> kirası kabul edildi; götürü gider yöntemi kullanıldı.
                İşyeri kirasında kiracı stopaj keser ve kurallar farklıdır.
                {r.partialYear && " Cari yılda kalan aylar son tahsil edilen kira tutarıyla tahmin edildi."}
              </li>
              {skippedForeign > 0 && <li>{skippedForeign} döviz cinsi temettü/kira kaydı hesaba katılmadı.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
