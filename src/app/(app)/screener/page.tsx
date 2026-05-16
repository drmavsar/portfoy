import { PageHeader } from "@/components/ui/page-header";
import { PlaceholderCard } from "@/components/ui/placeholder-card";

export default function ScreenerPage() {
  return (
    <>
      <PageHeader
        title="Piyasa Radarı"
        description="Teknik önce, temel sonra. BIST'te paranın aktığı yeri yakala."
      />

      <PlaceholderCard
        title="Filtre Çubuğu"
        description="Tier · Min skor · Sektör · Sadece portföyümdekiler · Breakout / Vol surge / USD confirm rozetleri"
      />

      <div className="mt-4">
        <PlaceholderCard
          title="Sıralı Liste (Composite Score)"
          description="Sembol · Composite · Tech · Fund · Catalyst · Rozetler · RS · 52H'den uzaklık · Vol surge · Sparkline"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PlaceholderCard title="Tier 1 (Yüksek İnanç)" />
        <PlaceholderCard title="Tier 2 (Momentum Adayı)" />
        <PlaceholderCard title="Tier 3 (Radar'da)" />
      </div>
    </>
  );
}
