"use client";

import { useState } from "react";

import { PersonChip } from "@/components/ui/chips";
import { Icon, type IconName } from "@/components/ui/icon";
import { fmt } from "@/lib/finance/fmt";
import {
  ACCOUNTS,
  BANK_TOTALS,
  BANKS,
  GOLD_ITEMS,
  GOLD_TOTAL,
  type Account,
  type Bank,
} from "@/lib/sample/data";

import { NewAccountModal } from "./new-account-modal";

const subIcon: Record<string, IconName> = {
  vadesiz: "wallet",
  vadeli: "wallet",
  dolar: "coins",
  euro: "coins",
  altin: "diamond",
  yatirim: "wealth",
  kripto: "coins",
};

function maskIBAN(iban: string): string {
  if (!iban || iban === "—") return "";
  const clean = iban.replace(/\s/g, "");
  if (clean.length < 12) return iban;
  return clean.slice(0, 4) + " •••• •••• •••• " + clean.slice(-4);
}

function BankCard({ bank, accounts, total }: { bank: Bank; accounts: Account[]; total: number }) {
  return (
    <div className="bank-card">
      <div className="bank-card-head">
        <div className="bank-logo" style={{ background: bank.color }}>{bank.short}</div>
        <div>
          <div className="bank-name">{bank.name}</div>
          <div className="hint">{accounts.length} alt-hesap</div>
        </div>
        <div className="bank-total">{fmt.trydp(total)}</div>
      </div>
      <div>
        {accounts.map((a) => (
          <div key={a.id} className="subacc-row">
            <div className="subacc-icon">
              <Icon name={subIcon[a.subtype] ?? "wallet"} size={14} />
            </div>
            <div>
              <div className="subacc-name">{a.name}</div>
              <div className="subacc-tag">{a.subtype.toUpperCase()}</div>
            </div>
            <div className="subacc-meta">{a.iban !== "—" ? maskIBAN(a.iban) : ""}</div>
            <div>
              <div className="subacc-try">{fmt.tr(a.balance_try, 2)} ₺</div>
              {a.raw && (
                <div className="subacc-raw">
                  {fmt.tr(
                    a.raw.v,
                    a.raw.ccy === "gr" ? 0 : a.raw.ccy === "BTC" || a.raw.ccy === "ETH" ? 4 : 0,
                  )}{" "}
                  {a.raw.ccy}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          padding: "10px 18px",
          borderTop: "1px solid var(--border-soft)",
          display: "flex",
          gap: 8,
        }}
      >
        <button className="btn btn-sm"><Icon name="plus" size={12} /> Alt-hesap</button>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm"><Icon name="ext" size={12} /></button>
        <button className="btn btn-ghost btn-sm"><Icon name="edit" size={12} /></button>
      </div>
    </div>
  );
}

function GoldCard() {
  return (
    <div className="bank-card">
      <div className="bank-card-head">
        <div className="bank-logo" style={{ background: "#d4a056", color: "#0a0d14" }}>KSA</div>
        <div>
          <div className="bank-name">Ev (Fiziki Altın)</div>
          <div className="hint">{GOLD_ITEMS.length} tip · kasa</div>
        </div>
        <div className="bank-total">{fmt.trydp(GOLD_TOTAL)}</div>
      </div>
      <table className="dg">
        <thead>
          <tr>
            <th>Tip</th>
            <th className="num">Adet</th>
            <th className="num">Birim Fiyat</th>
            <th>Kişi</th>
            <th className="num">Toplam (₺)</th>
          </tr>
        </thead>
        <tbody>
          {GOLD_ITEMS.map((g) => (
            <tr key={g.id}>
              <td>
                <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="diamond" size={12} style={{ color: "#d4a056" }} />
                  {g.label}
                </div>
                {g.notes && <div className="hint" style={{ marginTop: 2 }}>{g.notes}</div>}
              </td>
              <td className="num tabular" style={{ fontWeight: 600 }}>{g.count}</td>
              <td className="num tabular">{fmt.tr(g.unit_price, 0)} ₺</td>
              <td><PersonChip id={g.beneficiary} size="sm" /></td>
              <td className="num tabular" style={{ fontWeight: 600 }}>
                {fmt.tr(g.count * g.unit_price, 0)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid var(--border)" }}>
            <td colSpan={4} className="hint" style={{ textAlign: "right", fontWeight: 600, padding: "10px 10px" }}>
              Toplam
            </td>
            <td className="num tabular" style={{ fontWeight: 700, fontSize: 14 }}>
              {fmt.tr(GOLD_TOTAL, 0)} ₺
            </td>
          </tr>
        </tfoot>
      </table>
      <div
        style={{
          padding: "10px 18px",
          borderTop: "1px solid var(--border-soft)",
          display: "flex",
          gap: 8,
        }}
      >
        <button className="btn btn-sm"><Icon name="plus" size={12} /> Altın Ekle</button>
        <span className="hint" style={{ marginLeft: "auto", alignSelf: "center" }}>
          Fiyatlar TCMB
        </span>
      </div>
    </div>
  );
}

export default function HesaplarPage() {
  const [newOpen, setNewOpen] = useState(false);
  const bankTotal = Object.values(BANK_TOTALS).reduce((s, v) => s + v, 0);
  const grand = bankTotal + GOLD_TOTAL;
  const orderedBanks = BANKS.filter((b) => !b.isPhysical);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Hesaplar</div>
          <div className="page-sub">Banka × alt-hesap detayı · IBAN ve gerçek bakiyeler.</div>
        </div>
        <div className="page-actions">
          <button className="btn"><Icon name="refresh" size={14} /> Senkronize</button>
          <button className="btn btn-prim" onClick={() => setNewOpen(true)}>
            <Icon name="plus" size={14} /> Yeni Hesap
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div className="card-title">Hesap Özeti</div>
          <div className="card-sub">tüm hesaplar · 15.05.2026 09:18</div>
        </div>
        <div style={{ padding: "12px 0" }}>
          {orderedBanks.map((b) => (
            <div
              key={b.id}
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr auto",
                alignItems: "center",
                gap: 12,
                padding: "8px 20px",
              }}
            >
              <div className="bank-logo" style={{ background: b.color, width: 28, height: 28, fontSize: 10 }}>{b.short}</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{b.name}</div>
              <div
                className="tabular"
                style={{ fontFamily: "var(--font-sans)", fontWeight: 500, fontSize: 14 }}
              >
                {fmt.trydp(BANK_TOTALS[b.id] ?? 0)}
              </div>
            </div>
          ))}
          <div style={{ borderTop: "1px dashed var(--border)", margin: "8px 16px" }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "40px 1fr auto",
              alignItems: "center",
              gap: 12,
              padding: "8px 20px",
            }}
          >
            <span />
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Banka Hesapları Toplamı</div>
            <div className="tabular" style={{ fontWeight: 600, fontSize: 15 }}>{fmt.trydp(bankTotal)}</div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "40px 1fr auto",
              alignItems: "center",
              gap: 12,
              padding: "8px 20px",
            }}
          >
            <div className="bank-logo" style={{ background: "#d4a056", width: 28, height: 28, fontSize: 10 }}>KSA</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Ev (Fiziki Altın)</div>
            <div
              className="tabular"
              style={{ fontFamily: "var(--font-sans)", fontWeight: 500, fontSize: 14 }}
            >
              {fmt.trydp(GOLD_TOTAL)}
            </div>
          </div>
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
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>Portföy Toplamı</div>
            <div
              className="tabular"
              style={{
                fontFamily: "var(--font-sans)",
                fontWeight: 700,
                fontSize: 20,
                color: "var(--accent)",
              }}
            >
              {fmt.trydp(grand)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-base grid-2" style={{ gap: 18, alignItems: "start" }}>
        {orderedBanks.map((b) => {
          const accs = ACCOUNTS.filter((a) => a.bank === b.id);
          if (accs.length === 0) return null;
          return <BankCard key={b.id} bank={b} accounts={accs} total={BANK_TOTALS[b.id] ?? 0} />;
        })}
        <GoldCard />
      </div>

      {newOpen && <NewAccountModal onClose={() => setNewOpen(false)} />}
    </div>
  );
}
