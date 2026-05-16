import { PageHeader } from "@/components/ui/page-header";
import { PlaceholderCard } from "@/components/ui/placeholder-card";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Kurallar & Ayarlar"
        description="Sistemi kendi diline öğret. Kategoriler, faydalanıcılar, kurallar — hepsi dinamik."
      />

      <nav className="flex gap-1 border-b border-[color:var(--border)] mb-6 text-sm">
        {[
          "Tanımlamalar",
          "Kurallar",
          "Hesaplar",
          "Entegrasyonlar",
          "Hesabım",
        ].map((t, i) => (
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
        <PlaceholderCard
          title="Kategoriler"
          description="Parent / child ağaç · inline ekle · renk + ikon"
        />
        <PlaceholderCard
          title="Faydalanıcılar"
          description="Ev · Ahmet Burak · Salih · Anne/Baba · Ortak — dinamik"
        />
        <PlaceholderCard
          title="Saklama Lokasyonları"
          description="Banka · Midas · Garanti Kripto · Kasa"
        />
      </div>
    </>
  );
}
