import Link from "next/link";
import { Icon } from "@/components/Icon";

export function PartnerTorneoOperacionPanel({
  children,
  showBracketsFallback,
  hasBracket,
}: {
  children?: React.ReactNode;
  showBracketsFallback: boolean;
  hasBracket: boolean;
}) {
  return (
    <div className="mp-partner-torneo-operacion-stack">
      {children}
      {showBracketsFallback && (
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
            <Link href="/dashboard/partner/p-brackets" className="btn btn-primary">
              <Icon name="external-link" size={12} color="#fff" />
              Ir a brackets
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
