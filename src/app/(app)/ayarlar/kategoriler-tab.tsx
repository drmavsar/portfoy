"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";

import {
  type CategoryRow,
  createCategory,
  deleteCategory,
} from "./actions";

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

const ICON_CHOICES = ["🛒", "🍔", "🚗", "🏠", "💊", "📚", "✈️", "💻", "🎬", "💰", "📈", "🎁", "🔁", "🎯"];

interface CategoryListProps {
  title: string;
  kind: "income" | "expense" | "transfer";
  rows: CategoryRow[];
  onAdd: (row: CategoryRow) => void;
  onRemove: (id: string) => void;
  configured: boolean;
}

function CategoryList({ title, kind, rows, onAdd, onRemove, configured }: CategoryListProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICON_CHOICES[0]);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    if (!name.trim() || busy) return;
    setError(null);
    startTransition(async () => {
      const r = await createCategory({ name, kind, icon });
      if (r.ok) {
        onAdd(r.row);
        setName("");
      } else {
        setError(r.error);
      }
    });
  };

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">{title}</div>
        <div className="card-sub">{rows.length}</div>
      </div>

      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--border-soft)",
          display: "grid",
          gridTemplateColumns: "60px 1fr auto",
          gap: 8,
        }}
      >
        <select
          style={inp}
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          disabled={!configured || busy}
        >
          {ICON_CHOICES.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <input
          style={inp}
          placeholder="Yeni kategori"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          disabled={!configured || busy}
        />
        <button
          className="btn btn-prim"
          onClick={add}
          disabled={!configured || busy || !name.trim()}
        >
          <Icon name="plus" size={12} /> Ekle
        </button>
      </div>

      {error && <div style={{ padding: "8px 14px", color: "var(--negative)", fontSize: 12 }}>{error}</div>}

      <div>
        {rows.length === 0 ? (
          <div className="empty">
            <div>Henüz kategori yok.</div>
          </div>
        ) : (
          rows.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderTop: i === 0 ? "none" : "1px solid var(--border-soft)",
              }}
            >
              <span style={{ fontSize: 16 }}>{c.icon ?? "·"}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{c.name}</span>
              {c.color && (
                <span style={{ width: 10, height: 10, borderRadius: 50, background: c.color }} />
              )}
              <button
                className="icon-btn"
                onClick={() => onRemove(c.id)}
                disabled={!configured || busy}
                title="Sil"
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface Props {
  initialRows: CategoryRow[];
  configured: boolean;
}

export function KategorilerTab({ initialRows, configured }: Props) {
  const [rows, setRows] = useState<CategoryRow[]>(initialRows);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const expense = rows.filter((c) => c.kind === "expense");
  const income = rows.filter((c) => c.kind === "income");

  const addRow = (r: CategoryRow) => setRows((prev) => [...prev, r]);
  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    startTransition(async () => {
      const r = await deleteCategory(id);
      if (!r.ok) setError(r.error ?? "Silinemedi.");
    });
  };

  return (
    <div>
      {!configured && (
        <div
          style={{
            margin: "0 0 12px",
            padding: 10,
            background: "var(--warning-soft)",
            color: "var(--warning)",
            borderRadius: 6,
            fontSize: 12,
          }}
        >
          Supabase yapılandırılmamış. CRUD pasif.
        </div>
      )}
      {error && (
        <div style={{ padding: 10, marginBottom: 12, color: "var(--negative)", fontSize: 12 }}>
          {error}
        </div>
      )}
      <div className="grid-base grid-2" style={{ gap: 16, alignItems: "start" }}>
        <CategoryList
          title="Gider Kategorileri"
          kind="expense"
          rows={expense}
          onAdd={addRow}
          onRemove={removeRow}
          configured={configured}
        />
        <CategoryList
          title="Gelir Kategorileri"
          kind="income"
          rows={income}
          onAdd={addRow}
          onRemove={removeRow}
          configured={configured}
        />
      </div>
    </div>
  );
}
