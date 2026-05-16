import { Icon } from "@/components/ui/icon";

export const dynamic = "force-dynamic";

export default function IslemlerPage() {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">İşlemler</div>
          <div className="page-sub">Al/sat defteri. Her işlem bir lot oluşturur, WAC otomatik hesaplanır.</div>
        </div>
      </div>

      <div className="empty">
        <div className="title">
          <Icon name="wealth" size={20} /> Bu sayfa henüz bağlanmadı
        </div>
        <div style={{ marginTop: 8, lineHeight: 1.6 }}>
          Hisse/kripto/altın alım-satım defteri <b>Yatırımlar sprintinde</b> canlıya çıkacak.
          <br />
          Asset master tablosu (BIST sembolleri), portföyler, lot/WAC hesabı bu sprint paketinin
          parçası.
        </div>
      </div>
    </div>
  );
}
