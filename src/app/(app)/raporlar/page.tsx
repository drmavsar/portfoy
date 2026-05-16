import { Icon } from "@/components/ui/icon";

export const dynamic = "force-dynamic";

export default function RaporlarPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Raporlar</div>
          <div className="page-sub">Reel vs nominal · varlık kompozisyonu · kişi-bazlı.</div>
        </div>
      </div>

      <div className="empty">
        <div className="title">
          <Icon name="report" size={20} /> Bu sayfa henüz bağlanmadı
        </div>
        <div style={{ marginTop: 8, lineHeight: 1.6 }}>
          Çoklu zaman serisi grafikleri (reel/nominal, kişi-bazlı dağılım) <b>Raporlar sprintinde</b>
          canlıya çıkacak. Gelir/gider ve yatırım verisi tamamlandıktan sonra hesaplar.
        </div>
      </div>
    </div>
  );
}
