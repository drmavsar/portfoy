"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";

import type { AccountRow, BeneficiaryLite, CustodyRow } from "@/app/(app)/hesaplar/actions";
import { deleteAccount } from "@/app/(app)/hesaplar/actions";
import { NewAccountModal } from "@/app/(app)/hesaplar/new-account-modal";

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  checking: "VADESİZ",
  savings: "VADELİ",
  brokerage: "YATIRIM",
  credit_card: "KREDİ KARTI",
  loan: "KREDİ",
  crypto: "KRİPTO",
  safe: "FİZİKİ",
  other: "DİĞER",
};

function maskIban(iban: string | null): string {
  if (!iban) return "—";
  const clean = iban.replace(/\s/g, "");
  if (clean.length < 12) return iban;
  return clean.slice(0, 9) + "••••";
}

interface Props {
  accounts: AccountRow[];
  custodies: CustodyRow[];
  beneficiaries: BeneficiaryLite[];
  configured: boolean;
}

export function HesaplarSettingsTab({ accounts, custodies, beneficiaries, configured }: Props) {
  const [newOpen, setNewOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const custodyName = (id: string | null) => custodies.find((c) => c.id === id)?.name ?? "—";
  const custodyColor = (id: string | null) => custodies.find((c) => c.id === id)?.color ?? "#6ea8fe";
  const custodyShort = (id: string | null) => {
    const c = custodies.find((x) => x.id === id);
    return c?.short ?? c?.name.slice(0, 3).toUpperCase() ?? "?";
  };
  const beneficiaryName = (id: string | null) =>
    id ? beneficiaries.find((b) => b.id === id)?.name ?? "—" : "—";

  const remove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const r = await deleteAccount(id);
      if (!r.ok) setError(r.error ?? "Silinemedi.");
    });
  };

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Hesaplar</div>
        <div className="card-sub">{accounts.length} hesap · {custodies.length} kurum</div>
        <button
          className="btn btn-prim btn-sm"
          style={{ marginLeft: "auto" }}
          onClick={() => setNewOpen(true)}
          disabled={!configured || busy}
        >
          <Icon name="plus" size={12} /> Yeni Hesap
        </button>
      </div>

      {error && (
        <div style={{ padding: 10, color: "var(--negative)", fontSize: 12 }}>{error}</div>
      )}

      {accounts.length === 0 ? (
        <div className="empty">
          <div className="title">Henüz hesap yok</div>
          <div>&quot;Yeni Hesap&quot; ile ilk hesabını ekle.</div>
        </div>
      ) : (
        <table className="dg">
          <thead>
            <tr>
              <th>Kurum</th>
              <th>Hesap</th>
              <th>Tip</th>
              <th>Para</th>
              <th>IBAN</th>
              <th>Sahip</th>
              <th className="num">Bakiye (₺)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>
                  <span className="row gap-8">
                    <span
                      className="bank-logo"
                      style={{ background: custodyColor(a.custody_id), width: 20, height: 20, fontSize: 8 }}
                    >
                      {custodyShort(a.custody_id)}
                    </span>
                    {custodyName(a.custody_id)}
                  </span>
                </td>
                <td>{a.name}</td>
                <td>
                  <span className="chip chip-sm">
                    {ACCOUNT_TYPE_LABEL[a.account_type] ?? a.account_type.toUpperCase()}
                  </span>
                </td>
                <td className="mono" style={{ fontSize: 11 }}>{a.currency}</td>
                <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                  {maskIban(a.iban)}
                </td>
                <td style={{ fontSize: 12 }}>{beneficiaryName(a.beneficiary_id)}</td>
                <td className="num tabular">
                  {(a.balance_try ?? a.opening_balance ?? 0).toLocaleString("tr-TR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td>
                  <button
                    className="icon-btn"
                    onClick={() => remove(a.id)}
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
      )}

      {newOpen && (
        <NewAccountModal
          custodies={custodies}
          beneficiaries={beneficiaries}
          onClose={() => setNewOpen(false)}
        />
      )}
    </div>
  );
}
