"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { fmt } from "@/lib/finance/fmt";
import { Icon } from "@/components/ui/icon";
import type { PositionView } from "@/app/(app)/_lib/komite/types";
import {
  deactivateRiskFlag,
  upsertRiskFlag,
} from "@/app/(app)/_lib/komite/risk-flags-actions";
import type { RiskFlagKind, RiskFlagRow } from "@/lib/types/database";

const KIND_LABEL: Record<RiskFlagKind, string> = {
  vbts: "VBTS tedbiri",
  ban: "Açığa satış / kredili yasağı",
  spk: "SPK inceleme / ceza",
  fin: "Finansal bozulma",
  vol: "Aşırı volatilite",
  manual: "Manuel",
};

const KIND_OPTIONS: RiskFlagKind[] = ["vbts", "ban", "spk", "fin", "vol", "manual"];

export function PositionsPanel({
  positions,
  flags,
}: {
  positions: PositionView[];
  flags: RiskFlagRow[];
}) {
  const [editSymbol, setEditSymbol] = useState<string | null>(null);

  const flagsBySymbol = useMemo(() => {
    const m = new Map<string, RiskFlagRow[]>();
    for (const f of flags) {
      const arr = m.get(f.symbol) ?? [];
      arr.push(f);
      m.set(f.symbol, arr);
    }
    return m;
  }, [flags]);

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Pozisyonlarım</div>
        <div className="card-sub">{positions.length} pozisyon · ağırlık sıralı</div>
      </div>
      <table className="dg">
        <thead>
          <tr>
            <th>Sembol</th>
            <th>Sınıf</th>
            <th className="num">Değer</th>
            <th className="num">Ağırlık</th>
            <th>Sağlık</th>
            <th className="num">Kalite</th>
            <th>Gate</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const symFlags = flagsBySymbol.get(p.symbol) ?? [];
            const flaggable = p.bucket === "equity" || symFlags.length > 0;
            return (
              <PositionRow
                key={`${p.symbol}-${p.bucket}`}
                p={p}
                symFlags={symFlags}
                flaggable={flaggable}
                onEdit={() => setEditSymbol(editSymbol === p.symbol ? null : p.symbol)}
                editing={editSymbol === p.symbol}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PositionRow({
  p,
  symFlags,
  flaggable,
  onEdit,
  editing,
}: {
  p: PositionView;
  symFlags: RiskFlagRow[];
  flaggable: boolean;
  onEdit: () => void;
  editing: boolean;
}) {
  const gateColor =
    p.gate.tier === "hard"
      ? "var(--negative)"
      : p.gate.tier === "soft"
        ? "var(--warning)"
        : "var(--positive)";
  const gateBg =
    p.gate.tier === "hard"
      ? "var(--negative-soft)"
      : p.gate.tier === "soft"
        ? "var(--warning-soft)"
        : "transparent";
  const gateLabel =
    p.gate.tier === "hard"
      ? p.gate.quarantine
        ? "Karantina"
        : "Kapı"
      : p.gate.tier === "soft"
        ? "Riskli"
        : "Temiz";
  const gateTooltip =
    p.gate.reasons.length > 0
      ? p.gate.reasons.map((r) => r.label).join("\n")
      : "Aktif risk bayrağı yok";

  const bucketLabel: Record<string, string> = {
    equity: "Hisse",
    fund: "Fon",
    gold: "Altın",
    cash: "Nakit",
    other: "Diğer",
  };

  return (
    <>
      <tr>
        <td>
          <span style={{ fontWeight: 600 }}>{p.symbol}</span>
          {p.name !== p.symbol && (
            <div className="hint" style={{ fontSize: 10 }}>{p.name}</div>
          )}
        </td>
        <td className="hint" style={{ fontSize: 11 }}>
          {bucketLabel[p.bucket] ?? p.bucket}
          {p.sector && <div style={{ fontSize: 10 }}>{p.sector}</div>}
        </td>
        <td className="num tabular" style={{ fontWeight: 600 }}>{fmt.tr(p.value, 0)}</td>
        <td className="num tabular">%{p.weight.toFixed(1)}</td>
        <td>
          {p.healthLabel ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: p.healthColor ?? "var(--fg)",
                background: `color-mix(in srgb, ${p.healthColor ?? "var(--fg)"} 12%, transparent)`,
                padding: "2px 7px",
                borderRadius: 100,
                whiteSpace: "nowrap",
              }}
            >
              {p.healthLabel}
            </span>
          ) : (
            <span className="hint" style={{ fontSize: 11 }}>—</span>
          )}
        </td>
        <td className="num tabular">
          {p.effectiveQuality != null ? (
            <span style={{ fontWeight: 600 }}>
              {p.gate.quarantine ? (
                <span style={{ color: "var(--negative)" }} title={`Teknik ${p.qualityRaw?.toFixed(0)} — karantinada geçersiz`}>
                  kar.
                </span>
              ) : (
                p.effectiveQuality.toFixed(0)
              )}
              {!p.gate.quarantine && p.qualityRaw != null && p.effectiveQuality !== p.qualityRaw && (
                <span className="hint" style={{ fontSize: 9 }}> /{p.qualityRaw.toFixed(0)}</span>
              )}
            </span>
          ) : (
            <span className="hint">—</span>
          )}
        </td>
        <td>
          <span
            title={gateTooltip}
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 4,
              color: gateColor,
              background: gateBg,
            }}
          >
            {gateLabel}
          </span>
        </td>
        <td className="num">
          {flaggable && (
            <button className="btn btn-sm" onClick={onEdit} title="Risk bayrağı yönet">
              <Icon name="bolt" size={12} />
            </button>
          )}
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={8} style={{ background: "var(--surface-2)", padding: 0 }}>
            <FlagEditor symbol={p.symbol} symFlags={symFlags} />
          </td>
        </tr>
      )}
    </>
  );
}

function FlagEditor({ symbol, symFlags }: { symbol: string; symFlags: RiskFlagRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<RiskFlagKind>("vbts");
  const [severity, setSeverity] = useState(3);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    setError(null);
    startTransition(async () => {
      const res = await upsertRiskFlag({ symbol, kind, severity, note });
      if (!res.ok) setError(res.error);
      else {
        setNote("");
        router.refresh();
      }
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      await deactivateRiskFlag(id);
      router.refresh();
    });
  };

  return (
    <div style={{ padding: 14, display: "grid", gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{symbol} · Risk Bayrakları (Gate)</div>

      {symFlags.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {symFlags.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                  color: "var(--negative)",
                  background: "var(--negative-soft)",
                }}
              >
                {KIND_LABEL[f.kind]} · s{f.severity}
              </span>
              {f.note && <span className="hint">{f.note}</span>}
              {f.expires_at && (
                <span className="hint" style={{ fontSize: 11 }}>· biter {f.expires_at}</span>
              )}
              <button
                className="btn btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
                onClick={() => remove(f.id)}
              >
                Kaldır
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as RiskFlagKind)}
          style={selectStyle}
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </select>
        <select
          value={severity}
          onChange={(e) => setSeverity(Number(e.target.value))}
          style={selectStyle}
          title="Şiddet"
        >
          <option value={1}>Şiddet 1</option>
          <option value={2}>Şiddet 2</option>
          <option value={3}>Şiddet 3</option>
        </select>
        <input
          placeholder="Not (opsiyonel)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ ...selectStyle, width: 200 }}
        />
        <button className="btn btn-sm btn-prim" onClick={add} disabled={pending}>
          {pending ? "…" : "Bayrak ekle"}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "var(--negative)" }}>{error}</div>
      )}
      <div className="hint" style={{ fontSize: 11 }}>
        VBTS / yasak / SPK → karantina (teknik skor geçersiz). Finansal bozulma /
        volatilite → tavan. Düşük likidite otomatik gate yer.
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--fg)",
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 12,
};
