import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MiraX IPTV Player",
    short_name: "MiraX",
    description: "Set-top-box style IPTV player",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#1f3fdc",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
