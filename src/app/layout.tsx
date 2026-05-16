import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Mehmet's Assets",
  description:
    "Kişisel ERP ve yatırım terminali — nakit akışı, varlık takibi ve BIST radarı.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[color:var(--background)] text-[color:var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
