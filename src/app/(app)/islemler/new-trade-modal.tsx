"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";
import { HOLDINGS, PEOPLE } from "@/lib/sample/data";

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

export function NewTradeModal({ onClose }: { onClose: () => void }) {
  const [sym, setSym] = useState("ASELS");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState(100);
  const [price, setPrice] = useState(84.55);
  const [ben, setBen] = useState("ben");
  const [custody, setCustody] = useState("Midas");

  const existing = useMemo(() => HOLDINGS.find((h) => h.sym === sym && h.sub === ben), [sym, ben]);
  const newQty = side === "BUY" ? (existing?.qty ?? 0) + qty : Math.max(0, (existing?.qty ?? 0) - qty);
  const newWac =
    side === "BUY" && existing
      ? (existing.qty * existing.wac + qty * price) / newQty
      : side === "BUY" && !existing
        ? price
        : existing?.wac ?? 0;

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
          <Icon name="swap" size={16} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Yeni İşlem</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Kişi</Lbl>
              <select style={inp} value={ben} onChange={(e) => setBen(e.target.value)}>
                {PEOPLE.filter((p) => p.role !== "parent" && p.role !== "household").map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Lbl>Saklama</Lbl>
              <select style={inp} value={custody} onChange={(e) => setCustody(e.target.value)}>
                <option>Midas</option>
                <option>Garanti BBVA</option>
                <option>İş Bankası</option>
                <option>Garanti Kripto</option>
                <option>Kasa</option>
              </select>
            </div>
          </div>

          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Sembol</Lbl>
              <input style={inp} value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} />
              <div className="hint" style={{ marginTop: 4 }}>typeahead — son fiyat çekilir</div>
            </div>
            <div>
              <Lbl>Yön</Lbl>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn"
                  style={{
                    flex: 1,
                    background: side === "BUY" ? "var(--positive-soft)" : "transparent",
                    color: side === "BUY" ? "var(--positive)" : "var(--fg)",
                    fontWeight: side === "BUY" ? 700 : 500,
                  }}
                  onClick={() => setSide("BUY")}
                >
                  ALIŞ
                </button>
                <button
                  className="btn"
                  style={{
                    flex: 1,
                    background: side === "SELL" ? "var(--negative-soft)" : "transparent",
                    color: side === "SELL" ? "var(--negative)" : "var(--fg)",
                    fontWeight: side === "SELL" ? 700 : 500,
                  }}
                  onClick={() => setSide("SELL")}
                >
                  SATIŞ
                </button>
              </div>
            </div>
          </div>

          <div className="grid-base grid-3" style={{ gap: 14 }}>
            <div>
              <Lbl>Adet</Lbl>
              <input type="number" style={inp} value={qty} onChange={(e) => setQty(+e.target.value || 0)} />
            </div>
            <div>
              <Lbl>Fiyat (₺)</Lbl>
              <input
                type="number"
                step="0.01"
                style={inp}
                value={price}
                onChange={(e) => setPrice(+e.target.value || 0)}
              />
            </div>
            <div>
              <Lbl>Tarih</Lbl>
              <input style={inp} defaultValue="15.05.2026" />
            </div>
          </div>

          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Komisyon</Lbl>
              <input type="number" step="0.01" style={inp} defaultValue="0.40" />
            </div>
            <div>
              <Lbl>Not</Lbl>
              <input style={inp} placeholder="opsiyonel" />
            </div>
          </div>

          <div
            style={{
              padding: 14,
              background: side === "BUY" ? "var(--positive-soft)" : "var(--negative-soft)",
              borderRadius: 8,
              border:
                "1px solid " +
                (side === "BUY"
                  ? "color-mix(in oklab, var(--positive) 30%, transparent)"
                  : "color-mix(in oklab, var(--negative) 30%, transparent)"),
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 6,
              }}
            >
              Önizleme
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, fontSize: 13 }}>
              <div>
                <div className="hint" style={{ fontSize: 10 }}>İşlem Tutarı</div>
                <div className="tabular" style={{ fontWeight: 700, fontSize: 15 }}>{fmt.tr(qty * price, 2)} ₺</div>
              </div>
              <div>
                <div className="hint" style={{ fontSize: 10 }}>Mevcut Pozisyon</div>
                <div className="tabular" style={{ fontWeight: 600 }}>
                  {existing?.qty ?? 0} → <b>{newQty}</b>
                </div>
              </div>
              <div>
                <div className="hint" style={{ fontSize: 10 }}>WAC Değişimi</div>
                <div className="tabular" style={{ fontWeight: 600 }}>
                  {existing ? fmt.tr(existing.wac, 2) : "—"} ₺ → <b>{newWac ? fmt.tr(newWac, 2) : "—"} ₺</b>
                </div>
              </div>
              <div>
                <div className="hint" style={{ fontSize: 10 }}>K/Z Etkisi</div>
                <div
                  className="tabular"
                  style={{ fontWeight: 600, color: side === "SELL" ? "var(--negative)" : "var(--muted)" }}
                >
                  {side === "SELL" && existing
                    ? (price > existing.wac ? "+" : "") + fmt.k((price - existing.wac) * qty) + " ₺"
                    : "lot oluştur"}
                </div>
              </div>
            </div>
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
          <button className="btn btn-prim">{side === "BUY" ? "Alışı Kaydet" : "Satışı Kaydet"}</button>
        </div>
      </div>
    </div>
  );
}
