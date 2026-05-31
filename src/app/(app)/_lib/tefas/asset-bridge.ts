// Sprint-6 PR-B — Fund ↔ Asset bridge helper'ları.
//
// Migration 0041 ile her fund için bir assets satırı (asset_class='fund',
// symbol=fund.code, exchange='TEFAS') oluşturuldu. Yeni fund INSERT'leri
// trigger ile otomatik düşer (sync_fund_to_asset).
//
// Bu modül runtime resolve helper'ları sağlar:
//   - findAssetIdByFundCode → trade formu için
//   - findFundCodeByAssetId → ters mapping (raporlama için)

import { createClient } from "@/lib/supabase/server";

/**
 * Fund code'dan assets.id UUID'sini resolve eder.
 * Migration 0041 sonrası tüm fund'lar bridge'lendi. Null dönerse fund
 * silinmiş veya migration eksik anlamına gelir.
 */
export async function findAssetIdByFundCode(code: string): Promise<string | null> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .select("id")
    .eq("symbol", trimmed)
    .eq("asset_class", "fund")
    .maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/**
 * Bir UUID için fund_code geri döner (asset_class='fund' ise).
 * Holdings → fund detay sayfası bağlantısı için.
 */
export async function findFundCodeByAssetId(assetId: string): Promise<string | null> {
  if (!assetId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .select("symbol, asset_class")
    .eq("id", assetId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { symbol: string; asset_class: string };
  if (row.asset_class !== "fund") return null;
  return row.symbol;
}

/**
 * Birden çok fund_code → asset_id Map (trade form bulk resolve için).
 * Bilinmeyen kodlar Map'te yer almaz.
 */
export async function findAssetIdsForFundCodes(
  codes: string[],
): Promise<Map<string, string>> {
  const cleaned = Array.from(
    new Set(codes.map((c) => c.trim().toUpperCase()).filter((c) => c.length > 0)),
  );
  if (cleaned.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .select("id, symbol")
    .eq("asset_class", "fund")
    .in("symbol", cleaned);
  if (error || !data) return new Map();
  const rows = data as Array<{ id: string; symbol: string }>;
  return new Map(rows.map((r) => [r.symbol, r.id]));
}
