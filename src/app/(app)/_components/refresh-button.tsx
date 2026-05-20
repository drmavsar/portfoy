"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { refreshMarketData } from "@/app/(app)/_lib/refresh-actions";

/** Piyasa verisi cache'ini manuel temizleyip sayfayı tazeler. */
export function RefreshButton() {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const onClick = () => {
    setDone(false);
    startTransition(async () => {
      await refreshMarketData();
      router.refresh();
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    });
  };

  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={onClick}
      disabled={busy}
      title="Piyasa verisini yeniden çek (Yahoo + Truncgil cache temizlenir)"
      style={{ whiteSpace: "nowrap" }}
    >
      <Icon name="refresh" size={12} />
      {busy ? " Güncelleniyor…" : done ? " Güncellendi" : " Güncelle"}
    </button>
  );
}
