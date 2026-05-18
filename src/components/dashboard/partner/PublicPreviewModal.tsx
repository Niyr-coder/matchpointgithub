"use client";
// Preview de la vista pública del torneo, embebido en modal. Sin redirect,
// el partner se queda en su panel. Recibe los datos ya cargados por la
// página de gestión para evitar otro fetch.
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";

type Preview = {
  name: string;
  slug: string;
  sport: string;
  format: string;
  modalityLabel: string;
  startsAt: string;
  endsAt: string | null;
  clubName: string | null;
  prizePoolCents: number | null;
  entryFeeCents: number;
  maxParticipants: number | null;
  paymentPolicy: string;
  status: string;
  isFeatured: boolean;
  scoringSummary: string;
};

type CategoryLite = { id: string; name: string; mprMin?: number | null; mprMax?: number | null };
type ScheduleLite = { id: string; startsAt: string; label: string; categoryId: string | null };
type PrizeLite = {
  id: string;
  placeLabel: string;
  prizeLabel: string;
  valueCents: number | null;
  sponsor: string | null;
};

export function PublicPreviewModal({
  preview,
  categories,
  blocks,
  prizes = [],
}: {
  preview: Preview;
  categories: CategoryLite[];
  blocks: ScheduleLite[];
  prizes?: PrizeLite[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="card"
        style={{
          padding: 18,
          textDecoration: "none",
          color: "inherit",
          display: "flex",
          gap: 12,
          alignItems: "center",
          textAlign: "left",
          background: "var(--card-bg, #fff)",
          border: "1px solid var(--border)",
          cursor: "pointer",
          fontFamily: "inherit",
          width: "100%",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "var(--muted)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="eye" size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 900 }}>Vista pública del torneo</div>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
            Lo que ven los jugadores en el detalle (preview en modal, sin salir).
          </div>
        </div>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="mp-modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="mp-modal-panel"
            style={{
              width: "100%",
              maxWidth: 880,
              maxHeight: "92vh",
              background: "#fff",
              borderRadius: 14,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
            }}
          >
            <div
              style={{
                padding: "12px 18px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--muted-fg)",
                }}
              >
                Preview público · sin salir del panel
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Link
                  href={`/eventos/${preview.slug}`}
                  target="_blank"
                  rel="noopener"
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "var(--muted-fg)",
                    textDecoration: "none",
                    display: "inline-flex",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  <Icon name="external-link" size={11} />
                  Abrir en nueva pestaña
                </Link>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--muted)",
                    border: 0,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            </div>

            <div style={{ overflow: "auto", flex: 1 }}>
              {/* Hero negro */}
              <div
                style={{
                  padding: "36px 28px 28px",
                  background:
                    "linear-gradient(135deg, #0a0a0a 0%, #1f2937 60%, #064e3b 100%)",
                  color: "#fff",
                  position: "relative",
                }}
              >
                <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                  {preview.isFeatured && (
                    <Chip bg="#fbbf24" fg="#000">
                      <Icon name="star" size={9} color="#000" /> Estelar
                    </Chip>
                  )}
                  <Chip bg="var(--primary)" fg="#fff">
                    {preview.modalityLabel}
                  </Chip>
                  <Chip bg="rgba(255,255,255,0.15)" fg="#fff">
                    {preview.sport.toUpperCase()} · {preview.format.toUpperCase()}
                  </Chip>
                  {preview.status === "draft" && (
                    <Chip bg="#dc2626" fg="#fff">
                      BORRADOR — NO PÚBLICO AÚN
                    </Chip>
                  )}
                </div>
                <h2
                  className="font-heading"
                  style={{
                    fontSize: 36,
                    fontWeight: 900,
                    letterSpacing: "-0.03em",
                    margin: 0,
                    textTransform: "uppercase",
                    lineHeight: 1,
                  }}
                >
                  {preview.name}
                  <span style={{ color: "var(--primary)" }}>.</span>
                </h2>
                <div
                  style={{
                    display: "flex",
                    gap: 18,
                    flexWrap: "wrap",
                    marginTop: 12,
                    fontSize: 12,
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  <span>
                    <Icon name="calendar" size={12} />{" "}
                    {fmtDate(preview.startsAt)}
                    {preview.endsAt ? ` → ${fmtDate(preview.endsAt)}` : " · Un solo día"}
                  </span>
                  {preview.clubName && (
                    <span>
                      <Icon name="map-pin" size={12} /> {preview.clubName}
                    </span>
                  )}
                  {preview.prizePoolCents && preview.prizePoolCents > 0 && (
                    <span>
                      <Icon name="trophy" size={12} />{" "}
                      <b style={{ color: "var(--primary)" }}>
                        ${Math.round(preview.prizePoolCents / 100).toLocaleString("en-US")}
                      </b>{" "}
                      en premios
                    </span>
                  )}
                  {preview.maxParticipants && (
                    <span>
                      <Icon name="users" size={12} /> {preview.maxParticipants} cupos
                    </span>
                  )}
                </div>
              </div>

              {/* Sección scoring + pago */}
              <div
                style={{
                  padding: 24,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    background: "var(--muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="label-mp">Sistema de puntuación</div>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>
                    {preview.scoringSummary}
                  </div>
                </div>
                <div
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    background: "var(--muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="label-mp">Cuota de inscripción</div>
                  <div
                    className="font-heading"
                    style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}
                  >
                    {preview.entryFeeCents === 0
                      ? "Gratis"
                      : `$${(preview.entryFeeCents / 100).toFixed(2)}`}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                    Pago: {policyLabel(preview.paymentPolicy)}
                  </div>
                </div>
              </div>

              {/* Categorías */}
              {categories.length > 0 && (
                <div style={{ padding: "0 24px 22px" }}>
                  <div className="label-mp" style={{ marginBottom: 8 }}>
                    Categorías
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {categories.map((c) => (
                      <span
                        key={c.id}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          background: "#0a0a0a",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {c.name}
                        {c.mprMin != null || c.mprMax != null ? (
                          <span style={{ marginLeft: 6, opacity: 0.7 }}>
                            MPR {c.mprMin ?? "—"}{c.mprMax != null ? `-${c.mprMax}` : "+"}
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Premios */}
              {prizes.length > 0 && (
                <div style={{ padding: "0 24px 22px" }}>
                  <div className="label-mp" style={{ marginBottom: 8 }}>
                    Premios
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {prizes.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "90px 1fr 90px",
                          gap: 12,
                          alignItems: "center",
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: "var(--muted)",
                          fontSize: 12,
                        }}
                      >
                        <div
                          className="font-heading"
                          style={{
                            fontSize: 15,
                            fontWeight: 900,
                            letterSpacing: "-0.02em",
                          }}
                        >
                          {p.placeLabel}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 800 }}>
                            {p.prizeLabel}
                          </div>
                          {p.sponsor && (
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: "0.06em",
                                color: "var(--muted-fg)",
                                textTransform: "uppercase",
                                marginTop: 2,
                              }}
                            >
                              {p.sponsor}
                            </div>
                          )}
                        </div>
                        <div
                          className="font-heading tabular"
                          style={{
                            fontSize: 14,
                            fontWeight: 900,
                            color: p.valueCents ? "var(--primary)" : "var(--muted-fg)",
                            textAlign: "right",
                          }}
                        >
                          {p.valueCents ? `$${Math.round(p.valueCents / 100).toLocaleString("en-US")}` : "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cronograma */}
              {blocks.length > 0 && (
                <div style={{ padding: "0 24px 28px" }}>
                  <div className="label-mp" style={{ marginBottom: 8 }}>
                    Cronograma
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {blocks.slice(0, 12).map((b) => {
                      const cat = categories.find((c) => c.id === b.categoryId);
                      return (
                        <div
                          key={b.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "120px 1fr",
                            gap: 12,
                            alignItems: "center",
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: "var(--muted)",
                            fontSize: 12,
                          }}
                        >
                          <div className="font-heading tabular" style={{ fontWeight: 800 }}>
                            {fmtDateTime(b.startsAt)}
                          </div>
                          <div>
                            <b>{b.label}</b>
                            {cat && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 9.5,
                                  fontWeight: 800,
                                  letterSpacing: "0.08em",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "var(--primary)",
                                  color: "#fff",
                                  textTransform: "uppercase",
                                }}
                              >
                                {cat.name}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Chip({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) {
  return (
    <span
      style={{
        padding: "4px 10px",
        background: bg,
        color: fg,
        borderRadius: 9999,
        fontSize: 9.5,
        fontWeight: 900,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        display: "inline-flex",
        gap: 4,
        alignItems: "center",
      }}
    >
      {children}
    </span>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function policyLabel(p: string): string {
  switch (p) {
    case "prepay":
      return "Online (transferencia)";
    case "onsite":
      return "En club";
    case "flexible":
      return "Online o en club";
    case "free":
      return "Gratis";
    default:
      return p;
  }
}
