"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import type { IndexBadge } from "@/app/(app)/_lib/bist-index-members";
import { fetchFundamentals, type FundamentalsResult } from "@/app/(app)/_lib/fundamentals";
import {
  bandVerdict,
  FAIR_PE,
  type Fundamentals,
  type StatementTable,
  type Verdict,
} from "@/app/(app)/_lib/fundamentals-score";

interface Props {
  symbols: string[];
  selected: string;
  name: string;
  indices: IndexBadge[];
}

type TabKey =
  | "degerleme"
  | "buyume"
  | "borc"
  | "temettu"
  | "analist"
  | "tablolar"
  | "hakkinda";

const TABS: Array<[TabKey, string]> = [
  ["degerleme", "Değerleme"],
  ["buyume", "Büyüme & Karlılık"],
  ["borc", "Borç & Nakit"],
  ["temettu", "Temettü"],
  ["analist", "Analist"],
  ["tablolar", "Mali Tablolar"],
  ["hakkinda", "Hakkında"],
];

// ---- format yardımcıları --------------------------------------------------

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Büyük sayıyı kısalt — mn / mlr / trln. */
function big(n: number | null | undefined): string {
  if (!isNum(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " trln";
  if (a >= 1e9) return (n / 1e9).toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " mlr";
  if (a >= 1e6) return (n / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " mn";
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
}

function bigTRY(n: number | null | undefined): string {
  return isNum(n) ? `${big(n)} ₺` : "—";
}

function dec(n: number | null | undefined, d = 2): string {
  return isNum(n) ? n.toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
}

function pct(n: number | null | undefined, d = 1): string {
  if (!isNum(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toLocaleString("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d })}%`;
}

function price(n: number | null | undefined): string {
  return isNum(n) ? `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺` : "—";
}

function shortDate(s: string | null | undefined): string {
  if (!s) return "—";
  const m = String(s).match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0].split("-").reverse().join(".");
  return String(s).slice(0, 10);
}

function verdictColor(v: Verdict | undefined): string {
  if (v === "good") return "var(--positive)";
  if (v === "warn") return "var(--warning)";
  if (v === "bad") return "var(--negative)";
  return "var(--border)";
}

/** Pozitif olması gereken, düşük=iyi çarpan için renk (negatif → kötü). */
function lowerBetter(v: number | null | undefined, good: number, warn: number): Verdict {
  if (!isNum(v)) return "na";
  if (v <= 0) return "bad";
  if (v <= good) return "good";
  if (v <= warn) return "warn";
  return "bad";
}

// ---- küçük bileşenler -----------------------------------------------------

function Metric({
  label,
  value,
  sub,
  verdict,
}: {
  label: string;
  value: string;
  sub?: string;
  verdict?: Verdict;
}) {
  return (
    <div
      className="card"
      style={{ padding: "12px 14px", borderLeft: `3px solid ${verdictColor(verdict)}` }}
    >
      <div className="hint" style={{ fontSize: 11 }}>{label}</div>
      <div className="tabular" style={{ fontSize: 17, fontWeight: 650, marginTop: 4 }}>{value}</div>
      {sub && <div className="hint" style={{ fontSize: 10, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function MetricGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid-base grid-4" style={{ gap: 12 }}>{children}</div>;
}

function SectionNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 10,
        marginTop: 14,
        background: "var(--surface-2)",
        borderRadius: 8,
        fontSize: 11,
        color: "var(--muted)",
      }}
    >
      {children}
    </div>
  );
}

function Range52w({
  low,
  high,
  current,
  position,
}: {
  low: number | null;
  high: number | null;
  current: number | null;
  position: number | null;
}) {
  if (!isNum(low) || !isNum(high) || !isNum(current) || high <= low) return null;
  const posPct = isNum(position) ? Math.min(100, Math.max(0, position)) : 50;
  return (
    <div style={{ minWidth: 220 }}>
      <div className="hint" style={{ fontSize: 10, marginBottom: 4 }}>
        52 hafta · konum %{posPct.toFixed(0)}
      </div>
      <div style={{ position: "relative", height: 6, background: "var(--surface-3)", borderRadius: 3 }}>
        <div
          style={{
            position: "absolute",
            left: `calc(${posPct}% - 5px)`,
            top: -2,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "var(--accent)",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10 }}>
        <span className="tabular hint">{price(low)}</span>
        <span className="tabular hint">{price(high)}</span>
      </div>
    </div>
  );
}

function StatementTableView({ table }: { table: StatementTable | null | undefined }) {
  if (!table || table.rows.length === 0) {
    return <div className="hint" style={{ padding: 12 }}>Tablo verisi yok.</div>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 8px", position: "sticky", left: 0, background: "var(--surface)" }}>
              Kalem
            </th>
            {table.periods.map((p) => (
              <th key={p} style={{ textAlign: "right", padding: "6px 8px", whiteSpace: "nowrap" }}>{p}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={`${row.item}-${i}`} style={{ borderTop: "1px solid var(--border-soft)" }}>
              <td style={{ padding: "5px 8px", position: "sticky", left: 0, background: "var(--surface)", maxWidth: 260 }}>
                {row.item}
              </td>
              {row.values.map((v, j) => (
                <td key={j} className="tabular" style={{ textAlign: "right", padding: "5px 8px", whiteSpace: "nowrap" }}>
                  {isNum(v) ? big(v) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- ana bileşen ----------------------------------------------------------

export function TemelClient({ symbols, selected, name, indices }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabKey>("degerleme");
  const [fetched, setFetched] = useState<{
    symbol: string;
    value: FundamentalsResult;
  } | null>(null);

  // Temel veri tarayıcıdan çekilir (sunucu→sunucu fetch Vercel Deployment
  // Protection'a takılıp 401 dönüyordu). selected değişince yeniden çekilir.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    fetchFundamentals(selected).then((value) => {
      if (!cancelled) setFetched({ symbol: selected, value });
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Sonuç yalnız güncel sembole aitse geçerli — sembol değişince render
  // sırasında türetilerek anında sıfırlanır, yükleniyor durumuna geçilir.
  const result = fetched && fetched.symbol === selected ? fetched.value : null;
  const loading = Boolean(selected) && !result;

  const options = useMemo(() => {
    const set = new Set(symbols);
    if (selected) set.add(selected);
    return [...set].sort();
  }, [symbols, selected]);

  const go = (sym: string) => {
    const clean = sym.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!clean) return;
    startTransition(() => router.push(`/temel?symbol=${clean}`));
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Temel Analiz</div>
          <div className="page-sub">
            BIST hissesi için değerleme, mali tablo, temettü ve analist verisi — borsapy
            (TradingView · İş Yatırım · KAP) üzerinden.
          </div>
        </div>
      </div>

      {/* sembol seçici */}
      <div
        className="card"
        style={{ padding: 14, marginBottom: 18, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
      >
        <select
          value={selected || ""}
          onChange={(e) => go(e.target.value)}
          style={{
            padding: "8px 10px",
            background: "var(--surface-2)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            minWidth: 160,
          }}
        >
          <option value="" disabled>Hisse seç…</option>
          {options.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="hint">veya</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go(query)}
          placeholder="Sembol gir (örn. THYAO)"
          style={{
            padding: "8px 10px",
            background: "var(--surface-2)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            minWidth: 180,
          }}
        />
        <button className="btn btn-prim" onClick={() => go(query)} style={{ padding: "8px 16px" }}>
          Analiz Et
        </button>
        {(isPending || loading) && <span className="hint">Yükleniyor…</span>}
      </div>

      {!selected && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          <Icon name="search" size={28} />
          <div style={{ marginTop: 10 }}>Analiz için yukarıdan bir hisse seç.</div>
        </div>
      )}

      {selected && !result && (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          <Icon name="refresh" size={28} />
          <div style={{ marginTop: 10 }}>
            <strong>{selected}</strong> için temel analiz verisi yükleniyor…
          </div>
        </div>
      )}

      {selected && result && !result.ok && (
        <div
          className="card"
          style={{ padding: 20, borderLeft: "3px solid var(--negative)", color: "var(--fg-soft)" }}
        >
          <strong>{selected}</strong> — {result.error}
          <div className="hint" style={{ marginTop: 6 }}>
            Sembol yanlış olabilir ya da veri kaynağı geçici olarak yanıt vermiyor.
          </div>
        </div>
      )}

      {selected && result && result.ok && (
        <ReportView
          data={result.data}
          name={name}
          indices={indices}
          tab={tab}
          setTab={setTab}
          dimmed={isPending}
        />
      )}
    </div>
  );
}

function ReportView({
  data,
  name,
  indices,
  tab,
  setTab,
  dimmed,
}: {
  data: Fundamentals;
  name: string;
  indices: IndexBadge[];
  tab: TabKey;
  setTab: (t: TabKey) => void;
  dimmed: boolean;
}) {
  const { raw, derived, score } = data;
  const scoreColor =
    score.label === "Güçlü"
      ? "var(--positive)"
      : score.label === "Orta"
        ? "var(--warning)"
        : score.label === "Zayıf"
          ? "var(--negative)"
          : "var(--muted)";

  const targetUpside =
    isNum(raw.analyst.upside_potential)
      ? raw.analyst.upside_potential
      : isNum(raw.analyst.target_price ?? raw.analyst.mean) && isNum(raw.quote.price)
        ? (((raw.analyst.target_price ?? raw.analyst.mean) as number) - raw.quote.price!) /
          raw.quote.price! *
          100
        : null;

  return (
    <div style={{ opacity: dimmed ? 0.55 : 1, transition: "opacity .15s" }}>
      {/* başlık kartı */}
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{raw.symbol}</span>
              <span style={{ color: "var(--muted)" }}>{name}</span>
            </div>
            <div className="hint" style={{ marginTop: 2 }}>
              {[raw.profile.sector, raw.profile.industry].filter(Boolean).join(" · ") || "Sektör bilinmiyor"}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 }}>
              <span className="tabular" style={{ fontSize: 26, fontWeight: 700 }}>{price(raw.quote.price)}</span>
              <span
                className="tabular"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: isNum(raw.quote.change_pct)
                    ? raw.quote.change_pct >= 0
                      ? "var(--positive)"
                      : "var(--negative)"
                    : "var(--muted)",
                }}
              >
                {pct(raw.quote.change_pct, 2)}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <span className="chip chip-sm">Piyasa Değeri {bigTRY(raw.quote.market_cap)}</span>
              {isNum(raw.analyst.target_price ?? raw.analyst.mean) && (
                <span className="chip chip-sm chip-acc">
                  Hedef {price(raw.analyst.target_price ?? raw.analyst.mean)}
                  {isNum(targetUpside) ? ` (${pct(targetUpside, 0)})` : ""}
                </span>
              )}
              {indices.slice(0, 4).map((ix) => (
                <span key={ix.code} className="chip chip-sm chip-ghost">{ix.code}</span>
              ))}
            </div>
          </div>

          {/* skor + 52h */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: scoreColor,
                  lineHeight: 1,
                }}
              >
                {score.score ?? "—"}
              </div>
              <div className="hint" style={{ fontSize: 11, marginTop: 2 }}>
                Temel skor · {score.label}
              </div>
            </div>
            <Range52w
              low={raw.quote.fifty_two_week_low}
              high={raw.quote.fifty_two_week_high}
              current={raw.quote.price}
              position={derived.price_position_52w}
            />
          </div>
        </div>

        {/* skor sütunları */}
        {score.pillars.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
            {score.pillars.map((p) => (
              <span
                key={p.key}
                className="chip chip-sm"
                style={{
                  color: verdictColor(p.verdict),
                  borderColor: verdictColor(p.verdict),
                }}
                title={`Ağırlık %${p.weight}`}
              >
                {p.label}: {p.detail}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* sekmeler */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "degerleme" && <DegerlemeTab data={data} />}
      {tab === "buyume" && <BuyumeTab data={data} />}
      {tab === "borc" && <BorcTab data={data} />}
      {tab === "temettu" && <TemettuTab data={data} />}
      {tab === "analist" && <AnalistTab data={data} />}
      {tab === "tablolar" && <TablolarTab data={data} />}
      {tab === "hakkinda" && <HakkindaTab data={data} indices={indices} />}

      <div style={{ marginTop: 18, fontSize: 11, color: "var(--muted)" }}>
        Yatırım tavsiyesi değildir. Veri borsapy (TradingView · İş Yatırım · KAP · hedeffiyat)
        üzerinden gelir — gecikmeli veya eksik olabilir.
        {raw.warnings.length > 0 && (
          <span> · {raw.warnings.length} alan çekilemedi (bkz. Hakkında sekmesi).</span>
        )}
      </div>
    </div>
  );
}

// ---- sekmeler -------------------------------------------------------------

function DegerlemeTab({ data }: { data: Fundamentals }) {
  const { raw, derived } = data;
  const v = raw.valuation;
  const mosVerdict = bandVerdict(derived.margin_of_safety_pct, 25, 0, true);
  return (
    <div>
      <MetricGrid>
        <Metric label="F/K (TTM)" value={dec(v.pe, 2)} verdict={lowerBetter(v.pe, 10, 20)} />
        <Metric label="PD/DD" value={dec(v.pb, 2)} verdict={lowerBetter(v.pb, 1.5, 3)} />
        <Metric label="FD/FAVÖK" value={dec(v.ev_ebitda, 2)} verdict={lowerBetter(v.ev_ebitda, 8, 14)} />
        <Metric label="Hisse Başı Kâr (TTM)" value={isNum(derived.eps_ttm) ? price(derived.eps_ttm) : "—"} sub="Fiyat / F/K" />
        <Metric label="Piyasa Değeri" value={bigTRY(raw.quote.market_cap)} />
        <Metric label="Hisse Adedi" value={big(raw.quote.shares_outstanding)} />
        <Metric label="Halka Açıklık" value={isNum(v.free_float) ? `%${dec(v.free_float, 1)}` : "—"} />
        <Metric label="Yabancı Oranı" value={isNum(v.foreign_ratio) ? `%${dec(v.foreign_ratio, 1)}` : "—"} />
      </MetricGrid>

      {/* Margin of Safety */}
      <div className="card" style={{ padding: 16, marginTop: 16, borderLeft: `3px solid ${verdictColor(mosVerdict)}` }}>
        <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 10 }}>
          Margin of Safety <span className="hint">· basit gösterge</span>
        </div>
        <div className="grid-base grid-3" style={{ gap: 12 }}>
          <Metric label={`Adil Değer (${FAIR_PE}× F/K)`} value={price(derived.fair_value)} />
          <Metric label="Bugünkü Fiyat" value={price(raw.quote.price)} />
          <Metric
            label="Güvenlik Payı"
            value={pct(derived.margin_of_safety_pct, 1)}
            verdict={mosVerdict}
          />
        </div>
        <SectionNote>
          Adil değer = {FAIR_PE} × Hisse Başı Kâr (TTM). Konservatif, kabaca bir referans —
          yüksek enflasyon ortamında {FAIR_PE}× çarpanı her sektör için uygun olmayabilir.
        </SectionNote>
      </div>
    </div>
  );
}

function BuyumeTab({ data }: { data: Fundamentals }) {
  const { raw, derived } = data;
  return (
    <div>
      <MetricGrid>
        <Metric
          label="Özkaynak Kârlılığı (ROE)"
          value={isNum(derived.roe) ? `%${dec(derived.roe, 1)}` : "—"}
          verdict={bandVerdict(derived.roe, 15, 8, true)}
        />
        <Metric
          label="Net Kâr Marjı"
          value={isNum(derived.net_margin) ? `%${dec(derived.net_margin, 1)}` : "—"}
          verdict={bandVerdict(derived.net_margin, 12, 4, true)}
        />
        <Metric
          label="Brüt Kâr Marjı"
          value={isNum(derived.gross_margin) ? `%${dec(derived.gross_margin, 1)}` : "—"}
          verdict={bandVerdict(derived.gross_margin, 30, 15, true)}
        />
        <Metric label="Net Kâr (TTM)" value={bigTRY(raw.financials.derived.net_income_ttm)} />
        <Metric
          label="Gelir Büyümesi (YoY)"
          value={pct(derived.revenue_growth, 1)}
          verdict={bandVerdict(derived.revenue_growth, 25, 0, true)}
          sub="nominal — enflasyon arındırılmamış"
        />
        <Metric
          label="Kâr Büyümesi (YoY)"
          value={pct(derived.earnings_growth, 1)}
          verdict={bandVerdict(derived.earnings_growth, 25, 0, true)}
          sub="nominal"
        />
        <Metric label="Gelir (TTM)" value={bigTRY(raw.financials.derived.revenue_ttm)} />
        <Metric label="Brüt Kâr (TTM)" value={bigTRY(raw.financials.derived.gross_profit_ttm)} />
      </MetricGrid>
      <AnnualMini
        title="Yıllık Gelir"
        points={raw.financials.derived.revenue_annual}
      />
      <AnnualMini
        title="Yıllık Net Kâr"
        points={raw.financials.derived.net_income_annual}
      />
      <SectionNote>
        Türkiye yüksek enflasyon ortamında nominal büyüme oranları gerçek (reel) büyümeyi
        olduğundan yüksek gösterebilir. Oranları dönem enflasyonu ile birlikte değerlendir.
      </SectionNote>
    </div>
  );
}

function AnnualMini({
  title,
  points,
}: {
  title: string;
  points: { period: string; value: number }[] | undefined;
}) {
  if (!points || points.length === 0) return null;
  return (
    <div className="card" style={{ padding: "10px 14px", marginTop: 12 }}>
      <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {points.map((p) => (
          <div key={p.period}>
            <div className="hint" style={{ fontSize: 10 }}>{p.period}</div>
            <div className="tabular" style={{ fontSize: 13, fontWeight: 600 }}>{big(p.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BorcTab({ data }: { data: Fundamentals }) {
  const { raw, derived } = data;
  const d = raw.financials.derived;
  const netDebt = raw.valuation.net_debt;
  return (
    <div>
      <MetricGrid>
        <Metric
          label="Net Borç"
          value={bigTRY(netDebt)}
          verdict={isNum(netDebt) ? (netDebt <= 0 ? "good" : "warn") : "na"}
          sub={isNum(netDebt) && netDebt <= 0 ? "Net nakit pozisyonu" : undefined}
        />
        <Metric label="FD/FAVÖK" value={dec(raw.valuation.ev_ebitda, 2)} verdict={lowerBetter(raw.valuation.ev_ebitda, 8, 14)} />
        <Metric
          label="Cari Oran"
          value={dec(derived.current_ratio, 2)}
          verdict={bandVerdict(derived.current_ratio, 1.5, 1, true)}
          sub="Dönen varlık / kısa vadeli yükümlülük"
        />
        <Metric label="İşletme Nakit Akışı (TTM)" value={bigTRY(d.operating_cf_ttm)} />
        <Metric
          label="Serbest Nakit Akışı (TTM)"
          value={bigTRY(derived.free_cash_flow_ttm)}
          verdict={isNum(derived.free_cash_flow_ttm) ? (derived.free_cash_flow_ttm > 0 ? "good" : "bad") : "na"}
          sub="İşletme NA − yatırım harcaması"
        />
        <Metric label="Yatırım Harcaması (TTM)" value={bigTRY(d.capex_ttm)} />
        <Metric label="Dönen Varlıklar" value={bigTRY(d.current_assets)} />
        <Metric label="Kısa Vadeli Yükümlülük" value={bigTRY(d.current_liabilities)} />
      </MetricGrid>
      <SectionNote>
        Net borç ve değerleme çarpanları İş Yatırım şirket kartından; nakit akışı kalemleri
        son 4 çeyrek (TTM) mali tablo toplamından hesaplanır. Banka/finans hisselerinde bazı
        kalemler farklı tablo yapısı nedeniyle boş gelebilir.
      </SectionNote>
    </div>
  );
}

function TemettuTab({ data }: { data: Fundamentals }) {
  const { raw } = data;
  const dv = raw.dividend;
  return (
    <div>
      <MetricGrid>
        <Metric
          label="Temettü Verimi"
          value={isNum(dv.yield) ? `%${dec(dv.yield, 2)}` : "—"}
          verdict={bandVerdict(dv.yield, 4, 2, true)}
        />
        <Metric label="Yıllık Temettü (hisse başı)" value={isNum(dv.annual_rate) ? price(dv.annual_rate) : "—"} />
        <Metric label="Son Temettü Tarihi" value={shortDate(dv.ex_date)} />
      </MetricGrid>
      <div className="card" style={{ padding: 14, marginTop: 16 }}>
        <div className="hint" style={{ fontSize: 11, marginBottom: 8 }}>Temettü Geçmişi</div>
        {dv.history.length === 0 ? (
          <div className="hint">Kayıtlı temettü ödemesi bulunamadı.</div>
        ) : (
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr className="hint">
                <th style={{ textAlign: "left", padding: "4px 6px" }}>Tarih</th>
                <th style={{ textAlign: "right", padding: "4px 6px" }}>Hisse Başı Tutar</th>
              </tr>
            </thead>
            <tbody>
              {dv.history.map((h, i) => (
                <tr key={`${h.date}-${i}`} style={{ borderTop: "1px solid var(--border-soft)" }}>
                  <td style={{ padding: "5px 6px" }}>{shortDate(h.date)}</td>
                  <td className="tabular" style={{ textAlign: "right", padding: "5px 6px" }}>
                    {isNum(h.amount) ? price(h.amount) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AnalistTab({ data }: { data: Fundamentals }) {
  const { raw } = data;
  const a = raw.analyst;
  const s = a.summary;
  const total = s ? (s.strongBuy ?? 0) + (s.buy ?? 0) + (s.hold ?? 0) + (s.sell ?? 0) + (s.strongSell ?? 0) : 0;
  const buy = s ? (s.strongBuy ?? 0) + (s.buy ?? 0) : 0;
  const hold = s ? s.hold ?? 0 : 0;
  const sell = s ? (s.sell ?? 0) + (s.strongSell ?? 0) : 0;
  return (
    <div>
      <MetricGrid>
        <Metric label="Hedef Fiyat" value={price(a.target_price ?? a.mean)} verdict="na" />
        <Metric
          label="Yükseliş Potansiyeli"
          value={pct(a.upside_potential, 1)}
          verdict={bandVerdict(a.upside_potential, 20, 0, true)}
        />
        <Metric label="Tavsiye" value={a.recommendation ?? "—"} />
        <Metric label="Analist Sayısı" value={isNum(a.num_analysts as number) ? String(a.num_analysts) : "—"} />
        <Metric label="En Düşük Hedef" value={price(a.low)} />
        <Metric label="Ortalama Hedef" value={price(a.mean)} />
        <Metric label="Medyan Hedef" value={price(a.median)} />
        <Metric label="En Yüksek Hedef" value={price(a.high)} />
      </MetricGrid>
      {total > 0 && (
        <div className="card" style={{ padding: 14, marginTop: 16 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 8 }}>
            Tavsiye Dağılımı · {total} analist
          </div>
          <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden" }}>
            {buy > 0 && <div style={{ width: `${(buy / total) * 100}%`, background: "var(--positive)" }} />}
            {hold > 0 && <div style={{ width: `${(hold / total) * 100}%`, background: "var(--warning)" }} />}
            {sell > 0 && <div style={{ width: `${(sell / total) * 100}%`, background: "var(--negative)" }} />}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12 }}>
            <span style={{ color: "var(--positive)" }}>● AL {buy}</span>
            <span style={{ color: "var(--warning)" }}>● TUT {hold}</span>
            <span style={{ color: "var(--negative)" }}>● SAT {sell}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TablolarTab({ data }: { data: Fundamentals }) {
  const f = data.raw.financials;
  const [sub, setSub] = useState<"income" | "balance" | "cashflow">("income");
  const tables: Record<typeof sub, StatementTable | null | undefined> = {
    income: f.income_annual,
    balance: f.balance_annual,
    cashflow: f.cashflow_annual,
  };
  return (
    <div>
      <div className="tabs" style={{ marginBottom: 12 }}>
        {([
          ["income", "Gelir Tablosu"],
          ["balance", "Bilanço"],
          ["cashflow", "Nakit Akış"],
        ] as const).map(([k, l]) => (
          <button key={k} className={`tab ${sub === k ? "active" : ""}`} onClick={() => setSub(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: 8 }}>
        <StatementTableView table={tables[sub]} />
      </div>
      <SectionNote>
        Yıllık mali tablolar — İş Yatırım. Değerler tablo para biriminde (genellikle bin TL)
        ve kısaltılmış gösterilir (mn = milyon, mlr = milyar).
      </SectionNote>
    </div>
  );
}

function HakkindaTab({ data, indices }: { data: Fundamentals; indices: IndexBadge[] }) {
  const { raw } = data;
  return (
    <div>
      <div className="grid-base grid-3" style={{ gap: 12 }}>
        <Metric label="Sektör" value={raw.profile.sector ?? "—"} />
        <Metric label="Sektör Dalı" value={raw.profile.industry ?? "—"} />
        <Metric label="Para Birimi" value={raw.quote.currency} />
      </div>
      {raw.profile.website && (
        <div style={{ marginTop: 12 }}>
          <a
            href={raw.profile.website}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)", fontSize: 13 }}
          >
            <Icon name="ext" size={11} /> {raw.profile.website}
          </a>
        </div>
      )}
      {indices.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {indices.map((ix) => (
            <span key={ix.code} className="chip chip-sm chip-ghost" title={ix.name}>{ix.code}</span>
          ))}
        </div>
      )}
      {raw.profile.summary && (
        <div className="card" style={{ padding: 14, marginTop: 14 }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>Faaliyet Özeti</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fg-soft)" }}>
            {raw.profile.summary}
          </div>
        </div>
      )}
      {raw.warnings.length > 0 && (
        <div className="card" style={{ padding: 14, marginTop: 14, borderLeft: "3px solid var(--warning)" }}>
          <div className="hint" style={{ fontSize: 11, marginBottom: 6 }}>Çekilemeyen Alanlar</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--muted)" }}>
            {raw.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
