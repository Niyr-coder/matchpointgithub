import Link from "next/link";
import { Icon } from "@/components/Icon";

const LIGA_FORMATS = new Set(["round_robin", "swiss"]);

export function PartnerTorneoOperacionPanel({
  children,
  showBracketsFallback,
  hasBracket,
  tournamentFormat,
  tournamentId,
}: {
  children?: React.ReactNode;
  showBracketsFallback: boolean;
  hasBracket: boolean;
  tournamentFormat?: string;
  tournamentId?: string;
}) {
  const isLiga = tournamentFormat ? LIGA_FORMATS.has(tournamentFormat) : false;

  return (
    <div className="mp-partner-torneo-operacion-stack">
      {children}
      {showBracketsFallback && !isLiga && (
        <div className="card mp-partner-torneo-operacion-brackets">
          <div className="mp-partner-torneo-operacion-brackets-icon" aria-hidden>
            <Icon name="trophy" size={18} />
          </div>
          <div className="mp-partner-torneo-operacion-brackets-body">
            <div className="label-mp">Cuadro eliminatorio</div>
            <p className="mp-partner-torneo-operacion-brackets-sub">
              {hasBracket
                ? "El bracket ya está generado. Gestiona marcadores y avance desde la pantalla de brackets."
                : "Cuando cierres inscripciones y generes el cuadro, podrás cargar resultados aquí."}
            </p>
            <Link href={`/dashboard/partner/p-brackets${tournamentId ? `?tid=${tournamentId}` : ""}`} className="btn btn-primary">
              <Icon name="external-link" size={12} color="#fff" />
              Ir a brackets
            </Link>
          </div>
        </div>
      )}
      {showBracketsFallback && isLiga && (
        <div className="card mp-partner-torneo-operacion-brackets">
          <div className="mp-partner-torneo-operacion-brackets-icon" aria-hidden>
            <Icon name="list" size={18} />
          </div>
          <div className="mp-partner-torneo-operacion-brackets-body">
            <div className="label-mp">Marcadores de liga</div>
            <p className="mp-partner-torneo-operacion-brackets-sub">
              La gestión de partidos y marcadores para formatos de liga (round-robin y suizo) estará disponible próximamente.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
