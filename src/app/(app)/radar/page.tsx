import { FlagBadge, type FlagKind } from "@/components/ui/chips";
import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";
import { SCREENER } from "@/lib/sample/data";

export default function RadarPage() {
  const sorted = [...SCREENER].sort((a, b) => b.comp - a.comp);
  const tier1 = sorted.filter((s) => s.comp >= 85);
  const tier2 = sorted.filter((s) => s.comp >= 70 && s.comp < 85);
  const tier3 = sorted.filter((s) => s.comp >= 55 && s.comp < 70);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Piyasa Radarı</div>
          <div className="page-sub">
            Teknik önce, temel sonra — BIST&apos;te paranın aktığı hisseleri yakala.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="refresh" size={14} /> Tara</button>
          <button className="btn"><Icon name="filter" size={14} /> Filtreler</button>
        </div>
      </div>

      <div
        className="card"
        style={{ marginBottom: 18, padding: 14, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="card-title">Aşama 1 — Teknik Eleme</span>
          <span className="hint">Close &gt; SMA200 · RS ≥ 70 · Ort. Hacim ≥ 5M ₺</span>
        </div>
        <div style={{ width: 1, height: 28, background: "var(--border)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="card-title">Aşama 2 — Temel Kalite</span>
          <span className="hint">Net Borç/EBITDA &lt; 3 · FCF &gt; 0 · ROE</span>
        </div>
        <div style={{ width: 1, height: 28, background: "var(--border)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="card-title">Aşama 3 — Katalist</span>
          <span className="hint">KAP + LLM özet · pozitif / negatif bayrak</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <span className="chip chip-pos chip-sm">Tier 1 · {tier1.length}</span>
          <span className="chip chip-warn chip-sm">Tier 2 · {tier2.length}</span>
          <span className="chip chip-sm">Tier 3 · {tier3.length}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Composite Score · sıralı</div>
          <div className="card-sub">{SCREENER.length} hisse · son tarama bugün 09:00</div>
        </div>
        <table className="dg">
          <thead>
            <tr>
              <th>Sembol</th>
              <th>Ad</th>
              <th>Sektör</th>
              <th className="num">Comp</th>
              <th className="num">Tech</th>
              <th className="num">Fund</th>
              <th className="num">RS</th>
              <th className="num">Vol×Avg</th>
              <th className="num">52H Δ</th>
              <th>Rozetler</th>
              <th className="num">Son</th>
              <th className="num">Δ</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.sym}>
                <td style={{ fontWeight: 600 }}>{s.sym}</td>
                <td>{s.name}</td>
                <td className="hint">{s.sector}</td>
                <td
                  className="num tabular"
                  style={{
                    fontWeight: 700,
                    color:
                      s.comp >= 85
                        ? "var(--positive)"
                        : s.comp >= 70
                          ? "var(--warning)"
                          : "var(--muted)",
                  }}
                >
                  {s.comp}
                </td>
                <td className="num tabular">{s.tech}</td>
                <td className="num tabular">{s.fund}</td>
                <td className="num tabular">{s.rs}</td>
                <td className="num tabular">{s.volSurprise.toFixed(1)}×</td>
                <td className="num tabular hint">{s.dist52h.toFixed(1)}%</td>
                <td>
                  <div className="row gap-4">
                    {s.flags.map((f) => (
                      <FlagBadge key={f} kind={f as FlagKind} />
                    ))}
                  </div>
                </td>
                <td className="num tabular">{fmt.tr(s.last, 2)}</td>
                <td
                  className={`num tabular ${s.chg >= 0 ? "delta-pos" : "delta-neg"}`}
                  style={{ fontWeight: 600 }}
                >
                  {fmt.pct(s.chg)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
