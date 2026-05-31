// Sprint-6 PR-C — Manuel fund trade form input validation.
//
// Saf fonksiyon: server action ve client side aynı kuralları paylaşır.
// FIFO lot kontrolü Sprint-6 PR-D'de realized_lots üretiminde yapılır;
// burada sadece toplam holding kontrolü (sell qty <= currentHoldingQty).

export type FundTradeInput = {
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fees: number;
  taxes: number;
  executed_at: string; // ISO timestamp
};

export type FundTradeContext = {
  now: Date;
  fundIsActive: boolean;
  currentHoldingQuantity: number; // 0 if user has no position
};

export type FundTradeValidationResult =
  | { ok: true }
  | { ok: false; error: string };

const QTY_EPSILON = 1e-8; // numeric(24,8) precision

export function validateFundTrade(
  input: FundTradeInput,
  ctx: FundTradeContext,
): FundTradeValidationResult {
  if (!ctx.fundIsActive) {
    return { ok: false, error: "Fon aktif değil; işlem kaydı oluşturulamaz." };
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: "Adet pozitif olmalı." };
  }
  if (!Number.isFinite(input.price) || input.price <= 0) {
    return { ok: false, error: "Fiyat pozitif olmalı." };
  }
  if (!Number.isFinite(input.fees) || input.fees < 0) {
    return { ok: false, error: "Komisyon negatif olamaz." };
  }
  if (!Number.isFinite(input.taxes) || input.taxes < 0) {
    return { ok: false, error: "Vergi negatif olamaz." };
  }
  const executed = new Date(input.executed_at);
  if (Number.isNaN(executed.getTime())) {
    return { ok: false, error: "Geçersiz işlem tarihi." };
  }
  if (executed.getTime() > ctx.now.getTime()) {
    return { ok: false, error: "İşlem tarihi gelecekte olamaz." };
  }
  if (input.side === "sell") {
    if (ctx.currentHoldingQuantity <= 0) {
      return { ok: false, error: "Bu fonda pozisyon yok; satış kaydı oluşturulamaz." };
    }
    if (input.quantity > ctx.currentHoldingQuantity + QTY_EPSILON) {
      return {
        ok: false,
        error: `Satış adedi mevcut pozisyondan büyük (${ctx.currentHoldingQuantity.toFixed(6)} adet).`,
      };
    }
  }
  return { ok: true };
}
