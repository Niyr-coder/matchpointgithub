import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SportsProvider } from "@/components/SportsProvider";
import { LegalComplianceShell } from "@/components/legal/LegalComplianceShell";
import { getMultisportEnabled } from "@/lib/sports.server";
import { getSiteUrl } from "@/lib/site-url";

// URL canónica (docs/architecture/90-canonical-url.md). metadataBase resuelve OG/twitter.
const SITE_URL = getSiteUrl();

const TITLE = "MATCHPOINT — La comunidad #1 de Pickleball en Ecuador";
const DESCRIPTION =
  "Reserva canchas, encuentra rivales de tu nivel y sube al ranking. De cero a cancha en 60 segundos.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "MATCHPOINT",
  title: TITLE,
  description: DESCRIPTION,
  keywords: ["pickleball", "ecuador", "canchas", "reservas", "ranking"],
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "MATCHPOINT",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/matchpoint-icon.svg", type: "image/svg+xml" },
      { url: "/icons/matchpoint-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // TODO: agregar imagen OG (1200×630) — hoy no hay asset en /public, así que
  // se comparte sin preview de imagen. Cuando exista, sumar `images` acá y
  // cambiar twitter.card a "summary_large_image".
  openGraph: {
    type: "website",
    siteName: "MATCHPOINT",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "es_EC",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#10b981",
  colorScheme: "light",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const multisport = await getMultisportEnabled();
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">
        <SportsProvider multisport={multisport}>
          {children}
          <LegalComplianceShell />
        </SportsProvider>
      </body>
    </html>
  );
}
