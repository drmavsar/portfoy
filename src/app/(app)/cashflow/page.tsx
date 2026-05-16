import { PageHeader } from "@/components/ui/page-header";
import { PlaceholderCard } from "@/components/ui/placeholder-card";

export default function CashflowPage() {
  return (
    <>
      <PageHeader
        title="Nakit Akışı"
        description="Ekstreni yükle, kategori ata, faydalanıcıya etiketle. Sistem önerir, sen onaylarsın."
      />

      <nav className="flex gap-1 border-b border-[color:var(--border)] mb-6 text-sm">
        {["Genel Bakış", "İşlemler", "Ekstreler", "Bütçeler", "Tekrar Eden"].map((t, i) => (
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
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PlaceholderCard title="Bu Ay Gelir" />
        <PlaceholderCard title="Bu Ay Gider" />
        <PlaceholderCard title="Tasarruf Oranı" />
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PlaceholderCard
          title="Faydalanıcı Pastası"
          description="Bu ayki harcamalar Ev / Salih / Ahmet Burak / Anne-Baba bazında"
        />
        <PlaceholderCard
          title="Kategori Pastası"
          description="Market / Yeme-İçme / Eğitim / Faturalar / Sağlık / Diğer"
        />
      </div>

      <div className="mt-4">
        <PlaceholderCard
          title="Burn Rate"
          description="Kategori bazlı bütçe tüketimi (% dolu) — ayın gününe göre tempo"
        />
      </div>
    </>
  );
}
