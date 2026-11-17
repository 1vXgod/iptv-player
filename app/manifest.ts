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
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
