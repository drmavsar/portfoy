"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { pickNavOnOrBefore } from "@/app/(app)/_lib/tefas/nav-lookup";
import { validateFundTrade } from "@/app/(app)/_lib/tefas/trade-validation";

import {
  createFundTrade,
  type FundTradeAccountOption,
  type FundTradePortfolioOption,
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

function todayDateInput(): string {
  // YYYY-MM-DD (local) for <input type="date">
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface Props {
  fundCode: string;
  fundIsActive: boolean;
  assetId: string | null;
  accounts: FundTradeAccountOption[];
  portfolios: FundTradePortfolioOption[];
  defaultPortfolioId: string | null;
  latestNav: { as_of: string; nav: number } | null;
  recentNavRows: Array<{ as_of: string; nav: number }>;
  currentHoldings: Array<{ portfolio_id: string; quantity: number }>;
  /** Allocation ekranından gelen prefill bilgileri — sadece UI ipucu. */
  prefillSide?: "buy" | "sell";
  prefillQuantity?: string | null;
  prefillPrice?: string | null;
}

export function TradeForm({
  fundCode,
  fundIsActive,
  assetId,
  accounts,
  portfolios,
  defaultPortfolioId,
  latestNav,
  recentNavRows,
  currentHoldings,
  prefillSide,
  prefillQuantity,
  prefillPrice,
}: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [side, setSide] = useState<"buy" | "sell">(prefillSide ?? "buy");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [portfolioId, setPortfolioId] = useState(
    defaultPortfolioId ?? portfolios[0]?.id ?? "",
  );
  const [executedAt, setExecutedAt] = useState(todayDateInput());
  const [quantity, setQuantity] = useState(prefillQuantity ?? "");
  const [price, setPrice] = useState(
    prefillPrice ?? (latestNav ? String(latestNav.nav) : ""),
  );
  const [fees, setFees] = useState("0");
  const [taxes, setTaxes] = useState("");
  const [notes, setNotes] = useState("");

  // Tarih değiştiğinde NAV default güncellensin (kullanıcı dokunmadıysa).
  // setState-in-effect anti-pattern'i önlemek için price'ı date onChange'inde
  // güncelliyoruz; navForSelectedDate sadece "ipucu" göstermek için memoize.
  // Prefill ile gelen price varsa kullanıcı dokunmuş sayılır (tarih değişince
  // override edilmesin).
  const [priceTouched, setPriceTouched] = useState(!!prefillPrice);
  const navForSelectedDate = useMemo(
    () => pickNavOnOrBefore(recentNavRows, executedAt),
    [recentNavRows, executedAt],
  );

  const handleDateChange = (value: string) => {
    setExecutedAt(value);
    if (!priceTouched) {
      const navHere = pickNavOnOrBefore(recentNavRows, value);
      if (navHere != null) setPrice(String(navHere));
    }
  };

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;
  // Account'un portfolio_id'si varsa onu kullan, yoksa kullanıcı seçtiği.
  const effectivePortfolioId = selectedAccount?.portfolio_id ?? portfolioId;

  const holdingQty = useMemo(() => {
    const row = currentHoldings.find((h) => h.portfolio_id === effectivePortfolioId);
    return row ? Number(row.quantity) : 0;
  }, [currentHoldings, effectivePortfolioId]);

  const hasBlockingState =
    !fundIsActive || !assetId || accounts.length === 0 || portfolios.length === 0;

  const submit = () => {
    setError(null);
    setSuccess(null);

    if (!fundIsActive) {
      setError("Fon aktif değil; işlem kaydı oluşturulamaz.");
      return;
    }
    if (!assetId) {
      setError("Fon ↔ asset köprüsü bulunamadı. Yöneticiye bildir.");
      return;
    }
    if (!accountId) {
      setError("Hesap seç.");
      return;
    }
    if (!effectivePortfolioId) {
      setError("Portföy bulunamadı; hesabı portföye bağla veya bir portföy seç.");
      return;
    }

    const qty = Number(quantity);
    const prc = Number(price);
    const fe = Number(fees || "0");
    const tx = taxes.trim() === "" ? 0 : Number(taxes);

    const executedAtIso = `${executedAt}T12:00:00Z`; // gün ortası UTC
    const clientValidation = validateFundTrade(
      { side, quantity: qty, price: prc, fees: fe, taxes: tx, executed_at: executedAtIso },
      { now: new Date(), fundIsActive, currentHoldingQuantity: holdingQty },
    );
    if (!clientValidation.ok) {
      setError(clientValidation.error);
      return;
    }

    startTransition(async () => {
      const r = await createFundTrade({
        fund_code: fundCode,
        account_id: accountId,
        portfolio_id: effectivePortfolioId,
        side,
        executed_at: executedAtIso,
        quantity: qty,
        price: prc,
        fees: fe,
        taxes: tx,
        notes: notes.trim() ? notes.trim() : null,
      });
      if (r.ok) {
        setSuccess("İşlem kaydı oluşturuldu.");
        router.refresh();
        // 600ms sonra fon detayına dön
        setTimeout(() => router.push(`/fonlar/${fundCode}`), 600);
      } else {
        setError(r.error);
      }
    });
  };

  const sideLabel = side === "buy" ? "Alış kaydı" : "Satış kaydı";

  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        background: "var(--surface)",
        border: "1px solid var(--border-soft)",
        borderRadius: 8,
        padding: 20,
        maxWidth: 720,
      }}
    >
      {hasBlockingState && (
        <div
          style={{
            padding: 10,
            background: "var(--danger-soft)",
            color: "var(--danger)",
            fontSize: 12,
            borderRadius: 6,
          }}
        >
          {!fundIsActive && "Fon inaktif. "}
          {!assetId && "Fon assets tablosunda bulunamadı (asset bridge eksik). "}
          {accounts.length === 0 &&
            "TRY hesabın yok. Önce Hesaplar ekranından bir TRY hesabı ekle. "}
          {portfolios.length === 0 && "Portföyün yok. "}
        </div>
      )}

      {/* Side toggle */}
      <div>
        <Lbl>Tür</Lbl>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className={`btn ${side === "buy" ? "btn-prim" : ""}`}
            onClick={() => setSide("buy")}
            style={{ flex: 1 }}
          >
            Alış kaydı
          </button>
          <button
            type="button"
            className={`btn ${side === "sell" ? "btn-prim" : ""}`}
            onClick={() => setSide("sell")}
            style={{ flex: 1 }}
          >
            Satış kaydı
          </button>
        </div>
      </div>

      <div className="grid-base grid-2" style={{ gap: 14 }}>
        <div>
          <Lbl>Hesap</Lbl>
          <select
            style={inp}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.length === 0 && <option value="">Hesap yok</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {a.currency !== "TRY" ? `(${a.currency})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Lbl>Portföy</Lbl>
          <select
            style={inp}
            value={effectivePortfolioId ?? ""}
            disabled={!!selectedAccount?.portfolio_id}
            onChange={(e) => setPortfolioId(e.target.value)}
          >
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.is_default ? " · varsayılan" : ""}
              </option>
            ))}
          </select>
          {selectedAccount?.portfolio_id && (
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              Hesabın bağlı portföyü kullanılıyor.
            </div>
          )}
        </div>
      </div>

      <div className="grid-base grid-2" style={{ gap: 14 }}>
        <div>
          <Lbl>İşlem Tarihi</Lbl>
          <input
            type="date"
            style={inp}
            value={executedAt}
            max={todayDateInput()}
            onChange={(e) => handleDateChange(e.target.value)}
          />
          {navForSelectedDate != null && (
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              En yakın NAV: {navForSelectedDate.toFixed(6)}
            </div>
          )}
        </div>

        <div>
          <Lbl>Adet</Lbl>
          <input
            type="number"
            min="0"
            step="0.000001"
            style={inp}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
          />
          {side === "sell" && (
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              Mevcut: {holdingQty.toFixed(6)} adet
            </div>
          )}
        </div>
      </div>

      <div className="grid-base grid-2" style={{ gap: 14 }}>
        <div>
          <Lbl>Birim Fiyat (TRY)</Lbl>
          <input
            type="number"
            min="0"
            step="0.000001"
            style={inp}
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setPriceTouched(true);
            }}
          />
        </div>

        <div>
          <Lbl>Komisyon (TRY)</Lbl>
          <input
            type="number"
            min="0"
            step="0.01"
            style={inp}
            value={fees}
            onChange={(e) => setFees(e.target.value)}
          />
        </div>
      </div>

      <div className="grid-base grid-2" style={{ gap: 14 }}>
        <div>
          <Lbl>Vergi / Stopaj (TRY) — opsiyonel</Lbl>
          <input
            type="number"
            min="0"
            step="0.01"
            style={inp}
            value={taxes}
            onChange={(e) => setTaxes(e.target.value)}
            placeholder="0"
          />
        </div>
        <div />
      </div>

      <div>
        <Lbl>Not — opsiyonel</Lbl>
        <textarea
          style={{ ...inp, minHeight: 60, resize: "vertical" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Kullanıcı notu (broker referansı, açıklama vb.)"
        />
      </div>

      {error && (
        <div
          style={{
            padding: 10,
            background: "var(--danger-soft)",
            color: "var(--danger)",
            fontSize: 12,
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: 10,
            background: "var(--success-soft)",
            color: "var(--success)",
            fontSize: 12,
            borderRadius: 6,
          }}
        >
          {success}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Link href={`/fonlar/${fundCode}`} className="btn">
          İptal
        </Link>
        <button
          type="button"
          className="btn btn-prim"
          onClick={submit}
          disabled={busy || hasBlockingState}
        >
          {busy ? "Kaydediliyor…" : sideLabel}
        </button>
      </div>
    </div>
  );
}
