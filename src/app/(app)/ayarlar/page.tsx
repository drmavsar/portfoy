import { AyarlarClient } from "./ayarlar-client";
import { isSupabaseConfigured, listBeneficiaries } from "./actions";

export const dynamic = "force-dynamic";

export default async function AyarlarPage() {
  const [configured, rows] = await Promise.all([
    isSupabaseConfigured(),
    listBeneficiaries(),
  ]);

  return <AyarlarClient initialBeneficiaries={rows} supabaseConfigured={configured} />;
}
