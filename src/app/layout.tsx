import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
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
      { url: "/icons/matchpoint-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/icons/matchpoint-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
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
  const fontVars = [
    plusJakarta.variable,
    inter.variable,
    spaceGrotesk.variable,
    jetbrainsMono.variable,
  ].join(" ");

  return (
    <html lang="es" className={`${fontVars} h-full antialiased`}>
      <body className="min-h-full">
        <SportsProvider multisport={multisport}>
          {children}
          <LegalComplianceShell />
        </SportsProvider>
      </body>
    </html>
  );
}
