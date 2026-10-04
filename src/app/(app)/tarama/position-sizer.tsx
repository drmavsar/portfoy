"use client";

import { useEffect, useMemo, useState } from "react";

import { fmt } from "@/lib/finance/fmt";
import { BSMV_RATE, parseLooseNumber, sizePosition } from "@/lib/finance/position-size";

export interface SizerSetup {
  symbol: string;
  price: number;
  entry: number;
  stop: number;
  target: number | null;
  /** "Çift Dip" veya "ATR (1,5×)" */
  source: string;
}

interface Props {
  /** Önerilen hesap büyüklüğü (hisse portföyü değeri) */
  defaultEquity: number | null;
  /** Geçmiş işlemlerden efektif komisyon (BSMV dahil) */
  observedFeeRate: number | null;
  /** Dışarıdan (tablodaki "Lot" düğmesi) seçilen kurulum */
  setup: SizerSetup | null;
}

const STORE_KEY = "position-sizer:v1";

interface Saved {
  equity?: string;
  riskPct?: string;
  commissionBinde?: string;
  maxPosPct?: string;
  bsmv?: boolean;
}

function readSaved(): Saved {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : {};
  } catch {
    return {};
  }
}

const num = parseLooseNumber;

const inp: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--fg)",
  padding: "6px 8px",
  borderRadius: 6,
  fontSize: 13,
  width: "100%",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 11, alignContent: "start" }}>
      <span className="hint">{label}</span>
      {children}
      {hint && <span className="hint" style={{ fontSize: 10 }}>{hint}</span>}
    </label>
  );
}

function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div>
      <div className="hint" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div className="tabular" style={{ fontSize: 17, fontWeight: 700, color }}>{value}</div>
      {sub && <div className="hint" style={{ fontSize: 10 }}>{sub}</div>}
    </div>
  );
}

export function PositionSizer({ defaultEquity, observedFeeRate, setup }: Props) {
  // Komisyon girişi BSMV hariç binde: gözlenen efektif oran ÷ (1 + BSMV)
  const defaultBinde = observedFeeRate != null ? ((observedFeeRate / (1 + BSMV_RATE)) * 1000).toFixed(2).replace(".", ",") : "2";

  const [equity, setEquity] = useState(defaultEquity != null ? String(Math.round(defaultEquity)) : "");
  const [riskPct, setRiskPct] = useState("1");
  const [commissionBinde, setCommissionBinde] = useState(defaultBinde);
  const [maxPosPct, setMaxPosPct] = useState("20");
  const [bsmv, setBsmv] = useState(true);
  const [symbol, setSymbol] = useState("");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [source, setSource] = useState<string | null>(null);
  // Kayıtlı ayarlar okunmadan yazma: varsayılanlar kayıtlıların üstüne yazılmasın
  const [hydrated, setHydrated] = useState(false);

  // Kişisel ayarlar bu tarayıcıda hatırlanır (yalnız kolaylık)
  useEffect(() => {
    const s = readSaved();
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage yalnız istemcide okunabilir */
    if (s.equity) setEquity(s.equity);
    if (s.riskPct) setRiskPct(s.riskPct);
    if (s.commissionBinde) setCommissionBinde(s.commissionBinde);
    if (s.maxPosPct) setMaxPosPct(s.maxPosPct);
    if (typeof s.bsmv === "boolean") setBsmv(s.bsmv);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({ equity, riskPct, commissionBinde, maxPosPct, bsmv }));
    } catch {
      /* depolama kapalı — sorun değil */
    }
  }, [hydrated, equity, riskPct, commissionBinde, maxPosPct, bsmv]);

  // Tablodan kurulum seçilince fiyatları doldur
  useEffect(() => {
    if (!setup) return;
    /* eslint-disable react-hooks/set-state-in-effect -- dışarıdan gelen seçim formu doldurur */
    setSymbol(setup.symbol);
    setEntry(String(setup.entry));
    setStop(String(setup.stop));
    setTarget(setup.target != null ? String(setup.target) : "");
    setSource(setup.source);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [setup]);

  const result = useMemo(() => {
    if (!entry || !stop || !equity) return null;
    return sizePosition({
      equity: num(equity),
      riskPct: num(riskPct) / 100,
      entry: num(entry),
      stop: num(stop),
      target: target ? num(target) : null,
      commissionRate: num(commissionBinde) / 1000,
      includeBsmv: bsmv,
      maxPositionPct: maxPosPct ? num(maxPosPct) / 100 : null,
    });
  }, [equity, riskPct, entry, stop, target, commissionBinde, bsmv, maxPosPct]);

  const limitText = (l: "risk" | "maxPosition" | "cash") =>
    l === "risk" ? "risk bütçesi" : l === "maxPosition" ? `azami pozisyon (%${maxPosPct})` : "nakit";

  return (
    <div id="lot-hesabi" className="card" style={{ marginBottom: 18 }}>
      <div className="card-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="card-title">Lot Hesabı — Risk Bazlı Pozisyon</div>
        <div className="card-sub">
          {symbol ? `${symbol}${source ? ` · ${source}` : ""}` : "Tablodaki “Lot” düğmesiyle doldur ya da elle gir"}
        </div>
      </div>
      <div style={{ padding: "14px 16px", display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          <Field label="Hesap büyüklüğü (₺)" hint={defaultEquity != null ? `hisse portföyü ≈ ${fmt.k(defaultEquity)} ₺` : undefined}>
            <input style={inp} inputMode="decimal" value={equity} onChange={(e) => setEquity(e.target.value)} />
          </Field>
          <Field label="İşlem başına risk (%)">
            <input style={inp} inputMode="decimal" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} />
          </Field>
          <Field label="Giriş">
            <input style={inp} inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} />
          </Field>
          <Field label="Stop">
            <input style={inp} inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} />
          </Field>
          <Field label="Hedef (opsiyonel)">
            <input style={inp} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Field
            label="Komisyon (binde)"
            hint={observedFeeRate != null ? `işlemlerinden: binde ${fmt.tr((observedFeeRate / (1 + BSMV_RATE)) * 1000, 2)} + BSMV` : undefined}
          >
            <input style={inp} inputMode="decimal" value={commissionBinde} onChange={(e) => setCommissionBinde(e.target.value)} />
          </Field>
          <Field label="Azami pozisyon (%)">
            <input style={inp} inputMode="decimal" value={maxPosPct} onChange={(e) => setMaxPosPct(e.target.value)} />
          </Field>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, alignSelf: "end", paddingBottom: 8 }}>
            <input type="checkbox" checked={bsmv} onChange={(e) => setBsmv(e.target.checked)} />
            BSMV (%5) ekle
          </label>
        </div>

        {result && !result.ok && (
          <div style={{ fontSize: 12, color: "var(--negative)" }}>{result.error}</div>
        )}
        {result && result.ok && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: 14,
                paddingTop: 12,
                borderTop: "1px solid var(--border-soft)",
              }}
            >
              <Stat
                label="Alınacak lot"
                value={fmt.tr(result.qty, 0)}
                color="var(--accent)"
                sub={`sınır: ${limitText(result.limitedBy)}`}
              />
              <Stat
                label="Pozisyon"
                value={`${fmt.tr(result.positionValue, 0)} ₺`}
                sub={`hesabın %${fmt.tr(result.positionPct * 100, 1)}'i`}
              />
              <Stat
                label="Stopta kayıp"
                value={`−${fmt.tr(result.actualRisk, 0)} ₺`}
                color="var(--negative)"
                sub={`bütçe ${fmt.tr(result.riskBudget, 0)} ₺ · lot başı ${fmt.tr(result.riskPerShare, 2)}`}
              />
              <Stat
                label="Masraf (al + stopta sat)"
                value={`${fmt.tr(result.buyCost + result.sellCostAtStop, 0)} ₺`}
                sub={`efektif binde ${fmt.tr(result.effectiveRate * 1000, 3)} / yön`}
              />
              <Stat label="Başabaş" value={`${fmt.tr(result.breakeven, 2)} ₺`} sub="iki yön masraf sonrası" />
              {result.rr != null && (
                <Stat
                  label="Net R/R"
                  value={fmt.tr(result.rr, 2)}
                  color={result.rr >= 2 ? "var(--positive)" : result.rr >= 1 ? "var(--warning)" : "var(--negative)"}
                  sub={`hedefte net +${fmt.tr(result.netRewardAtTarget ?? 0, 0)} ₺`}
                />
              )}
            </div>
            {result.qty === 0 && (
              <div className="hint" style={{ fontSize: 12 }}>
                Bu risk ve stop mesafesiyle 1 lot bile alınamıyor; stopu daralt ya da riski artır.
              </div>
            )}
          </>
        )}
        <div className="hint" style={{ fontSize: 11, lineHeight: 1.6 }}>
          Lot = (hesap × risk%) ÷ (giriş − stop + alış ve stopta satış masrafı). Komisyona %5 BSMV eklenir. Stop
          kayması (gap) ve borsa payı dahil değildir; gerçek kayıp stopun altında açılışta daha büyük olabilir.
          Bu bir alım/satım tavsiyesi değildir.
        </div>
      </div>
    </div>
  );
}
