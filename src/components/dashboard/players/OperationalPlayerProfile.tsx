// Vista operacional del perfil de un jugador, para roles que NO son user.
// admin / owner / manager / partner / coach / employee acceden a este detalle
// cuando visitan /dashboard/user/players/[username] desde sus propios contextos.
//
// Difiere de ProfileScreenView (social) en:
// - Sin toggle "Vista propia/pública", sin tabs sociales.
// - Sin botones de amistad / ranking público.
// - Header compact con identidad + role chips + plan.
// - Stats grid denso.
// - Sección "Role assignments" con scope (club/partner).
// - Slot de acciones específicas del viewer role (admin: audit, suspend;
//   owner: ver historial en su club; etc) — placeholders por ahora.
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { RoleKey } from "@/lib/roles";
import type { ProfileData } from "@/components/dashboard/user/ProfileScreenView";

type Props = {
  data: ProfileData;
  viewerRole: RoleKey;
};

const SPORT_LABEL: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
};

function ratingDisplay(elo: number): string {
  return (elo / 1000).toFixed(2);
}

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export function OperationalPlayerProfile({ data, viewerRole }: Props) {
  const wr =
    data.matchesTotal > 0 ? Math.round((data.wins / data.matchesTotal) * 100) : 0;
  const memberSince = new Date(data.memberSince).toLocaleDateString("es-EC", {
    year: "numeric",
    month: "short",
  });

  return (
    <>
      <div className="label-mp">Perfil de jugador · vista {viewerRole}</div>

      {/* Header compacto */}
      <div
        className="card"
        style={{
          padding: 20,
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#10b981,#047857)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          {initials(data.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            {data.name}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--muted-fg)",
              marginTop: 4,
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span>@{data.username}</span>
            {data.city && <span>· {data.city}</span>}
            <span>· Miembro desde {memberSince}</span>
          </div>
        </div>
        <Link
          href="javascript:history.back()"
          className="btn"
          style={{
            background: "#fff",
            color: "#0a0a0a",
            border: "1px solid var(--border)",
            padding: "8px 14px",
          }}
        >
          <Icon name="arrow-left" size={12} />
          Volver
        </Link>
      </div>

      {/* Grid de stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBlock label="Rating actual" value={ratingDisplay(data.currentRating)} />
        <StatBlock
          label="Ranking"
          value={data.rank != null ? `#${data.rank}` : "—"}
        />
        <StatBlock label="Partidos" value={String(data.matchesTotal)} />
        <StatBlock
          label="Win rate"
          value={`${wr}%`}
          hint={`${data.wins}W · ${data.losses}L`}
        />
      </div>

      {/* Ratings por modalidad */}
      <div className="card" style={{ padding: 20 }}>
        <div className="label-mp">Rating por modalidad</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ marginTop: 14 }}>
          <ModeRow
            label="Singles"
            rating={data.ratings.singles?.currentRating}
            matches={data.ratings.singles?.matchesTotal ?? 0}
            wins={data.ratings.singles?.wins ?? 0}
          />
          <ModeRow
            label="Dobles"
            rating={data.ratings.doubles?.currentRating}
            matches={data.ratings.doubles?.matchesTotal ?? 0}
            wins={data.ratings.doubles?.wins ?? 0}
          />
        </div>
      </div>

      {/* Role assignments */}
      {data.clubs.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp">Pertenencias</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {data.clubs.map((c) => (
              <div
                key={`${c.id}-${c.role}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                    {c.city} · desde {new Date(c.since).toLocaleDateString("es-EC", {
                      year: "numeric",
                      month: "short",
                    })}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 900,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    padding: "3px 8px",
                    borderRadius: 9999,
                    background: "#0a0a0a",
                    color: "#fff",
                  }}
                >
                  {c.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acciones específicas del viewer role */}
      <RoleActions viewerRole={viewerRole} userId={data.meUserId} />
    </>
  );
}

function StatBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--muted-fg)",
        }}
      >
        {label}
      </div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{hint}</div>
      )}
    </div>
  );
}

function ModeRow({
  label,
  rating,
  matches,
  wins,
}: {
  label: string;
  rating: number | undefined;
  matches: number;
  wins: number;
}) {
  const wr = matches > 0 ? Math.round((wins / matches) * 100) : 0;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 10,
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 12, fontWeight: 800 }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
          {matches} partidos · {wr}% WR
        </div>
      </div>
      <div
        className="font-heading tabular"
        style={{ fontSize: 22, fontWeight: 900, color: rating ? "#0a0a0a" : "var(--muted-fg)" }}
      >
        {rating ? ratingDisplay(rating) : "—"}
      </div>
    </div>
  );
}

// Acciones disponibles según rol del viewer. Por ahora placeholders honestos:
// son botones que abrirían modales/acciones reales en una iteración futura.
function RoleActions({
  viewerRole,
  userId,
}: {
  viewerRole: RoleKey;
  userId: string | null;
}) {
  const actions: { icon: string; label: string; hint?: string; href?: string }[] = [];

  if (viewerRole === "admin") {
    actions.push(
      { icon: "shield", label: "Ver audit log", href: `/dashboard/admin/admin-audit?focus=${userId ?? ""}` },
      { icon: "crown", label: "Otorgar MP+", hint: "Próximamente" },
      { icon: "alert-triangle", label: "Suspender cuenta", hint: "Próximamente" },
    );
  } else if (viewerRole === "owner" || viewerRole === "manager") {
    actions.push(
      { icon: "calendar", label: "Reservas en mi club", hint: "Próximamente" },
      { icon: "trending-up", label: "Historial de gasto", hint: "Próximamente" },
    );
  } else if (viewerRole === "partner") {
    actions.push(
      { icon: "trophy", label: "Torneos jugados", hint: "Próximamente" },
      { icon: "list", label: "Inscripciones activas", hint: "Próximamente" },
    );
  } else if (viewerRole === "coach") {
    actions.push(
      { icon: "graduation-cap", label: "Clases tomadas", hint: "Próximamente" },
      { icon: "user-check", label: "Asistencias", hint: "Próximamente" },
    );
  } else if (viewerRole === "employee") {
    actions.push(
      { icon: "user-check", label: "Check-in rápido", hint: "Próximamente" },
    );
  }

  if (actions.length === 0) return null;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="label-mp">Acciones · rol {viewerRole}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3" style={{ marginTop: 12 }}>
        {actions.map((a) => {
          const inner = (
            <>
              <Icon name={a.icon} size={14} color="var(--primary)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{a.label}</div>
                {a.hint && (
                  <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{a.hint}</div>
                )}
              </div>
            </>
          );
          const baseStyle: React.CSSProperties = {
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "#fff",
            color: "inherit",
            textDecoration: "none",
            cursor: a.href ? "pointer" : "default",
            opacity: a.href ? 1 : 0.7,
          };
          return a.href ? (
            <Link key={a.label} href={a.href} style={baseStyle}>
              {inner}
            </Link>
          ) : (
            <div key={a.label} style={baseStyle}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
