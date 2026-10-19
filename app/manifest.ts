import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "おさいふびより",
    short_name: "おさいふびより",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#f7f1ec",
    background_color: "#f7f1ec",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
