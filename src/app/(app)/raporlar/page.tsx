"use client";

import { useState } from "react";

import { BarChart } from "@/components/charts/bar-chart";
import { Donut } from "@/components/charts/donut";
import { LineChart } from "@/components/charts/line-chart";
import { StackedArea } from "@/components/charts/stacked-area";
import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";
import {
  ASSET_COMP_DAILY,
  BEN_SPEND,
  CASHFLOW_12,
  EXPENSE_BY_CAT_MONTH,
  INCOME_BY_CAT_MONTH,
  PEOPLE,
  PERSON_PORT_HIST,
  REAL_VS_NOM,
} from "@/lib/sample/data";

function SummaryStat({ label, value, pos, neg }: { label: string; value: string; pos?: boolean; neg?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          fontSize: 18,
          color: pos ? "var(--positive)" : neg ? "var(--negative)" : "var(--fg)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function RaporlarPage() {
  const [range, setRange] = useState("ytd");
  const [normalize, setNormalize] = useState(false);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Raporlar</div>
          <div className="page-sub">Tarihsel trendler, varlık kompozisyonu, kategori dağılımları.</div>
        </div>
        <div className="page-actions">
          {(
            [
              ["1ay", "Bu Ay"],
              ["ytd", "YTD"],
              ["12a", "Son 12 Ay"],
              ["ozel", "Özel"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              className="btn btn-sm"
              onClick={() => setRange(k)}
              style={range === k ? { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" } : undefined}
            >
              {l}
            </button>
          ))}
          <span style={{ width: 1, height: 20, background: "var(--border)", margin: "0 6px" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} /> 100=baz
          </label>
          <button className="btn"><Icon name="download" size={14} /> PDF</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <SummaryStat label="Toplam Gelir (12A)" value="+1.512.000 ₺" pos />
          <SummaryStat label="Toplam Gider (12A)" value="−884.000 ₺" neg />
          <SummaryStat label="Net Tasarruf" value="+628.000 ₺" pos />
          <SummaryStat label="Tasarruf Oranı" value="%41,5" pos />
          <span className="spacer" />
          <SummaryStat label="Servet Değişimi (12A)" value="+%18,1" pos />
          <SummaryStat label="Reel Getiri (12A)" value="+%14,8" pos />
        </div>
      </div>

      <div className="grid-base" style={{ gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Yıllık Gelir-Gider Trendi</div>
            <div className="card-sub">aylık · son 12 ay</div>
            <div style={{ display: "flex", gap: 10, marginLeft: "auto", fontSize: 10, color: "var(--muted)" }}>
              <span>
                <span style={{ display: "inline-block", width: 10, height: 10, background: "var(--positive)", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />
                Gelir
              </span>
              <span>
                <span style={{ display: "inline-block", width: 10, height: 10, background: "var(--negative)", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />
                Gider
              </span>
              <span>
                <span style={{ display: "inline-block", width: 18, height: 2, background: "var(--accent)", marginRight: 4, verticalAlign: "middle" }} />
                Net
              </span>
            </div>
          </div>
          <div className="card-pad">
            <BarChart data={CASHFLOW_12} width={580} height={220} showNet />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Varlık Kompozisyonu</div>
            <div className="card-sub">günlük · son 90 gün · stacked</div>
          </div>
          <div className="card-pad">
            <StackedArea
              labels={ASSET_COMP_DAILY.labels}
              series={[
                { name: "Nakit", values: ASSET_COMP_DAILY.nakit, color: "#7d8699" },
                { name: "Döviz", values: ASSET_COMP_DAILY.doviz, color: "#4cc9b0" },
                { name: "Altın", values: ASSET_COMP_DAILY.altin, color: "#d4a056" },
                { name: "Hisse", values: ASSET_COMP_DAILY.hisse, color: "#6ea8fe" },
                { name: "Kripto", values: ASSET_COMP_DAILY.kripto, color: "#b388f2" },
              ]}
              width={580}
              height={220}
            />
            <div
              style={{
                marginTop: 10,
                padding: "8px 10px",
                background: "var(--surface-2)",
                borderRadius: 6,
                display: "flex",
                gap: 14,
                fontSize: 11,
                fontFamily: "var(--font-mono)",
              }}
            >
              <span>
                <span style={{ display: "inline-block", width: 8, height: 8, background: "#7d8699", borderRadius: 2, marginRight: 5 }} />
                Nakit %1,8
              </span>
              <span>
                <span style={{ display: "inline-block", width: 8, height: 8, background: "#4cc9b0", borderRadius: 2, marginRight: 5 }} />
                Döviz %20,4
              </span>
              <span>
                <span style={{ display: "inline-block", width: 8, height: 8, background: "#d4a056", borderRadius: 2, marginRight: 5 }} />
                Altın %22,4
              </span>
              <span>
                <span style={{ display: "inline-block", width: 8, height: 8, background: "#6ea8fe", borderRadius: 2, marginRight: 5 }} />
                Hisse %31,8
              </span>
              <span>
                <span style={{ display: "inline-block", width: 8, height: 8, background: "#b388f2", borderRadius: 2, marginRight: 5 }} />
                Kripto %23,6
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Kişi Bazlı Portföy Tarihsel</div>
            <div className="card-sub">günlük · son 90 gün</div>
          </div>
          <div className="card-pad">
            <LineChart
              labels={PERSON_PORT_HIST.labels}
              series={[
                { name: "Ben", values: PERSON_PORT_HIST.ben, color: "#6ea8fe", strong: true },
                { name: "Ahmet Burak", values: PERSON_PORT_HIST.aburak, color: "#d4a056", strong: true },
                { name: "Salih", values: PERSON_PORT_HIST.salih, color: "#b388f2", strong: true },
              ]}
              width={580}
              height={220}
              yFmt={(v) => fmt.k(v)}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Reel vs Nominal Getiri</div>
            <div className="card-sub">endeksli · 12 ay · baz 100</div>
          </div>
          <div className="card-pad">
            <LineChart
              labels={REAL_VS_NOM.labels}
              series={[
                { name: "Portföy", values: REAL_VS_NOM.port, color: "var(--accent)", strong: true },
                { name: "TÜFE", values: REAL_VS_NOM.cpi, color: "var(--negative)", dash: "4 2" },
                { name: "USD", values: REAL_VS_NOM.usd, color: "#4cc9b0" },
                { name: "XAU", values: REAL_VS_NOM.xau, color: "#d4a056" },
                { name: "BIST100", values: REAL_VS_NOM.bist, color: "#b388f2" },
              ]}
              width={580}
              height={220}
            />
            <div className="row gap-12" style={{ marginTop: 8, fontSize: 11, color: "var(--muted-2)", flexWrap: "wrap" }}>
              <span>Portföy <b style={{ color: "var(--positive)" }}>+38,2%</b></span>
              <span>· TÜFE <b style={{ color: "var(--negative)" }}>+22,1%</b></span>
              <span>· Reel Getiri <b style={{ color: "var(--positive)" }}>+14,8%</b></span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-base grid-3" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-head"><div className="card-title">Bu Ay — Gelir Dağılımı</div></div>
          <div className="card-pad">
            <Donut
              data={INCOME_BY_CAT_MONTH}
              size={170}
              thickness={26}
              centerLabel="Gelir"
              centerValue={fmt.k(INCOME_BY_CAT_MONTH.reduce((s, i) => s + i.value, 0)) + " ₺"}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">Bu Ay — Gider Dağılımı</div></div>
          <div className="card-pad">
            <Donut
              data={EXPENSE_BY_CAT_MONTH}
              size={170}
              thickness={26}
              centerLabel="Gider"
              centerValue={fmt.k(EXPENSE_BY_CAT_MONTH.reduce((s, e) => s + e.value, 0)) + " ₺"}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-title">Bu Ay — Kişiye Göre Gider</div></div>
          <div className="card-pad">
            <Donut
              data={BEN_SPEND.map((b) => ({
                label: b.label,
                value: b.amount,
                color: PEOPLE.find((p) => p.id === b.id)?.color ?? "#7d8699",
              }))}
              size={170}
              thickness={26}
              centerLabel="Bu ay"
              centerValue={fmt.k(BEN_SPEND.reduce((s, b) => s + b.amount, 0)) + " ₺"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
