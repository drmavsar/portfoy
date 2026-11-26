"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { refreshMarketData } from "@/app/(app)/_lib/refresh-actions";
import { refreshHeldFundPrices } from "@/app/(app)/_lib/tefas/prices-actions";

/** Piyasa verisi cache'ini manuel temizleyip sayfayı tazeler. */
export function RefreshButton() {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [fundNote, setFundNote] = useState<{ text: string; warn: boolean } | null>(null);

  const onClick = () => {
    setDone(false);
    setFundNote(null);
    startTransition(async () => {
      // Hisse/kur cache'ini temizle + portföydeki fonların NAV'ını TEFAS'tan
      // canlı çek. Fon tazelemesi best-effort; başarısızsa diğerini bozmaz.
      const [, funds] = await Promise.all([
        refreshMarketData().catch(() => null),
        refreshHeldFundPrices().catch(() => null),
      ]);
      setFundNote(describeFundRefresh(funds));
      router.refresh();
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    });
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className="btn btn-sm"
        onClick={onClick}
        disabled={busy}
        title="Piyasa verisini yeniden çek (hisse fiyatı + döviz/altın cache temizlenir, portföydeki fonların TEFAS NAV'ı güncellenir)"
        style={{ whiteSpace: "nowrap" }}
      >
        <Icon name="refresh" size={12} />
        {busy ? " Güncelleniyor…" : done ? " Güncellendi" : " Güncelle"}
      </button>
      {fundNote && (
        <span
          role="status"
          style={{
            fontSize: 12,
            whiteSpace: "nowrap",
            color: fundNote.warn ? "var(--negative)" : "var(--muted)",
          }}
        >
          {fundNote.text}
        </span>
      )}
    </span>
  );
}

type FundRefreshResult = Awaited<ReturnType<typeof refreshHeldFundPrices>> | null;

/** Fon tazelemesinin sonucu: TEFAS'ın verdiği son fiyat tarihi ya da hata. */
export function describeFundRefresh(res: FundRefreshResult): { text: string; warn: boolean } | null {
  if (!res) return { text: "Fon fiyatları güncellenemedi", warn: true };
  if (res.codes.length === 0) return null;
  if (res.failed.length > 0) {
    return { text: `TEFAS'tan alınamadı: ${res.failed.join(", ")}`, warn: true };
  }
  if (res.saveError) return { text: "Fon fiyatı kaydedilemedi", warn: true };
  const dates = (res.latest ?? []).map((l) => l.as_of).sort();
  const last = dates[dates.length - 1];
  if (!last) return null;
  const [y, m, d] = last.split("-");
  return { text: `Fon fiyatı: ${d}.${m}.${y}`, warn: false };
}
