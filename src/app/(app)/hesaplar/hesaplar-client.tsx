"use client";

import { useMemo, useState, useTransition } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";

import type { AccountRow, BeneficiaryLite, CustodyRow } from "./actions";
import { deleteAccount } from "./actions";
import { NewAccountModal } from "./new-account-modal";

const subIcon: Record<string, IconName> = {
  checking: "wallet",
  savings: "wallet",
  brokerage: "wealth",
  credit_card: "wallet",
  loan: "wallet",
  crypto: "coins",
  safe: "diamond",
  other: "wallet",
};

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

function maskIBAN(iban: string | null): string {
  if (!iban || iban === "—") return "";
  const clean = iban.replace(/\s/g, "");
  if (clean.length < 12) return iban;
  return clean.slice(0, 4) + " •••• •••• •••• " + clean.slice(-4);
}

function shortOf(custody: CustodyRow): string {
  return custody.short ?? custody.name.slice(0, 3).toUpperCase();
}

interface Props {
  accounts: AccountRow[];
  custodies: CustodyRow[];
  beneficiaries: BeneficiaryLite[];
  supabaseConfigured: boolean;
}

export function HesaplarClient({ accounts, custodies, beneficiaries, supabaseConfigured }: Props) {
  const [newOpen, setNewOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Group accounts by custody
  const grouped = useMemo(() => {
    const map = new Map<string, { custody: CustodyRow; accounts: AccountRow[]; total: number }>();
    for (const c of custodies) {
      map.set(c.id, { custody: c, accounts: [], total: 0 });
    }
    for (const a of accounts) {
      if (!a.custody_id) continue;
      const g = map.get(a.custody_id);
      if (!g) continue;
      g.accounts.push(a);
      g.total += a.balance_try ?? a.opening_balance ?? 0;
    }
    return Array.from(map.values()).filter((g) => g.accounts.length > 0);
  }, [accounts, custodies]);

  const grand = grouped.reduce((s, g) => s + g.total, 0);

  const remove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const r = await deleteAccount(id);
      if (!r.ok) setError(r.error ?? "Silinemedi.");
    });
  };

  if (!supabaseConfigured) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-title">Hesaplar</div>
            <div className="page-sub">Banka × alt-hesap detayı.</div>
          </div>
        </div>
        <div className="empty">
          <div className="title">Supabase yapılandırılmamış</div>
          <div>Ortam değişkenlerini ekledikten sonra burada bankalar ve hesaplar görünecek.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Hesaplar</div>
          <div className="page-sub">Banka × alt-hesap detayı · IBAN ve gerçek bakiyeler.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-prim" onClick={() => setNewOpen(true)} disabled={busy}>
            <Icon name="plus" size={14} /> Yeni Hesap
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 10, marginBottom: 12, color: "var(--negative)", fontSize: 12 }}>
          {error}
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="empty">
          <div className="title">Henüz hesap yok</div>
          <div>Sağ üstteki &quot;Yeni Hesap&quot; ile ilk hesabını ekle (Garanti vadesiz, Midas yatırım, vs.).</div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <div className="card-title">Hesap Özeti</div>
              <div className="card-sub">{accounts.length} hesap · {grouped.length} kurum</div>
            </div>
            <div style={{ padding: "12px 0" }}>
              {grouped.map((g) => (
                <div
                  key={g.custody.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr auto",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 20px",
                  }}
                >
                  <div
                    className="bank-logo"
                    style={{
                      background: g.custody.color ?? "#6ea8fe",
                      width: 28,
                      height: 28,
                      fontSize: 10,
                    }}
                  >
                    {shortOf(g.custody)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{g.custody.name}</div>
                  <div className="tabular" style={{ fontWeight: 500, fontSize: 14 }}>
                    {fmt.trydp(g.total)}
                  </div>
                </div>
              ))}
              <div style={{ borderTop: "1px solid var(--border)", margin: "10px 16px 4px" }} />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 20px",
                  background: "var(--accent-soft)",
                  margin: "0 16px",
                  borderRadius: 8,
                }}
              >
                <span />
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>
                  Portföy Toplamı
                </div>
                <div
                  className="tabular"
                  style={{ fontWeight: 700, fontSize: 20, color: "var(--accent)" }}
                >
                  {fmt.trydp(grand)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid-base grid-2" style={{ gap: 18, alignItems: "start" }}>
            {grouped.map((g) => (
              <div key={g.custody.id} className="bank-card">
                <div className="bank-card-head">
                  <div className="bank-logo" style={{ background: g.custody.color ?? "#6ea8fe" }}>
                    {shortOf(g.custody)}
                  </div>
                  <div>
                    <div className="bank-name">{g.custody.name}</div>
                    <div className="hint">{g.accounts.length} alt-hesap</div>
                  </div>
                  <div className="bank-total">{fmt.trydp(g.total)}</div>
                </div>
                <div>
                  {g.accounts.map((a) => (
                    <div key={a.id} className="subacc-row">
                      <div className="subacc-icon">
                        <Icon name={subIcon[a.account_type] ?? "wallet"} size={14} />
                      </div>
                      <div>
                        <div className="subacc-name">{a.name}</div>
                        <div className="subacc-tag">
                          {ACCOUNT_TYPE_LABEL[a.account_type] ?? a.account_type.toUpperCase()}
                        </div>
                      </div>
                      <div className="subacc-meta">{maskIBAN(a.iban)}</div>
                      <div>
                        <div className="subacc-try">
                          {fmt.tr(a.balance_try ?? a.opening_balance ?? 0, 2)} ₺
                        </div>
                        {a.currency !== "TRY" && a.balance_native != null && (
                          <div className="subacc-raw">
                            {fmt.tr(
                              a.balance_native,
                              ["BTC", "ETH"].includes(a.currency) ? 4 : a.currency === "XAU" ? 2 : 0,
                            )}{" "}
                            {a.currency}
                          </div>
                        )}
                      </div>
                      <button
                        className="icon-btn"
                        onClick={() => remove(a.id)}
                        disabled={busy}
                        title="Hesabı sil"
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
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
