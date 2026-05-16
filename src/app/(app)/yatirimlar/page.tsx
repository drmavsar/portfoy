import { Icon } from "@/components/ui/icon";

export const dynamic = "force-dynamic";

export default function YatirimlarPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Yatırımlar</div>
          <div className="page-sub">Holdings + lot detayı + K/Z.</div>
        </div>
      </div>

      <div className="empty">
        <div className="title">
          <Icon name="wealth" size={20} /> Bu sayfa henüz bağlanmadı
        </div>
        <div style={{ marginTop: 8, lineHeight: 1.6 }}>
          Pozisyonlar, ortalama maliyet, anlık kâr/zarar tabloları <b>Yatırımlar sprintinde</b>
          canlıya çıkacak. Borsa fiyatları için <code>borsa-api</code> entegrasyonu bu sprint'te.
        </div>
      </div>
    </div>
  );
}
