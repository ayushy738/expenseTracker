import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Deposit Flow Finance",
    short_name: "Deposit Flow",
    description: "Know where your money comes from, where it goes, and what's left.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5fbfa",
    theme_color: "#0d9488",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ],
    shortcuts: [
      { name: "Quick Add Expense", short_name: "Add expense", url: "/quick-add", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] }
    ]
  };
}
