import { PublicChrome } from "@/components/landing/PublicChrome";
import { ComingSoon } from "@/components/landing/MarketingShell";

export default function BlogPage() {
  return (
    <PublicChrome>
      <ComingSoon
        eyebrow="Blog MatchPoint"
        title={<>Historias, guías y novedades del deporte del Ecuador<span style={{ color: "var(--primary)" }}>.</span></>}
        hint="Pronto vas a encontrar aquí entrevistas con jugadores, calendario de eventos del mes y guías técnicas. Mientras tanto síguenos en redes."
      />
    </PublicChrome>
  );
}
