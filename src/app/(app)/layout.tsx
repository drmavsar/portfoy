import { AppShell } from "@/components/layout/app-shell";
import { getFxTickers } from "@/app/(app)/_lib/asset-rates";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const fxTickers = await getFxTickers();
  return <AppShell fxTickers={fxTickers}>{children}</AppShell>;
}
