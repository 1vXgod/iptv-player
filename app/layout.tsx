import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MiraX IPTV Player",
  description: "HLS IPTV player with a set-top-box style interface",
  applicationName: "MiraX",
  appleWebApp: { capable: true, title: "MiraX", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

// Phone: fixed scale (no pinch-zoom / double-tap zoom fighting the gestures), full-bleed under the notch,
// and the layout shrinks (instead of scrolling) when the on-screen keyboard opens.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
