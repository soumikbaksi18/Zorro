import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zorro",
    short_name: "Zorro",
    description: "Private cash for Zcash: pay anyone in any coin, autopay and track every payment.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070b08",
    theme_color: "#070b08",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
