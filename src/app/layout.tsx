import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mehmet's Assets — Servet ve Nakit Akışı Terminali",
  description:
    "Kişisel ERP ve yatırım terminali — nakit akışı, varlık takibi, BIST radarı.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

// Hydration öncesi tema + font ölçeğini uygula (flash önleme).
// Varsayılan: light tema, "buyuk" font ölçeği.
const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('ma-theme') || 'light';
    var f = localStorage.getItem('ma-fontscale') || 'buyuk';
    document.documentElement.dataset.theme = t;
    document.documentElement.dataset.fontscale = f;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.fontscale = 'buyuk';
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      data-theme="light"
      data-fontscale="buyuk"
      className={`${inter.variable} ${plexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
