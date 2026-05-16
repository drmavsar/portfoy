import { CatChip } from "@/components/ui/chips";
import { Icon } from "@/components/ui/icon";
import { CATS, PEOPLE, RULES } from "@/lib/sample/data";

export default function SettingsPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Kurallar &amp; Ayarlar</div>
          <div className="page-sub">
            Sistemi kendi diline öğret — kategori, faydalanıcı, kural hepsi
            dinamik.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-prim">
            <Icon name="plus" size={14} /> Yeni Kural
          </button>
        </div>
      </div>

      <div className="grid-base grid-3" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Faydalanıcılar</div>
            <span className="card-sub">{PEOPLE.length} kayıt</span>
          </div>
          <div className="card-pad" style={{ display: "grid", gap: 6 }}>
            {PEOPLE.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "12px 1fr auto auto",
                  gap: 8,
                  alignItems: "center",
                  padding: "6px 4px",
                  borderBottom: "1px solid var(--border-soft)",
                  fontSize: 13,
                }}
              >
                <span
                  className="chip-dot"
                  style={{ background: p.color, width: 10, height: 10 }}
                />
                <span style={{ fontWeight: 500 }}>{p.name}</span>
                <span className="hint">{p.role}</span>
                <button className="icon-btn" data-tip="Düzenle">
                  <Icon name="edit" size={12} />
                </button>
              </div>
            ))}
            <button
              className="btn btn-sm"
              style={{ marginTop: 6, justifyContent: "center" }}
            >
              <Icon name="plus" size={11} /> Yeni Faydalanıcı (örn. Eş)
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Kategoriler</div>
            <span className="card-sub">{CATS.length} kayıt</span>
          </div>
          <div
            className="card-pad"
            style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
          >
            {CATS.map((c) => (
              <CatChip key={c.id} id={c.id} />
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Saklama / Kanal</div>
          </div>
          <div className="card-pad" style={{ display: "grid", gap: 6 }}>
            {["Garanti BBVA", "İş Bankası", "Midas", "Garanti Kripto", "Kasa"].map(
              (c) => (
                <div
                  key={c}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 4px",
                    borderBottom: "1px solid var(--border-soft)",
                    fontSize: 13,
                  }}
                >
                  <span>{c}</span>
                  <span className="hint">aktif</span>
                </div>
              ),
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Sınıflandırma Kuralları</div>
          <div className="card-sub">öncelik sırasına göre · ilk eşleşme uygulanır</div>
        </div>
        <table className="dg">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Kural</th>
              <th>Eşleşme</th>
              <th>Aksiyon</th>
              <th className="num">Hit</th>
              <th>Son</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {RULES.map((r) => (
              <tr key={r.id}>
                <td className="num tabular hint">{r.prio}</td>
                <td style={{ fontWeight: 500 }}>{r.name}</td>
                <td className="hint" style={{ fontFamily: "var(--font-mono)" }}>
                  {r.match}
                </td>
                <td className="hint">{r.action}</td>
                <td className="num tabular">{r.hits}</td>
                <td className="hint tabular">{r.last}</td>
                <td>
                  <button className="icon-btn">
                    <Icon name="edit" size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
