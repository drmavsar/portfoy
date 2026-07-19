"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};

/* Modal overlay'lerini body altına taşır. Modallar .shell içinde kalırsa
   fontscale zoom'u ([data-fontscale] .shell) ve scroll edilmiş .main,
   position:fixed konumlamayı — özellikle iOS Safari'de — bozabiliyor
   (sayfa scroll'luyken overlay kayıyor, footer ekran dışında kalıyor).
   Body'nin zoom'u/scroll'u olmadığından portal bu etkileri sıfırlar;
   yazı ölçeği globals.css'te .modal'a ayrıca uygulanır. */
export function ModalPortal({ children }: { children: ReactNode }) {
  /* SSR/hydration sırasında false, client'ta true — effect'siz mounted kontrolü */
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return createPortal(children, document.body);
}
