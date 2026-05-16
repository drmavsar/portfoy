import { PageHeader } from "@/components/ui/page-header";
import { PlaceholderCard } from "@/components/ui/placeholder-card";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Ana Kokpit"
        description="Sabah 30 saniyede ne olduğunu gör. Net servet, nakit akışı, reel getiri ve katalistler."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <PlaceholderCard title="Net Servet">
          Σ tüm hesaplar + portföyler (TRY) · günlük / aylık delta · sparkline.
        </PlaceholderCard>
        <PlaceholderCard title="Bu Ay Nakit Akışı">
          Gelir − Gider = Tasarruf · geçen aya kıyas.
        </PlaceholderCard>
        <PlaceholderCard title="Portföy Reel Getiri (YTD)">
          CPI-adjusted · Altın, USD, BIST100 kıyasları.
        </PlaceholderCard>
        <PlaceholderCard title="Açık Kart Borcu">
          Toplam ödenmemiş + son ödeme tarihi.
        </PlaceholderCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3 space-y-4">
          <PlaceholderCard
            title="Toplam Servet — Waterfall (12 ay)"
            description="Başlangıç → Gelir → Gider → Yatırım K/Z → Bitiş"
          />
          <PlaceholderCard title="Aylık Nakit Akışı (12 ay)" />
          <PlaceholderCard
            title="Reel vs Nominal Getiri"
            description="Portföy · CPI · USD · EUR · Altın · BIST100 (overlay)"
          />
        </div>
        <div className="xl:col-span-2 space-y-4">
          <PlaceholderCard
            title="Faydalanıcı Dağılımı"
            description="Ev / Salih / Ahmet Burak / Anne-Baba / Ortak"
          />
          <PlaceholderCard title="Varlık Dağılımı (Treemap)" />
          <PlaceholderCard title="Bu Hafta Top 5 Harcama" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <PlaceholderCard
          title="Korelasyon Isı Haritası"
          description="Portföyündeki varlıkların 90g rolling korelasyonu"
        />
        <PlaceholderCard title="Sektör Rotasyonu" />
        <PlaceholderCard title="Canlı KAP & Cashtag Akışı" />
      </div>
    </>
  );
}
