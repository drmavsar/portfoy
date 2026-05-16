import { PageHeader } from "@/components/ui/page-header";
import { PlaceholderCard } from "@/components/ui/placeholder-card";

export default function WealthPage() {
  return (
    <>
      <PageHeader
        title="Varlık Yönetimi"
        description="Hisse · Döviz · Altın · Kripto. Ağırlıklı maliyet ve reel getiri tek panelde."
      />

      <div className="flex gap-1 border-b border-[color:var(--border)] mb-6 text-sm">
        {["Tümü", "Ana", "Ahmet Burak", "Salih"].map((t, i) => (
          <span
            key={t}
            className={
              i === 0
                ? "px-3 py-2 border-b-2 border-[color:var(--primary)] font-medium"
                : "px-3 py-2 text-[color:var(--muted)]"
            }
          >
            {t}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <PlaceholderCard title="Toplam Değer" />
        <PlaceholderCard title="Bekleyen K/Z" />
        <PlaceholderCard title="Realize K/Z (YTD)" />
        <PlaceholderCard title="TWR (YTD)" />
        <PlaceholderCard title="Reel Getiri (YTD)" />
        <PlaceholderCard title="Max Drawdown (12A)" />
      </div>

      <PlaceholderCard
        title="Varlık Listesi"
        description="Sembol · Adet · WAC · Son Fiyat · Piyasa Değeri · K/Z · Saklama · Portföy · 30g sparkline"
      />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PlaceholderCard
          title="Sunburst: Sınıf → Sembol"
          description="Portföy ağırlıklarını sınıf bazında dağıt"
        />
        <PlaceholderCard
          title="Saklama Treemap"
          description="Banka · Midas · Garanti Kripto · Kasa"
        />
        <PlaceholderCard
          title="Reel vs Nominal (zamansal)"
          description="1G · 1H · 1A · YTD · 1Y · Tümü"
        />
      </div>
    </>
  );
}
