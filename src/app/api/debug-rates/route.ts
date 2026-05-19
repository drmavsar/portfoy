import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

import { getAssetRates } from "@/app/(app)/_lib/asset-rates";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TRUNCGIL_URL = "https://finans.truncgil.com/v4/today.json";

export async function GET(req: NextRequest) {
  // Auth check — login olmayan kullanıcı debug endpoint'ini göremez
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Auth check failed" }, { status: 500 });
  }

  const out: Record<string, unknown> = {};
  const bust = req.nextUrl.searchParams.get("bust") === "1";
  if (bust) {
    revalidateTag("asset-rates", "max");
    out.cache_busted = true;
  }

  // 1) Ham Truncgil yanıtı — hangi key'ler dönüyor?
  try {
    const res = await fetch(TRUNCGIL_URL, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      out.truncgil_status = res.status;
      out.truncgil_error = res.statusText;
    } else {
      const json = (await res.json()) as Record<string, unknown>;
      const keys = Object.keys(json);
      // Altınla ilgili olabilecek key'leri öne çıkar
      const goldKeys = keys.filter((k) =>
        /alt|gram|ons|gold|gra|has|ceyrek|yarim|cumhur|ata|res|bilezik|gumus/i.test(k),
      );
      out.truncgil_total_keys = keys.length;
      out.truncgil_gold_related = goldKeys;
      // Bu key'lerin değerlerini al — Selling/Buying nedir?
      const goldDump: Record<string, unknown> = {};
      for (const k of goldKeys) {
        goldDump[k] = json[k];
      }
      out.truncgil_gold_values = goldDump;
      out.truncgil_all_keys = keys; // tüm key'ler
    }
  } catch (err) {
    out.truncgil_throw = err instanceof Error ? err.message : String(err);
  }

  // 2) getAssetRates çıktısı — gold için ne hesaplandı?
  try {
    const rates = await getAssetRates();
    out.parsed_rates = {
      USD: rates.USD,
      EUR: rates.EUR,
      XAU: rates.XAU,
      XAU_OZ: rates.XAU_OZ,
      XAG: rates.XAG,
      CEYREK: rates.CEYREK,
      YARIM: rates.YARIM,
      TAM: rates.TAM,
      CUMHURIYET: rates.CUMHURIYET,
      ATA: rates.ATA,
      RESAT: rates.RESAT,
      BILEZIK14: rates.BILEZIK14,
      BILEZIK18: rates.BILEZIK18,
      BILEZIK22: rates.BILEZIK22,
    };
    out.parsed_rates_all_keys = Object.keys(rates);
  } catch (err) {
    out.parsed_rates_throw = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(out, { status: 200 });
}
