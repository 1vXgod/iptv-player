import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MiraX IPTV Player",
  description: "HLS IPTV player with a set-top-box style interface",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
