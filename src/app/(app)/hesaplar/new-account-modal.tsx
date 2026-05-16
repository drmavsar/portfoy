"use client";

import { Icon } from "@/components/ui/icon";
import { PEOPLE } from "@/lib/sample/data";

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

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--muted)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

export function NewAccountModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-soft)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="bank" size={16} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Yeni Hesap</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Banka</Lbl>
              <select style={inp}>
                <option>Garanti BBVA</option>
                <option>İş Bankası</option>
                <option>Akbank (yeni)</option>
                <option>Yapı Kredi (yeni)</option>
              </select>
            </div>
            <div>
              <Lbl>Tip</Lbl>
              <select style={inp}>
                <option>Vadesiz</option>
                <option>Vadeli</option>
                <option>Dolar</option>
                <option>Euro</option>
                <option>Altın</option>
                <option>Yatırım</option>
              </select>
            </div>
          </div>
          <div>
            <Lbl>Hesap Adı</Lbl>
            <input style={inp} defaultValue="Vadesiz" />
          </div>
          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Para Birimi</Lbl>
              <select style={inp}>
                <option>TRY</option>
                <option>USD</option>
                <option>EUR</option>
                <option>XAU</option>
              </select>
            </div>
            <div>
              <Lbl>Açılış Bakiyesi</Lbl>
              <input type="number" style={inp} defaultValue="0" />
            </div>
          </div>
          <div>
            <Lbl>IBAN</Lbl>
            <input style={inp} placeholder="TR.. 0000 0000 0000 0000 0000 00" />
          </div>
          <div>
            <Lbl>Sahip</Lbl>
            <select style={inp}>
              {PEOPLE.filter((p) => p.role !== "household").map((p) => (
                <option key={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border-soft)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button className="btn" onClick={onClose}>İptal</button>
          <button className="btn btn-prim">Hesabı Ekle</button>
        </div>
      </div>
    </div>
  );
}
