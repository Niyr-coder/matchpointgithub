// Pantalla de DETALLE de una quedada para el JUGADOR (read-only). Vive bajo
// /dashboard/[role]/quedada/[id] cuando el usuario NO gestiona. Fetchea con
// getQuedadaPlayerView (action read-only) y monta <QuedadaGameView> en modo
// lectura. Se refresca en vivo por realtime.
//
// Las tablas de quedadas no están en los tipos generados → tipamos localmente.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { Skeleton as SkBar } from "@/components/ui/Skeleton";
import { getQuedadaPlayerView } from "@/server/actions/quedadas";
import {
  QuedadaGameView,
  type GameViewCategory,
  type GameViewPair,
  type GameViewParticipant,
  type GameViewRound,
  type GameViewGame,
} from "./QuedadaGameView";
import type { Prize } from "@/lib/schemas/quedadas";

type PlayerQuedada = {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  format: string;
  match_mode: "singles" | "doubles";
  visibility: "open" | "private";
  status: string;
  starts_at: string;
  location_text: string | null;
  fee_cents: number;
  perks_text: string | null;
  prizes: Prize[] | null;
  target_points: number | null;
};
type PlayerView = {
  quedada: PlayerQuedada;
  meUserId: string;
  isMember: boolean;
  categories: GameViewCategory[];
  pairs: GameViewPair[];
  participants: GameViewParticipant[];
  rounds: GameViewRound[];
  games: GameViewGame[];
};

const FORMAT_LABEL: Record<string, string> = {
  americano: "Americano",
  mexicano: "Mexicano",
  round_robin: "Round Robin",
  kotc: "Rey de Cancha",
  canguil: "Canguil",
  libre: "Libre",
};

function statusMeta(status: string): { label: string; bg: string; fg: string } {
  switch (status) {
    case "registration_open":
      return { label: "Abierta", bg: "rgba(16,185,129,0.22)", fg: "#d1fae5" };
    case "registration_closed":
      return { label: "Cerrada", bg: "rgba(251,191,36,0.22)", fg: "#fef3c7" };
    case "live":
      return { label: "En curso", bg: "rgba(14,165,233,0.22)", fg: "#e0f2fe" };
    case "finished":
      return { label: "Finalizada", bg: "rgba(255,255,255,0.16)", fg: "#fff" };
    case "cancelled":
      return { label: "Cancelada", bg: "rgba(239,68,68,0.25)", fg: "var(--destructive-border)" };
    default:
      return { label: status, bg: "rgba(255,255,255,0.16)", fg: "#fff" };
  }
}

function money(cents: number): string {
  const n = cents / 100;
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("es-EC", { weekday: "short", day: "2-digit", month: "short" });
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${date} · ${hh}:${mm}`;
}

export function QuedadaDetailView({ quedadaId }: { quedadaId: string }) {
  const router = useRouter();
  const [data, setData] = useState<PlayerView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await getQuedadaPlayerView({ quedadaId });
    if (!res.ok) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    setData(res.data as PlayerView);
    setError(null);
    setLoading(false);
  }, [quedadaId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Realtime: refresca en vivo cuando el organizador genera rondas, reporta
  // marcadores o cierra la quedada. onChange + reload con debounce (ráfagas).
  const rtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtimeRefresh(
    [
      { table: "quedada_rounds", filter: `quedada_id=eq.${quedadaId}` },
      { table: "quedada_games", filter: `quedada_id=eq.${quedadaId}` },
      { table: "quedada_participants", filter: `quedada_id=eq.${quedadaId}` },
      { table: "quedadas", filter: `id=eq.${quedadaId}` },
    ],
    {
      onChange: () => {
        if (rtTimer.current) clearTimeout(rtTimer.current);
        rtTimer.current = setTimeout(() => void reload(), 400);
      },
    },
  );

  const backBtn = (
    <button
      onClick={() => router.push("/dashboard/user/quedadas")}
      aria-label="Volver"
      style={{
        height: 30,
        borderRadius: 9999,
        padding: "0 12px",
        gap: 6,
        background: "rgba(255,255,255,0.12)",
        border: "1px solid rgba(255,255,255,0.2)",
        color: "#fff",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      <Icon name="arrow-left" size={14} color="#fff" /> Volver
    </button>
  );

  const q = data?.quedada ?? null;
  const sm = q ? statusMeta(q.status) : null;

  return (
    <div className="card" style={{ width: "100%", overflow: "hidden", display: "flex", flexDirection: "column", padding: 0, background: "#fff" }}>
      {/* Header */}
      <div
        style={{
          padding: "20px 22px 18px",
          background: "linear-gradient(135deg,var(--fg) 0%,#064e3b 72%,#10b981 100%)",
          color: "#fff",
          flexShrink: 0,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Quedada</div>
            {q ? (
              <h2 className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "8px 0 0" }}>
                {q.title}
                <span style={{ color: "#34d399" }}>.</span>
              </h2>
            ) : (
              <div style={{ margin: "10px 0 0" }}><SkBar w={240} h={24} r={8} dark /></div>
            )}
            {q ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap", fontSize: 11.5, color: "rgba(255,255,255,0.82)" }}>
                {sm && (
                  <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 9999, background: sm.bg, color: sm.fg }}>{sm.label}</span>
                )}
                <span>
                  {FORMAT_LABEL[q.format] ?? q.format} · {q.match_mode === "singles" ? "Singles" : "Dobles"}
                </span>
                <span>· {whenLabel(q.starts_at)}</span>
                {q.location_text && <span>· {q.location_text}</span>}
                {q.fee_cents > 0 && <span>· {money(q.fee_cents)}</span>}
              </div>
            ) : (
              <div style={{ marginTop: 10 }}><SkBar w={200} h={12} r={6} dark /></div>
            )}
          </div>
          <div style={{ flexShrink: 0 }}>{backBtn}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}>
        {loading && (
          <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <SkBar w={160} h={14} r={6} />
            <SkBar h={56} r={10} />
            <SkBar h={56} r={10} />
          </div>
        )}

        {!loading && error && (
          <div className="card" style={{ padding: 18, background: "var(--destructive-bg)", border: "1px solid var(--destructive-border)", color: "var(--destructive-fg)", fontSize: 13 }}>
            No se pudo cargar la quedada: {error}
          </div>
        )}

        {!loading && !error && q && (
          <>
            {q.description && (
              <p style={{ fontSize: 12.5, color: "var(--muted-fg)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{q.description}</p>
            )}
            {q.perks_text && (
              <div style={{ fontSize: 12, color: "var(--color-mp-primary-active)", background: "var(--color-mp-primary-light)", borderRadius: 8, padding: "8px 10px", display: "flex", gap: 6, alignItems: "flex-start" }}>
                <Icon name="sparkles" size={12} color="#10b981" />
                <span>{q.perks_text}</span>
              </div>
            )}
            {q.prizes && q.prizes.length > 0 && (
              <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="label-mp">Premios</div>
                {q.prizes.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 9, background: "var(--muted)", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: "var(--primary)", minWidth: 44 }}>{p.place}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>{p.prize}</span>
                    {p.valueCents != null && <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>{money(p.valueCents)}</span>}
                  </div>
                ))}
              </div>
            )}

            {q.format === "americano" ? (
              <QuedadaGameView
                categories={data!.categories}
                pairs={data!.pairs}
                participants={data!.participants}
                rounds={data!.rounds}
                games={data!.games}
                meUserId={data!.meUserId}
                matchMode={q.match_mode}
                quedadaTargetPoints={q.target_points}
                canManage={false}
              />
            ) : (
              <div className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 12, background: "var(--muted)", color: "var(--muted-fg)" }}>
                <Icon name="clock" size={18} color="var(--muted-fg)" />
                <div>
                  <div className="font-heading" style={{ fontSize: 13.5, fontWeight: 900, color: "var(--fg)" }}>Pronto</div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    El formato {FORMAT_LABEL[q.format] ?? q.format} todavía no tiene motor de juego.
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
