"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";

import type { BeneficiaryLite, CustodyRow } from "./actions";
import { createAccount } from "./actions";

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

const ACCOUNT_TYPES = [
  { value: "checking", label: "Vadesiz" },
  { value: "savings", label: "Vadeli" },
  { value: "brokerage", label: "Yatırım" },
  { value: "credit_card", label: "Kredi Kartı" },
  { value: "crypto", label: "Kripto" },
  { value: "safe", label: "Fiziki (Altın/Nakit)" },
  { value: "other", label: "Diğer" },
];

const CURRENCY_GROUPS: Array<{ label: string; codes: string[] }> = [
  { label: "Para", codes: ["TRY", "USD", "EUR", "GBP", "CHF", "JPY"] },
  {
    label: "Altın & Gümüş",
    codes: [
      "XAU",           // gram altın
      "CEYREK",        // çeyrek altın
      "YARIM",         // yarım altın
      "TAM",           // tam altın
      "CUMHURIYET",    // cumhuriyet altını
      "ATA",           // ata altını
      "RESAT",         // reşat altını
      "BILEZIK22",     // 22 ayar bilezik (gram)
      "BILEZIK14",     // 14 ayar bilezik (gram)
      "BILEZIK18",     // 18 ayar bilezik (gram)
      "XAU_OZ",        // ons altın
      "XAG",           // gram gümüş
    ],
  },
  { label: "Kripto", codes: ["BTC", "ETH", "SOL", "USDT", "BNB"] },
];

const CURRENCY_LABEL: Record<string, string> = {
  TRY: "TRY — Türk Lirası",
  USD: "USD — ABD Doları",
  EUR: "EUR — Euro",
  GBP: "GBP — İngiliz Sterlini",
  CHF: "CHF — İsviçre Frangı",
  JPY: "JPY — Japon Yeni",
  XAU: "XAU — Gram Altın",
  XAU_OZ: "XAU_OZ — Ons Altın",
  XAG: "XAG — Gram Gümüş",
  CEYREK: "CEYREK — Çeyrek Altın",
  YARIM: "YARIM — Yarım Altın",
  TAM: "TAM — Tam Altın",
  CUMHURIYET: "CUMHURIYET — Cumhuriyet Altını",
  ATA: "ATA — Ata Altını",
  RESAT: "RESAT — Reşat Altını",
  BILEZIK22: "BILEZIK22 — 22 Ayar Bilezik (gr)",
  BILEZIK14: "BILEZIK14 — 14 Ayar Bilezik (gr)",
  BILEZIK18: "BILEZIK18 — 18 Ayar Bilezik (gr)",
  BTC: "BTC — Bitcoin",
  ETH: "ETH — Ethereum",
  SOL: "SOL — Solana",
  USDT: "USDT — Tether",
  BNB: "BNB — Binance Coin",
};

interface Props {
  custodies: CustodyRow[];
  beneficiaries: BeneficiaryLite[];
  onClose: () => void;
}

export function NewAccountModal({ custodies, beneficiaries, onClose }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [custodyId, setCustodyId] = useState(custodies[0]?.id ?? "");
  const [beneficiaryId, setBeneficiaryId] = useState(beneficiaries[0]?.id ?? "");
  const [accountType, setAccountType] = useState("checking");
  const [name, setName] = useState("Vadesiz");
  const [currency, setCurrency] = useState("TRY");
  const [balanceTry, setBalanceTry] = useState("0");
  const [balanceNative, setBalanceNative] = useState("");
  const [iban, setIban] = useState("");

  const submit = () => {
    setError(null);
    if (!custodyId) {
      setError("Önce Ayarlar'dan bir kurum (banka/broker) ekle.");
      return;
    }
    startTransition(async () => {
      const r = await createAccount({
        custody_id: custodyId,
        beneficiary_id: beneficiaryId || null,
        name,
        account_type: accountType,
        currency,
        iban,
        balance_try: Number(balanceTry) || 0,
        balance_native: balanceNative.trim() ? Number(balanceNative) : null,
      });
      if (r.ok) {
        router.refresh();
        onClose();
      } else {
        setError(r.error);
      }
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
          <Icon name="bank" size={16} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>Yeni Hesap</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          {custodies.length === 0 && (
            <div
              style={{
                padding: 10,
                background: "var(--warning-soft)",
                color: "var(--warning)",
                fontSize: 12,
                borderRadius: 6,
              }}
            >
              Önce Ayarlar → Kurumlar üzerinden bir banka/broker eklemelisin.
            </div>
          )}

          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Banka/Kurum</Lbl>
              <select
                style={inp}
                value={custodyId}
                onChange={(e) => setCustodyId(e.target.value)}
              >
                {custodies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Lbl>Tip</Lbl>
              <select
                style={inp}
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Lbl>Hesap Adı</Lbl>
            <input style={inp} value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid-base grid-2" style={{ gap: 14 }}>
            <div>
              <Lbl>Para Birimi</Lbl>
              <select
                style={inp}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCY_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.codes.map((c) => (
                      <option key={c} value={c}>{CURRENCY_LABEL[c] ?? c}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <Lbl>Bakiye (₺ karşılığı)</Lbl>
              <input
                type="number"
                style={inp}
                value={balanceTry}
                onChange={(e) => setBalanceTry(e.target.value)}
              />
            </div>
          </div>

          {currency !== "TRY" && (
            <div>
              <Lbl>Bakiye ({currency})</Lbl>
              <input
                type="number"
                style={inp}
                value={balanceNative}
                onChange={(e) => setBalanceNative(e.target.value)}
                placeholder={`Örn. 1500 ${currency}`}
              />
            </div>
          )}

          <div>
            <Lbl>IBAN (opsiyonel)</Lbl>
            <input
              style={inp}
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="TR.. 0000 0000 0000 0000 0000 00"
            />
          </div>

          <div>
            <Lbl>Sahip</Lbl>
            <select
              style={inp}
              value={beneficiaryId}
              onChange={(e) => setBeneficiaryId(e.target.value)}
            >
              <option value="">— Seçme —</option>
              {beneficiaries.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

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
          <button
            className="btn btn-prim"
            onClick={submit}
            disabled={busy || !name.trim() || !custodyId}
          >
            {busy ? "Ekleniyor…" : "Hesabı Ekle"}
          </button>
        </div>
      </div>
    </div>
  );
}
