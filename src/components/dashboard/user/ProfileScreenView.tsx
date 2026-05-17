// Client view de ProfileScreen — recibe data ya fetcheada del server.
"use client";
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ImageUploader } from "@/components/ImageUploader";
import { updateMyAvatar } from "@/server/actions/me";
import { useToast } from "../ToastProvider";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type ProfileClub = {
  id: string;
  name: string;
  city: string;
  role: string;
  since: string;
};

export type ProfileData = {
  meUserId: string | null;
  name: string;
  username: string;
  city: string | null;
  bio: string | null;
  avatarUrl: string | null;
  primaryClub: { id: string; name: string; city: string } | null;
  clubs: ProfileClub[];
  memberSince: string;
  currentRating: number;
  rank: number | null;
  matchesTotal: number;
  wins: number;
  losses: number;
};

type Mode = "mine" | "public";
type FriendState = "none" | "pending" | "friends";
type Tab = "historial" | "insignias" | "clubes" | "preferencias";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function memberLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function ratingDisplay(elo: number): string {
  return (elo / 1000).toFixed(2);
}

function winRate(wins: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

function levelFromRating(elo: number): string {
  return (elo / 1000).toFixed(1);
}

const modePill = (a: boolean): CSSProperties => ({
  border: 0,
  padding: "8px 18px",
  borderRadius: 9999,
  background: a ? "#0a0a0a" : "transparent",
  color: a ? "#fff" : "#737373",
  fontWeight: 900,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
});

const coverBtn: CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  background: "rgba(0,0,0,0.5)",
  backdropFilter: "blur(8px)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 9999,
  padding: "6px 12px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: "inherit",
};

const editAvatarBtn: CSSProperties = {
  position: "absolute",
  bottom: 6,
  right: 0,
  width: 28,
  height: 28,
  borderRadius: "50%",
  background: "#0a0a0a",
  color: "#fff",
  border: "3px solid #fff",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export function ProfileScreenView({ data }: { data: ProfileData }) {
  // Realtime: stats actualizan al confirmar match, role_assignments para clubes.
  useRealtimeRefresh(
    data.meUserId
      ? [
          { table: "player_stats", filter: `user_id=eq.${data.meUserId}` },
          { table: "ranking_snapshots", filter: `user_id=eq.${data.meUserId}` },
          { table: "role_assignments", filter: `user_id=eq.${data.meUserId}` },
        ]
      : [],
    { enabled: !!data.meUserId },
  );

  const [mode, setMode] = useState<Mode>("mine");
  const [tab, setTab] = useState<Tab>("historial");
  const [friend, setFriend] = useState<FriendState>("none");
  const [avatarOverlayOpen, setAvatarOverlayOpen] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const isMine = mode === "mine";

  const handleAvatarUploaded = async (publicUrl: string) => {
    const res = await updateMyAvatar({ avatarUrl: publicUrl });
    if (res.ok) {
      toast({ icon: "check", title: "Foto actualizada" });
      setAvatarOverlayOpen(false);
      router.refresh();
    } else {
      toast({ icon: "x", title: "No se pudo actualizar", sub: res.error.message });
    }
  };

  const tabs: { k: Tab; label: string; icon: string }[] = [
    { k: "historial", label: "Historial", icon: "history" },
    { k: "insignias", label: "Insignias", icon: "award" },
    { k: "clubes", label: "Clubes", icon: "building-2" },
    ...(isMine ? ([{ k: "preferencias", label: "Preferencias", icon: "settings-2" }] as const) : []),
  ];

  const level = levelFromRating(data.currentRating);
  const memberSince = memberLabel(data.memberSince);
  const wr = winRate(data.wins, data.matchesTotal);

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: 4,
          background: "#f5f5f5",
          borderRadius: 9999,
          alignSelf: "flex-start",
        }}
      >
        <button onClick={() => setMode("mine")} style={modePill(isMine)}>Vista propia</button>
        <button onClick={() => setMode("public")} style={modePill(!isMine)}>Vista pública</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            height: 140,
            background: "linear-gradient(135deg, #064e3b 0%, #0a0a0a 50%, #000 100%)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(ellipse at 75% 30%, rgba(16,185,129,0.3), transparent 60%)",
            }}
          />
          {isMine && (
            <button style={coverBtn}>
              <Icon name="camera" size={13} />
              Cambiar portada
            </button>
          )}
        </div>
        <div
          style={{
            padding: "0 28px 24px",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
            <div style={{ position: "relative", marginTop: -52 }}>
              <div
                style={{
                  width: 112,
                  height: 112,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #10b981, #047857)",
                  border: "5px solid #fff",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  overflow: "hidden",
                }}
              >
                {data.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.avatarUrl}
                    alt={data.name}
                    width={112}
                    height={112}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span className="font-heading" style={{ fontSize: 36, fontWeight: 900 }}>
                    {data.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "?"}
                  </span>
                )}
              </div>
              {isMine && (
                <button
                  onClick={() => setAvatarOverlayOpen(true)}
                  style={editAvatarBtn}
                  aria-label="Cambiar foto de perfil"
                >
                  <Icon name="pencil" size={12} color="#fff" />
                </button>
              )}
            </div>
            <div style={{ paddingBottom: 8, paddingTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div
                  className="font-heading"
                  style={{
                    fontWeight: 900,
                    fontSize: 32,
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                    textTransform: "uppercase",
                  }}
                >
                  {data.name}<span className="dot">.</span>
                </div>
                <span className="chip-green">
                  <span className="chip-dot" />
                  Nivel {level}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--muted-fg)",
                  marginTop: 6,
                  display: "flex",
                  gap: 14,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                {data.city && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="map-pin" size={12} />
                    {data.city}
                  </span>
                )}
                {data.primaryClub && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="building-2" size={12} />
                    {data.primaryClub.name}
                  </span>
                )}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="calendar" size={12} />
                  Miembro desde {memberSince}
                </span>
              </div>
              <p style={{ marginTop: 12, fontSize: 13.5, color: "#404040", maxWidth: 540, lineHeight: 1.5 }}>
                {data.bio ?? `@${data.username} aún no agregó una bio.`}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, paddingBottom: 8 }}>
            {isMine ? (
              <>
                <button className="btn btn-outline">
                  <Icon name="pencil" size={12} />
                  Editar
                </button>
                <button className="btn btn-primary">
                  <Icon name="share-2" size={12} />
                  Compartir
                </button>
              </>
            ) : (
              <>
                {friend === "none" && (
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setFriend("pending");
                      toast({
                        icon: "user-plus",
                        title: `Solicitud enviada a ${data.name}`,
                        sub: "Le avisaremos para que acepte",
                      });
                    }}
                  >
                    <Icon name="user-plus" size={12} />
                    Agregar amigo
                  </button>
                )}
                {friend === "pending" && (
                  <button
                    className="btn"
                    style={{
                      background: "var(--muted)",
                      border: "1px solid var(--border)",
                      color: "var(--muted-fg)",
                    }}
                    onClick={() => {
                      setFriend("none");
                      toast({ icon: "x", title: "Solicitud cancelada" });
                    }}
                  >
                    <Icon name="clock" size={12} />
                    Solicitud enviada
                  </button>
                )}
                <button className="btn btn-outline">
                  <Icon name="message-square" size={12} />
                  Mensaje
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("mp-open-retar", {
                        detail: {
                          name: data.name,
                          level: parseFloat(level),
                          sport: "Pickleball",
                          city: data.city ?? "—",
                          av: data.name.split(" ").map((n) => n[0]).join("").slice(0, 2),
                          avBg: "linear-gradient(135deg,#7c3aed,#db2777)",
                        },
                      }),
                    )
                  }
                >
                  <Icon name="swords" size={12} />
                  Retar a match
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
        <StatBlock label="MP Rating" value={ratingDisplay(data.currentRating)} sub={data.rank != null ? "Oficial" : "Punto de partida"} />
        <StatBlock label="Ranking nacional" value={data.rank != null ? `#${data.rank}` : "—"} sub={data.rank != null ? "Pickleball" : "Aún sin ranking"} />
        <StatBlock label="Partidos jugados" value={String(data.matchesTotal)} sub={data.matchesTotal > 0 ? "Total" : "Empieza a jugar"} />
        <StatBlock label="Win rate" value={data.matchesTotal > 0 ? `${wr}%` : "—"} sub={data.matchesTotal > 0 ? `${data.wins}W · ${data.losses}L` : "—"} />
      </div>

      <div>
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
          {tabs.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                border: 0,
                background: "transparent",
                padding: "12px 18px",
                borderBottom: tab === t.k ? "2px solid var(--primary)" : "2px solid transparent",
                color: tab === t.k ? "#0a0a0a" : "var(--muted-fg)",
                fontWeight: tab === t.k ? 900 : 600,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: -1,
              }}
            >
              <Icon name={t.icon} size={13} />
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ paddingTop: 20 }}>
          {tab === "historial" && <MatchHistory matchesTotal={data.matchesTotal} />}
          {tab === "insignias" && <BadgesGrid />}
          {tab === "clubes" && <ClubsList clubs={data.clubs} />}
          {tab === "preferencias" && <PreferencesPanel />}
        </div>
      </div>

      {avatarOverlayOpen && data.meUserId && (
        <AvatarOverlay
          userId={data.meUserId}
          currentUrl={data.avatarUrl}
          onClose={() => setAvatarOverlayOpen(false)}
          onUploaded={handleAvatarUploaded}
        />
      )}
    </>
  );
}

function AvatarOverlay({
  userId,
  currentUrl,
  onClose,
  onUploaded,
}: {
  userId: string;
  currentUrl: string | null;
  onClose: () => void;
  onUploaded: (publicUrl: string) => Promise<void> | void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
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
          padding: 24,
          width: "100%",
          maxWidth: 380,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3
            className="font-heading"
            style={{ margin: 0, fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}
          >
            Tu foto
          </h3>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: "transparent", border: 0, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>
            ×
          </button>
        </div>
        <ImageUploader
          bucket="avatars"
          folder={userId}
          filenamePrefix="avatar"
          currentUrl={currentUrl}
          shape="circle"
          height={180}
          onUploaded={onUploaded}
        />
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 8 }}>
          JPG, PNG o WEBP · máximo 4 MB
        </div>
      </div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  delta,
  deltaPos,
  sub,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaPos?: boolean;
  sub?: string;
}) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="label-mp">{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
        <div
          className="font-heading tabular"
          style={{ fontWeight: 900, fontSize: 36, lineHeight: 1, letterSpacing: "-0.03em" }}
        >
          {value}
        </div>
        {delta && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: deltaPos ? "var(--primary)" : "#dc2626",
            }}
          >
            {delta}
          </div>
        )}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function MatchHistory({ matchesTotal }: { matchesTotal: number }) {
  if (matchesTotal === 0) {
    return (
      <div
        className="card"
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--muted-fg)",
        }}
      >
        <Icon name="history" size={32} color="var(--muted-fg)" />
        <div
          className="font-heading"
          style={{ fontSize: 18, fontWeight: 900, marginTop: 12, color: "#0a0a0a" }}
        >
          Aún no has jugado partidos oficiales<span className="dot">.</span>
        </div>
        <p style={{ fontSize: 13, marginTop: 8, maxWidth: 360, margin: "8px auto 0" }}>
          Cuando reportes tu primer match confirmado, aparece aquí con score, rival y delta de rating.
        </p>
      </div>
    );
  }
  // TODO: query match_results joined a profiles para opp name. Por ahora
  // mostramos un placeholder informativo basado en el count real.
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="label-mp">Resumen</div>
      <p style={{ fontSize: 13.5, marginTop: 10, color: "#404040", lineHeight: 1.5 }}>
        Has jugado <b>{matchesTotal}</b> partidos oficiales. El detalle por partido (rival, score, delta) aparecerá aquí en la próxima entrega cuando conectemos el listado completo.
      </p>
    </div>
  );
}

const BADGES_FULL = [
  { label: "1° match", icon: "flag", on: true, when: "Mar 2025" },
  { label: "Racha 5", icon: "flame", on: true, when: "Abr 2025" },
  { label: "Top 50", icon: "trophy", on: true, when: "Abr 2025" },
  { label: "Doblete", icon: "award", on: false, hint: "Gana 2 torneos" },
  { label: "Campeón", icon: "crown", on: false, hint: "Gana un torneo Open" },
  { label: "10 wins", icon: "medal", on: true, when: "Abr 2025" },
  { label: "Madrugón", icon: "sunrise", on: true, when: "Mar 2025" },
  { label: "Maratón", icon: "zap", on: false, hint: "Juega 30 partidos en un mes" },
];

function BadgesGrid() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
      {BADGES_FULL.map((b) => (
        <div
          key={b.label}
          className="card"
          style={{ padding: 18, textAlign: "center", opacity: b.on ? 1 : 0.55 }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              margin: "0 auto",
              background: b.on ? "#f0fdf4" : "#f5f5f5",
              color: b.on ? "var(--primary)" : "#a3a3a3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: b.on ? "1px solid rgba(16,185,129,0.3)" : "1px solid var(--border)",
            }}
          >
            <Icon name={b.icon} size={22} />
          </div>
          <div
            className="font-heading"
            style={{
              fontWeight: 900,
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              marginTop: 12,
            }}
          >
            {b.label}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--muted-fg)",
              marginTop: 4,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {b.on ? `Conseguida · ${b.when}` : b.hint}
          </div>
        </div>
      ))}
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  partner: "Partner",
  coach: "Coach",
  employee: "Empleado",
  user: "Miembro",
  admin: "Admin",
};

function ClubsList({ clubs }: { clubs: ProfileClub[] }) {
  if (clubs.length === 0) {
    return (
      <div
        className="card"
        style={{
          padding: 40,
          textAlign: "center",
          color: "var(--muted-fg)",
        }}
      >
        <Icon name="building-2" size={32} color="var(--muted-fg)" />
        <div
          className="font-heading"
          style={{ fontSize: 18, fontWeight: 900, marginTop: 12, color: "#0a0a0a" }}
        >
          Aún no perteneces a ningún club<span className="dot">.</span>
        </div>
        <p style={{ fontSize: 13, marginTop: 8, maxWidth: 360, margin: "8px auto 0" }}>
          Únete a un club para acceder a sus canchas, torneos y comunidad.
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {clubs.map((c, i) => (
        <div key={c.id} className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 10,
              background: "linear-gradient(135deg, #10b981, #047857)",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <span className="font-heading" style={{ fontSize: 18, fontWeight: 900 }}>
              {c.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</div>
              {i === 0 && (
                <span className="chip-green" style={{ fontSize: 9 }}>
                  Principal
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>
              {ROLE_LABEL[c.role] ?? c.role} · Desde {memberLabel(c.since)} · {c.city}
            </div>
          </div>
          <a
            href={`/clubes/${c.id}`}
            className="btn btn-outline"
            style={{ padding: "8px 14px", textDecoration: "none" }}
          >
            Ver club
          </a>
        </div>
      ))}
    </div>
  );
}

const PREF_FIELDS = [
  { label: "Mano dominante", value: "Derecha" },
  { label: "Estilo preferido", value: "Dobles" },
  { label: "Disponibilidad", value: "Sáb-Dom · Mañanas" },
  { label: "Notificaciones", value: "Email + Push" },
  { label: "Visibilidad de perfil", value: "Pública" },
  { label: "Idioma", value: "Español" },
];

function PreferencesPanel() {
  return (
    <div className="card">
      {PREF_FIELDS.map((f, i) => (
        <div
          key={f.label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderTop: i === 0 ? 0 : "1px solid var(--border)",
          }}
        >
          <div>
            <div className="label-mp">{f.label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{f.value}</div>
          </div>
          <button className="btn btn-outline" style={{ padding: "7px 14px" }}>
            Editar
          </button>
        </div>
      ))}
    </div>
  );
}
