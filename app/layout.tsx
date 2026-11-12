import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { PwaRegistration } from "@/components/pwa-registration";

export const metadata: Metadata = {
  title: "Deposit Flow Finance",
  description: "Deposit-based money tracking for exact source-to-spend visibility.",
  manifest: "/manifest.webmanifest",
  applicationName: "Deposit Flow Finance",
  appleWebApp: { capable: true, title: "Deposit Flow", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: "/icons/icon-192.png"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5fbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1720" }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          <PwaRegistration />
          {children}
        </Providers>
      </body>
    </html>
  );
}
