"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";

import {
  type BeneficiaryRow,
  createBeneficiary,
  deleteBeneficiary,
  updateBeneficiaryColor,
} from "./actions";

const COLORS = ["#6ea8fe", "#4cc9b0", "#d4a056", "#b388f2", "#e26a8f", "#a4cc4c"];

const inp: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--fg)",
  padding: "8px 10px",
  borderRadius: 6,
  fontSize: 13,
  outline: "none",
  width: "100%",
};

const ROLE_LABELS: Record<string, string> = {
  self: "kendisi",
  household: "hâne",
  son: "oğul",
  daughter: "kız",
  parent: "ebeveyn",
  spouse: "eş",
  other: "diğer",
};

interface Props {
  initialRows: BeneficiaryRow[];
  configured: boolean;
}

export function KisilerTab({ initialRows, configured }: Props) {
  const [rows, setRows] = useState<BeneficiaryRow[]>(initialRows);
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("other");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    if (!name.trim() || busy) return;
    setError(null);
    startTransition(async () => {
      const result = await createBeneficiary({ name, role });
      if (result.ok) {
        setRows([...rows, result.row]);
        setName("");
      } else {
        setError(result.error);
      }
    });
  };

  const changeColor = (id: string, color: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, color } : r)));
    startTransition(async () => {
      const result = await updateBeneficiaryColor(id, color);
      if (!result.ok) setError(result.error ?? "Renk güncellenemedi.");
    });
  };

  const remove = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    startTransition(async () => {
      const result = await deleteBeneficiary(id);
      if (!result.ok) setError(result.error ?? "Silinemedi.");
    });
  };

  return (
    <div className="grid-base" style={{ gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Kişiler</div>
          <div className="card-sub">{rows.length} kişi {configured ? "" : "· demo modu"}</div>
        </div>

        {!configured && (
          <div
            style={{
              margin: "10px 14px",
              padding: 10,
              background: "var(--warning-soft)",
              color: "var(--warning)",
              borderRadius: 6,
              fontSize: 12,
              border: "1px solid color-mix(in oklab, var(--warning) 30%, transparent)",
            }}
          >
            Supabase yapılandırılmamış. CRUD pasif — sadece okunuyor.
          </div>
        )}

        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--border-soft)",
            display: "grid",
            gridTemplateColumns: "1fr 130px auto",
            gap: 8,
          }}
        >
          <input
            style={inp}
            placeholder="Yeni kişi adı (örn. Eş, Gelin, Damat)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            disabled={!configured || busy}
          />
          <select
            style={inp}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={!configured || busy}
          >
            <option value="self">Kendisi</option>
            <option value="spouse">Eş</option>
            <option value="son">Oğul</option>
            <option value="daughter">Kız</option>
            <option value="parent">Ebeveyn</option>
            <option value="household">Hâne</option>
            <option value="other">Diğer</option>
          </select>
          <button
            className="btn btn-prim"
            onClick={add}
            disabled={!configured || busy || !name.trim()}
          >
            <Icon name="plus" size={12} /> Ekle
          </button>
        </div>

        {error && (
          <div style={{ padding: "8px 14px", color: "var(--negative)", fontSize: 12 }}>{error}</div>
        )}

        <div>
          {rows.length === 0 ? (
            <div className="empty">
              <div className="title">Henüz kişi yok</div>
              <div>Yukarıdaki kutuya isim yazıp Ekle&apos;ye tıkla.</div>
            </div>
          ) : (
            rows.map((p, i) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border-soft)",
                }}
              >
                <div
                  className="avatar"
                  style={{
                    background: p.color ?? "#7d8699",
                    color: "#0a0d14",
                    width: 28,
                    height: 28,
                    fontSize: 11,
                  }}
                >
                  {p.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                  <div className="hint">{ROLE_LABELS[p.role] ?? p.role}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => changeColor(p.id, c)}
                      disabled={!configured || busy}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 50,
                        background: c,
                        border: c === p.color ? "2px solid var(--fg)" : "2px solid transparent",
                        cursor: configured ? "pointer" : "not-allowed",
                      }}
                    />
                  ))}
                </div>
                <button
                  className="icon-btn"
                  onClick={() => remove(p.id)}
                  disabled={!configured || busy}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">İpucu</div></div>
        <div className="card-pad" style={{ fontSize: 13, color: "var(--fg-soft)", lineHeight: 1.6 }}>
          <p>Yeni kişi eklediğinde:</p>
          <ul style={{ paddingLeft: 20, color: "var(--muted)" }}>
            <li>Yatırımlar sekmesinde otomatik tab açılır</li>
            <li>Gelir/Gider sekmelerinde filtreye eklenir</li>
            <li>Hâne kartları arasında görünür</li>
            <li>Raporlar grafiklerine seri olarak katılır</li>
          </ul>
          <p style={{ marginTop: 14 }}>
            Renk seçimi her ekrandaki chip/donut&apos;larda kullanılır. Daha sonra istediğinde değiştirebilirsin.
          </p>
          {configured && (
            <p style={{ marginTop: 14, color: "var(--positive)", fontWeight: 600 }}>
              ✓ Supabase&apos;e bağlı — değişiklikler kalıcı.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
