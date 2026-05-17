// Client view de ClubCanchasScreen — layout del mock 1:1 SIEMPRE visible.
// Sin canchas reales → 4 cards placeholder neutras (dashed + "—" sin inventar datos).
// Con canchas reales → todas las que tenga el club (no cap).
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { createCourt, updateCourt } from "@/server/actions/courts";

type StPill = "BUSY" | "MAINT" | "OK";

export type CourtCard = {
  id: string;
  name: string;
  surf: string;
  lights: boolean;
  active: boolean;
  priceCents: number | null;
  hours: string;
  util: number;
};

export type CanchasData = {
  clubId: string | null;
  courts: CourtCard[];
};

const ST_COLOR: Record<StPill, string> = {
  BUSY: "var(--primary)",
  OK: "#0ea5e9",
  MAINT: "#dc2626",
};

function stPill(c: CourtCard): StPill {
  if (!c.active) return "MAINT";
  if (c.util > 80) return "BUSY";
  return "OK";
}

export function ClubCanchasScreenView({ data }: { data: CanchasData }) {
  useRealtimeRefresh(
    data.clubId ? [{ table: "courts", filter: `club_id=eq.${data.clubId}` }] : [],
    { enabled: !!data.clubId },
  );

  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const handleCreate = (form: {
    code: string;
    sport: "pickleball" | "padel" | "tennis";
    indoor: boolean;
    lights: boolean;
    surface: string;
  }) => {
    if (!data.clubId) return;
    startTransition(async () => {
      const r = await createCourt({
        clubId: data.clubId,
        code: form.code.trim(),
        sport: form.sport,
        indoor: form.indoor,
        lights: form.lights,
        surface: form.surface.trim() || undefined,
      });
      if (!r.ok) {
        const msg =
          r.error.code === "COURTS.DUPLICATE_CODE"
            ? "Ya existe una cancha con ese código en este club"
            : r.error.message;
        toast({ icon: "alert-triangle", title: "No se pudo crear", sub: msg });
        return;
      }
      toast({ icon: "check-circle-2", title: "Cancha creada", sub: r.data.code });
      setShowAdd(false);
      router.refresh();
    });
  };

  const toggleActive = (court: CourtCard) => {
    setBusyId(court.id);
    startTransition(async () => {
      const r = await updateCourt({
        courtId: court.id,
        patch: { active: !court.active },
      });
      setBusyId(null);
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo actualizar", sub: r.error.message });
        return;
      }
      toast({
        icon: court.active ? "ban" : "check-circle-2",
        title: court.active ? "Cancha bloqueada" : "Cancha reabierta",
        sub: court.name,
      });
      router.refresh();
    });
  };

  // Si hay canchas reales → todas; si no → 4 placeholders neutros que
  // preservan el layout del mock (sin inventar datos: "—" en vez de "$14").
  const hasReal = data.courts.length > 0;
  const cards: (CourtCard | { placeholder: true; n: number })[] = hasReal
    ? data.courts
    : [1, 2, 3, 4].map((n) => ({ placeholder: true as const, n }));

  return (
    <>
      <RSHeader
        label="Club · Recursos"
        title="Canchas"
        action={
          <button
            className="btn btn-primary"
            disabled={!data.clubId}
            onClick={() => setShowAdd(true)}
            style={{
              opacity: data.clubId ? 1 : 0.5,
              cursor: data.clubId ? "pointer" : "not-allowed",
            }}
          >
            <Icon name="plus" size={13} color="#fff" />
            Agregar cancha
          </button>
        }
      />

      {showAdd && data.clubId && (
        <AddCourtModal
          pending={pending}
          onCancel={() => setShowAdd(false)}
          onSubmit={handleCreate}
        />
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {cards.map((card, idx) => {
          // ── Placeholder card ────────────────────────────────────────
          if ("placeholder" in card) {
            return (
              <div
                key={`ph-${card.n}`}
                className="card"
                style={{
                  padding: 0,
                  overflow: "hidden",
                  opacity: 0.6,
                  border: "1px dashed var(--border)",
                  background: "#fafafa",
                }}
              >
                <div
                  style={{
                    height: 100,
                    background: "linear-gradient(135deg, #e5e5e5, #d4d4d4)",
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-end",
                    padding: 12,
                  }}
                >
                  <div style={{ position: "absolute", top: 10, right: 10 }}>
                    <RSPill bg="var(--muted-fg)">—</RSPill>
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 12,
                      fontFamily: "Plus Jakarta Sans",
                      fontWeight: 900,
                      fontSize: 32,
                      color: "rgba(255,255,255,0.25)",
                      letterSpacing: "-0.04em",
                    }}
                  >
                    {card.n}
                  </div>
                  <div style={{ position: "relative", zIndex: 2, color: "#fff" }}>
                    <div
                      className="font-heading"
                      style={{
                        fontSize: 18,
                        fontWeight: 900,
                        letterSpacing: "-0.02em",
                        textTransform: "uppercase",
                      }}
                    >
                      Cancha {card.n}
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>.</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)" }}>—</div>
                  </div>
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                    <div>
                      <div className="label-mp">Tarifa</div>
                      <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, color: "var(--muted-fg)" }}>
                        $—
                      </div>
                    </div>
                    <div>
                      <div className="label-mp">Horario</div>
                      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: "var(--muted-fg)" }}>—</div>
                    </div>
                    <div>
                      <div className="label-mp">Utilización</div>
                      <div
                        className="font-heading"
                        style={{ fontSize: 16, fontWeight: 900, color: "var(--muted-fg)" }}
                      >
                        —
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    <button
                      className="btn"
                      disabled
                      style={{
                        flex: 1,
                        background: "#fff",
                        border: RS_BORDER,
                        fontSize: 11,
                        opacity: 0.5,
                        cursor: "not-allowed",
                      }}
                    >
                      <Icon name="ban" size={11} />
                      Bloquear
                    </button>
                    <button
                      className="btn"
                      disabled
                      style={{
                        background: "#fff",
                        border: RS_BORDER,
                        fontSize: 11,
                        opacity: 0.5,
                        cursor: "not-allowed",
                      }}
                    >
                      <Icon name="settings-2" size={11} />
                      Editar
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          // ── Real court card ─────────────────────────────────────────
          const c = card;
          const st = stPill(c);
          const isMaint = !c.active;
          const priceLabel = c.priceCents != null ? `$${Math.round(c.priceCents / 100)}` : "$—";
          return (
            <div
              key={c.id}
              className="card"
              style={{
                padding: 0,
                overflow: "hidden",
                opacity: isMaint ? 0.7 : 1,
              }}
            >
              <div
                style={{
                  height: 100,
                  background: isMaint
                    ? "linear-gradient(135deg,#dc2626,#7f1d1d)"
                    : "linear-gradient(135deg,#064e3b,#10b981)",
                  position: "relative",
                  display: "flex",
                  alignItems: "flex-end",
                  padding: 12,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.18), transparent 60%)",
                  }}
                />
                <div style={{ position: "absolute", top: 10, right: 10 }}>
                  <RSPill bg={ST_COLOR[st]}>{st}</RSPill>
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 12,
                    fontFamily: "Plus Jakarta Sans",
                    fontWeight: 900,
                    fontSize: 32,
                    color: "rgba(255,255,255,0.1)",
                    letterSpacing: "-0.04em",
                  }}
                >
                  {c.name.split(" ").pop() ?? idx + 1}
                </div>
                <div style={{ position: "relative", zIndex: 2, color: "#fff" }}>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 18,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      textTransform: "uppercase",
                    }}
                  >
                    {c.name}
                    <span style={{ color: "#bbf7d0" }}>.</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.85)" }}>
                    {c.surf}
                    {c.lights ? " · iluminada" : ""}
                  </div>
                </div>
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  <div>
                    <div className="label-mp">Tarifa</div>
                    <div className="font-heading" style={{ fontSize: 16, fontWeight: 900 }}>
                      {priceLabel}
                      <span style={{ fontSize: 9, color: "var(--muted-fg)" }}>/h</span>
                    </div>
                  </div>
                  <div>
                    <div className="label-mp">Horario</div>
                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4 }}>
                      {isMaint ? "Cerrada por mant." : c.hours}
                    </div>
                  </div>
                  <div>
                    <div className="label-mp">Utilización</div>
                    <div
                      className="font-heading"
                      style={{
                        fontSize: 16,
                        fontWeight: 900,
                        color:
                          c.util > 80
                            ? "var(--primary)"
                            : c.util > 60
                              ? "#fbbf24"
                              : "var(--muted-fg)",
                      }}
                    >
                      {c.util}%
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                  {isMaint ? (
                    <button
                      className="btn btn-primary"
                      style={{
                        flex: 1,
                        fontSize: 11,
                        opacity: pending && busyId === c.id ? 0.6 : 1,
                        cursor: pending && busyId === c.id ? "wait" : "pointer",
                      }}
                      disabled={pending && busyId === c.id}
                      onClick={() => toggleActive(c)}
                    >
                      {pending && busyId === c.id ? "Reabriendo…" : "Reabrir cancha"}
                    </button>
                  ) : (
                    <button
                      className="btn"
                      style={{
                        flex: 1,
                        background: "#fff",
                        border: RS_BORDER,
                        fontSize: 11,
                        opacity: pending && busyId === c.id ? 0.6 : 1,
                        cursor: pending && busyId === c.id ? "wait" : "pointer",
                      }}
                      disabled={pending && busyId === c.id}
                      onClick={() => toggleActive(c)}
                    >
                      <Icon name="ban" size={11} />
                      {pending && busyId === c.id ? "Bloqueando…" : "Bloquear"}
                    </button>
                  )}
                  <button
                    className="btn"
                    style={{
                      background: "#fff",
                      border: RS_BORDER,
                      fontSize: 11,
                    }}
                  >
                    <Icon name="settings-2" size={11} />
                    Editar
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Modal: Agregar cancha ──────────────────────────────────────────────
function AddCourtModal({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (form: {
    code: string;
    sport: "pickleball" | "padel" | "tennis";
    indoor: boolean;
    lights: boolean;
    surface: string;
  }) => void;
}) {
  const [code, setCode] = useState("");
  const [sport, setSport] = useState<"pickleball" | "padel" | "tennis">("pickleball");
  const [indoor, setIndoor] = useState(false);
  const [lights, setLights] = useState(true);
  const [surface, setSurface] = useState("Acrílica");

  const canSubmit = code.trim().length > 0 && !pending;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(2px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          padding: 28,
          width: "100%",
          maxWidth: 460,
          background: "#fff",
        }}
      >
        <div
          className="font-heading"
          style={{
            fontSize: 22,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
            marginBottom: 4,
          }}
        >
          Nueva cancha<span className="dot">.</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-fg)", margin: "0 0 18px" }}>
          Quedará activa al crearla. Podrás bloquearla luego desde la lista.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                marginBottom: 6,
              }}
            >
              Código <span style={{ color: "#dc2626" }}>*</span>
            </div>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ej. Cancha 5 / C-Indoor 1"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: RS_BORDER,
                borderRadius: 8,
                fontSize: 13,
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  marginBottom: 6,
                }}
              >
                Deporte
              </div>
              <select
                value={sport}
                onChange={(e) => setSport(e.target.value as "pickleball" | "padel" | "tennis")}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: RS_BORDER,
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: "inherit",
                  background: "#fff",
                }}
              >
                <option value="pickleball">Pickleball</option>
                <option value="padel">Pádel</option>
                <option value="tennis">Tenis</option>
              </select>
            </div>
            <div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  marginBottom: 6,
                }}
              >
                Superficie
              </div>
              <input
                value={surface}
                onChange={(e) => setSurface(e.target.value)}
                placeholder="Acrílica / Sintética / …"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: RS_BORDER,
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setIndoor(false)}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 800,
                fontFamily: "inherit",
                cursor: "pointer",
                background: !indoor ? "#0a0a0a" : "#fff",
                color: !indoor ? "#fff" : "#0a0a0a",
                border: "1px solid " + (!indoor ? "#0a0a0a" : "var(--border)"),
              }}
            >
              Outdoor
            </button>
            <button
              onClick={() => setIndoor(true)}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 800,
                fontFamily: "inherit",
                cursor: "pointer",
                background: indoor ? "#0a0a0a" : "#fff",
                color: indoor ? "#fff" : "#0a0a0a",
                border: "1px solid " + (indoor ? "#0a0a0a" : "var(--border)"),
              }}
            >
              Indoor
            </button>
          </div>

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={lights}
              onChange={(e) => setLights(e.target.checked)}
              style={{ accentColor: "#10b981" }}
            />
            Iluminada (juego nocturno)
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22 }}>
          <button
            onClick={onCancel}
            disabled={pending}
            className="btn"
            style={{ background: "#fff", border: RS_BORDER }}
          >
            Cancelar
          </button>
          <button
            onClick={() => canSubmit && onSubmit({ code, sport, indoor, lights, surface })}
            disabled={!canSubmit}
            className="btn btn-primary"
            style={{
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            <Icon name="plus" size={13} color="#fff" />
            {pending ? "Creando…" : "Crear cancha"}
          </button>
        </div>
      </div>
    </div>
  );
}
