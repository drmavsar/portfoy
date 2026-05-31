import { notFound } from "next/navigation";
import Link from "next/link";

import { getFundTradeContext } from "./actions";
import { TradeForm } from "./trade-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{
    side?: string;
    qty?: string;
    price?: string;
  }>;
}

export default async function FundTradePage({ params, searchParams }: PageProps) {
  const { code: rawCode } = await params;
  const sp = await searchParams;
  const code = decodeURIComponent(rawCode).toUpperCase();
  const ctx = await getFundTradeContext(code);
  if (!ctx) notFound();

  const defaultPortfolioId =
    ctx.portfolios.find((p) => p.is_default)?.id ?? ctx.portfolios[0]?.id ?? null;

  // Allocation ekranından prefill: side=buy/sell, qty=adet, price=birim TRY
  const prefillSide: "buy" | "sell" =
    sp.side === "sell" ? "sell" : sp.side === "buy" ? "buy" : "buy";
  const prefillQty = sp.qty && Number.isFinite(Number(sp.qty)) ? sp.qty : null;
  const prefillPrice = sp.price && Number.isFinite(Number(sp.price)) ? sp.price : null;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link
            href={`/fonlar/${code}`}
            style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none" }}
          >
            ← Fon Detayı
          </Link>
          <div className="page-title" style={{ marginTop: 4 }}>
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 22 }}>{code}</code>
            <span style={{ marginLeft: 10, fontSize: 16, fontWeight: 500 }}>
              · İşlem Kaydet
            </span>
          </div>
          {ctx.fund.name && ctx.fund.name !== code && (
            <div className="page-sub" style={{ marginTop: 4 }}>
              {ctx.fund.name}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          padding: 12,
          marginBottom: 16,
          background: "var(--warning-soft)",
          color: "var(--warning)",
          fontSize: 12,
          borderRadius: 6,
          lineHeight: 1.5,
        }}
      >
        Bu işlem TEFAS&apos;a emir göndermez; yalnızca portföy kayıtlarını
        günceller. Gerçek emir TEFAS arayüzünden ya da banka/broker üzerinden
        verilmelidir.
      </div>

      <TradeForm
        fundCode={code}
        fundIsActive={ctx.fund.is_active}
        assetId={ctx.assetId}
        accounts={ctx.accounts}
        portfolios={ctx.portfolios}
        defaultPortfolioId={defaultPortfolioId}
        latestNav={ctx.latestNav}
        recentNavRows={ctx.recentNavRows}
        currentHoldings={ctx.currentHoldings}
        prefillSide={prefillSide}
        prefillQuantity={prefillQty}
        prefillPrice={prefillPrice}
      />
    </div>
  );
}
