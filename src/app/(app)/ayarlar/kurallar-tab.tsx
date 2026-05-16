"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";

import type { BeneficiaryLite } from "@/app/(app)/hesaplar/actions";

import {
  type CategoryRow,
  type ClassificationRuleRow,
  createClassificationRule,
  deleteClassificationRule,
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

interface Props {
  initialRules: ClassificationRuleRow[];
  categories: CategoryRow[];
  beneficiaries: BeneficiaryLite[];
  configured: boolean;
}

export function KurallarTab({ initialRules, categories, beneficiaries, configured }: Props) {
  const [rules, setRules] = useState<ClassificationRuleRow[]>(initialRules);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const catName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name : null);
  const benName = (id: string | null) => (id ? beneficiaries.find((b) => b.id === id)?.name : null);

  const matchSummary = (r: ClassificationRuleRow): string => {
    const parts: string[] = [];
    if (r.match_description_ilike) parts.push(`açıklama ⊃ "${r.match_description_ilike.replace(/%/g, "")}"`);
    if (r.match_merchant_ilike) parts.push(`merchant ⊃ "${r.match_merchant_ilike.replace(/%/g, "")}"`);
    if (r.match_min_amount != null) parts.push(`tutar ≥ ${r.match_min_amount}`);
    return parts.join(" ∧ ") || "—";
  };

  const actionSummary = (r: ClassificationRuleRow): string => {
    const parts: string[] = [];
    if (r.set_is_transfer) parts.push("transfer ✓");
    if (r.set_category_id) parts.push(`kategori: ${catName(r.set_category_id) ?? "?"}`);
    if (r.set_beneficiary_id) parts.push(`kişi: ${benName(r.set_beneficiary_id) ?? "?"}`);
    return parts.join(" · ") || "—";
  };

  const remove = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    setError(null);
    startTransition(async () => {
      const r = await deleteClassificationRule(id);
      if (!r.ok) setError(r.error ?? "Silinemedi.");
    });
  };

  return (
    <div>
      <div className="row gap-8" style={{ marginBottom: 12 }}>
        <div className="hint">Düşük öncelik (priority) önce çalışır.</div>
        <span className="spacer" />
        <button
          className="btn btn-prim"
          onClick={() => setModalOpen(true)}
          disabled={!configured || busy}
        >
          <Icon name="plus" size={14} /> Yeni Kural
        </button>
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, color: "var(--negative)", fontSize: 12 }}>
          {error}
        </div>
      )}

      {rules.length === 0 ? (
        <div className="empty">
          <div className="title">Henüz kural yok</div>
          <div>&quot;Yeni Kural&quot; ile ilk sınıflandırma kuralını ekle (örn. &quot;Eczane → Sağlık&quot;).</div>
        </div>
      ) : (
        <div className="card">
          <table className="dg">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Öncelik</th>
                <th>Ad</th>
                <th>Eşleştirme</th>
                <th>Aksiyon</th>
                <th className="num">Hit</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="center">
                    <span className="mono" style={{ fontWeight: 600 }}>#{r.priority}</span>
                  </td>
                  <td><div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div></td>
                  <td>
                    <code
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--fg-soft)",
                        background: "var(--surface-2)",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {matchSummary(r)}
                    </code>
                  </td>
                  <td>
                    <code
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--accent)",
                        background: "var(--accent-soft)",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {actionSummary(r)}
                    </code>
                  </td>
                  <td className="num tabular">{r.hit_count}</td>
                  <td>
                    <button
                      className="icon-btn"
                      onClick={() => remove(r.id)}
                      disabled={!configured || busy}
                      title="Sil"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <RuleModal
          categories={categories}
          beneficiaries={beneficiaries}
          onClose={() => setModalOpen(false)}
          onCreated={(row) => {
            setRules((prev) => [...prev, row].sort((a, b) => a.priority - b.priority));
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function RuleModal({
  categories,
  beneficiaries,
  onClose,
  onCreated,
}: {
  categories: CategoryRow[];
  beneficiaries: BeneficiaryLite[];
  onClose: () => void;
  onCreated: (row: ClassificationRuleRow) => void;
}) {
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(100);
  const [matchDesc, setMatchDesc] = useState("");
  const [matchMerchant, setMatchMerchant] = useState("");
  const [matchMin, setMatchMin] = useState("");
  const [setCategoryId, setSetCategoryId] = useState("");
  const [setBeneficiaryId, setSetBeneficiaryId] = useState("");
  const [setTransfer, setSetTransfer] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const wrapIlike = (s: string): string | null => {
    const t = s.trim();
    if (!t) return null;
    return t.includes("%") ? t : `%${t}%`;
  };

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError("İsim boş olamaz.");
      return;
    }
    startTransition(async () => {
      const r = await createClassificationRule({
        name,
        priority,
        match_description_ilike: wrapIlike(matchDesc),
        match_merchant_ilike: wrapIlike(matchMerchant),
        match_min_amount: matchMin.trim() ? Number(matchMin) : null,
        set_category_id: setCategoryId || null,
        set_beneficiary_id: setBeneficiaryId || null,
        set_is_transfer: setTransfer ? true : null,
      });
      if (r.ok) onCreated(r.row);
      else setError(r.error);
    });
  };

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
          <Icon name="rules" size={16} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Yeni Kural</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Ad</Lbl>
              <input
                style={inp}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ör. Eczane → Sağlık"
              />
            </div>
            <div>
              <Lbl>Öncelik (düşük = önce)</Lbl>
              <input
                type="number"
                style={inp}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value) || 100)}
              />
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 8 }}>Eşleştirme (en az birini doldur)</div>
          <div>
            <Lbl>Açıklama içeriyor</Lbl>
            <input
              style={inp}
              value={matchDesc}
              onChange={(e) => setMatchDesc(e.target.value)}
              placeholder="örn. eczane"
            />
          </div>
          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Merchant içeriyor</Lbl>
              <input
                style={inp}
                value={matchMerchant}
                onChange={(e) => setMatchMerchant(e.target.value)}
                placeholder="örn. MIGROS"
              />
            </div>
            <div>
              <Lbl>Min. tutar (₺)</Lbl>
              <input
                type="number"
                style={inp}
                value={matchMin}
                onChange={(e) => setMatchMin(e.target.value)}
                placeholder="boş bırakılabilir"
              />
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 8 }}>Aksiyon</div>
          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Kategori ata</Lbl>
              <select
                style={inp}
                value={setCategoryId}
                onChange={(e) => setSetCategoryId(e.target.value)}
              >
                <option value="">— Seçme —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>
                ))}
              </select>
            </div>
            <div>
              <Lbl>Kişi ata</Lbl>
              <select
                style={inp}
                value={setBeneficiaryId}
                onChange={(e) => setSetBeneficiaryId(e.target.value)}
              >
                <option value="">— Seçme —</option>
                {beneficiaries.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={setTransfer}
              onChange={(e) => setSetTransfer(e.target.checked)}
            />
            Transfer olarak işaretle (gelir/gider sayma)
          </label>

          {error && <div style={{ color: "var(--negative)", fontSize: 12 }}>{error}</div>}
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
          <button className="btn" onClick={onClose} disabled={busy}>İptal</button>
          <button className="btn btn-prim" onClick={submit} disabled={busy || !name.trim()}>
            {busy ? "Kaydediliyor…" : "Kuralı Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
