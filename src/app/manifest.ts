import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MATCHPOINT",
    short_name: "MATCHPOINT",
    description:
      "Reserva canchas, encuentra rivales de tu nivel y sube al ranking en Ecuador.",
    id: "/",
    start_url: "/",
    scope: "/",
    lang: "es-EC",
    display: "standalone",
    display_override: ["standalone", "browser"],
    background_color: "#0a0a0a",
    theme_color: "#10b981",
    categories: ["sports", "lifestyle"],
    icons: [
      {
        src: "/icons/matchpoint-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/matchpoint-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/matchpoint-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
