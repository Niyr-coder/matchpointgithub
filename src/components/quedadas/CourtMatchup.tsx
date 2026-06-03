"use client";

/**
 * Vista superior de cancha de pickleball con jugadores en cuadrantes.
 * Compartido entre gestión del organizador y vista jugador (Por cancha).
 */
export function CourtMatchup({
  teamA,
  teamB,
  nameSize = 12,
  emptyLabel,
  highlightNames,
  active,
  centerLabel = "vs",
}: {
  teamA: string[];
  teamB: string[];
  nameSize?: number;
  /** Texto centrado cuando no hay partido (p. ej. "Libre"). */
  emptyLabel?: string;
  /** Nombres a marcar con badge "Tú". */
  highlightNames?: string[];
  /** Tinte suave cuando es tu cancha / partido activo. */
  active?: boolean;
  /** Etiqueta sobre la red (p. ej. marcador "24–18"). */
  centerLabel?: string;
}) {
  const highlights = new Set(highlightNames ?? []);
  const spots = [
    { x: 18.5, y: 26.5, name: teamA[0] },
    { x: 18.5, y: 73.5, name: teamA[1] },
    { x: 81.5, y: 26.5, name: teamB[0] },
    { x: 81.5, y: 73.5, name: teamB[1] },
  ].filter((s): s is { x: number; y: number; name: string } => !!s.name);

  const isEmpty = spots.length === 0;
  const lineProps = { stroke: "#0a0a0a", strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" as const };

  return (
    <div style={{ position: "relative", marginTop: isEmpty && emptyLabel ? 4 : 10 }}>
      <svg viewBox="0 0 480 224" width="100%" style={{ display: "block" }} aria-hidden>
        <g fill="none" strokeLinejoin="miter">
          <rect
            x={6}
            y={6}
            width={468}
            height={212}
            fill="none"
            {...lineProps}
          />
          <line x1={240} y1={6} x2={240} y2={218} {...lineProps} />
          <line x1={170} y1={6} x2={170} y2={218} {...lineProps} />
          <line x1={310} y1={6} x2={310} y2={218} {...lineProps} />
          <line x1={6} y1={112} x2={170} y2={112} {...lineProps} />
          <line x1={310} y1={112} x2={474} y2={112} {...lineProps} />
        </g>
      </svg>

      {isEmpty && emptyLabel ? (
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
          }}
        >
          {emptyLabel}
        </span>
      ) : null}

      {spots.map((s, i) => {
        const parts = s.name.split(" ");
        const first = parts[0];
        const rest = parts.slice(1).join(" ");
        const isMe = highlights.has(s.name);
        return (
          <div
            key={i}
            className="font-heading"
            style={{
              position: "absolute",
              left: `${s.x}%`,
              top: `${s.y}%`,
              transform: "translate(-50%,-50%)",
              maxWidth: "30%",
              textAlign: "center",
              fontSize: nameSize,
              fontWeight: 800,
              lineHeight: 1.2,
              color: isMe ? "var(--color-mp-primary-active)" : "var(--fg)",
            }}
          >
            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{first}</span>
            {rest ? (
              <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", fontSize: nameSize - 1, fontWeight: 700 }}>
                {rest}
              </span>
            ) : null}
            {isMe ? (
              <span
                style={{
                  display: "inline-block",
                  marginTop: 3,
                  padding: "1px 5px",
                  borderRadius: 9999,
                  background: "var(--primary)",
                  color: "#0a0a0a",
                  fontSize: 7.5,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                }}
              >
                TÚ
              </span>
            ) : null}
          </div>
        );
      })}

      {!isEmpty ? (
        <span
          className={centerLabel !== "vs" ? "font-heading tabular" : undefined}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            fontSize: centerLabel !== "vs" ? 12 : 10,
            fontWeight: 900,
            letterSpacing: centerLabel !== "vs" ? "-0.02em" : "0.08em",
            textTransform: centerLabel !== "vs" ? "none" : "uppercase",
            color: centerLabel !== "vs" ? "var(--fg)" : "#fff",
            background: centerLabel !== "vs" ? "rgba(255,255,255,0.94)" : "var(--primary)",
            border: centerLabel !== "vs" ? "1px solid var(--border)" : undefined,
            padding: centerLabel !== "vs" ? "4px 11px" : "3px 8px",
            borderRadius: 9999,
          }}
        >
          {centerLabel}
        </span>
      ) : null}
    </div>
  );
}