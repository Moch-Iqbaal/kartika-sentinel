import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://kartika-sentinel.vercel.app"),
  title: "Kartika Sentinel — Detektor hoaks berita Indonesia",
  description: "Detektor hoaks berita Indonesia untuk personel TNI. Cek teks, tautan, atau video: hasilnya Kemungkinan HOAKS atau Kemungkinan FAKTA. Rekomendasi untuk analis, bukan putusan otomatis.",
  openGraph: {
    title: "Kartika Sentinel",
    description: "Detektor hoaks berita Indonesia untuk personel TNI.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Kartika Sentinel" }],
  },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
