import { PublicChrome } from "@/components/landing/PublicChrome";
import { ComingSoon } from "@/components/landing/MarketingShell";

export default function MaterialPage() {
  return (
    <PublicChrome>
      <ComingSoon
        eyebrow="Material de marketing para coaches"
        title={<>Plantillas, fotos y guías para promocionar tus clases<span style={{ color: "var(--primary)" }}>.</span></>}
        hint="Estamos armando el kit. Mientras tanto, si ya eres coach activo en MatchPoint, pídelo a coaches@matchpoint.top y te lo enviamos por correo."
      />
    </PublicChrome>
  );
}
