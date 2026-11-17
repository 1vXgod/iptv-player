import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MiraX IPTV Player",
  description: "HLS IPTV player with a set-top-box style interface",
  applicationName: "MiraX",
  appleWebApp: { capable: true, title: "MiraX", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  // Safari's "Add to Home Screen" opens the page as a bar-free app when this is set
  other: { "apple-mobile-web-app-capable": "yes" },
  // iOS ignores SVG home-screen icons, so there are PNGs too
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
