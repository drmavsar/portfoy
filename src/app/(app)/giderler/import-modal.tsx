"use client";

import { useState } from "react";

import { CatChip, ConfPill, PersonChip } from "@/components/ui/chips";
import { Icon } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";
import { DRAFT, DRAFT_ROWS, type DraftRow } from "@/lib/sample/data";

export function ImportModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [rows, setRows] = useState<DraftRow[]>(DRAFT_ROWS);

  const accept = (id: number) => setRows((r) => r.map((x) => (x.id === id ? { ...x, status: "auto" } : x)));
  const ignore = (id: number) => setRows((r) => r.map((x) => (x.id === id ? { ...x, status: "ignored" } : x)));

  const counts = {
    auto: rows.filter((r) => r.status === "auto").length,
    review: rows.filter((r) => r.status === "review").length,
    ignored: rows.filter((r) => r.status === "ignored").length,
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: "95vw", maxWidth: 1100, maxHeight: "92vh" }}>
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border-soft)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="upload" size={16} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Ekstre Yükle</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        {step === "upload" && (
          <div style={{ padding: 24 }}>
            <div
              style={{
                border: "1.5px dashed var(--border)",
                borderRadius: 10,
                padding: "40px 20px",
                textAlign: "center",
                background: "var(--surface)",
              }}
            >
              <Icon name="upload2" size={32} stroke={1.4} />
              <div style={{ marginTop: 14, fontSize: 15, fontWeight: 600 }}>Ekstre dosyalarını sürükle bırak</div>
              <div className="hint" style={{ marginTop: 6 }}>Garanti BBVA Bonus XLS · CSV · PDF (kuyrukta OCR)</div>
              <button className="btn btn-prim" style={{ marginTop: 16 }} onClick={() => setStep("review")}>
                Dosya Seç
              </button>
              <div className="hint" style={{ marginTop: 10, fontSize: 11 }}>
                veya örnek dosyayı kullan:{" "}
                <span style={{ color: "var(--accent)" }}>garanti-bonus-platinum-05-2026.csv</span>
              </div>
            </div>
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: "var(--accent-soft)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--fg-soft)",
              }}
            >
              <b style={{ color: "var(--accent)" }}>Akıllı Sınıflandırma</b> — Sistem ekstreyi yüklediğinde geçmiş verilere ve konumlara bakarak otomatik kategorize eder. Kural eşleşmezse onay bekler.
            </div>
          </div>
        )}

        {step === "review" && (
          <div style={{ overflowY: "auto", maxHeight: "72vh" }}>
            <div
              style={{
                padding: "12px 20px",
                borderBottom: "1px solid var(--border-soft)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <Icon name="folder" size={14} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>{DRAFT.filename}</span>
              <span className="chip chip-sm">{DRAFT.card}</span>
              <span className="hint">{DRAFT.range} · {DRAFT.total} satır</span>
              <span className="spacer" />
              <span className="chip chip-pos">{counts.auto} otomatik</span>
              <span className="chip chip-warn">{counts.review} inceleme</span>
            </div>

            <table className="dg">
              <thead>
                <tr>
                  <th style={{ width: 54 }}>Tarih</th>
                  <th>Açıklama</th>
                  <th className="num" style={{ width: 110 }}>Tutar</th>
                  <th style={{ width: 140 }}>Kategori</th>
                  <th style={{ width: 148 }}>Kişi</th>
                  <th className="center" style={{ width: 90 }}>Güven</th>
                  <th className="center" style={{ width: 130 }}>Eylem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isReview = r.status === "review";
                  const isIgnored = r.status === "ignored";
                  return (
                    <tr
                      key={r.id}
                      style={{
                        opacity: isIgnored ? 0.4 : 1,
                        background: isReview ? "color-mix(in oklab, var(--warning) 6%, transparent)" : undefined,
                      }}
                    >
                      <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{r.date}</td>
                      <td>
                        <div style={{ fontSize: 13 }}>{r.desc}</div>
                        {r.rule && (
                          <div className="hint" style={{ marginTop: 2 }}>
                            <Icon name="rules" size={10} /> {r.rule}
                          </div>
                        )}
                        {r.inst && <div className="hint" style={{ marginTop: 2 }}>Taksit: {r.inst}</div>}
                      </td>
                      <td className="num">
                        <span className="tabular" style={{ fontWeight: 500 }}>−{fmt.tr(r.amount, 2)}</span>
                      </td>
                      <td><CatChip id={r.sugCat} /></td>
                      <td><PersonChip id={r.sugBen} /></td>
                      <td className="center"><ConfPill conf={r.conf} /></td>
                      <td className="center">
                        <div className="row gap-8" style={{ justifyContent: "center" }}>
                          <button
                            data-tip="Kabul"
                            className="icon-btn"
                            onClick={() => accept(r.id)}
                            style={{ color: r.status === "auto" ? "var(--positive)" : "var(--muted)" }}
                          >
                            <Icon name="check" size={14} />
                          </button>
                          <button data-tip="Düzenle" className="icon-btn">
                            <Icon name="edit" size={14} />
                          </button>
                          <button data-tip="Yoksay" className="icon-btn" onClick={() => ignore(r.id)}>
                            <Icon name="x" size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

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
          {step === "review" && (
            <button className="btn btn-prim" onClick={onClose}>{counts.auto} işlemi onayla</button>
          )}
        </div>
      </div>
    </div>
  );
}
