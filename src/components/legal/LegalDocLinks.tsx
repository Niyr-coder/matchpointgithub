import type { CSSProperties } from "react";

const linkStyle: CSSProperties = {
  color: "#0a0a0a",
  textDecoration: "underline",
  fontWeight: 700,
};

type Props = {
  prefix?: string;
  style?: CSSProperties;
  linkStyleOverride?: CSSProperties;
};

/** Enlace inline a Términos + Privacidad (LOPDP / consentimiento informado). */
export function LegalDocLinks({
  prefix = "Al continuar aceptas nuestros",
  style,
  linkStyleOverride,
}: Props) {
  const a = linkStyleOverride ?? linkStyle;
  return (
    <div style={style}>
      {prefix}{" "}
      <a href="/legal/terminos" target="_blank" rel="noopener noreferrer" style={a}>
        Términos
      </a>{" "}
      y{" "}
      <a href="/legal/privacidad" target="_blank" rel="noopener noreferrer" style={a}>
        Política de Privacidad
      </a>
      .
    </div>
  );
}
