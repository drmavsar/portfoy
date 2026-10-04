import type { Metadata } from "next";

import "@/components/ledger/ledger.css";

import { Showcase } from "./showcase";
import "./showcase.css";

export const metadata: Metadata = {
  title: "Tasarım sistemi — Mehmet's Assets",
};

/** Petrol Masa tasarım sistemi vitrini: token'lar ve bileşenlerin bütün halleri. */
export default function TasarimSistemiPage() {
  return <Showcase />;
}
