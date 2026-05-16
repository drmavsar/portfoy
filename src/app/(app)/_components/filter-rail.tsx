import { BANKS, CATS, PEOPLE } from "@/lib/sample/data";

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

export function FilterRail({ kind }: { kind: "income" | "expense" }) {
  const cats = CATS.filter((c) => c.kind === (kind === "income" ? "income" : "expense"));
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Filtreler</div>
      </div>
      <div className="card-pad" style={{ display: "grid", gap: 16 }}>
        <FilterGroup label="Tarih Aralığı">
          <button className="btn btn-sm" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "transparent" }}>
            Son 30 Gün
          </button>
          <button className="btn btn-sm">YTD</button>
          <button className="btn btn-sm">Özel</button>
        </FilterGroup>
        <FilterGroup label="Kişi">
          {PEOPLE.map((p) => (
            <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" defaultChecked />
              <span className="chip-dot" style={{ background: p.color }} />
              <span style={{ flex: 1 }}>{p.name}</span>
            </label>
          ))}
        </FilterGroup>
        <FilterGroup label="Kategori">
          {cats.map((c) => (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" defaultChecked />
              <span style={{ fontSize: 12 }}>{c.icon}</span>
              <span style={{ flex: 1 }}>{c.name}</span>
            </label>
          ))}
        </FilterGroup>
        <FilterGroup label="Hesap">
          {BANKS.map((b) => (
            <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" defaultChecked={b.id !== "kasa"} />
              <span style={{ flex: 1 }}>{b.name}</span>
            </label>
          ))}
        </FilterGroup>
        {kind === "income" && (
          <FilterGroup label="Tekrar Eden">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" /> Sadece tekrar edenler
            </label>
          </FilterGroup>
        )}
      </div>
    </div>
  );
}

export function SourcePill({ src }: { src: "manuel" | "ekstre" | "sistem" }) {
  const map = {
    manuel: { c: "var(--muted)", l: "Manuel" },
    ekstre: { c: "var(--accent)", l: "Ekstre" },
    sistem: { c: "var(--positive)", l: "Sistem" },
  };
  const m = map[src] ?? map.manuel;
  return (
    <span
      className="chip chip-sm"
      style={{
        color: m.c,
        background: `color-mix(in oklab, ${m.c} 12%, transparent)`,
        borderColor: "transparent",
      }}
    >
      {m.l}
    </span>
  );
}
