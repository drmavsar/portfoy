import { Icon } from "@/components/ui/icon";

export const dynamic = "force-dynamic";

export default function RadarPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Piyasa Radarı</div>
          <div className="page-sub">BIST screener · sektör rotasyonu · KAP akışı.</div>
        </div>
      </div>

      <div className="empty">
        <div className="title">
          <Icon name="screener" size={20} /> Bu sayfa henüz bağlanmadı
        </div>
        <div style={{ marginTop: 8, lineHeight: 1.6 }}>
          Screener, sektör rotasyonu, KAP duyuru akışı <b>Piyasa Veri sprintinde</b> canlıya çıkacak.
          <br />
          Veri kaynakları: <code>borsa-api</code> (BIST fiyat/endeks), KAP RSS (duyuru), TCMB (kur).
        </div>
      </div>
    </div>
  );
}
