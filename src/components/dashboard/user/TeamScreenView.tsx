// TeamScreen — UI migrado del mock; TeamHome consume data real.
// Flujo interno: 6 vistas controladas por `?view=...` en la URL. El default
// (sin query) deriva de la data: con team → "team", sin team → "empty".
// Antes esto vivía en useState+localStorage y causaba flash al hidratar +
// race conditions cuando el team se borraba desde otra device.
"use client";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { SelfChip } from "../widgets/SelfBadge";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  cancelInvite,
  createTeam,
  disbandTeam,
  inviteToTeam,
  joinTeamByCode,
  leaveTeam,
  requestJoinTeam,
  transferCaptain,
  updateTeam,
} from "@/server/actions/teams";

// Server actions pendientes: createTeam, joinTeamByCode, leaveTeam, inviteToTeam,
// updateTeam, transferCaptain, disbandTeam, cancelInvite. Mientras tanto, los submits
// devuelven un toast "Próximamente" para que la UI siga interactiva.
function useComingSoon() {
  const toast = useToast();
  return useCallback(
    (action: string) =>
      toast({ icon: "clock", title: "Próximamente", sub: action }),
    [toast],
  );
}

type View = "team" | "empty" | "create" | "join" | "settings" | "invite";

// Resuelve la view efectiva a partir del query param + estado real (team).
// Validaciones: vistas que requieren team caen a empty si no hay team.
function resolveView(urlView: string | null, hasTeam: boolean): View {
  if (urlView === "create" || urlView === "join") return urlView;
  if (urlView === "settings" || urlView === "invite" || urlView === "team") {
    return hasTeam ? (urlView as View) : "empty";
  }
  if (urlView === "empty") return "empty";
  // Default: deriva de la data.
  return hasTeam ? "team" : "empty";
}

export type TeamMemberLite = {
  userId: string;
  name: string;
  role: string;
  level: number;
  played: number;
  wr: number;
  online: boolean;
  // Customización del miembro (mig 113/114). Server resuelve ownership.
  accentHex?: string | null;
  cardStyleCss?: {
    background: string;
    border?: string;
    boxShadow?: string;
    backdropFilter?: string;
    color?: string;
  } | null;
};

export type TeamCapsLite = {
  rosterMax: number;
  pendingInvitesMax: number | null;
  renamesMax: number;
};

export type TeamLite = {
  id: string;
  name: string;
  tag: string;
  sport: string;
  description: string | null;
  inviteCode: string | null;
  captainId: string;
  captainName: string;
  founded: string;
  wins: number;
  losses: number;
  rank: number | null;
  league: string;
  // Team MPR computado (weighted avg de los current_rating del roster en el
  // sport del team + mode='doubles'). null = sin miembros con stats. Escala
  // interna 1500-base; el render divide por 1000 → "4.20".
  teamMpr: number | null;
  members: TeamMemberLite[];
  pendingInvites: PendingInviteLite[];
  // Caps + plan info: gating de UI (badges, banners, stats split).
  renameCount: number;
  captainPlanTier: "free" | "premium";
  caps: TeamCapsLite;
};

export type PendingInviteLite = {
  id: string;
  displayName: string;
  sentAt: string; // ISO
};

export type PublicTeamLite = {
  id: string;
  name: string;
  tag: string;
  sport: string | null;
  city: string | null;
  members: number;
  privacy: "public" | "invite" | "private";
};

export type FriendLite = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
};

export function TeamScreenView({
  team,
  publicTeams,
  friends,
  meUserId,
}: {
  team: TeamLite | null;
  publicTeams: PublicTeamLite[];
  friends: FriendLite[];
  meUserId: string | null;
}) {
  // Realtime: invites + membership + el team mismo.
  useRealtimeRefresh([
    { table: "team_invites" },
    { table: "team_members" },
    ...(team ? [{ table: "teams", filter: `id=eq.${team.id}` }] : []),
  ]);

  // Vista derivada de la URL. `?view=create|join|settings|invite|team|empty`.
  // Sin query → default según team. resolveView valida que la vista pedida
  // sea coherente con el estado real (no permite "settings" sin team).
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = resolveView(searchParams.get("view"), !!team);

  const setView = useCallback(
    (v: View) => {
      const params = new URLSearchParams(searchParams.toString());
      // "team" y "empty" son defaults derivables — limpiamos el query para
      // que las URLs queden limpias (`/team` en vez de `/team?view=team`).
      if (v === "team" || v === "empty") {
        params.delete("view");
      } else {
        params.set("view", v);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  if (view === "empty")
    return <TeamEmpty onCreate={() => setView("create")} onJoin={() => setView("join")} />;
  if (view === "create") return <TeamCreate onBack={() => setView("empty")} onSubmit={() => setView("team")} />;
  if (view === "join") return <TeamJoin onBack={() => setView("empty")} onJoined={() => setView("team")} publicTeams={publicTeams} />;
  if (view === "settings" && team)
    return <TeamSettings team={team} onBack={() => setView("team")} onLeave={() => setView("empty")} />;
  if (view === "invite" && team) return <TeamInvite team={team} friends={friends} onBack={() => setView("team")} />;
  if (team) return <TeamHome setView={setView} team={team} meUserId={meUserId} />;
  return <TeamEmpty onCreate={() => setView("create")} onJoin={() => setView("join")} />;
}

// ── Field helper (igual estética que SolicitarClubScreen pero con sus propios paddings) ─────
const inp: CSSProperties = {
  padding: "11px 14px",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontFamily: "inherit",
  fontSize: 13.5,
  outline: "none",
  background: "#fff",
  width: "100%",
};

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          fontSize: 10.5,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "#0a0a0a",
        }}
      >
        {label} {required && <span style={{ color: "#dc2626" }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{hint}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// EMPTY — sin team aún
// ══════════════════════════════════════════════════════════════════════
function TeamEmpty({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        alignItems: "center",
        textAlign: "center",
        maxWidth: 880,
        margin: "0 auto",
        paddingTop: 8,
      }}
    >
      <div className="label-mp">Mi Team · Empieza tu camino competitivo</div>
      <h1 className="font-heading display-md" style={{ margin: 0, maxWidth: 640 }}>
        Aún no tienes un equipo<span className="dot">.</span>
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 15,
          color: "var(--muted-fg)",
          maxWidth: 540,
          lineHeight: 1.5,
        }}
      >
        Crea un equipo nuevo y arma tu roster, o únete a uno existente con un código de invitación o
        aplicando a un team público.
      </p>

      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        style={{
          width: "100%",
          marginTop: 8,
        }}
      >
        {/* Create */}
        <button
          onClick={onCreate}
          className="card"
          style={{
            padding: 28,
            textAlign: "left",
            cursor: "pointer",
            border: "1px solid var(--border)",
            background: "linear-gradient(135deg, #064e3b 0%, #047857 60%, #10b981 100%)",
            color: "#fff",
            position: "relative",
            overflow: "hidden",
            minHeight: 240,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            fontFamily: "inherit",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -10,
              right: -20,
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 160,
              color: "rgba(255,255,255,0.08)",
              letterSpacing: "-0.06em",
              lineHeight: 0.8,
              textTransform: "uppercase",
              transform: "rotate(-6deg)",
              pointerEvents: "none",
            }}
          >
            NEW
          </div>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "rgba(255,255,255,0.18)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              zIndex: 2,
            }}
          >
            <Icon name="plus" size={24} color="#fff" />
          </div>
          <div style={{ position: "relative", zIndex: 2 }}>
            <div
              className="font-heading"
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              Crear team<span style={{ color: "#fbbf24" }}>.</span>
            </div>
            <p
              style={{
                marginTop: 8,
                fontSize: 12.5,
                color: "rgba(255,255,255,0.85)",
                lineHeight: 1.5,
              }}
            >
              Define nombre, tag, deporte y privacidad. Tú serás capitán/a y podrás invitar hasta 12
              miembros.
            </p>
            <div
              style={{
                marginTop: 14,
                fontSize: 11,
                fontWeight: 800,
                color: "#fbbf24",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Crear ahora <Icon name="arrow-right" size={12} color="#fbbf24" />
            </div>
          </div>
        </button>

        {/* Join */}
        <button
          onClick={onJoin}
          className="card"
          style={{
            padding: 28,
            textAlign: "left",
            cursor: "pointer",
            border: "1px solid var(--border)",
            background: "#fff",
            position: "relative",
            overflow: "hidden",
            minHeight: 240,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            fontFamily: "inherit",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -10,
              right: -20,
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 160,
              color: "rgba(0,0,0,0.04)",
              letterSpacing: "-0.06em",
              lineHeight: 0.8,
              textTransform: "uppercase",
              transform: "rotate(-6deg)",
              pointerEvents: "none",
            }}
          >
            JOIN
          </div>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "var(--muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              zIndex: 2,
            }}
          >
            <Icon name="users" size={24} />
          </div>
          <div style={{ position: "relative", zIndex: 2 }}>
            <div
              className="font-heading"
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              Unirse a un team<span className="dot">.</span>
            </div>
            <p
              style={{
                marginTop: 8,
                fontSize: 12.5,
                color: "var(--muted-fg)",
                lineHeight: 1.5,
              }}
            >
              Ingresa un código de invitación o explora teams públicos cerca de ti que estén buscando
              jugadores.
            </p>
            <div
              style={{
                marginTop: 14,
                fontSize: 11,
                fontWeight: 800,
                color: "var(--primary)",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Buscar teams <Icon name="arrow-right" size={12} color="var(--primary)" />
            </div>
          </div>
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 24,
          fontSize: 11.5,
          color: "var(--muted-fg)",
          flexWrap: "wrap",
          justifyContent: "center",
          marginTop: 12,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="trophy" size={12} /> Compite en ligas inter-clubes
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="bar-chart-3" size={12} /> Stats grupales y ranking
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="message-square" size={12} /> Chat de equipo
        </span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CREATE — form crear equipo + preview en vivo
// ══════════════════════════════════════════════════════════════════════
// Paleta del team. Cubrimos verdes (emerald, lime), azules (sky, blue,
// indigo, cyan), morados/rosas (purple, fuchsia, pink), rojos/naranjas
// (red, orange, amber, yellow), grises (slate, zinc) y negro. 20 opciones.
const COLORS = [
  "#10b981", // emerald
  "#22c55e", // green
  "#84cc16", // lime
  "#fbbf24", // amber
  "#f59e0b", // amber-500
  "#f97316", // orange
  "#dc2626", // red
  "#e11d48", // rose
  "#ec4899", // pink
  "#d946ef", // fuchsia
  "#a855f7", // purple
  "#7c3aed", // violet
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#0ea5e9", // sky
  "#06b6d4", // cyan
  "#14b8a6", // teal
  "#64748b", // slate
  "#71717a", // zinc
  "#0a0a0a", // black
];

// Colores claros donde el texto blanco no contrasta — usar texto negro.
const LIGHT_TEXT_COLORS = new Set(["#fbbf24", "#10b981", "#0ea5e9", "#22c55e", "#84cc16", "#f59e0b", "#06b6d4", "#14b8a6"]);

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// El UI dice "tenis" pero el enum DB es "tennis". Map para no romper.
// "multi" no existe en DB → sport queda undefined (multi-deporte permitido).
function mapSportToDb(s: string): "tennis" | "padel" | "pickleball" | undefined {
  if (s === "padel") return "padel";
  if (s === "pickleball") return "pickleball";
  if (s === "tenis" || s === "tennis") return "tennis";
  return undefined;
}

function TeamCreate({ onBack, onSubmit }: { onBack: () => void; onSubmit: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [color, setColor] = useState("#10b981");
  const [sport, setSport] = useState("padel");
  const [privacy, setPrivacy] = useState("public");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast({ icon: "x", title: "Nombre demasiado corto", sub: "Mínimo 2 caracteres" });
      return;
    }
    if (tag.trim().length < 2) {
      toast({ icon: "x", title: "Tag requerido", sub: "2 o 3 letras" });
      return;
    }
    const baseSlug = slugify(`${trimmed}-${tag}`);
    if (baseSlug.length < 3) {
      toast({ icon: "x", title: "Nombre inválido", sub: "Debe contener letras o números" });
      return;
    }
    setBusy(true);
    try {
      const res = await createTeam({
        name: trimmed,
        slug: baseSlug,
        description: description.trim() || undefined,
        sport: mapSportToDb(sport),
      });
      if (res.ok) {
        toast({ icon: "check", title: "Team creado", sub: res.data.name });
        // Navegar PRIMERO a /team (limpio), luego refrescar — así el refresh
        // aplica a la URL destino y loadTeam encuentra la membresía recién
        // creada. Al revés, el refresh corría sobre ?view=create y la nueva
        // URL quedaba con team=null → resolveView caía a "empty".
        onSubmit();
        router.refresh();
      } else {
        const msg =
          res.error.code === "TEAMS.SLUG_TAKEN"
            ? "Ese nombre ya está tomado. Prueba variando el tag."
            : res.error.code === "TEAMS.ALREADY_CAPTAIN"
              ? "Ya eres capitán de otro team. Sal de ese primero."
              : res.error.message;
        toast({ icon: "alert-triangle", title: "No se pudo crear", sub: msg });
      }
    } finally {
      setBusy(false);
    }
  };

  const sportLabel =
    sport === "padel" ? "Pádel" : sport === "tenis" ? "Tenis" : sport === "pickleball" ? "Pickleball" : "Multi-deporte";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        maxWidth: 1080,
        width: "100%",
        margin: "0 auto",
      }}
    >
      <BackBtn onBack={onBack} label="Volver" />
      <div className="label-mp">Mi Team · Crear nuevo equipo</div>
      <h1 className="font-heading display-md" style={{ margin: 0 }}>
        Arma tu equipo <span className="dot">●</span>
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Nombre del equipo" required hint="Hasta 32 caracteres">
            <input
              style={inp}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12 }}>
            <Field label="Tag (3 letras)" required hint="Aparece en partidos y rankings">
              <input
                style={{
                  ...inp,
                  textTransform: "uppercase",
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                }}
                value={tag}
                onChange={(e) => setTag(e.target.value.slice(0, 3).toUpperCase())}
                maxLength={3}
              />
            </Field>
            <Field label="Deporte principal" required>
              <select style={inp} value={sport} onChange={(e) => setSport(e.target.value)}>
                <option value="padel">Pádel</option>
                <option value="tenis">Tenis</option>
                <option value="pickleball">Pickleball</option>
                <option value="multi">Multi-deporte</option>
              </select>
            </Field>
          </div>
          <Field label="Color del equipo" hint="Define el accent del logo y banner">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: c,
                    border: color === c ? "3px solid #0a0a0a" : "2px solid var(--border)",
                    cursor: "pointer",
                    boxShadow: color === c ? "0 0 0 3px #fff inset" : "none",
                  }}
                />
              ))}
            </div>
          </Field>
          <Field label="Descripción" hint="Cuenta a los jugadores qué tipo de equipo son">
            <textarea
              style={{ ...inp, minHeight: 80, resize: "vertical" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder="Equipo competitivo de pádel sub-4.0 que entrena 2 veces por semana en Vitacura…"
            />
          </Field>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Preview */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                padding: 22,
                background: `linear-gradient(135deg, #0a0a0a 0%, #1f2937 60%, ${color} 100%)`,
                color: "#fff",
                minHeight: 180,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  fontFamily: "Plus Jakarta Sans",
                  fontWeight: 900,
                  fontSize: 200,
                  color: "rgba(255,255,255,0.06)",
                  letterSpacing: "-0.06em",
                  lineHeight: 0.8,
                  transform: "rotate(-8deg) translate(15%, -15%)",
                }}
              >
                {tag || "???"}
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 16 }}>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 14,
                    background: color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: ["#fbbf24", "#10b981", "#0ea5e9"].includes(color) ? "#0a0a0a" : "#fff",
                    boxShadow: "0 12px 24px rgba(0,0,0,0.3)",
                  }}
                >
                  <span className="font-heading" style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em" }}>
                    {tag || "???"}
                  </span>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 900,
                      color: "rgba(255,255,255,0.6)",
                      textTransform: "uppercase",
                      letterSpacing: "0.18em",
                    }}
                  >
                    Vista previa
                  </div>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 26,
                      fontWeight: 900,
                      letterSpacing: "-0.025em",
                      textTransform: "uppercase",
                      lineHeight: 1,
                    }}
                  >
                    {name || "Nombre"}
                    <span style={{ color }}>.</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", marginTop: 6 }}>
                    {sportLabel} · 1 miembro
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Privacy */}
          <div className="card" style={{ padding: 22 }}>
            <div className="label-mp" style={{ marginBottom: 10 }}>
              Privacidad
            </div>
            {[
              { k: "public", icon: "globe", t: "Público", d: "Cualquiera puede ver el team y solicitar unirse." },
              { k: "invite", icon: "mail", t: "Solo invitación", d: "Visible pero requiere código o aprobación del capitán." },
              { k: "private", icon: "lock", t: "Privado", d: "Oculto para el público. Solo accesible con código directo." },
            ].map((o) => {
              const on = privacy === o.k;
              return (
                <label
                  key={o.k}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: 12,
                    marginBottom: 6,
                    borderRadius: 10,
                    border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                    cursor: "pointer",
                    background: on ? "#ecfdf5" : "#fff",
                  }}
                >
                  <input
                    type="radio"
                    checked={on}
                    onChange={() => setPrivacy(o.k)}
                    style={{ marginTop: 3, accentColor: "#10b981" }}
                  />
                  <div>
                    <div
                      style={{
                        display: "inline-flex",
                        gap: 6,
                        alignItems: "center",
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      <Icon name={o.icon} size={13} /> {o.t}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>{o.d}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
        <button
          onClick={onBack}
          className="btn"
          style={{ background: "#fff", border: "1px solid var(--border)" }}
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={busy}
          className="btn btn-primary"
          style={{ opacity: busy ? 0.6 : 1 }}
        >
          <Icon name="check" size={13} color="#fff" />
          {busy ? "Creando…" : "Crear team"}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// JOIN — código + lista de teams públicos (data real desde TeamScreen)
// ══════════════════════════════════════════════════════════════════════
function TeamJoin({
  onBack,
  onJoined,
  publicTeams,
}: {
  onBack: () => void;
  onJoined: () => void;
  publicTeams: PublicTeamLite[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());

  const handleRequestJoin = async (teamId: string, name: string) => {
    if (requesting) return;
    setRequesting(teamId);
    try {
      const res = await requestJoinTeam({ teamId });
      if (res.ok) {
        toast({ icon: "check", title: "Solicitud enviada", sub: name });
        setRequested((s) => new Set(s).add(teamId));
      } else {
        const msg =
          res.error.code === "TEAMS.REQUEST_PENDING"
            ? "Ya enviaste una solicitud a este team"
            : res.error.code === "TEAMS.PRIVATE"
              ? "Este team no acepta solicitudes"
              : res.error.code === "TEAMS.ALREADY_MEMBER"
                ? "Ya formas parte de este team"
                : res.error.code === "TEAMS.ROSTER_LIMIT_REACHED"
                  ? "El roster de ese team está lleno."
                  : res.error.code === "TEAMS.ALREADY_CAPTAIN"
                    ? "Ya eres capitán de otro team."
                    : res.error.message;
        toast({ icon: "alert-triangle", title: "No se pudo enviar", sub: msg });
      }
    } finally {
      setRequesting(null);
    }
  };
  const handleJoinByCode = async () => {
    if (busy) return;
    if (code.trim().length < 4) {
      toast({ icon: "x", title: "Código inválido" });
      return;
    }
    setBusy(true);
    try {
      const res = await joinTeamByCode({ code });
      if (res.ok) {
        toast({ icon: "check", title: "¡Te uniste!", sub: res.data.name });
        onJoined();
        router.refresh();
      } else {
        const msg =
          res.error.code === "TEAMS.CODE_INVALID"
            ? "Ese código no existe"
            : res.error.code === "TEAMS.ALREADY_MEMBER"
              ? "Ya eres miembro de ese team"
              : res.error.code === "TEAMS.ROSTER_LIMIT_REACHED"
                ? "El roster de ese team está lleno."
                : res.error.code === "TEAMS.ALREADY_CAPTAIN"
                  ? "Ya eres capitán de otro team."
                  : res.error.message;
        toast({ icon: "alert-triangle", title: "No se pudo unir", sub: msg });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        maxWidth: 1080,
        width: "100%",
        margin: "0 auto",
      }}
    >
      <BackBtn onBack={onBack} label="Volver" />
      <div className="label-mp">Mi Team · Únete a un equipo</div>
      <h1 className="font-heading display-md" style={{ margin: 0 }}>
        Encuentra tu team <span className="dot">●</span>
      </h1>

      <div
        className="card"
        style={{
          padding: 22,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 12,
          alignItems: "flex-end",
        }}
      >
        <Field label="Código de invitación" hint="Te lo comparte el capitán de un equipo privado">
          <input
            style={{
              ...inp,
              fontFamily: "monospace",
              fontSize: 16,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
            placeholder="HDN-7M2K-X9P"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>
        <button
          onClick={handleJoinByCode}
          disabled={busy}
          className="btn btn-primary"
          style={{ height: 44, opacity: busy ? 0.6 : 1 }}
        >
          <Icon name="log-in" size={13} color="#fff" />
          {busy ? "Uniendo…" : "Unirse"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 6,
        }}
      >
        <h2
          className="font-heading"
          style={{
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Teams públicos<span className="dot">.</span>
        </h2>
        <div style={{ display: "flex", gap: 6 }}>
          {["Todos", "Pádel", "Tenis", "Pickleball"].map((f, i) => (
            <button
              key={f}
              style={{
                padding: "7px 14px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                cursor: "pointer",
                fontFamily: "inherit",
                background: i === 0 ? "#0a0a0a" : "#fff",
                color: i === 0 ? "#fff" : "#0a0a0a",
                border: "1px solid " + (i === 0 ? "#0a0a0a" : "var(--border)"),
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        {publicTeams.length === 0 ? (
          <div
            className="card"
            style={{
              padding: 32,
              textAlign: "center",
              color: "var(--muted-fg)",
              fontSize: 13,
              gridColumn: "1 / -1",
            }}
          >
            No hay teams públicos abiertos en este momento. Prueba con un código de invitación.
          </div>
        ) : (
          publicTeams.map((t) => {
            const isRequested = requested.has(t.id);
            const isLoading = requesting === t.id;
            return (
              <div key={t.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div
                  style={{
                    height: 88,
                    background: "linear-gradient(135deg,#0a0a0a,#374151)",
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
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
                  <span
                    className="font-heading"
                    style={{
                      fontSize: 38,
                      fontWeight: 900,
                      color: "rgba(255,255,255,0.95)",
                      letterSpacing: "-0.04em",
                    }}
                  >
                    {t.tag}
                  </span>
                  <div
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      padding: "3px 9px",
                      background: "rgba(255,255,255,0.25)",
                      backdropFilter: "blur(8px)",
                      borderRadius: 9999,
                      fontSize: 9,
                      fontWeight: 900,
                      color: "#fff",
                      textTransform: "uppercase",
                      letterSpacing: "0.14em",
                    }}
                  >
                    {t.privacy === "invite" ? "Por invitación" : "Reclutando"}
                  </div>
                </div>
                <div style={{ padding: 14 }}>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 14,
                      fontWeight: 900,
                      letterSpacing: "-0.01em",
                      lineHeight: 1.15,
                    }}
                  >
                    {t.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted-fg)",
                      marginTop: 4,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Icon name="map-pin" size={10} />
                    {[t.city, t.sport].filter(Boolean).join(" · ") || "Sin ubicación"}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: "1px dashed var(--border)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--muted-fg)",
                          textTransform: "uppercase",
                          letterSpacing: "0.14em",
                          fontWeight: 800,
                        }}
                      >
                        Miembros
                      </div>
                      <div className="font-heading" style={{ fontSize: 13, fontWeight: 900 }}>
                        {t.members}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRequestJoin(t.id, t.name)}
                    disabled={isRequested || isLoading}
                    className="btn btn-primary"
                    style={{
                      width: "100%",
                      marginTop: 10,
                      fontSize: 11,
                      opacity: isRequested ? 0.6 : 1,
                    }}
                  >
                    {isRequested ? (
                      <>
                        <Icon name="check" size={12} color="#fff" />
                        Solicitud enviada
                      </>
                    ) : (
                      <>
                        <Icon name="send" size={12} color="#fff" />
                        {isLoading ? "Enviando…" : "Solicitar unirse"}
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════════════
const TOGGLES = [
  { t: "Solo capitán/a puede invitar", d: "Si lo desactivas, los co-capitanes también podrán enviar invitaciones.", on: true },
  { t: "Aprobar nuevos miembros", d: "Las solicitudes de unirse requieren tu aprobación manual.", on: true },
  { t: "Mostrar ranking del team", d: "Tu equipo aparecerá en el ranking inter-clubes público.", on: true },
  { t: "Permitir invitados externos al chat", d: "Otros equipos rivales pueden escribir en el chat de partido.", on: false },
];

function TeamSettings({ team, onBack, onLeave }: { team: TeamLite; onBack: () => void; onLeave: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"leave" | "disband" | "save" | "transfer" | null>(null);
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");
  const [transferPickerOpen, setTransferPickerOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string>("");

  const transferableMembers = team.members.filter((m) => m.userId !== team.captainId);

  const dirty = name !== team.name || description !== (team.description ?? "");

  const handleTransfer = async () => {
    if (busy || !transferTarget) return;
    const target = team.members.find((m) => m.userId === transferTarget);
    if (!target) return;
    if (!window.confirm(`Transferir capitanía a ${target.name}? Tú pasarás a ser jugador.`)) return;
    setBusy("transfer");
    try {
      const res = await transferCaptain({ teamId: team.id, newCaptainUserId: transferTarget });
      if (res.ok) {
        toast({ icon: "crown", title: "Capitanía transferida", sub: target.name });
        setTransferPickerOpen(false);
        onBack();
      } else {
        toast({ icon: "x", title: "No se pudo transferir", sub: res.error.message });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    if (busy || !dirty) return;
    if (name.trim().length < 2) {
      toast({ icon: "x", title: "Nombre demasiado corto" });
      return;
    }
    setBusy("save");
    try {
      const patch: { name?: string; description?: string | null } = {};
      if (name !== team.name) patch.name = name.trim();
      if (description !== (team.description ?? "")) {
        patch.description = description.trim() === "" ? null : description.trim();
      }
      const res = await updateTeam({ teamId: team.id, patch });
      if (res.ok) {
        toast({ icon: "check", title: "Cambios guardados" });
        onBack();
      } else {
        const msg =
          res.error.code === "TEAMS.RENAME_LIMIT_REACHED"
            ? "Alcanzaste el máximo de cambios de nombre. Activa MatchPoint+ para más."
            : res.error.message;
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: msg });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleLeave = async () => {
    if (busy) return;
    if (!window.confirm(`Salir de "${team.name}"? Perderás acceso al chat y stats grupales.`)) return;
    setBusy("leave");
    try {
      const res = await leaveTeam({ teamId: team.id });
      if (res.ok) {
        toast({ icon: "check", title: "Saliste del team", sub: team.name });
        onLeave();
      } else {
        toast({ icon: "x", title: "No se pudo salir", sub: res.error.message });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleDisband = async () => {
    if (busy) return;
    const typed = window.prompt(`Esta acción es irreversible. Escribe "${team.tag}" para confirmar:`);
    if (typed !== team.tag) {
      if (typed !== null) toast({ icon: "x", title: "Confirmación incorrecta" });
      return;
    }
    setBusy("disband");
    try {
      const res = await disbandTeam({ teamId: team.id });
      if (res.ok) {
        toast({ icon: "trash-2", title: "Team disuelto", sub: team.name });
        onLeave();
      } else {
        toast({ icon: "x", title: "No se pudo disolver", sub: res.error.message });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        maxWidth: 920,
        width: "100%",
        margin: "0 auto",
      }}
    >
      <BackBtn onBack={onBack} label="Volver al team" />
      <div className="label-mp">Mi Team · Halcones del Norte</div>
      <h1 className="font-heading display-md" style={{ margin: 0 }}>
        Ajustes <span className="dot">●</span>
      </h1>

      <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <h2
          className="font-heading"
          style={{
            fontSize: 16,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          Información general
        </h2>
        {(() => {
          const renamesMax = team.caps.renamesMax;
          const renameCount = team.renameCount;
          const renameExhausted = renameCount >= renamesMax;
          const renameHint = renameExhausted
            ? "Alcanzaste el máximo. Activa MatchPoint+ para más cambios."
            : `${renameCount}/${renamesMax} cambios usados`;
          return (
            <Field label="Nombre" required hint={renameHint}>
              <input
                style={{ ...inp, opacity: renameExhausted ? 0.6 : 1 }}
                value={renameExhausted ? team.name : name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                disabled={renameExhausted}
              />
            </Field>
          );
        })()}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 12 }}>
          <Field label="Tag" hint="Derivado del slug, no editable">
            <input
              style={{ ...inp, textTransform: "uppercase", fontWeight: 900, opacity: 0.6 }}
              value={team.tag}
              disabled
            />
          </Field>
          <Field label="Liga actual" hint="Pronto: asignación de ligas">
            <select style={{ ...inp, opacity: 0.6 }} disabled>
              <option>{team.league}</option>
            </select>
          </Field>
        </div>
        <Field label="Descripción">
          <textarea
            style={{ ...inp, minHeight: 70 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            placeholder="Cuenta de qué va el team…"
          />
        </Field>
      </div>

      <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        <h2
          className="font-heading"
          style={{
            fontSize: 16,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          Roles y permisos
        </h2>
        {TOGGLES.map((o, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
              borderTop: i ? "1px solid var(--border)" : "none",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{o.t}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>{o.d}</div>
            </div>
            <button
              style={{
                width: 42,
                height: 24,
                borderRadius: 9999,
                background: o.on ? "var(--primary)" : "#d4d4d8",
                border: 0,
                position: "relative",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: o.on ? 20 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.15s",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                }}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 24, borderColor: "#fecaca" }}>
        <h2
          className="font-heading"
          style={{
            fontSize: 16,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            margin: 0,
            color: "#b91c1c",
          }}
        >
          Zona de peligro<span className="dot">.</span>
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {[
            {
              t: "Transferir capitanía",
              d: transferableMembers.length === 0
                ? "Necesitas al menos un miembro más en el team."
                : "Otorga el rol de capitán a otro miembro del team.",
              btn: "Transferir",
              onClick: () => {
                if (transferableMembers.length === 0) {
                  toast({ icon: "x", title: "Sin miembros disponibles" });
                  return;
                }
                setTransferPickerOpen((s) => !s);
              },
            },
            { t: "Salir del team", d: "Perderás acceso al chat, partidos y stats grupales.", btn: busy === "leave" ? "Saliendo…" : "Salir", onClick: handleLeave },
          ].map((row) => (
            <div
              key={row.t}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 14,
                background: "#fef2f2",
                borderRadius: 10,
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{row.t}</div>
                <div style={{ fontSize: 11.5, color: "#7f1d1d", marginTop: 2 }}>{row.d}</div>
              </div>
              <button
                onClick={row.onClick}
                className="btn"
                style={{
                  background: "#fff",
                  border: "1.5px solid #fca5a5",
                  color: "#b91c1c",
                }}
              >
                {row.btn}
              </button>
            </div>
          ))}
          {transferPickerOpen && transferableMembers.length > 0 && (
            <div
              style={{
                padding: 14,
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: "#9a3412" }}>
                Elegí el nuevo capitán
              </div>
              <select
                value={transferTarget}
                onChange={(e) => setTransferTarget(e.target.value)}
                style={inp}
              >
                <option value="">— Seleccionar miembro —</option>
                {transferableMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} · {m.role}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => {
                    setTransferPickerOpen(false);
                    setTransferTarget("");
                  }}
                  className="btn"
                  style={{ background: "#fff", border: "1px solid var(--border)" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleTransfer}
                  disabled={!transferTarget || busy !== null}
                  className="btn btn-primary"
                  style={{ opacity: !transferTarget || busy ? 0.6 : 1 }}
                >
                  <Icon name="crown" size={13} color="#fff" />
                  {busy === "transfer" ? "Transfiriendo…" : "Confirmar transferencia"}
                </button>
              </div>
            </div>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 14,
              background: "#fef2f2",
              borderRadius: 10,
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 13 }}>Disolver el team</div>
              <div style={{ fontSize: 11.5, color: "#7f1d1d", marginTop: 2 }}>
                Acción irreversible. Se eliminará el historial completo.
              </div>
            </div>
            <button
              onClick={handleDisband}
              disabled={busy !== null}
              className="btn"
              style={{ background: "#dc2626", color: "#fff", opacity: busy ? 0.6 : 1 }}
            >
              <Icon name="trash-2" size={12} color="#fff" />
              {busy === "disband" ? "Disolviendo…" : "Disolver"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onBack}
          className="btn"
          style={{ background: "#fff", border: "1px solid var(--border)" }}
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={!dirty || busy !== null}
          className="btn btn-primary"
          style={{ opacity: !dirty || busy ? 0.6 : 1 }}
        >
          <Icon name="check" size={13} color="#fff" />
          {busy === "save" ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// INVITE — código, link, amigos
// ══════════════════════════════════════════════════════════════════════
// Paleta para avatares con fallback de iniciales (cuando friend no tiene avatarUrl).
const INVITE_AVATARS = [
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
  "linear-gradient(135deg,#10b981,#047857)",
];
function relSent(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) {
    const hr = Math.floor(diff / 3600000);
    return hr <= 0 ? "ahora" : `Hace ${hr}h`;
  }
  return `Hace ${days}d`;
}

function TeamInvite({
  team,
  friends,
  onBack,
}: {
  team: TeamLite;
  friends: FriendLite[];
  onBack: () => void;
}) {
  const comingSoon = useComingSoon();
  const toast = useToast();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [qrOpen, setQrOpen] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [friendQuery, setFriendQuery] = useState("");

  // Excluir friends que ya son miembros o tienen invite pending.
  const memberIds = new Set(team.members.map((m) => m.userId));
  const pendingUserIds = new Set<string>(); // sólo tenemos displayName de pending, no userId
  // (Si quisiéramos filtrar por pending, habría que extender PendingInviteLite con userId.)
  const availableFriends = friends.filter((f) => !memberIds.has(f.userId));
  // Caps gating (Stage 2): bloquear submits cuando roster lleno o invites al máximo.
  const rosterMax = team.caps.rosterMax;
  const pendingMax = team.caps.pendingInvitesMax; // null = ∞
  const rosterFull = team.members.length >= rosterMax;
  const pendingFull = pendingMax !== null && team.pendingInvites.length >= pendingMax;
  const inviteBlocked = rosterFull || pendingFull;
  const blockedReason = rosterFull ? "Roster lleno" : pendingFull ? "Invitaciones al máximo" : null;
  const filtered = friendQuery
    ? availableFriends.filter((f) =>
        f.displayName.toLowerCase().includes(friendQuery.toLowerCase()),
      )
    : availableFriends;

  const handleInviteFriend = async (friend: FriendLite) => {
    if (inviting) return;
    setInviting(friend.userId);
    try {
      const res = await inviteToTeam({
        teamId: team.id,
        body: { userId: friend.userId },
      });
      if (res.ok) {
        toast({ icon: "send", title: "Invitación enviada", sub: friend.displayName });
        setSent((s) => new Set(s).add(friend.userId));
      } else {
        const msg =
          res.error.code === "TEAMS.ALREADY_INVITED"
            ? "Ya tiene una invitación pendiente"
            : res.error.code === "TEAMS.ROSTER_LIMIT_REACHED"
            ? "El roster está lleno. Activa MatchPoint+ para más cupos."
            : res.error.code === "TEAMS.INVITES_LIMIT_REACHED"
            ? "Llegaste al máximo de invitaciones pendientes."
            : res.error.code === "TEAMS.ALREADY_CAPTAIN"
            ? "Esta persona ya es capitana de otro team."
            : res.error.message;
        toast({ icon: "alert-triangle", title: "No se pudo invitar", sub: msg });
      }
    } finally {
      setInviting(null);
    }
  };
  // Silenciar unused warning: pendingUserIds reservado para futura mejora.
  void pendingUserIds;
  const code = team.inviteCode ?? "—";
  const link = team.inviteCode
    ? `matchpoint.app/team/join/${team.inviteCode}`
    : `matchpoint.app/team/${team.tag.toLowerCase()}`;
  const fullLink = `https://${link}`;
  const inviteMessage = `Te invito a unirte a "${team.name}" en MatchPoint. Código: ${code} · ${fullLink}`;
  const visiblePending = team.pendingInvites.filter((p) => !hidden.has(p.id));

  const handleShare = (channel: "email" | "whatsapp" | "qr") => {
    if (channel === "qr") {
      setQrOpen(true);
      return;
    }
    if (channel === "email") {
      const url = `mailto:?subject=${encodeURIComponent(
        `Únete a ${team.name} en MatchPoint`,
      )}&body=${encodeURIComponent(inviteMessage)}`;
      window.open(url, "_blank");
      return;
    }
    if (channel === "whatsapp") {
      const url = `https://wa.me/?text=${encodeURIComponent(inviteMessage)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
  };

  const handleCancelPending = async (inviteId: string, displayName: string) => {
    if (cancelling) return;
    if (!window.confirm(`Cancelar invitación a ${displayName}?`)) return;
    setCancelling(inviteId);
    try {
      const res = await cancelInvite({ inviteId });
      if (res.ok) {
        toast({ icon: "check", title: "Invitación cancelada", sub: displayName });
        setHidden((s) => new Set(s).add(inviteId));
      } else {
        toast({ icon: "x", title: "No se pudo cancelar", sub: res.error.message });
      }
    } finally {
      setCancelling(null);
    }
  };
  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ icon: "check", title: "Copiado", sub: label });
    } catch {
      comingSoon("Clipboard no disponible");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        maxWidth: 1080,
        width: "100%",
        margin: "0 auto",
      }}
    >
      <BackBtn onBack={onBack} label="Volver al team" />
      <div className="label-mp">Halcones del Norte · Invitar miembros</div>
      <h1 className="font-heading display-md" style={{ margin: 0 }}>
        Invitar al team <span className="dot">●</span>
      </h1>

      <div
        className="card"
        style={{
          padding: 0,
          overflow: "hidden",
          position: "relative",
          background: "linear-gradient(120deg, #064e3b 0%, #047857 60%, #10b981 100%)",
          color: "#fff",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 220,
            color: "rgba(255,255,255,0.06)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            textTransform: "uppercase",
            transform: "rotate(-8deg) translate(15%, -20%)",
            pointerEvents: "none",
          }}
        >
          HDN
        </div>
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5"
          style={{
            padding: 28,
            position: "relative",
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.65)", marginBottom: 10 }}>
              Código de invitación
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div
                style={{
                  flex: 1,
                  padding: "14px 18px",
                  background: "rgba(0,0,0,0.4)",
                  backdropFilter: "blur(8px)",
                  borderRadius: 12,
                  fontFamily: "monospace",
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: "0.18em",
                  color: "#fbbf24",
                }}
              >
                {code}
              </div>
              <button
                onClick={() => handleCopy(code, "Código de invitación")}
                className="btn"
                style={{ background: "#fff", color: "#0a0a0a", height: 50 }}
              >
                <Icon name="copy" size={13} />
                Copiar
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
              Caduca en 7 días · 8 usos restantes
            </div>
          </div>
          <div>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.65)", marginBottom: 10 }}>
              Link directo
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div
                style={{
                  flex: 1,
                  padding: "14px 18px",
                  background: "rgba(0,0,0,0.4)",
                  backdropFilter: "blur(8px)",
                  borderRadius: 12,
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: "#fff",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {link}
              </div>
              <button
                onClick={() => handleCopy(link, "Link de invitación")}
                className="btn"
                style={{
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.2)",
                  height: 50,
                }}
              >
                <Icon name="share-2" size={13} color="#fff" />
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {[
                { i: "mail", l: "Email", c: "email" as const },
                { i: "message-circle", l: "WhatsApp", c: "whatsapp" as const },
                { i: "qr-code", l: "QR", c: "qr" as const },
              ].map((s) => (
                <button
                  key={s.l}
                  onClick={() => handleShare(s.c)}
                  className="btn"
                  style={{
                    background: "rgba(255,255,255,0.15)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.2)",
                    fontSize: 10.5,
                    padding: "7px 12px",
                  }}
                >
                  <Icon name={s.i} size={12} color="#fff" />
                  {s.l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-4">
        <div className="card" style={{ padding: 22 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: 14,
            }}
          >
            <h2
              className="font-heading"
              style={{
                fontSize: 18,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              Invitar amigos<span className="dot">.</span>
            </h2>
            <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
              {availableFriends.length} amigos disponibles
            </span>
          </div>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                top: 13,
                color: "var(--muted-fg)",
              }}
            >
              <Icon name="search" size={13} />
            </span>
            <input
              placeholder="Buscar amigo por nombre…"
              value={friendQuery}
              onChange={(e) => setFriendQuery(e.target.value)}
              style={{ ...inp, padding: "9px 12px 9px 32px" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.length === 0 && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted-fg)",
                  padding: 14,
                  textAlign: "center",
                }}
              >
                {availableFriends.length === 0
                  ? "Todavía no tenés amigos para invitar."
                  : "No hay amigos que coincidan con la búsqueda."}
              </div>
            )}
            {filtered.map((f, i) => (
              <div
                key={f.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: INVITE_AVATARS[i % INVITE_AVATARS.length],
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  {f.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.avatarUrl}
                      alt={f.displayName}
                      width={36}
                      height={36}
                      style={{ objectFit: "cover" }}
                    />
                  ) : (
                    <span className="font-heading" style={{ fontSize: 11, fontWeight: 900 }}>
                      {f.displayName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{f.displayName}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                    {f.city ?? "Sin ciudad"}
                  </div>
                </div>
                {sent.has(f.userId) ? (
                  <span
                    style={{
                      display: "inline-flex",
                      gap: 5,
                      alignItems: "center",
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: "var(--primary)",
                    }}
                  >
                    <Icon name="check" size={12} color="var(--primary)" />
                    Invitado
                  </span>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
                    <button
                      onClick={() => handleInviteFriend(f)}
                      disabled={inviting === f.userId || inviteBlocked}
                      title={blockedReason ?? undefined}
                      className="btn btn-primary"
                      style={{
                        padding: "7px 14px",
                        fontSize: 10.5,
                        opacity: inviting === f.userId || inviteBlocked ? 0.5 : 1,
                        cursor: inviteBlocked ? "not-allowed" : undefined,
                      }}
                    >
                      <Icon name="send" size={11} color="#fff" />
                      {inviting === f.userId ? "Enviando…" : "Invitar"}
                    </button>
                    {inviteBlocked && (
                      <span style={{ fontSize: 9.5, color: "#b91c1c", fontWeight: 700 }}>
                        {blockedReason}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
                gap: 8,
              }}
            >
              <div className="label-mp">Invitaciones pendientes</div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 900,
                  padding: "3px 9px",
                  borderRadius: 9999,
                  background: pendingFull ? "#fef2f2" : "var(--muted)",
                  color: pendingFull ? "#b91c1c" : "var(--muted-fg)",
                  border: `1px solid ${pendingFull ? "#fecaca" : "var(--border)"}`,
                  letterSpacing: "0.06em",
                }}
              >
                {team.pendingInvites.length}/{pendingMax ?? "∞"}
              </span>
            </div>
            {visiblePending.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)", padding: "4px 0" }}>
                Sin invitaciones pendientes.
              </div>
            ) : (
              visiblePending.map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderTop: i ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{p.displayName}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                      Enviada {relSent(p.sentAt)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCancelPending(p.id, p.displayName)}
                    disabled={cancelling === p.id}
                    style={{
                      fontSize: 10.5,
                      color: "#b91c1c",
                      background: "transparent",
                      border: 0,
                      cursor: cancelling === p.id ? "default" : "pointer",
                      fontWeight: 700,
                      fontFamily: "inherit",
                      opacity: cancelling === p.id ? 0.5 : 1,
                    }}
                  >
                    {cancelling === p.id ? "Cancelando…" : "Cancelar"}
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="card" style={{ padding: 20, background: "#fef3c7", borderColor: "#fbbf24" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Icon name="zap" size={14} color="#92400e" />
              <div className="label-mp" style={{ color: "#92400e" }}>
                Capacidad del team
              </div>
            </div>
            <div className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em" }}>
              {team.members.length} / {rosterMax} miembros
            </div>
            <div
              style={{
                height: 6,
                background: "rgba(0,0,0,0.1)",
                borderRadius: 9999,
                overflow: "hidden",
                marginTop: 8,
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.round((team.members.length / Math.max(1, rosterMax)) * 100))}%`,
                  height: "100%",
                  background: "#92400e",
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: "#78350f", marginTop: 8 }}>
              {rosterFull
                ? "Roster lleno. No puedes sumar más miembros."
                : team.captainPlanTier === "free"
                ? `Te quedan ${rosterMax - team.members.length} cupos. Activa MatchPoint+ para 24 miembros.`
                : `Te quedan ${rosterMax - team.members.length} cupos.`}
            </div>
            {team.captainPlanTier === "free" && (
              <a
                href="/dashboard/user/mi-plan"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 10,
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#92400e",
                  textDecoration: "none",
                }}
              >
                Activa MatchPoint+ →
              </a>
            )}
          </div>
        </div>
      </div>

      {qrOpen && <QrOverlay link={fullLink} code={code} teamName={team.name} onClose={() => setQrOpen(false)} />}
    </div>
  );
}

// QR via api.qrserver.com (servicio público gratuito). Si en el futuro queremos
// generación local sin red, swappear por una lib tipo qrcode.
function QrOverlay({
  link,
  code,
  teamName,
  onClose,
}: {
  link: string;
  code: string;
  teamName: string;
  onClose: () => void;
}) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(link)}`;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 28,
          maxWidth: 360,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div className="label-mp" style={{ marginBottom: 6 }}>
          Escanea para unirte
        </div>
        <h3
          className="font-heading"
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
          }}
        >
          {teamName}
        </h3>
        <div
          style={{
            margin: "16px auto",
            width: 260,
            height: 260,
            background: "var(--muted)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt={`QR para unirse a ${teamName}`} width={260} height={260} />
        </div>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.14em",
            color: "#0a0a0a",
            marginBottom: 12,
          }}
        >
          {code}
        </div>
        <button
          onClick={onClose}
          className="btn"
          style={{ background: "#0a0a0a", color: "#fff", width: "100%" }}
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// HOME — vista principal del team activo
// ══════════════════════════════════════════════════════════════════════
const ROSTER_AVATARS = [
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
];

const UPCOMING = [
  { vs: "Águilas Pádel Club", date: "Sáb 18 Ene · 10:00", club: "Club Norte", round: "Cuartos · Liga" },
  { vs: "Smash Brothers", date: "Sáb 25 Ene · 16:00", club: "Padel LC", round: "Semifinal · Copa Verano" },
];

function TeamHome({ setView, team: TEAM, meUserId }: { setView: (v: View) => void; team: TeamLite; meUserId: string | null }) {
  const ROSTER = TEAM.members;
  const winRate =
    TEAM.wins + TEAM.losses > 0
      ? Math.round((TEAM.wins / (TEAM.wins + TEAM.losses)) * 100)
      : 0;
  // Roster cap gating (Stage 2): badge de capacidad + mini-CTA para free.
  const rosterMax = TEAM.caps.rosterMax;
  const rosterCount = ROSTER.length;
  const rosterRatio = rosterMax > 0 ? rosterCount / rosterMax : 0;
  const rosterFull = rosterCount >= rosterMax;
  const rosterColor = rosterFull ? "#dc2626" : rosterRatio >= 0.8 ? "#ea580c" : "#10b981";
  const rosterBg = rosterFull ? "#fef2f2" : rosterRatio >= 0.8 ? "#fff7ed" : "#ecfdf5";
  const rosterBorder = rosterFull ? "#fecaca" : rosterRatio >= 0.8 ? "#fed7aa" : "#a7f3d0";
  const isFreeCaptain = TEAM.captainPlanTier === "free";
  const showUpsellMini = isFreeCaptain && rosterCount >= Math.max(0, rosterMax - 2);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="label-mp">Mi Team · Equipo competitivo</div>

      {/* Hero */}
      <div
        className="card"
        style={{
          padding: 0,
          overflow: "hidden",
          position: "relative",
          background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 100%)",
          color: "#fff",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 280,
            color: "rgba(255,255,255,0.05)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            textTransform: "uppercase",
            transform: "rotate(-8deg) translate(15%, -15%)",
            pointerEvents: "none",
          }}
        >
          {TEAM.tag}
        </div>
        <div
          className="grid grid-cols-[80px_1fr] md:grid-cols-[120px_1fr_auto] gap-4 md:gap-7 items-center"
          style={{
            padding: 32,
            position: "relative",
          }}
        >
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 16,
              background: "#fbbf24",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0a0a0a",
              boxShadow: "0 12px 24px rgba(0,0,0,0.3)",
            }}
          >
            <span className="font-heading" style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.04em" }}>
              {TEAM.tag}
            </span>
          </div>
          <div>
            <div
              style={{
                display: "inline-block",
                padding: "4px 11px",
                background: "rgba(255,255,255,0.15)",
                backdropFilter: "blur(8px)",
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                marginBottom: 10,
              }}
            >
              ★ {TEAM.rank != null ? `#${TEAM.rank} en ${TEAM.league}` : TEAM.league}
            </div>
            <h1
              className="font-heading"
              style={{
                fontSize: 44,
                fontWeight: 900,
                lineHeight: 0.95,
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                margin: 0,
              }}
            >
              {TEAM.name}
              <span style={{ color: "#fbbf24" }}>.</span>
            </h1>
            <div
              style={{
                display: "flex",
                gap: 18,
                marginTop: 12,
                fontSize: 12.5,
                color: "rgba(255,255,255,0.85)",
                flexWrap: "wrap",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="users" size={13} color="#fff" />
                {TEAM.members.length} miembros
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="crown" size={13} color="#fff" />
                {TEAM.captainName}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="calendar" size={13} color="#fff" />
                Desde {TEAM.founded}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <Stat n={TEAM.wins} l="Victorias" color="#10b981" />
              <div style={{ width: 1, background: "rgba(255,255,255,0.2)" }} />
              <Stat n={TEAM.losses} l="Derrotas" />
              <div style={{ width: 1, background: "rgba(255,255,255,0.2)" }} />
              <Stat n={winRate + "%"} l="Win rate" color="#fbbf24" />
              <div style={{ width: 1, background: "rgba(255,255,255,0.2)" }} />
              <Stat
                n={TEAM.teamMpr != null ? (TEAM.teamMpr / 1000).toFixed(2) : "—"}
                l="Team MPR"
                color="#10b981"
              />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                onClick={() => setView("settings")}
                className="btn"
                style={{
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                <Icon name="settings" size={13} color="#fff" />
                Ajustes
              </button>
              <button
                onClick={() => setView("invite")}
                className="btn"
                style={{ background: "#fbbf24", color: "#0a0a0a" }}
              >
                <Icon name="user-plus" size={13} />
                Invitar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-4">
        {/* Roster table */}
        <div className="card" style={{ padding: 22 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h2
              className="font-heading"
              style={{
                fontSize: 18,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "-0.02em",
                margin: 0,
              }}
            >
              Roster<span className="dot">.</span>
            </h2>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 900,
                padding: "4px 10px",
                borderRadius: 9999,
                background: rosterBg,
                color: rosterColor,
                border: `1px solid ${rosterBorder}`,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
              }}
            >
              {rosterCount}/{rosterMax} miembros
            </span>
          </div>
          {showUpsellMini && (
            <a
              href="/dashboard/user/mi-plan"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 14px",
                marginBottom: 14,
                borderRadius: 10,
                background: "linear-gradient(135deg, #fef3c7, #fde68a)",
                border: "1px solid #fbbf24",
                color: "#0a0a0a",
                textDecoration: "none",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Icon name="zap" size={13} color="#92400e" />
                Activa MatchPoint+ para 24 miembros
              </span>
              <span style={{ color: "#92400e" }}>→</span>
            </a>
          )}
          {/* Roster como cards (no tabla): cada fila es UNA card con fondo +
              borde + redondeo continuos. Grid compartido header/cards. */}
          {(() => {
            const ROSTER_GRID = "minmax(0,1.5fr) auto 48px 40px 104px 34px";
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: ROSTER_GRID,
                    gap: 12,
                    alignItems: "center",
                    padding: "0 14px",
                  }}
                >
                  {["Jugador", "Rol", "Nivel", "PJ", "WR", ""].map((h, i) => (
                    <div
                      key={i}
                      style={{
                        textAlign: i >= 2 && i < 5 ? "right" : "left",
                        fontSize: 9.5,
                        color: "var(--muted-fg)",
                        textTransform: "uppercase",
                        letterSpacing: "0.14em",
                        fontWeight: 800,
                      }}
                    >
                      {h}
                    </div>
                  ))}
                </div>
                {ROSTER.map((p, i) => {
                  const memberAccent = p.accentHex ?? null;
                  const memberCard = p.cardStyleCss ?? null;
                  const avatarBg = memberAccent
                    ? `linear-gradient(135deg, ${memberAccent}cc, ${memberAccent})`
                    : ROSTER_AVATARS[i % ROSTER_AVATARS.length];
                  const isMe = !!meUserId && p.userId === meUserId;
                  return (
                    <div
                      key={p.name}
                      style={{
                        display: "grid",
                        gridTemplateColumns: ROSTER_GRID,
                        gap: 12,
                        alignItems: "center",
                        padding: "10px 14px",
                        borderRadius: 12,
                        background: memberCard?.background ?? "#fafafa",
                        border: memberCard?.border ?? "1px solid var(--border)",
                        boxShadow: memberCard?.boxShadow,
                        color: memberCard?.color,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div style={{ position: "relative", flexShrink: 0 }}>
                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: "50%",
                              background: avatarBg,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#fff",
                            }}
                          >
                            <span className="font-heading" style={{ fontSize: 10.5, fontWeight: 900 }}>
                              {p.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)}
                            </span>
                          </div>
                          {p.online && (
                            <span
                              style={{
                                position: "absolute",
                                bottom: -1,
                                right: -1,
                                width: 9,
                                height: 9,
                                borderRadius: "50%",
                                background: "#10b981",
                                border: "2px solid #fff",
                              }}
                            />
                          )}
                        </div>
                        <span
                          style={{
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                          {isMe && <SelfChip />}
                        </span>
                      </div>
                      <div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: 9999,
                            background: p.role.includes("apit") ? "#fef3c7" : "var(--muted)",
                            color: p.role.includes("apit") ? "#92400e" : "var(--muted-fg)",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p.role}
                        </span>
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 800 }}>{p.level}</div>
                      <div style={{ textAlign: "right" }}>{p.played}</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                        <div
                          style={{
                            width: 36,
                            height: 4,
                            background: "var(--muted)",
                            borderRadius: 9999,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: p.wr + "%",
                              height: "100%",
                              background: p.wr >= 75 ? "#10b981" : p.wr >= 60 ? "#fbbf24" : "#dc2626",
                            }}
                          />
                        </div>
                        <span style={{ fontWeight: 800, minWidth: 28, textAlign: "right" }}>{p.wr}%</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <button
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 9999,
                            border: "1px solid var(--border)",
                            background: "#fff",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon name="more-horizontal" size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <div className="label-mp" style={{ marginBottom: 8 }}>
              Próximos partidos
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {UPCOMING.map((u, i) => (
                <div
                  key={i}
                  style={{
                    padding: 14,
                    background: "var(--muted)",
                    borderRadius: 10,
                    borderLeft: "3px solid var(--primary)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 900,
                      color: "var(--primary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.14em",
                      marginBottom: 4,
                    }}
                  >
                    {u.round}
                  </div>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 15,
                      fontWeight: 900,
                      letterSpacing: "-0.01em",
                      lineHeight: 1.15,
                    }}
                  >
                    vs {u.vs}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--muted-fg)",
                      marginTop: 4,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Icon name="calendar" size={10} />
                      {u.date}
                    </span>
                    <span>{u.club}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div
            className="card"
            style={{
              padding: 20,
              background: "linear-gradient(135deg, #fef3c7, #fde68a)",
              borderColor: "#fbbf24",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Icon name="trophy" size={16} color="#92400e" />
              <div className="label-mp" style={{ color: "#92400e" }}>
                Logro reciente
              </div>
            </div>
            <div
              className="font-heading"
              style={{
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: "#0a0a0a",
                lineHeight: 1.15,
              }}
            >
              Top 3 — Liga Inter-Clubes Primavera 2024
            </div>
            <div style={{ fontSize: 11.5, color: "#78350f", marginTop: 4 }}>
              14W · 4L en la temporada regular
            </div>
          </div>
        </div>
      </div>

      {/* Stats avanzadas (Stage 2): gated por captainPlanTier */}
      <div className="card" style={{ padding: 22 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <h2
            className="font-heading"
            style={{
              fontSize: 18,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Estadísticas avanzadas<span className="dot">.</span>
          </h2>
          {isFreeCaptain && (
            <a
              href="/dashboard/user/mi-plan"
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#92400e",
                background: "#fef3c7",
                border: "1px solid #fbbf24",
                padding: "5px 11px",
                borderRadius: 9999,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="zap" size={12} color="#92400e" />
              Activa MatchPoint+
            </a>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { t: "W/L por oponente", d: "Récord cabeza a cabeza contra cada team." },
            { t: "MPR promedio", d: "Ranking competitivo del roster en el tiempo." },
            { t: "Attendance heatmap", d: "Quién juega y cuándo, mapa de calor del año." },
          ].map((s) => (
            <div
              key={s.t}
              style={{
                padding: 16,
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: isFreeCaptain ? "var(--muted)" : "#fff",
                opacity: isFreeCaptain ? 0.7 : 1,
                position: "relative",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {isFreeCaptain && <Icon name="lock" size={12} color="var(--muted-fg)" />}
                <div
                  className="font-heading"
                  style={{
                    fontSize: 13,
                    fontWeight: 900,
                    letterSpacing: "-0.01em",
                    color: isFreeCaptain ? "var(--muted-fg)" : "#0a0a0a",
                  }}
                >
                  {s.t}
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)", lineHeight: 1.35 }}>
                {s.d}
              </div>
              {!isFreeCaptain && (
                <span
                  style={{
                    alignSelf: "flex-start",
                    marginTop: 4,
                    fontSize: 9.5,
                    fontWeight: 900,
                    color: "var(--primary)",
                    background: "#ecfdf5",
                    padding: "2px 8px",
                    borderRadius: 9999,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                  }}
                >
                  Pronto
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
        <button
          onClick={() => setView("empty")}
          style={{
            background: "transparent",
            border: 0,
            fontSize: 10.5,
            color: "var(--muted-fg)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ↩ Demo: ver flujo desde &quot;sin team&quot;
        </button>
      </div>
    </div>
  );
}

function Stat({ n, l, color }: { n: number | string; l: string; color?: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div
        className="font-heading"
        style={{
          fontSize: 36,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          color: color || "#fff",
        }}
      >
        {n}
      </div>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 900,
          color: "rgba(255,255,255,0.55)",
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {l}
      </div>
    </div>
  );
}

// Botón de back compartido por las sub-vistas
function BackBtn({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      onClick={onBack}
      style={{
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        fontWeight: 700,
        color: "var(--muted-fg)",
        background: "transparent",
        border: 0,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <Icon name="arrow-left" size={13} /> {label}
    </button>
  );
}
