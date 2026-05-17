import { PublicChrome } from "@/components/landing/PublicChrome";
import { ComingSoon } from "@/components/landing/MarketingShell";

export default function CasosPage() {
  return (
    <PublicChrome>
      <ComingSoon
        eyebrow="Casos de éxito"
        title={<>Historias de clubes que crecieron con MatchPoint<span style={{ color: "var(--primary)" }}>.</span></>}
        hint="Estamos terminando de documentar los primeros casos. Si tu club ya está usando MatchPoint y quieres aparecer aquí, escríbenos a hola@matchpoint.top."
      />
    </PublicChrome>
  );
}
