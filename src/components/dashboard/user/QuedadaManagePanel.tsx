// Panel de gestión del organizador de una Quedada (juego social).
//
// Se renderiza como PÁGINA bajo /dashboard/[role]/quedada/[id]. El layout es
// estilo pantalla de rol: un header suelto (degradado) con título + descripción
// + cards de stats, debajo la barra de navegación (Gestión/Juego + sub-tabs) y
// el contenido como cards sobre el fondo de página. El botón "Volver" navega a
// la lista. Recibe `quedadaId`.
// Al montar llama `getQuedadaManageData` → estado. Header con stats + tabs:
//   • Resumen  — datos clave, link de inscripción (compartir), premios.
//   • Parejas  — categorías con "cupos" numerados; asignar pareja (A/B en dobles,
//                Jugador en singles) + marcar pago inline. Cada categoría contraíble.
//   • Pagos    — datos bancarios del organizador + lista de inscritos con pago.
//   • Configurar (solo creador) — categorías, logística, banco/premios, co-hosts.
// Nota: "cupos" = posiciones numeradas (antes "slots"); en código siguen como slotNo.
//
// Las tablas de quedadas aún no están en los tipos generados → la action de
// lectura devuelve `unknown`, así que tipamos el resultado localmente.
"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { Icon } from "@/components/Icon";
import { CourtMatchup } from "@/components/quedadas/CourtMatchup";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { LabelWithTip } from "../widgets/InfoTip";
import { PlayerPicker, type Player } from "../widgets/PlayerPicker";
import {
  getQuedadaManageData,
  createCategory,
  updateCategory,
  deleteCategory,
  assignPair,
  autoAssignCategory,
  removePair,
  setParticipantPaid,
  setParticipantCheckedIn,
  setAllCheckedIn,
  addQuedadaWalkIn,
  removeQuedadaWalkIn,
  setGuestPaid,
  setGuestCheckedIn,
  remindQuedadaPayment,
  getQuedadaPlayerHistory,
  updateQuedadaDetails,
  regenerateInviteCode,
  updateQuedadaLogistics,
  addCohost,
  removeCohost,
  setQuedadaStatus,
  setQuedadaResults,
  cancelQuedada,
  generateQuedadaRound,
  createManualQuedadaGame,
  reportGame,
  deleteRound,
  finishQuedada,
  finishQuedadaCategory,
  startAmericanoRolling,
  reportRollingGame,
  reportQuedada,
} from "@/server/actions/quedadas";
import { QuedadaGameView } from "./QuedadaGameView";
import { individualStandings, type StandingRow, type GameForStandings } from "@/lib/quedadas/standings";
import { getQuedadaEngine, rosterModeFor, standingsModeFor } from "@/lib/quedadas/engines/registry";
import { quedadaFormatLabel } from "@/lib/quedadas/format-labels";
import type { PaymentAccount, Prize, QuedadaRule } from "@/lib/schemas/quedadas";
import {
  BankAccountFields,
  accountToBankDraft,
  bankDraftToAccount,
  bankDraftIsIncomplete,
  type BankDraft,
} from "./quedada-fields/BankAccountFields";
import { PrizesEditor, prizesToDrafts, prizeDraftsToPrizes, type PrizeDraft } from "./quedada-fields/PrizesEditor";
import { QuedadaPrizeRow } from "./quedada-fields/QuedadaPrizeRow";
import { RulesEditor, rulesToDrafts, ruleDraftsToRules, type RuleDraft } from "./quedada-fields/RulesEditor";
import { SUMA_MIN, SUMA_MAX, parseSuma, sumaLabel } from "@/lib/quedadas/level";
import { Skeleton as SkBar } from "@/components/ui/Skeleton";

// ── Tipos del payload (la action devuelve `unknown`) ─────────────────────────
type ManageQuedada = {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  format: string;
  engine_mode: "rounds" | "rolling";
  match_mode: "singles" | "doubles";
  visibility: "open" | "private";
  status: string;
  starts_at: string;
  live_at: string | null;
  updated_at: string;
  location_text: string | null;
  perks_text: string | null;
  fee_cents: number;
  max_players: number | null;
  courts_count: number | null;
  hours: number | null;
  court_price_cents: number | null;
  target_points: number | null;
  payment_account: PaymentAccount | null;
  prizes: Prize[] | null;
  rules: QuedadaRule[] | null;
  payment_info: string | null; // deprecado
  prizes_text: string | null; // deprecado
  invite_code: string | null;
};
type ManageCategory = {
  id: string;
  name: string;
  level_label: string | null;
  starts_at: string | null;
  court_label: string | null;
  max_slots: number | null;
  target_points: number | null;
  sort_order: number;
  status?: "scheduled" | "active" | "finished";
  finished_at?: string | null;
};
type ManagePair = {
  id: string;
  category_id: string;
  slot_no: number;
  player_a_id: string;
  player_b_id: string | null;
};
type ManageParticipant = {
  user_id: string;
  status: string;
  paid: boolean;
  checked_in_at: string | null;
  payment_reminded_at: string | null;
  points: number | null;
  final_rank: number | null;
  profiles: { display_name: string | null; username: string | null; avatar_url: string | null } | null;
};
type ManageCohost = {
  user_id: string;
  profiles: { display_name: string | null; username: string | null } | null;
};
// Walk-in (guest sin cuenta): agregado a mano por el organizador; ocupa cupos
// y juega games con su UUID propio (quedada_guests).
type ManageGuest = {
  id: string;
  display_name: string;
  paid: boolean;
  checked_in_at: string | null;
  final_rank: number | null;
  created_at: string;
};
type ManageRound = {
  id: string;
  category_id: string;
  round_no: number;
  status: string; // 'scheduled' | 'active' | 'done'
};
type ManageGame = {
  id: string;
  category_id: string;
  round_id: string | null;
  round_no: number | null;
  court_no: number | null;
  court_match_no: number | null;
  side_a_p1: string;
  side_a_p2: string | null;
  side_b_p1: string;
  side_b_p2: string | null;
  points_a: number | null;
  points_b: number | null;
  status: string; // 'scheduled' | 'played'
  created_at: string;
  updated_at: string;
};
type ManageData = {
  quedada: ManageQuedada;
  isCreator: boolean;
  canManage: boolean;
  meUserId: string;
  categories: ManageCategory[];
  pairs: ManagePair[];
  participants: ManageParticipant[];
  cohosts: ManageCohost[];
  guests: ManageGuest[];
  rounds: ManageRound[];
  games: ManageGame[];
};

type TabKey = "resumen" | "parejas" | "juego" | "pagos" | "resultados" | "config";

function quedadaIsLocked(status: string): boolean {
  return status === "finished" || status === "cancelled";
}

function quedadaTimerFrozenAt(q: ManageQuedada): string | null {
  if (!quedadaIsLocked(q.status)) return null;
  return q.updated_at || q.live_at || q.starts_at;
}

type CategoryFlowStatus = "scheduled" | "active" | "finished";

function categoryFlowStatus(c: ManageCategory, quedadaStatus: string): CategoryFlowStatus {
  if (c.status) return c.status;
  if (quedadaStatus === "finished") return "finished";
  if (quedadaStatus === "live") return "active";
  return "scheduled";
}

function standingsForCategory(
  data: ManageData,
  categoryId: string,
  q: ManageQuedada,
  nameById: (id: string) => string,
): StandingRow[] {
  const players = data.pairs
    .filter((p) => p.category_id === categoryId)
    .flatMap((p) => [p.player_a_id, p.player_b_id].filter((id): id is string => !!id));
  if (standingsModeFor(q.format, q.match_mode) !== "individual" || players.length === 0) return [];
  const catGames = data.games.filter((g) => g.category_id === categoryId);
  return individualStandings(catGames as GameForStandings[], players, nameById);
}

function QuedadaLockedNotice() {
  return (
    <div
      className="card"
      style={{
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--muted)",
        border: "1px solid var(--border)",
        fontSize: 12.5,
        color: "var(--muted-fg)",
      }}
    >
      <Icon name="lock" size={14} color="var(--muted-fg)" />
      <span>Quedada finalizada — solo lectura. No se pueden cambiar marcadores, roster ni pagos.</span>
    </div>
  );
}

function quedadaStatusMeta(status: string): { label: string; bg: string; fg: string } {
  switch (status) {
    case "registration_open":
      return { label: "Abierta", bg: "rgba(16,185,129,0.22)", fg: "#d1fae5" };
    case "registration_closed":
      return { label: "Cerrada", bg: "rgba(251,191,36,0.22)", fg: "#fef3c7" };
    case "live":
      return { label: "En vivo", bg: "rgba(14,165,233,0.22)", fg: "#e0f2fe" };
    case "finished":
      return { label: "Finalizada", bg: "rgba(255,255,255,0.16)", fg: "#fff" };
    case "cancelled":
      return { label: "Cancelada", bg: "rgba(239,68,68,0.25)", fg: "var(--destructive-border)" };
    default:
      return { label: status, bg: "rgba(255,255,255,0.16)", fg: "#fff" };
  }
}

// Color sólido del estado, legible sobre fondo CLARO (la card de Estado vive
// fuera del banner). El `fg` de quedadaStatusMeta es para fondo oscuro.
function quedadaStatusSolid(status: string): string {
  switch (status) {
    case "registration_open":
      return "var(--primary)";
    case "registration_closed":
      return "#d97706";
    case "live":
      return "#0284c7";
    case "cancelled":
      return "#dc2626";
    default:
      return "var(--fg)";
  }
}

function HeaderBtn({
  children,
  onClick,
  disabled,
  icon,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon: string;
  tone?: "neutral" | "primary" | "danger" | "ghost";
}) {
  // Botones sólidos (sin glass) según su función; "ghost" = outline sobre el banner.
  const palette =
    tone === "danger"
      ? { bg: "#dc2626", fg: "#fff", border: "#dc2626" }
      : tone === "primary"
        ? { bg: "var(--primary)", fg: "#fff", border: "var(--primary)" }
        : tone === "ghost"
          ? { bg: "transparent", fg: "#fff", border: "rgba(255,255,255,0.45)" }
          : { bg: "#fff", fg: "var(--fg)", border: "#fff" };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        borderRadius: 9999,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
        fontSize: 11.5,
        fontWeight: 900,
        letterSpacing: "0.02em",
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.fg,
        opacity: disabled ? 0.6 : 1,
        transition: "filter 150ms var(--ease-out), transform 120ms var(--ease-out)",
      }}
    >
      <Icon name={icon} size={12} color={palette.fg} />
      {children}
    </button>
  );
}

// Card de stat para el FONDO DE PÁGINA (claro), fuera del banner. Label arriba,
// valor grande abajo. Valores numéricos cortos lucen grandes; los de texto
// (Estado/Formato) bajan un poco para no desbordar.
function StatCard({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  const isText = !/^[\d/.$]+$/.test(value);
  return (
    <div
      className="card"
      style={{ padding: "13px 15px", height: "100%", display: "flex", flexDirection: "column", minHeight: 88 }}
    >
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>{label}</div>
      <div
        className="font-heading"
        style={{ fontSize: isText ? 18 : 22, fontWeight: 900, lineHeight: 1.15, marginTop: 5, color: valueColor ?? "var(--fg)" }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: "auto", paddingTop: 8, lineHeight: 1.4 }}>{sub}</div>
      ) : (
        <div style={{ marginTop: "auto" }} aria-hidden />
      )}
    </div>
  );
}

type PrevMatch = { gameId: string; seqNo: number; teamA: string[]; teamB: string[]; pointsA: number | null; pointsB: number | null; durationMs: number | null; played: boolean };
type CourtMatch = {
  gameId: string;
  seqNo: number; // round_no (modo rondas) o court_match_no (modo rolling)
  courtNo: number | null;
  teamA: string[];
  teamB: string[];
  played: boolean;
  pointsA: number | null;
  pointsB: number | null;
  startedAt: string; // created_at del partido (para el cronómetro en vivo)
  prev: PrevMatch | null; // último partido jugado antes en esa cancha (historial)
};

// Marcador EDITABLE inline: dos números (0 por defecto) que se editan al clic; al
// tocar aparece el check para guardar (también Enter). Keyed por gameId en el
// padre → se reinicia al cambiar de cancha. Sin botón "Cargar marcador".
const MAX_POINTS = 21; // tope de puntos por lado en el marcador

// Duración como reloj M:SS (o H:MM:SS) para el cronómetro en vivo.
function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
// Duración estática en minutos ("12 min").
function fmtDurMin(ms: number): string {
  const min = Math.round(ms / 60000);
  return min < 1 ? "<1 min" : `${min} min`;
}
// Cronómetro en vivo: tiempo transcurrido desde `since` (created_at del partido).
// Con `frozenAt` deja de tickar (p. ej. quedada finalizada).
function LiveTimer({ since, frozenAt }: { since: string; frozenAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (frozenAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [frozenAt]);
  const start = Date.parse(since);
  const end = frozenAt ? Date.parse(frozenAt) : now;
  const ms = Number.isNaN(start) ? 0 : Math.max(0, (Number.isNaN(end) ? now : end) - start);
  return <span className="tabular">{fmtClock(ms)}</span>;
}

function ScoreEditor({ initialA, initialB, saving, onSave, compact = false }: { initialA: number | null; initialB: number | null; saving: boolean; onSave: (a: number, b: number) => void; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState(String(initialA ?? 0));
  const [b, setB] = useState(String(initialB ?? 0));
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const valid = Number.isFinite(na) && Number.isFinite(nb) && na >= 0 && nb >= 0 && na <= MAX_POINTS && nb <= MAX_POINTS;
  const save = () => {
    if (valid && !saving && !submitted) {
      setSubmitted(true); // feedback inmediato (baja opacidad) al guardar
      onSave(na, nb);
    }
  };
  const busy = submitted || saving;
  // Tamaños tipográficos del marcador. `compact` se usa cuando el marcador vive
  // dentro de la sección "Partido anterior" del widget de cancha, para no
  // competir visualmente con el marcador del partido actual.
  const numFontSize = compact ? 16 : 26;
  const dashFontSize = compact ? 14 : 20;
  const cellWidth = compact ? 26 : 40;
  const dashGap = compact ? 3 : 4;
  const pencilSize = compact ? 11 : 13;
  const pencilGap = compact ? 5 : 8;

  // Vista por defecto: marcador estático + lapicito (clickeable) a la izquierda,
  // fuera del flujo para no descentrar el marcador.
  if (!editing) {
    return (
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center", opacity: busy ? 0.45 : 1, transition: "opacity 150ms var(--ease-out)" }}>
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={busy}
          aria-label="Editar marcador"
          className="mp-edit-pencil"
          style={{ position: "absolute", right: "100%", top: "50%", transform: "translateY(-50%)", marginRight: pencilGap, border: 0, background: "transparent", padding: 0, lineHeight: 0, cursor: busy ? "default" : "pointer" }}
        >
          <Icon name="pencil" size={pencilSize} color="currentColor" />
        </button>
        <span className="font-heading tabular" style={{ fontSize: numFontSize, fontWeight: 900, lineHeight: 1 }}>
          {Number.isFinite(na) ? na : 0}
          <span style={{ color: "var(--primary)", margin: `0 ${dashGap}px` }}>–</span>
          {Number.isFinite(nb) ? nb : 0}
        </span>
      </div>
    );
  }

  const cell: React.CSSProperties = {
    width: cellWidth,
    textAlign: "center",
    fontFamily: "var(--font-heading, inherit)",
    fontSize: numFontSize,
    fontWeight: 900,
    lineHeight: 1,
    color: "var(--fg)",
    background: "transparent",
    border: 0,
    borderBottom: "2px dashed var(--border)",
    outline: "none",
    padding: "2px 0",
    cursor: "text",
  };
  // Clamp a 0..MAX_POINTS (no se pueden ingresar más de 21 puntos).
  const handle = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      set("");
    } else {
      const n = parseInt(raw, 10);
      set(Number.isFinite(n) ? String(Math.max(0, Math.min(MAX_POINTS, n))) : "");
    }
    setTouched(true);
  };
  // Al salir del editor: guarda si se editó y vuelve a la vista estática. Enter guarda.
  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      if (touched) save();
      setEditing(false);
    }
  };
  return (
    <div onBlur={onBlur} style={{ display: "inline-flex", alignItems: "center", gap: 2, opacity: busy ? 0.45 : 1, pointerEvents: busy ? "none" : undefined, transition: "opacity 150ms var(--ease-out)" }}>
      <input type="number" min={0} max={MAX_POINTS} autoFocus className="mp-no-spin" value={a} onChange={handle(setA)} onFocus={(e) => e.currentTarget.select()} onKeyDown={(e) => e.key === "Enter" && save()} aria-label="Puntos lado A" style={{ ...cell, textAlign: "right" }} />
      <span className="font-heading" style={{ fontSize: dashFontSize, fontWeight: 900, color: "var(--primary)" }}>–</span>
      <input type="number" min={0} max={MAX_POINTS} className="mp-no-spin" value={b} onChange={handle(setB)} onFocus={(e) => e.currentTarget.select()} onKeyDown={(e) => e.key === "Enter" && save()} aria-label="Puntos lado B" style={{ ...cell, textAlign: "left" }} />
    </div>
  );
}

// Card del header con CARRUSEL MANUAL de partidos en cancha (uno por cancha).
// El organizador navega con flechas/puntos. Cada cancha muestra su estado
// ("En juego" / "Libre"); en juego el marcador es editable inline (0-0 al clic) →
// al guardar, el motor rolling asigna el siguiente partido en esa cancha.
function MatchCarouselCard({
  matches,
  emptyTitle,
  emptySub,
  seqWord,
  canReport,
  reporting,
  onReport,
  courtMaxWidth,
  courtNameSize,
  showPrev = true,
  timerFrozenAt,
}: {
  matches: CourtMatch[];
  emptyTitle: string;
  emptySub: string;
  seqWord: string;
  canReport: boolean;
  reporting: boolean;
  onReport: (gameId: string, a: number, b: number) => void;
  courtMaxWidth?: number;
  courtNameSize?: number;
  showPrev?: boolean;
  timerFrozenAt?: string | null;
}) {
  const [idx, setIdx] = useState(0);
  const n = matches.length;
  const active = n ? Math.min(idx, n - 1) : 0;
  const freeCount = matches.filter((m) => m.played).length;

  return (
    <div className="card" style={{ width: "100%", minWidth: 0, maxWidth: "100%", overflow: "hidden", padding: 20, display: "flex", flexDirection: "column", gap: 10, color: "var(--fg)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
          {n > 1 ? "Partidos en cancha" : "Siguiente partido"}
        </span>
        {freeCount > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--success-fg)", background: "var(--success-bg)", padding: "3px 8px", borderRadius: 9999 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success-fg)" }} />
            {freeCount} libre{freeCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {n === 0 ? (
        <div style={{ padding: "24px 0" }}>
          <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase" }}>{emptyTitle}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.5, marginTop: 2 }}>{emptySub}</div>
        </div>
      ) : (
        <>
          {/* Viewport + track deslizante (un slide por cancha) */}
          <div style={{ overflow: "hidden", minWidth: 0, width: "100%" }}>
            <div style={{ display: "flex", alignItems: "stretch", transform: `translateX(-${active * 100}%)`, transition: "transform 300ms var(--ease-out)" }}>
              {matches.map((m, i) => (
                <div key={m.courtNo ?? i} inert={i !== active} style={{ flex: "0 0 100%", minWidth: 0, display: "flex", flexDirection: "column" }}>
                  {/* Contenido del partido actual (re-anima con fade al actualizarse) */}
                  <div key={m.gameId} className="mp-match-in" style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div className="font-heading" style={{ fontSize: 22, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em", minWidth: 0 }}>
                        {seqWord} {m.seqNo}
                        {m.courtNo ? <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted-fg)", textTransform: "none", marginLeft: 8 }}>· Cancha {m.courtNo}</span> : null}
                      </div>
                      {m.played ? (
                        <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--success-fg)", background: "var(--success-bg)", padding: "4px 9px", borderRadius: 9999 }}>
                          <Icon name="check" size={12} color="var(--success-fg)" /> Libre
                        </span>
                      ) : timerFrozenAt ? (
                        <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted-fg)", background: "var(--muted)", padding: "4px 9px", borderRadius: 9999 }}>
                          <Icon name="flag" size={12} color="var(--muted-fg)" /> <LiveTimer since={m.startedAt} frozenAt={timerFrozenAt} />
                        </span>
                      ) : (
                        <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", color: "#b45309", background: "rgba(251,191,36,0.18)", padding: "4px 9px", borderRadius: 9999 }}>
                          <Icon name="clock" size={12} color="#b45309" /> <LiveTimer since={m.startedAt} frozenAt={timerFrozenAt} />
                        </span>
                      )}
                    </div>
                    <div style={courtMaxWidth ? { maxWidth: courtMaxWidth, margin: "0 auto", width: "100%" } : undefined}>
                      <CourtMatchup teamA={m.teamA} teamB={m.teamB} nameSize={courtNameSize} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 34 }}>
                      {m.played ? (
                        <span className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
                          {m.pointsA ?? 0}
                          <span style={{ color: "var(--primary)", margin: "0 4px" }}>–</span>
                          {m.pointsB ?? 0}
                        </span>
                      ) : canReport ? (
                        <ScoreEditor key={m.gameId} initialA={m.pointsA} initialB={m.pointsB} saving={reporting} onSave={(a, b) => onReport(m.gameId, a, b)} />
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-fg)" }}>Por jugar</span>
                      )}
                    </div>
                    {/* Historial: partido anterior de esta cancha (mini-tabla 2 filas) */}
                    {showPrev && (
                    <div style={{ marginTop: "auto", borderTop: "1px dashed var(--border)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          Partido anterior{m.prev?.durationMs != null ? ` · ${fmtDurMin(m.prev.durationMs)}` : ""}
                        </span>
                        {m.prev && (
                          canReport ? (
                            <ScoreEditor
                              key={`prev-${m.prev.gameId}`}
                              initialA={m.prev.pointsA}
                              initialB={m.prev.pointsB}
                              saving={reporting}
                              onSave={(a, b) => onReport(m.prev!.gameId, a, b)}
                              compact
                            />
                          ) : (
                            <span className="font-heading tabular" style={{ flexShrink: 0, fontSize: 14, fontWeight: 900, color: "var(--fg)" }}>
                              {m.prev.pointsA ?? 0}
                              <span style={{ color: "var(--muted-fg)", margin: "0 2px" }}>–</span>
                              {m.prev.pointsB ?? 0}
                            </span>
                          )
                        )}
                      </div>
                      {m.prev ? (
                        (() => {
                          const rows = Math.max(m.prev.teamA.length, m.prev.teamB.length);
                          const cell = (i: number, side: "l" | "r"): React.CSSProperties => ({
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--fg)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            minWidth: 0,
                            padding: side === "r" ? "6px 12px 6px 0" : "6px 0 6px 12px",
                            textAlign: side === "r" ? "right" : "left",
                            borderBottom: i < rows - 1 ? "1px solid var(--border)" : undefined,
                          });
                          return (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
                              {m.prev.teamA.map((name, i) => (
                                <span key={`a${i}`} style={{ ...cell(i, "r"), gridColumn: 1, gridRow: i + 1 }}>{name}</span>
                              ))}
                              <span style={{ gridColumn: 2, gridRow: `1 / span ${rows}`, alignSelf: "stretch", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 12px", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)", fontSize: 9, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-fg)" }}>vs</span>
                              {m.prev.teamB.map((name, i) => (
                                <span key={`b${i}`} style={{ ...cell(i, "l"), gridColumn: 3, gridRow: i + 1 }}>{name}</span>
                              ))}
                            </div>
                          );
                        })()
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>Aún no hay partido anterior en esta cancha.</span>
                      )}
                    </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Navegación: cuadritos numerados por cancha */}
          {n > 1 && (
            <div className="mp-touch-hscroll" style={{ display: "flex", gap: 4, justifyContent: "center", flexShrink: 0 }}>
              {matches.map((m, i) => {
                const on = i === active;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIdx(i)}
                    aria-label={`Cancha ${m.courtNo ?? i + 1}`}
                    style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, border: on ? 0 : "1px solid var(--border)", background: on ? "var(--fg)" : m.played ? "var(--success-bg)" : "#fff", color: on ? "#fff" : "var(--muted-fg)", fontFamily: "var(--font-heading, inherit)", fontSize: 11, fontWeight: 900, cursor: "pointer", transition: "background 150ms var(--ease-out), color 150ms var(--ease-out)" }}
                  >
                    {m.courtNo ?? i + 1}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Micro-label igual al de las cards llenas. */
const skLbl: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--muted-fg)",
};

/** Skeleton del carrusel — solo mientras carga la página. */
function MatchCarouselSkeleton() {
  return (
    <div className="card" style={{ width: "100%", minWidth: 0, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
        Siguiente partido
      </span>
      <SkBar w="58%" h={22} r={6} />
      <SkBar w="100%" h={72} r={12} />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <SkBar w={88} h={32} r={8} />
      </div>
      <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={skLbl}>Partido anterior</span>
        <SkBar w="100%" h={36} r={8} />
      </div>
    </div>
  );
}

/** Skeleton de insight — solo mientras carga la página. */
function InsightCardSkeleton() {
  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1 }}>
        Insight de juego<span className="dot">.</span>
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <span style={skLbl}>Progreso de partidos</span>
          <SkBar w={72} h={14} r={4} />
        </div>
        <SkBar h={6} r={9999} />
        <SkBar w="46%" h={10} r={4} />
      </div>
      <div className="mp-grid-form-2 gap-3">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={skLbl}>Puntos totales</span>
          <SkBar w="70%" h={22} r={6} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={skLbl}>Promedio/partido</span>
          <SkBar w="55%" h={22} r={6} />
        </div>
      </div>
      {(["Partido más reñido", "Partido más largo"] as const).map((label) => (
        <div key={label} style={{ borderTop: "1px dashed var(--border)", paddingTop: 12, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <span style={skLbl}>{label}</span>
          <SkBar w={64} h={14} r={4} />
        </div>
      ))}
    </div>
  );
}

/** Skeleton de tabla — solo mientras carga la página. */
function StandingsCardSkeleton() {
  const cols = "26px minmax(0,1fr) 30px 28px 38px 42px";
  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1 }}>
          Tabla de posiciones<span className="dot">.</span>
        </h3>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>Ranking individual</span>
      </div>
      <div className="mp-table-scroll">
        <div>
      <div
        className="mp-table-row"
        style={{
          display: "grid",
          gridTemplateColumns: cols,
          gap: 8,
          padding: "0 4px 6px",
          fontSize: 9.5,
          fontWeight: 900,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--muted-fg)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span>#</span>
        <span>Jugador</span>
        <span style={{ textAlign: "center" }}>PJ</span>
        <span style={{ textAlign: "center" }}>V</span>
        <span style={{ textAlign: "center" }}>PF</span>
        <span style={{ textAlign: "center" }}>DIF</span>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="mp-table-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "0 4px" }}>
          <SkBar w={18} h={14} r={4} />
          <SkBar w="85%" h={14} r={4} />
          <SkBar w={22} h={14} r={4} />
          <SkBar w={22} h={14} r={4} />
          <SkBar w={28} h={14} r={4} />
          <SkBar w={32} h={14} r={4} />
        </div>
      ))}
        </div>
      </div>
    </div>
  );
}

const dashCell: React.CSSProperties = { textAlign: "center", color: "var(--muted-fg)", fontWeight: 700 };

/** Tabla vacía (datos cargados, aún sin ranking). */
function StandingsCardEmpty({ hint = "Aún sin partidos jugados." }: { hint?: string }) {
  const cols = "26px minmax(0,1fr) 30px 28px 38px 42px";
  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1 }}>
          Tabla de posiciones<span className="dot">.</span>
        </h3>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>Ranking individual</span>
      </div>
      <div className="mp-table-scroll">
        <div>
      <div className="mp-table-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "0 4px 6px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-fg)", borderBottom: "1px solid var(--border)" }}>
        <span>#</span>
        <span>Jugador</span>
        <span style={{ textAlign: "center" }}>PJ</span>
        <span style={{ textAlign: "center" }}>V</span>
        <span style={{ textAlign: "center" }}>PF</span>
        <span style={{ textAlign: "center" }}>DIF</span>
      </div>
      <div className="mp-table-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "4px 4px 0", fontSize: 13 }}>
        <span className="font-heading tabular" style={{ fontWeight: 900, color: "var(--muted-fg)" }}>—</span>
        <span style={{ color: "var(--muted-fg)" }}>—</span>
        <span className="tabular" style={dashCell}>—</span>
        <span className="tabular" style={dashCell}>—</span>
        <span className="tabular" style={dashCell}>—</span>
        <span className="tabular" style={dashCell}>—</span>
      </div>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 11.5, color: "var(--muted-fg)", lineHeight: 1.45 }}>{hint}</p>
    </div>
  );
}

// Tabla de posiciones (ranking individual del americano). Derivada de los games
// jugados. Top 3 en color primary. Columnas: #, Jugador, PJ, V, PF, DIF.
function StandingsCard({
  rows,
  nameOf,
  avatarOf,
}: {
  rows: StandingRow[];
  nameOf: (id: string) => string;
  avatarOf?: (id: string) => string | null;
}) {
  const cols = avatarOf ? "26px 34px minmax(0,1fr) 30px 28px 38px 42px" : "26px minmax(0,1fr) 30px 28px 38px 42px";
  const played = rows.some((r) => r.played > 0);
  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1 }}>
          Tabla de posiciones<span className="dot">.</span>
        </h3>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>Ranking individual</span>
      </div>
      <div className="mp-table-scroll">
        <div>
      <div className="mp-table-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "0 4px 6px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-fg)", borderBottom: "1px solid var(--border)" }}>
        <span>#</span>
        {avatarOf && <span aria-hidden />}
        <span>Jugador</span>
        <span style={{ textAlign: "center" }}>PJ</span>
        <span style={{ textAlign: "center" }}>V</span>
        <span style={{ textAlign: "center" }}>PF</span>
        <span style={{ textAlign: "center" }}>DIF</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.userId} className="mp-table-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "0 4px", fontSize: 13 }}>
          <span className="font-heading tabular" style={{ fontWeight: 900, color: played && i < 3 ? "var(--primary)" : "var(--muted-fg)" }}>{i + 1}</span>
          {avatarOf && (
            <PlayerStandingAvatar name={nameOf(r.userId)} avatarUrl={avatarOf(r.userId)} size={28} />
          )}
          <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{nameOf(r.userId)}</span>
          <span className="tabular" style={{ textAlign: "center", color: "var(--muted-fg)" }}>{r.played > 0 ? r.played : "—"}</span>
          <span className="tabular" style={{ textAlign: "center", color: "var(--muted-fg)" }}>{r.played > 0 ? r.wins : "—"}</span>
          <span className="tabular" style={{ textAlign: "center", fontWeight: 800 }}>{r.played > 0 ? r.pf : "—"}</span>
          <span className="tabular" style={{ textAlign: "center", color: r.played > 0 ? (r.diff > 0 ? "var(--success-fg)" : r.diff < 0 ? "var(--destructive-border)" : "var(--muted-fg)") : "var(--muted-fg)" }}>
            {r.played > 0 ? (r.diff > 0 ? `+${r.diff}` : r.diff) : "—"}
          </span>
        </div>
      ))}
        </div>
      </div>
      {!played && <div style={{ fontSize: 11.5, color: "var(--muted-fg)", paddingTop: 2 }}>Aún sin partidos jugados.</div>}
    </div>
  );
}

type InsightData = {
  playedN: number;
  scheduledN: number;
  totalPts: number;
  avg: number;
  closest: { a: number; b: number; court: number | null } | null;
  longest: { ms: number; court: number | null } | null;
  streakName: string | null;
  streakN: number;
};

// Widget "Insight de juego": progreso de partidos, puntos/promedio y partido más
// reñido. Todo derivado de los games de la categoría.
function InsightCard({ playedN, scheduledN, totalPts, avg, closest, longest, streakName, streakN }: InsightData) {
  const totalSet = playedN + scheduledN;
  const pct = totalSet > 0 ? Math.round((playedN / totalSet) * 100) : 0;
  const stat = (label: string, value: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>{label}</span>
      <span className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{value}</span>
    </div>
  );
  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1 }}>
        Insight de juego<span className="dot">.</span>
      </h3>

      {/* Progreso de partidos */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>Progreso de partidos</span>
          <span className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900 }}>{playedN > 0 ? `${playedN} jugados` : "—"}</span>
        </div>
        <div style={{ height: 6, borderRadius: 9999, background: "var(--muted)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "var(--primary)", borderRadius: 9999, transition: "width 320ms var(--ease-out)" }} />
        </div>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{scheduledN > 0 ? `${scheduledN} en cancha` : "Sin partidos en cancha"}</span>
      </div>

      {/* Puntos / promedio */}
      <div className="mp-grid-form-2 gap-3">
        {stat("Puntos totales", playedN > 0 ? String(totalPts) : "—")}
        {stat("Promedio/partido", playedN > 0 ? avg.toFixed(1) : "—")}
      </div>

      {/* Jugador en racha */}
      {streakName && (
        <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>Jugador en racha</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <Icon name="flame" size={14} color="#f97316" />
            <span style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{streakName}</span>
            <span className="tabular" style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: "var(--muted-fg)" }}>{streakN} seguidos</span>
          </span>
        </div>
      )}

      {/* Partido más reñido */}
      <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>Partido más reñido</span>
        {closest ? (
          <span className="font-heading tabular" style={{ fontSize: 15, fontWeight: 900 }}>
            {closest.a}<span style={{ color: "var(--primary)", margin: "0 3px" }}>–</span>{closest.b}
            {closest.court ? <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-fg)", marginLeft: 6 }}>· Cancha {closest.court}</span> : null}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>—</span>
        )}
      </div>

      {/* Partido más largo (por duración) */}
      <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>Partido más largo</span>
        {longest ? (
          <span className="font-heading tabular" style={{ fontSize: 15, fontWeight: 900 }}>
            {fmtDurMin(longest.ms)}
            {longest.court ? <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-fg)", marginLeft: 6 }}>· Cancha {longest.court}</span> : null}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>—</span>
        )}
      </div>
    </div>
  );
}

type GameViewCards = {
  roundNo: number;
  scheduledN: number;
  freeCourt: number | null;
  leaderName: string | null;
  leaderPf: number;
  leaderDiff: number | null;
  secondName: string | null;
  cierre: string | null;
};
type HistoryItem = { id: string; label: string; court: number | null; teamA: string[]; teamB: string[]; a: number; b: number; durationMs: number | null };

// Card "Partido anterior": último partido jugado por cancha, en modo tabla, con
// footer de botones numerados (uno por cancha) para navegar.
function LastMatchCard({ matches }: { matches: HistoryItem[] }) {
  const [idx, setIdx] = useState(0);
  const active = Math.min(idx, matches.length - 1);
  const match = matches[active];
  const rows = Math.max(match.teamA.length, match.teamB.length);
  const cell = (i: number, side: "l" | "r"): React.CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    color: "var(--fg)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
    padding: side === "r" ? "6px 12px 6px 0" : "6px 0 6px 12px",
    textAlign: side === "r" ? "right" : "left",
    borderBottom: i < rows - 1 ? "1px solid var(--border)" : undefined,
  });
  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1 }}>
          Partido anterior<span className="dot">.</span>
        </h3>
        <span className="font-heading tabular" style={{ flexShrink: 0, fontSize: 16, fontWeight: 900 }}>
          {match.a}<span style={{ color: "var(--primary)", margin: "0 3px" }}>–</span>{match.b}
        </span>
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
        Cancha {match.court ?? "—"} · {match.label}{match.durationMs != null ? ` · ${fmtDurMin(match.durationMs)}` : ""}
      </span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
        {match.teamA.map((name, i) => (
          <span key={`a${i}`} style={{ ...cell(i, "r"), gridColumn: 1, gridRow: i + 1 }}>{name}</span>
        ))}
        <span style={{ gridColumn: 2, gridRow: `1 / span ${rows}`, alignSelf: "stretch", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 12px", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)", fontSize: 9, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-fg)" }}>vs</span>
        {match.teamB.map((name, i) => (
          <span key={`b${i}`} style={{ ...cell(i, "l"), gridColumn: 3, gridRow: i + 1 }}>{name}</span>
        ))}
      </div>

      {/* Footer: una cancha por número */}
      {matches.length > 1 && (
        <div className="mp-touch-hscroll" style={{ display: "flex", gap: 4, justifyContent: "center", borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 2 }}>
          {matches.map((mm, i) => {
            const on = i === active;
            return (
              <button
                key={mm.id}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Cancha ${mm.court ?? i + 1}`}
                style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, border: on ? 0 : "1px solid var(--border)", background: on ? "var(--fg)" : "#fff", color: on ? "#fff" : "var(--muted-fg)", fontFamily: "var(--font-heading, inherit)", fontSize: 11, fontWeight: 900, cursor: "pointer", transition: "background 150ms var(--ease-out), color 150ms var(--ease-out)" }}
              >
                {mm.court ?? i + 1}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Contenido del tab "Partidos" (VISTA DE JUEGO): banner con carrusel grande, cards
// de estado, todas las canchas, historial, y a la derecha tabla + insight.
function PartidosTabView({
  matches,
  standings,
  insights,
  nameOf,
  seqWord,
  canReport,
  reporting,
  onReport,
  cards,
  history,
  lastPerCourt,
  showNextRound,
  showFillCourts,
  roundLabel,
  onNextRound,
  onFillCourts,
  roundBusy,
  showFinish,
  finishLabel = "Finalizar quedada",
  onFinish,
  isLocked,
  timerFrozenAt,
}: {
  matches: CourtMatch[];
  standings: StandingRow[];
  insights: InsightData;
  nameOf: (id: string) => string;
  seqWord: string;
  canReport: boolean;
  reporting: boolean;
  onReport: (gameId: string, a: number, b: number) => void;
  cards: GameViewCards;
  history: HistoryItem[];
  lastPerCourt: HistoryItem[];
  showNextRound: boolean;
  showFillCourts: boolean;
  roundLabel: string;
  onNextRound: () => void;
  onFillCourts: () => void;
  roundBusy: boolean;
  showFinish: boolean;
  finishLabel?: string;
  onFinish: () => void;
  isLocked: boolean;
  timerFrozenAt?: string | null;
}) {
  return (
    <div className="mp-tab-in" style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Columna izquierda */}
      <div style={{ flex: "1 1 460px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Banner VISTA DE JUEGO con carrusel grande */}
        <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--radius-mp-card, 14.4px)", padding: 22, background: "linear-gradient(135deg, #0a0a0a 0%, #18162e 58%, #3b0764 100%)", color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div className="label-mp" style={{ color: isLocked ? "var(--muted-fg)" : "var(--primary)" }}>
                {isLocked ? "● Finalizada" : "● En vivo"}
              </div>
              <h2 className="font-heading" style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                Vista de juego<span style={{ color: "#34d399" }}>.</span>
              </h2>
            </div>
            {showNextRound && (
              <HeaderBtn onClick={onNextRound} disabled={roundBusy} icon="arrow-right" tone="primary">
                Siguiente {roundLabel.toLowerCase()}
              </HeaderBtn>
            )}
            {showFillCourts && (
              <HeaderBtn onClick={onFillCourts} disabled={roundBusy} icon="layout-grid" tone="primary">
                Llenar canchas
              </HeaderBtn>
            )}
            {showFinish && (
              <HeaderBtn onClick={onFinish} disabled={roundBusy} icon="flag" tone="danger">
                {finishLabel}
              </HeaderBtn>
            )}
          </div>
          <MatchCarouselCard matches={matches} seqWord={seqWord} canReport={canReport} reporting={reporting} onReport={onReport} courtMaxWidth={620} courtNameSize={16} showPrev={false} emptyTitle="Canchas vacías" emptySub="Aún no hay partidos en cancha." timerFrozenAt={timerFrozenAt} />
        </div>

        {/* Cards de estado */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12 }}>
          <StatCard label="Ronda actual" value={cards.roundNo > 0 ? String(cards.roundNo) : "—"} sub={`${cards.scheduledN} partido${cards.scheduledN === 1 ? "" : "s"} en progreso`} />
          <StatCard label="Cancha libre" value={cards.freeCourt ? `Cancha ${cards.freeCourt}` : "—"} sub={cards.freeCourt ? "Lista para próxima rotación" : "Todas en juego"} />
          <StatCard label="Líder" value={cards.leaderName ? `${cards.leaderName} · ${cards.leaderPf} PF` : "—"} sub={cards.leaderDiff != null && cards.secondName ? `+${cards.leaderDiff} sobre ${cards.secondName}` : "Sin datos aún"} />
          <StatCard label="Cierre estimado" value={cards.cierre ?? "—"} sub={cards.cierre ? "Si no se añade ronda extra" : "Sin duración configurada"} />
        </div>

        {/* Todas las canchas */}
        <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1 }}>
            Todas las canchas<span className="dot">.</span>
          </h3>
          {matches.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Sin partidos en cancha.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px,1fr))", gap: 14 }}>
              {matches.map((m) => (
                <div key={m.gameId} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span className="font-heading" style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase" }}>Cancha {m.courtNo ?? "—"}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: m.played ? "var(--success-fg)" : "#b45309" }}>{m.played ? "Libre" : `${seqWord} ${m.seqNo}`}</span>
                  </div>
                  <CourtMatchup teamA={m.teamA} teamB={m.teamB} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 32, marginTop: 2 }}>
                    {m.played ? (
                      <span className="font-heading tabular" style={{ fontSize: 16, fontWeight: 900 }}>
                        {m.pointsA ?? 0}<span style={{ color: "var(--primary)", margin: "0 3px" }}>–</span>{m.pointsB ?? 0}
                      </span>
                    ) : canReport ? (
                      <ScoreEditor
                        key={m.gameId}
                        initialA={m.pointsA}
                        initialB={m.pointsB}
                        saving={reporting}
                        onSave={(a, b) => onReport(m.gameId, a, b)}
                        compact
                      />
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-fg)" }}>Por jugar</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Historial de partidos */}
        <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1 }}>
            Historial de partidos<span className="dot">.</span>
          </h3>
          {history.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Aún no hay partidos jugados.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {history.map((h, i) => (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 2px", borderBottom: i < history.length - 1 ? "1px solid var(--border)" : undefined }}>
                  <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted-fg)", minWidth: 64 }}>
                    {h.label}{h.court ? ` · C${h.court}` : ""}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.teamA.join(" + ")} <span style={{ color: "var(--muted-fg)" }}>vs</span> {h.teamB.join(" + ")}
                  </span>
                  {h.durationMs != null && <span style={{ flexShrink: 0, fontSize: 11, color: "var(--muted-fg)" }}>{fmtDurMin(h.durationMs)}</span>}
                  <span className="font-heading tabular" style={{ flexShrink: 0, fontSize: 14, fontWeight: 900 }}>
                    {h.a}<span style={{ color: "var(--primary)", margin: "0 2px" }}>–</span>{h.b}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Columna derecha: tabla + insight */}
      <div className="mp-quedada-side" style={{ maxWidth: "100%", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {lastPerCourt.length > 0 && <LastMatchCard matches={lastPerCourt} />}
        {standings.length > 0 && <StandingsCard rows={standings} nameOf={nameOf} />}
        <InsightCard {...insights} />
      </div>
    </div>
  );
}

// Iniciales para el avatar (2 letras).
function initialsOf(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

type QuedadaPlayerHistory = {
  appearances: number;
  timesPaid: number;
  totalPaidCents: number;
  payRatePct: number;
  attendanceRatePct: number;
  lastJoinedAt: string | null;
};

// Contenido del tab "Jugadores": banner + seguimiento (lista con rendimiento,
// estado, pago, categorías y reportar) + gestión de roster (SlotsSection).
function JugadoresTabView({ data, nameOf, onChanged }: { data: ManageData; nameOf: (id: string) => string; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const { ask, confirm } = usePromptModal();
  const readOnly = quedadaIsLocked(data.quedada.status);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reporting, startReport] = useTransition();
  // Asignación directa de cupo desde el chip "Sin cupo" (roster individual).
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [assigning, startAssign] = useTransition();
  // Ficha del jugador (historial en MIS quedadas).
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<QuedadaPlayerHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!historyFor) return;
    let alive = true;
    setHistory(null);
    setHistoryLoading(true);
    void getQuedadaPlayerHistory({ playerUserId: historyFor }).then((res) => {
      if (!alive) return;
      if (res.ok) setHistory(res.data);
      setHistoryLoading(false);
    });
    return () => { alive = false; };
  }, [historyFor]);

  const joined = data.participants.filter((p) => p.status === "joined");
  const walkIns = data.guests;
  const multiCat = data.categories.length > 1;
  const individualRoster = rosterModeFor(data.quedada.format, data.quedada.match_mode) === "individual";

  // Walk-ins: alta/baja manual de guests sin cuenta.
  const [walkInBusy, startWalkIn] = useTransition();
  const addWalkIn = async () => {
    const name = await ask({
      title: "Agregar walk-in",
      label: "Nombre del jugador",
      placeholder: "Ej. Carlos (llegó sin cuenta)",
      required: true,
      confirmLabel: "Agregar",
      validate: (v) => (v.trim().length < 1 ? "Escribe un nombre" : null),
    });
    if (name == null) return;
    startWalkIn(async () => {
      const res = await addQuedadaWalkIn({ quedadaId: data.quedada.id, name: name.trim() });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo agregar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Walk-in agregado", sub: "Asígnale un cupo para que juegue." });
      await onChanged();
    });
  };
  const removeWalkIn = async (guestId: string) => {
    const ok = await confirm({
      title: "Quitar walk-in",
      body: `¿Quitar a ${nameOf(guestId)} de la quedada? Se libera su cupo.`,
      confirmLabel: "Quitar",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    startWalkIn(async () => {
      const res = await removeQuedadaWalkIn({ quedadaId: data.quedada.id, guestId });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo quitar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Walk-in quitado" });
      await onChanged();
    });
  };

  // Categorías con al menos un cupo libre (para el picker de asignación directa).
  // Devuelve [{ id, name, freeSlot }] con el cupo libre más bajo.
  const categoriesWithFreeSlot = data.categories
    .map((c) => {
      const occupied = new Set(data.pairs.filter((pr) => pr.category_id === c.id).map((pr) => pr.slot_no));
      const max = c.max_slots ?? 0;
      let freeSlot = 0;
      for (let n = 1; n <= max; n++) if (!occupied.has(n)) { freeSlot = n; break; }
      return { id: c.id, name: c.name, freeSlot };
    })
    .filter((c) => c.freeSlot > 0);

  const assignToCategory = (userId: string, categoryId: string, slotNo: number) => {
    startAssign(async () => {
      const res = await assignPair({ quedadaId: data.quedada.id, categoryId, slotNo, playerAId: userId, playerBId: null });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo asignar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Jugador asignado al cupo" });
      setAssignFor(null);
      await onChanged();
    });
  };

  // Categorías por jugador (puede estar en varias → cada una es un pago).
  const catsByPlayer = new Map<string, Set<string>>();
  for (const pr of data.pairs) {
    const add = (id: string | null) => {
      if (!id) return;
      const s = catsByPlayer.get(id) ?? new Set<string>();
      s.add(pr.category_id);
      catsByPlayer.set(id, s);
    };
    add(pr.player_a_id);
    add(pr.player_b_id);
  }
  const catCount = (uid: string) => catsByPlayer.get(uid)?.size ?? 0;

  const busy = new Set<string>();
  // Partidos jugados / pendientes por jugador en ESTA quedada (seguimiento
  // operativo, no ranking competitivo: nada de victorias / diferencia).
  const playedById = new Map<string, number>();
  const pendingById = new Map<string, number>();
  for (const g of data.games) {
    const players = [g.side_a_p1, g.side_a_p2, g.side_b_p1, g.side_b_p2].filter(Boolean) as string[];
    if (g.status === "scheduled") players.forEach((x) => busy.add(x));
    for (const uid of players) {
      if (g.status === "played") playedById.set(uid, (playedById.get(uid) ?? 0) + 1);
      else if (g.status === "scheduled") pendingById.set(uid, (pendingById.get(uid) ?? 0) + 1);
    }
  }
  const catNameById = new Map(data.categories.map((c) => [c.id, c.name]));
  const catNamesFor = (uid: string) => [...(catsByPlayer.get(uid) ?? [])].map((id) => catNameById.get(id) ?? "—");

  const term = query.trim().toLowerCase();
  // Lista unificada de seguimiento: inscritos con cuenta + walk-ins (guests).
  type RosterRow = { id: string; paid: boolean; isWalkIn: boolean };
  const rosterRows: RosterRow[] = [
    ...joined.map((p) => ({ id: p.user_id, paid: p.paid, isWalkIn: false })),
    ...walkIns.map((g) => ({ id: g.id, paid: g.paid, isWalkIn: true })),
  ];
  const filtered = rosterRows.filter((r) => {
    if (cat !== "all" && !catsByPlayer.get(r.id)?.has(cat)) return false;
    if (term && !nameOf(r.id).toLowerCase().includes(term)) return false;
    return true;
  });

  // Chip de seguimiento: tono neutro / éxito / aviso según el estado.
  const chip = (label: string, tone: "neutral" | "ok" | "warn" = "neutral") => {
    const palette = {
      neutral: { bg: "var(--muted)", fg: "var(--muted-fg)", bd: "var(--border)" },
      ok: { bg: "var(--success-bg, #ecfdf5)", fg: "var(--success-fg)", bd: "var(--success-border, #a7f3d0)" },
      warn: { bg: "#fff7ed", fg: "#b45309", bd: "#fed7aa" },
    }[tone];
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 9999, fontSize: 11, fontWeight: 700, background: palette.bg, color: palette.fg, border: `1px solid ${palette.bd}`, whiteSpace: "nowrap" }}>
        {label}
      </span>
    );
  };

  const submitReport = () => {
    if (!reportFor || reporting) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      toast({ icon: "alert-triangle", title: "Escribe al menos 3 caracteres" });
      return;
    }
    const name = reportFor ? nameOf(reportFor) : "";
    startReport(async () => {
      const res = await reportQuedada({
        quedadaId: data.quedada.id,
        reason: `Jugador reportado: ${name} (${reportFor}). Motivo: ${trimmed}`,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo reportar", sub: res.error.message });
        return;
      }
      setReportFor(null);
      setReason("");
      toast({ icon: "flag", title: "Reporte enviado", sub: "Gracias, lo revisaremos." });
    });
  };

  return (
    <div className="mp-tab-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Banner */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--radius-mp-card, 14.4px)", padding: 22, background: "linear-gradient(135deg, #0a0a0a 0%, #18162e 58%, #3b0764 100%)", color: "#fff" }}>
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Gestión</div>
        <h2 className="font-heading" style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
          Jugadores<span style={{ color: "#34d399" }}>.</span>
        </h2>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", marginTop: 8 }}>
          {joined.length} inscrito{joined.length === 1 ? "" : "s"}
          {walkIns.length > 0 ? ` · ${walkIns.length} walk-in${walkIns.length === 1 ? "" : "s"}` : ""}
          {data.categories.length > 0 ? ` · ${data.categories.length} categoría${data.categories.length === 1 ? "" : "s"}` : ""}
        </div>
      </div>

      {/* Seguimiento + gestión de roster en 2 columnas (igual que el resto del panel) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 16, alignItems: "start" }}>
      {/* Seguimiento a jugadores */}
      <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1 }}>
            Seguimiento a jugadores<span className="dot">.</span>
          </h3>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{filtered.length} de {rosterRows.length}</span>
        </div>

        {/* Buscar + walk-in + filtro por categoría */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div style={{ flex: "1 1 200px", minWidth: 0, display: "flex", alignItems: "center", gap: 8, background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 9999, padding: "8px 14px" }}>
            <Icon name="search" size={14} color="var(--muted-fg)" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar jugador…" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 13, color: "var(--fg)" }} />
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => void addWalkIn()}
              disabled={walkInBusy}
              className="btn"
              title="Agrega a alguien que llegó sin cuenta MatchPoint"
              style={{ background: "#fff", border: "1px solid var(--border)", whiteSpace: "nowrap", opacity: walkInBusy ? 0.6 : 1 }}
            >
              <Icon name="user-plus" size={13} /> Agregar walk-in
            </button>
          )}
          {multiCat && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[{ id: "all", name: "Todas" }, ...data.categories.map((c) => ({ id: c.id, name: c.name }))].map((c) => {
                const on = cat === c.id;
                return (
                  <button key={c.id} type="button" onClick={() => setCat(c.id)} style={{ padding: "6px 12px", borderRadius: 9999, border: on ? 0 : "1px solid var(--border)", background: on ? "var(--fg)" : "#fff", color: on ? "#fff" : "var(--muted-fg)", fontFamily: "inherit", fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{c.name}</button>
                );
              })}
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted-fg)", padding: "8px 2px" }}>No hay jugadores que coincidan.</div>
        ) : (
          filtered.map((r, i) => {
            const inCourt = busy.has(r.id);
            const played = playedById.get(r.id) ?? 0;
            const pending = pendingById.get(r.id) ?? 0;
            const nc = catCount(r.id);
            const catNames = catNamesFor(r.id);
            const canAssign = !readOnly && nc === 0 && individualRoster && categoriesWithFreeSlot.length > 0;
            const picking = assignFor === r.id;
            return (
              <div key={r.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : undefined }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 2px" }}>
                <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", background: "var(--muted)", border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading, inherit)", fontSize: 12, fontWeight: 900, color: "var(--fg)" }}>{initialsOf(nameOf(r.id))}</span>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(r.id)}</span>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {r.isWalkIn && chip("Walk-in")}
                    {chip(inCourt ? "En cancha" : "En banca", inCourt ? "warn" : "neutral")}
                    {chip(r.paid ? "Pagado" : "Pago pendiente", r.paid ? "ok" : "warn")}
                    {chip(pending > 0 ? `${played} jugados · ${pending} por jugar` : `${played} jugado${played === 1 ? "" : "s"}`)}
                    {nc === 0
                      ? canAssign
                        ? (
                          <button
                            type="button"
                            onClick={() => setAssignFor(picking ? null : r.id)}
                            title="Asignar a un cupo"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 9999, fontSize: 11, fontWeight: 700, background: picking ? "var(--fg)" : "#fff7ed", color: picking ? "#fff" : "#b45309", border: `1px solid ${picking ? "var(--fg)" : "#fed7aa"}`, cursor: "pointer", whiteSpace: "nowrap" }}
                          >
                            <Icon name="plus" size={12} color={picking ? "#fff" : "#b45309"} /> Asignar cupo
                          </button>
                        )
                        : chip("Sin cupo", "warn")
                      : multiCat
                        ? chip(catNames.join(" · "))
                        : chip("Con cupo", "ok")}
                  </span>
                </span>
                {!r.isWalkIn && (
                  <button
                    type="button"
                    onClick={() => setHistoryFor(r.id)}
                    aria-label={`Ver historial de ${nameOf(r.id)}`}
                    title="Ver su historial en tus quedadas"
                    style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 9999, border: "1px solid var(--border)", background: "#fff", cursor: "pointer" }}
                  >
                    <Icon name="history" size={13} color="var(--muted-fg)" />
                  </button>
                )}
                {!readOnly && !r.isWalkIn && (
                  <button
                    type="button"
                    onClick={() => { setReportFor(r.id); setReason(""); }}
                    aria-label={`Reportar a ${nameOf(r.id)}`}
                    title="Reportar comportamiento indebido"
                    style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 9999, border: "1px solid var(--border)", background: "#fff", cursor: "pointer" }}
                  >
                    <Icon name="flag" size={13} color="var(--muted-fg)" />
                  </button>
                )}
                {!readOnly && r.isWalkIn && (
                  <button
                    type="button"
                    onClick={() => void removeWalkIn(r.id)}
                    disabled={walkInBusy}
                    aria-label={`Quitar a ${nameOf(r.id)}`}
                    title="Quitar walk-in de la quedada"
                    style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 9999, border: "1px solid var(--border)", background: "#fff", cursor: walkInBusy ? "default" : "pointer", opacity: walkInBusy ? 0.6 : 1 }}
                  >
                    <Icon name="x" size={13} color="var(--muted-fg)" />
                  </button>
                )}
                </div>
                {picking && (
                  <div className="mp-tab-in" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 2px 12px 46px" }}>
                    <span style={{ fontSize: 11, color: "var(--muted-fg)", alignSelf: "center" }}>Asignar a:</span>
                    {categoriesWithFreeSlot.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={assigning}
                        onClick={() => assignToCategory(r.id, c.id, c.freeSlot)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 11px", borderRadius: 9999, fontSize: 11, fontWeight: 800, background: "#fff", color: "var(--fg)", border: "1px solid var(--border)", cursor: assigning ? "default" : "pointer", opacity: assigning ? 0.6 : 1, whiteSpace: "nowrap" }}
                      >
                        {c.name} <span style={{ color: "var(--muted-fg)" }}>· cupo {c.freeSlot}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Gestión de roster (asignar a categorías / cupos) */}
      <SlotsSection data={data} onChanged={onChanged} />
      </div>

      {/* Modal de reporte (solo UI por ahora) */}
      {reportFor && (
        <div className="mp-modal-backdrop" onClick={() => setReportFor(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="mp-modal-panel card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, padding: 22, display: "flex", flexDirection: "column", gap: 12, background: "#fff" }}>
            <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1 }}>
              Reportar jugador<span className="dot">.</span>
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)" }}>
              Reportando a <b style={{ color: "var(--fg)" }}>{nameOf(reportFor)}</b> por comportamiento indebido.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo del reporte (opcional)…"
              rows={3}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10, fontFamily: "inherit", fontSize: 13, outline: "none", background: "#fff", color: "var(--fg)", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setReportFor(null)} disabled={reporting} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>Cancelar</button>
              <button type="button" onClick={submitReport} disabled={reporting} className="btn" style={{ background: "#dc2626", color: "#fff", border: "1px solid #dc2626", opacity: reporting ? 0.65 : 1 }}>
                <Icon name="flag" size={13} color="#fff" /> {reporting ? "Enviando…" : "Reportar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ficha del jugador: su historial en TUS quedadas */}
      {historyFor && (
        <div className="mp-modal-backdrop" onClick={() => setHistoryFor(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="mp-modal-panel card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, padding: 22, display: "flex", flexDirection: "column", gap: 14, background: "#fff" }}>
            <div>
              <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1 }}>
                {nameOf(historyFor)}<span className="dot">.</span>
              </h3>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>Su historial en todas tus quedadas.</p>
            </div>
            {historyLoading || !history ? (
              <div className="mp-grid-form-2 gap-2.5">
                {[0, 1, 2, 3].map((i) => <SkBar key={i} w="100%" h={52} r={10} />)}
              </div>
            ) : history.appearances === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--muted-fg)" }}>Aún no ha participado en ninguna de tus quedadas.</div>
            ) : (
              <>
                <div className="mp-grid-form-2 gap-2.5">
                  <div style={{ border: "1px solid var(--border)", borderRadius: 11, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-fg)" }}>Participaciones</span>
                    <span className="font-heading tabular" style={{ fontSize: 20, fontWeight: 900 }}>{history.appearances}</span>
                  </div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 11, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-fg)" }}>Total pagado</span>
                    <span className="font-heading tabular" style={{ fontSize: 20, fontWeight: 900, color: "var(--success-fg)" }}>{money(history.totalPaidCents)}</span>
                  </div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 11, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-fg)" }}>% de pago</span>
                    <span className="font-heading tabular" style={{ fontSize: 20, fontWeight: 900, color: history.payRatePct >= 80 ? "var(--success-fg)" : history.payRatePct >= 40 ? "#b45309" : "var(--destructive-border)" }}>{history.payRatePct}%</span>
                  </div>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 11, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-fg)" }}>% asistencia</span>
                    <span className="font-heading tabular" style={{ fontSize: 20, fontWeight: 900 }}>{history.attendanceRatePct}%</span>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
                  Pagó {history.timesPaid} de {history.appearances} vez{history.appearances === 1 ? "" : "es"}.
                </div>
              </>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setHistoryFor(null)} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Skeleton del body mientras carga (espejo aproximado del tab Resumen).
function ManageSkeleton() {
  return (
    <>
      <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", gap: 9 }}>
              <SkBar w={30} h={30} r={8} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <SkBar w="50%" h={8} r={4} />
                <SkBar w="80%" h={12} r={5} />
              </div>
            </div>
          ))}
        </div>
        <SkBar w="92%" h={10} r={5} />
        <SkBar w="68%" h={10} r={5} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px,1fr))", gap: 18 }}>
        {[0, 1].map((i) => (
          <div key={i} className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <SkBar w={140} h={14} r={6} />
            <SkBar h={44} r={10} />
            <SkBar w="60%" h={12} r={5} />
          </div>
        ))}
      </div>
    </>
  );
}

function centsToInput(cents: number | null): string {
  if (cents == null) return "";
  const n = cents / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
function dollarsToCents(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
function money(cents: number): string {
  const n = cents / 100;
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}
function nameOf(p: { display_name: string | null; username: string | null } | null): string {
  if (!p) return "Jugador";
  return p.display_name || (p.username ? `@${p.username}` : "Jugador");
}
// Tiempo relativo legible respecto a una fecha ISO.
function relSpan(absMs: number): string {
  const mins = Math.round(absMs / 60000);
  const hours = Math.floor(absMs / 3600000);
  const days = Math.floor(absMs / 86400000);
  return days >= 1 ? `${days} día${days > 1 ? "s" : ""}` : hours >= 1 ? `${hours} h` : `${Math.max(1, mins)} min`;
}
// Respecto a `starts_at` programado ("Empieza en 3 días" / pasado genérico).
function startRel(iso: string): string | undefined {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  const diff = t - Date.now();
  const future = diff >= 0;
  const span = relSpan(Math.abs(diff));
  return future ? `Empieza en ${span}` : `Empezó hace ${span}`;
}
function elapsedRel(iso: string, prefix = "Empezó hace"): string | undefined {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return undefined;
  const diff = Date.now() - t;
  if (diff < 0) return undefined;
  return `${prefix} ${relSpan(diff)}`;
}
// Subtítulo del card Estado: en vivo usa live_at; antes de iniciar, la fecha programada.
function estadoSub(q: ManageQuedada): string | undefined {
  if (q.status === "finished") return "Podio publicado";
  if (q.status === "live") {
    return q.live_at ? elapsedRel(q.live_at) : undefined;
  }
  if (q.status === "registration_closed") {
    const t = Date.parse(q.starts_at);
    if (!Number.isNaN(t) && t <= Date.now()) return "Lista para iniciar";
    return startRel(q.starts_at);
  }
  return startRel(q.starts_at);
}
function hourLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}


export function QuedadaManagePanel({ quedadaId }: { quedadaId: string }) {
  const router = useRouter();
  // "Volver" navega a la lista de quedadas.
  const close = () => router.push("/dashboard/user/quedadas");
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [busy, startBusy] = useTransition();
  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("resumen");
  const [section, setSection] = useState<"gestion" | "juego">("gestion");
  // Tabs de nivel de página (arriba del banner): cambian toda la interfaz.
  const [pageTab, setPageTab] = useState<"resumen" | "partidos" | "roster" | "pagos" | "config">("resumen");
  const [viewCategoryId, setViewCategoryId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await getQuedadaManageData({ quedadaId });
    if (!res.ok) {
      setLoadError(res.error.message);
      setLoading(false);
      return;
    }
    setData(res.data as ManageData);
    setLoadError(null);
    setLoading(false);
  }, [quedadaId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Refresca estado tras una mutación exitosa + refresca el árbol del server.
  const afterMutation = useCallback(async () => {
    await reload();
    router.refresh();
  }, [reload, router]);

  // Realtime: si otro (creador / co-host) asigna parejas o marca pagos, el panel
  // se refetchea solo. Datos son client-side (getQuedadaManageData) → usamos
  // onChange + reload (no router.refresh), con debounce para ráfagas.
  const rtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtimeRefresh(
    [
      { table: "quedada_pairs", filter: `quedada_id=eq.${quedadaId}` },
      { table: "quedada_participants", filter: `quedada_id=eq.${quedadaId}` },
      { table: "quedada_guests", filter: `quedada_id=eq.${quedadaId}` },
      { table: "quedada_categories", filter: `quedada_id=eq.${quedadaId}` },
      { table: "quedada_rounds", filter: `quedada_id=eq.${quedadaId}` },
      { table: "quedada_games", filter: `quedada_id=eq.${quedadaId}` },
      { table: "quedadas", filter: `id=eq.${quedadaId}` },
    ],
    {
      enabled: !!data?.canManage,
      onChange: () => {
        if (rtTimer.current) clearTimeout(rtTimer.current);
        rtTimer.current = setTimeout(() => void reload(), 400);
      },
    },
  );

  // Toggle de pago OPTIMISTA: marca al instante en el estado local y guarda en
  // segundo plano (sin reload ni router.refresh). Solo revierte si falla. Esto
  // hace el check-in inmediato (antes esperaba un re-fetch completo).
  const togglePaid = useCallback(
    (userId: string) => {
      // Walk-in (guest): mismo toggle optimista contra quedada_guests.
      const guest = data?.guests.find((g) => g.id === userId);
      if (guest) {
        const gCur = guest.paid;
        const gNext = !gCur;
        setData((d) =>
          d ? { ...d, guests: d.guests.map((g) => (g.id === userId ? { ...g, paid: gNext } : g)) } : d,
        );
        void setGuestPaid({ quedadaId, guestId: userId, paid: gNext }).then((res) => {
          if (!res.ok) {
            setData((d) =>
              d ? { ...d, guests: d.guests.map((g) => (g.id === userId ? { ...g, paid: gCur } : g)) } : d,
            );
            toast({ icon: "alert-triangle", title: "No se pudo actualizar el pago", sub: res.error.message });
          }
        });
        return;
      }
      const cur = data?.participants.find((p) => p.user_id === userId)?.paid ?? false;
      const next = !cur;
      setData((d) =>
        d ? { ...d, participants: d.participants.map((p) => (p.user_id === userId ? { ...p, paid: next } : p)) } : d,
      );
      void setParticipantPaid({ quedadaId, userId, paid: next }).then((res) => {
        if (!res.ok) {
          setData((d) =>
            d ? { ...d, participants: d.participants.map((p) => (p.user_id === userId ? { ...p, paid: cur } : p)) } : d,
          );
          toast({ icon: "alert-triangle", title: "No se pudo actualizar el pago", sub: res.error.message });
        }
      });
    },
    [data, quedadaId, toast],
  );

  // Marca/desmarca a TODOS los inscritos de una (optimista; best-effort).
  const setAllPaid = useCallback(
    (paid: boolean) => {
      const targets = (data?.participants ?? []).filter((p) => p.status === "joined" && p.paid !== paid);
      const guestTargets = (data?.guests ?? []).filter((g) => g.paid !== paid);
      if (targets.length === 0 && guestTargets.length === 0) return;
      setData((d) =>
        d
          ? {
              ...d,
              participants: d.participants.map((p) => (p.status === "joined" ? { ...p, paid } : p)),
              guests: d.guests.map((g) => ({ ...g, paid })),
            }
          : d,
      );
      Promise.all([
        ...targets.map((t) => setParticipantPaid({ quedadaId, userId: t.user_id, paid })),
        ...guestTargets.map((g) => setGuestPaid({ quedadaId, guestId: g.id, paid })),
      ]).then((results) => {
        if (results.some((r) => !r.ok)) {
          toast({ icon: "alert-triangle", title: "Algunos pagos no se guardaron", sub: "Recarga para ver el estado real." });
        }
      });
    },
    [data, quedadaId, toast],
  );

  // Check-in de asistencia (informativo; optimista, best-effort).
  const toggleCheckedIn = useCallback(
    (userId: string) => {
      // Walk-in (guest): check-in contra quedada_guests.
      const guest = data?.guests.find((g) => g.id === userId);
      if (guest) {
        const gCur = !!guest.checked_in_at;
        const gNext = gCur ? null : new Date().toISOString();
        setData((d) =>
          d ? { ...d, guests: d.guests.map((g) => (g.id === userId ? { ...g, checked_in_at: gNext } : g)) } : d,
        );
        void setGuestCheckedIn({ quedadaId, guestId: userId, checkedIn: !gCur }).then((res) => {
          if (!res.ok) {
            setData((d) =>
              d ? { ...d, guests: d.guests.map((g) => (g.id === userId ? { ...g, checked_in_at: gCur ? new Date().toISOString() : null } : g)) } : d,
            );
            toast({ icon: "alert-triangle", title: "No se pudo registrar el check-in", sub: res.error.message });
          }
        });
        return;
      }
      const cur = !!data?.participants.find((p) => p.user_id === userId)?.checked_in_at;
      const next = cur ? null : new Date().toISOString();
      setData((d) =>
        d ? { ...d, participants: d.participants.map((p) => (p.user_id === userId ? { ...p, checked_in_at: next } : p)) } : d,
      );
      void setParticipantCheckedIn({ quedadaId, userId, checkedIn: !cur }).then((res) => {
        if (!res.ok) {
          setData((d) =>
            d ? { ...d, participants: d.participants.map((p) => (p.user_id === userId ? { ...p, checked_in_at: cur ? new Date().toISOString() : null } : p)) } : d,
          );
          toast({ icon: "alert-triangle", title: "No se pudo registrar el check-in", sub: res.error.message });
        }
      });
    },
    [data, quedadaId, toast],
  );

  const setAllCheckedInLocal = useCallback(
    (checkedIn: boolean) => {
      const targets = (data?.participants ?? []).filter((p) => p.status === "joined" && !!p.checked_in_at !== checkedIn);
      const guestTargets = (data?.guests ?? []).filter((g) => !!g.checked_in_at !== checkedIn);
      if (targets.length === 0 && guestTargets.length === 0) return;
      const stamp = checkedIn ? new Date().toISOString() : null;
      setData((d) =>
        d
          ? {
              ...d,
              participants: d.participants.map((p) => (p.status === "joined" ? { ...p, checked_in_at: stamp } : p)),
              guests: d.guests.map((g) => ({ ...g, checked_in_at: stamp })),
            }
          : d,
      );
      Promise.all([
        setAllCheckedIn({ quedadaId, checkedIn }),
        ...guestTargets.map((g) => setGuestCheckedIn({ quedadaId, guestId: g.id, checkedIn })),
      ]).then((results) => {
        if (results.some((r) => !r.ok)) toast({ icon: "alert-triangle", title: "Algunos check-ins no se guardaron", sub: "Recarga para ver el estado real." });
      });
    },
    [data, quedadaId, toast],
  );

  // Aviso de pago a los pendientes (notif + DM, cooldown 30min server-side).
  const remindPayment = useCallback(
    (userIds?: string[]) => {
      startBusy(async () => {
        const res = await remindQuedadaPayment({ quedadaId, userIds });
        if (!res.ok) {
          toast({ icon: "alert-triangle", title: "No se pudo enviar el aviso", sub: res.error.message });
          return;
        }
        const { sent, skipped } = res.data;
        if (sent === 0 && skipped > 0) {
          toast({ icon: "clock", title: "Aviso en cooldown", sub: `${skipped} ya recibieron un aviso hace menos de 30 min.` });
        } else {
          toast({ icon: "check", title: `Aviso enviado a ${sent}`, sub: skipped > 0 ? `${skipped} en cooldown (< 30 min).` : undefined });
        }
        await afterMutation();
      });
    },
    [quedadaId, toast, afterMutation, startBusy],
  );

  // Transiciones de estado (creador): cerrar inscripciones / iniciar / reabrir.
  const changeStatus = (status: "registration_open" | "registration_closed" | "live") => {
    startBusy(async () => {
      const res = await setQuedadaStatus({ quedadaId, status });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo cambiar el estado", sub: res.error.message });
        return;
      }
      if (status === "live" && res.data.bootstrapped) {
        const b = res.data.bootstrapped;
        const roundWord = q ? getQuedadaEngine(q.format).roundLabel : "Ronda";
        toast({
          icon: "check-circle-2",
          title: "Quedada en vivo",
          sub: `${roundWord} ${b.roundNo} armada · ${b.created} partido${b.created === 1 ? "" : "s"}${b.byes > 0 ? ` · ${b.byes} descansan` : ""}`,
        });
      } else {
        toast({ icon: "check", title: status === "live" ? "Quedada en vivo" : "Estado actualizado" });
      }
      await afterMutation();
    });
  };
  const doCancel = async () => {
    const ok = await confirm({
      title: "Cancelar quedada",
      body: `¿Cancelar “${data?.quedada.title ?? "esta quedada"}”? Se avisa a los inscritos y no se puede deshacer.`,
      confirmLabel: "Cancelar quedada",
      cancelLabel: "No, volver",
      destructive: true,
    });
    if (!ok) return;
    startBusy(async () => {
      const res = await cancelQuedada({ quedadaId });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Quedada cancelada" });
      await afterMutation();
    });
  };

  const doFinishQuedada = async () => {
    if (!data || !q) return;
    const sorted = [...data.categories].sort((a, b) => a.sort_order - b.sort_order);
    const active =
      sorted.find((c) => categoryFlowStatus(c, q.status) === "active") ??
      sorted.find((c) => categoryFlowStatus(c, q.status) !== "finished") ??
      sorted[0] ??
      null;
    if (!active) {
      toast({ icon: "alert-triangle", title: "Sin categoría activa" });
      return;
    }
    const hasNext = sorted.some((c) => categoryFlowStatus(c, q.status) === "scheduled");
    const multi = sorted.length > 1;
    const ok = await confirm({
      title: multi && hasNext ? "Finalizar categoría" : "Finalizar quedada",
      body:
        multi && hasNext
          ? `Se publica el podio de «${active.name}» y pasas a la siguiente categoría. ¿Continuar?`
          : "Se calcula el podio según la tabla de posiciones y cierras la quedada. ¿Finalizar ahora?",
      confirmLabel: multi && hasNext ? "Finalizar y continuar" : "Finalizar y publicar podio",
      cancelLabel: "Seguir jugando",
    });
    if (!ok) return;
    startBusy(async () => {
      const res = await finishQuedadaCategory({ quedadaId, categoryId: active.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo finalizar", sub: res.error.message });
        return;
      }
      if (res.data.quedadaFinished) {
        toast({ icon: "trophy", title: "Quedada finalizada", sub: "El podio ya está publicado en el resumen." });
        setPageTab("resumen");
      } else {
        toast({
          icon: "trophy",
          title: `Podio de «${active.name}» publicado`,
          sub: res.data.nextCategoryName ? `Siguiente: ${res.data.nextCategoryName}` : undefined,
        });
        if (res.data.nextCategoryId) setViewCategoryId(res.data.nextCategoryId);
        setPageTab("partidos");
      }
      await afterMutation();
    });
  };

  const q = data?.quedada ?? null;
  const isQuedadaLocked = q != null && quedadaIsLocked(q.status);
  const joinedCount = data ? data.participants.filter((p) => p.status === "joined").length : 0;
  const paidCount = data ? data.participants.filter((p) => p.paid).length : 0;
  const sm = q ? quedadaStatusMeta(q.status) : null;
  const engine = q ? getQuedadaEngine(q.format) : null;

  const sortedCategories = data ? [...data.categories].sort((a, b) => a.sort_order - b.sort_order) : [];
  const activeCategory =
    sortedCategories.find((c) => categoryFlowStatus(c, q?.status ?? "") === "active") ??
    sortedCategories.find((c) => categoryFlowStatus(c, q?.status ?? "") !== "finished") ??
    sortedCategories[0] ??
    null;
  const viewCategory = sortedCategories.find((c) => c.id === viewCategoryId) ?? activeCategory;
  const multiCategory = sortedCategories.length > 1;
  const hasNextCategory = sortedCategories.some((c) => categoryFlowStatus(c, q?.status ?? "") === "scheduled");
  const finishActionLabel = multiCategory && hasNextCategory ? "Finalizar categoría" : "Finalizar quedada";
  const viewCategoryIsActive = viewCategory != null && categoryFlowStatus(viewCategory, q?.status ?? "") === "active";

  useEffect(() => {
    if (!viewCategoryId && activeCategory) setViewCategoryId(activeCategory.id);
  }, [viewCategoryId, activeCategory?.id]);

  // Categoría en pantalla (selector) vs categoría activa (motor / finalizar).
  const mainCategory = viewCategory;

  // Ronda actual (la más alta generada en la categoría principal) — para el
  // texto "Ronda N en vivo" del card Estado.
  const nameById = (id: string): string => {
    const guest = data?.guests.find((g) => g.id === id);
    if (guest) return guest.display_name;
    return nameOf(data?.participants.find((p) => p.user_id === id)?.profiles ?? null);
  };
  const avatarById = (id: string): string | null =>
    data?.participants.find((p) => p.user_id === id)?.profiles?.avatar_url ?? null;
  const catGames = data && mainCategory ? data.games.filter((g) => g.category_id === mainCategory.id) : [];
  const activeCatGames = data && activeCategory ? data.games.filter((g) => g.category_id === activeCategory.id) : [];
  const hasPlayedGames = activeCatGames.some((g) => g.status === "played");
  const currentRoundNo = catGames.reduce((m, g) => Math.max(m, g.round_no ?? 0), 0);
  const isRolling = q?.engine_mode === "rolling";
  const seqWord = isRolling ? "Partido" : engine?.roundLabel ?? "Ronda";

  const sideNames = (g: ManageGame, side: "a" | "b"): string[] =>
    (side === "a" ? [g.side_a_p1, g.side_a_p2] : [g.side_b_p1, g.side_b_p2])
      .filter((x): x is string => !!x)
      .map(nameById);
  const seqOf = (g: ManageGame): number => (isRolling ? g.court_match_no ?? 0 : g.round_no ?? 0);
  const toMatch = (g: ManageGame, prev: ManageGame | null): CourtMatch => ({
    gameId: g.id,
    seqNo: seqOf(g),
    courtNo: g.court_no,
    teamA: sideNames(g, "a"),
    teamB: sideNames(g, "b"),
    played: g.status === "played",
    pointsA: g.points_a,
    pointsB: g.points_b,
    startedAt: g.created_at,
    prev: prev
      ? {
          gameId: prev.id,
          seqNo: seqOf(prev),
          teamA: sideNames(prev, "a"),
          teamB: sideNames(prev, "b"),
          pointsA: prev.points_a,
          pointsB: prev.points_b,
          durationMs: Date.parse(prev.updated_at) - Date.parse(prev.created_at) || null,
          played: prev.status === "played",
        }
      : null,
  });

  // Carrusel: un slide por cancha. Por cada cancha, el ÚLTIMO partido es el actual
  // y el anterior es el historial (catGames viene ordenado por created_at asc).
  const courtMatches: CourtMatch[] = (() => {
    if (!data || !engine || !mainCategory) return [];
    const locked = q != null && quedadaIsLocked(q.status);
    const byCourt = new Map<number, ManageGame[]>();
    for (const g of catGames) {
      if (g.court_no == null) continue;
      const arr = byCourt.get(g.court_no);
      if (arr) arr.push(g);
      else byCourt.set(g.court_no, [g]);
    }
    return [...byCourt.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, list]) => {
        const played = list.filter((g) => g.status === "played");
        const current = locked ? played[played.length - 1] : list[list.length - 1];
        if (!current) return null;
        const prevIdx = locked
          ? played.length > 1
            ? played.length - 2
            : -1
          : list.length > 1
            ? list.length - 2
            : -1;
        const prevGame = prevIdx >= 0 ? (locked ? played[prevIdx] : list[prevIdx]) : null;
        return toMatch(current, prevGame);
      })
      .filter((m): m is CourtMatch => m != null);
  })();

  // Insights del juego (derivados de los games de la categoría principal).
  const insights = (() => {
    const played = catGames.filter((g) => g.status === "played");
    const scheduledN = catGames.filter((g) => g.status === "scheduled").length;
    const totalPts = played.reduce((s, g) => s + (g.points_a ?? 0) + (g.points_b ?? 0), 0);
    const avg = played.length ? totalPts / played.length : 0;
    // Partido más reñido: menor diferencia; a igual diferencia, el de mayor puntaje
    // total (un 11–11 fue más peleado que un 4–4).
    let closest: { a: number; b: number; court: number | null } | null = null;
    let bestDiff = Infinity;
    let bestTotal = -1;
    for (const g of played) {
      const a = g.points_a ?? 0;
      const b = g.points_b ?? 0;
      const d = Math.abs(a - b);
      const tot = a + b;
      if (d < bestDiff || (d === bestDiff && tot > bestTotal)) {
        bestDiff = d;
        bestTotal = tot;
        closest = { a, b, court: g.court_no };
      }
    }

    // Jugador en racha: más victorias CONSECUTIVAS contando desde su último partido.
    // catGames viene en orden cronológico (created_at asc).
    const results = new Map<string, boolean[]>();
    for (const g of played) {
      const a = g.points_a ?? 0;
      const b = g.points_b ?? 0;
      const aWon = a > b;
      const push = (ids: (string | null)[], won: boolean) =>
        ids.filter((x): x is string => !!x).forEach((id) => {
          const arr = results.get(id) ?? [];
          arr.push(won);
          results.set(id, arr);
        });
      push([g.side_a_p1, g.side_a_p2], aWon);
      push([g.side_b_p1, g.side_b_p2], !aWon && b > a);
    }
    let streak: { id: string; n: number } | null = null;
    for (const [id, arr] of results) {
      let s = 0;
      for (let i = arr.length - 1; i >= 0 && arr[i]; i--) s++;
      if (s > 1 && (!streak || s > streak.n)) streak = { id, n: s };
    }

    // Partido más largo (por duración: updated_at − created_at).
    let longest: { ms: number; court: number | null } | null = null;
    for (const g of played) {
      const ms = Date.parse(g.updated_at) - Date.parse(g.created_at);
      if (ms > 0 && (!longest || ms > longest.ms)) longest = { ms, court: g.court_no };
    }

    return {
      playedN: played.length,
      scheduledN,
      totalPts,
      avg,
      closest,
      longest,
      streakName: streak ? nameById(streak.id) : null,
      streakN: streak?.n ?? 0,
    };
  })();



  // Tabla de posiciones (ranking individual): roster de la categoría principal,
  // derivado de los games jugados.
  const standingsPlayers =
    data && mainCategory
      ? data.pairs
          .filter((p) => p.category_id === mainCategory.id)
          .flatMap((p) => [p.player_a_id, p.player_b_id].filter((id): id is string => !!id))
      : [];
  const standings: StandingRow[] =
    q && standingsModeFor(q.format, q.match_mode) === "individual" && standingsPlayers.length > 0
      ? individualStandings(catGames as GameForStandings[], standingsPlayers, nameById)
      : [];

  // Cards de estado + historial para la VISTA DE JUEGO (tab Partidos).
  const courtsCount = Math.max(1, (q?.courts_count as number | null) ?? 1);
  const gameViewCards = (() => {
    const maxMatchNo = catGames.reduce((mx, g) => Math.max(mx, (isRolling ? g.court_match_no : g.round_no) ?? 0), 0);
    const occupied = new Set(catGames.filter((g) => g.status === "scheduled" && g.court_no != null).map((g) => g.court_no as number));
    let freeCourt: number | null = null;
    for (let c = 1; c <= courtsCount; c++) {
      if (!occupied.has(c)) {
        freeCourt = c;
        break;
      }
    }
    const leaderRow = standings[0] ?? null;
    const secondRow = standings[1] ?? null;
    let cierre: string | null = null;
    if (q && q.hours != null) {
      const end = Date.parse(q.starts_at) + q.hours * 3600000;
      if (!Number.isNaN(end)) {
        const d = new Date(end);
        cierre = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      }
    }
    return {
      roundNo: maxMatchNo,
      scheduledN: insights.scheduledN,
      freeCourt,
      leaderName: leaderRow ? nameById(leaderRow.userId) : null,
      leaderPf: leaderRow?.pf ?? 0,
      leaderDiff: leaderRow && secondRow ? leaderRow.pf - secondRow.pf : null,
      secondName: secondRow ? nameById(secondRow.userId) : null,
      cierre,
    };
  })();
  const toHistory = (g: ManageGame): HistoryItem => ({
    id: g.id,
    label: isRolling ? `Partido ${g.court_match_no ?? 0}` : `Ronda ${g.round_no ?? 0}`,
    court: g.court_no,
    teamA: sideNames(g, "a"),
    teamB: sideNames(g, "b"),
    a: g.points_a ?? 0,
    b: g.points_b ?? 0,
    durationMs: Date.parse(g.updated_at) - Date.parse(g.created_at) || null,
  });
  const gameHistory = catGames
    .filter((g) => g.status === "played")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map(toHistory);
  // Último partido jugado por cada cancha (catGames viene en orden cronológico asc).
  const lastPerCourt = (() => {
    const byCourt = new Map<number, ManageGame>();
    for (const g of catGames) {
      if (g.status === "played" && g.court_no != null) byCourt.set(g.court_no, g);
    }
    return [...byCourt.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => toHistory(g));
  })();

  // Generar la siguiente ronda desde el motor del formato.
  const genRound = () => {
    if (!activeCategory) {
      toast({ icon: "alert-triangle", title: "Crea una categoría primero" });
      return;
    }
    startBusy(async () => {
      const res = await generateQuedadaRound({ quedadaId, categoryId: activeCategory.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo generar la ronda", sub: res.error.message });
        return;
      }
      toast({
        icon: "check-circle-2",
        title: `${engine?.roundLabel ?? "Ronda"} ${res.data.roundNo} armada`,
        sub: res.data.byes > 0 ? `${res.data.byes} jugador(es) descansan` : undefined,
      });
      await afterMutation();
    });
  };

  // Rolling: llenar las canchas libres con un partido inicial.
  const startRolling = () => {
    if (!activeCategory) {
      toast({ icon: "alert-triangle", title: "Crea una categoría primero" });
      return;
    }
    startBusy(async () => {
      const res = await startAmericanoRolling({ quedadaId, categoryId: activeCategory.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudieron llenar las canchas", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: res.data.filled > 0 ? `${res.data.filled} cancha(s) en juego` : "Canchas ya llenas" });
      await afterMutation();
    });
  };

  // Rolling: reportar marcador → el motor asigna el siguiente partido en esa cancha.
  const reportRolling = (gameId: string, a: number, b: number) => {
    startBusy(async () => {
      const res = await reportRollingGame({ gameId, pointsA: a, pointsB: b });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar el marcador", sub: res.error.message });
        return;
      }
      toast({
        icon: "check-circle-2",
        title: "Marcador guardado",
        sub: res.data.advanced ? "Siguiente partido asignado a la cancha" : "Cancha libre — esperando jugadores",
      });
      await afterMutation();
    });
  };

  // Compartir el link de la vista jugador (join/seguimiento por código).
  const sharePlayerView = async () => {
    const code = q?.invite_code;
    if (!code) {
      toast({ icon: "alert-triangle", title: "Sin código de invitación" });
      return;
    }
    const link = typeof window !== "undefined" ? `${window.location.origin}/q/${code}` : `/q/${code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({ icon: "check-circle-2", title: "Link copiado", sub: "Compártelo con los jugadores." });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar", sub: "Copia el link manualmente." });
    }
  };

  // Dos niveles: arriba GESTIÓN vs JUEGO (el motor), abajo los sub-tabs de cada uno.
  const showResultados =
    !!data?.isCreator &&
    !!q &&
    (q.status === "registration_closed" || q.status === "live" || q.status === "finished");
  // Gestión = setup; Juego = el motor (partidos + resultados/podio).
  // Orden del flujo: la gente se inscribe y paga primero, luego se arma el roster.
  const rosterLabel = q && rosterModeFor(q.format, q.match_mode) === "individual" ? "Jugadores" : "Parejas";
  const gestionTabs: { k: TabKey; label: string }[] = [
    { k: "resumen", label: "Resumen" },
    { k: "pagos", label: "Pagos" },
    { k: "parejas", label: rosterLabel },
    ...(data?.isCreator ? [{ k: "config" as TabKey, label: "Configurar" }] : []),
  ];
  const juegoTabs: { k: TabKey; label: string }[] = [
    { k: "juego", label: "Partidos" },
    ...(showResultados ? [{ k: "resultados" as TabKey, label: "Resultados" }] : []),
  ];
  const sectionTabs = section === "juego" ? juegoTabs : gestionTabs;
  const activeTab: TabKey = sectionTabs.some((t) => t.k === tab) ? tab : sectionTabs[0].k;
  const switchSection = (s: "gestion" | "juego") => {
    setSection(s);
    setTab(s === "juego" ? "juego" : "resumen");
  };

  // Link "Volver" igual al BackBtn de Teams (texto plano, muted-fg, sin borde).
  const backLink = (
    <button
      onClick={close}
      aria-label="Volver a quedadas"
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
      <Icon name="arrow-left" size={13} /> Volver
    </button>
  );

  // Acción primaria contextual al estado (avanza el flujo) + compartir vista jugador.
  const headerButtons =
    q && data?.canManage ? (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
        {data.isCreator && q.status === "registration_open" && (
          <HeaderBtn onClick={() => changeStatus("registration_closed")} disabled={busy} icon="lock" tone="primary">Cerrar inscripciones</HeaderBtn>
        )}
        {data.isCreator && q.status === "registration_closed" && (
          <HeaderBtn onClick={() => changeStatus("live")} disabled={busy} icon="play" tone="primary">Iniciar quedada</HeaderBtn>
        )}
        {data.isCreator && q.status === "live" && q.format === "americano" && isRolling && (
          <HeaderBtn onClick={startRolling} disabled={busy} icon="layout-grid" tone="primary">Llenar canchas</HeaderBtn>
        )}
        {data.isCreator && q.status === "live" && engine?.canGenerateRound && !isRolling && (
          <HeaderBtn onClick={genRound} disabled={busy} icon="arrow-right" tone="primary">
            Siguiente {engine.roundLabel.toLowerCase()}
          </HeaderBtn>
        )}
        {data.isCreator && q.status === "live" && hasPlayedGames && activeCategory && (
          <HeaderBtn onClick={doFinishQuedada} disabled={busy} icon="flag" tone="danger">
            {finishActionLabel}
          </HeaderBtn>
        )}
        <HeaderBtn onClick={sharePlayerView} icon="share-2" tone="ghost">Compartir vista jugador</HeaderBtn>
      </div>
    ) : null;

  // Card propia (columna a la derecha) con el carrusel de partidos en cancha.
  const nextMatchCard = data ? (
    <MatchCarouselCard
      matches={courtMatches}
      seqWord={seqWord}
      timerFrozenAt={q ? quedadaTimerFrozenAt(q) : null}
      canReport={!!data.canManage && q != null && q.status === "live" && viewCategoryIsActive}
      reporting={busy}
      onReport={
        isRolling
          ? reportRolling
          : (gameId, a, b) => {
              startBusy(async () => {
                const res = await reportGame({ gameId, pointsA: a, pointsB: b });
                if (!res.ok) {
                  toast({ icon: "alert-triangle", title: "No se pudo guardar el marcador", sub: res.error.message });
                  return;
                }
                toast({ icon: "check", title: "Marcador guardado" });
                await afterMutation();
              });
            }
      }
      emptyTitle={isRolling ? "Canchas vacías" : "Sin rondas todavía"}
      emptySub={
        data.isCreator
          ? isRolling
            ? "Pulsa “Llenar canchas” para empezar."
            : "Genera o crea el primer partido para empezar."
          : "El organizador aún no generó partidos."
      }
    />
  ) : null;

  const insightCard = data ? <InsightCard {...insights} /> : null;

  const header = (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "22px 24px",
        background:
          "radial-gradient(115% 130% at 98% 112%, rgba(124,58,237,0.3) 0%, rgba(124,58,237,0) 52%), linear-gradient(135deg, #0a0a0a 0%, #18162e 58%, #3b0764 100%)",
        color: "#fff",
        borderRadius: "var(--radius-mp-card, 14.4px)",
      }}
    >
      {/* Wordmark decorativo (mismo patrón que el hero de la lista de Quedadas) */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          fontFamily: "Plus Jakarta Sans",
          fontWeight: 900,
          fontSize: 180,
          color: "rgba(255,255,255,0.06)",
          letterSpacing: "-0.06em",
          lineHeight: 0.8,
          transform: "rotate(-6deg) translate(15%, -20%)",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        QUEDA
      </div>
      <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
          {q ? (
            <div style={{ display: "inline-flex", alignSelf: "flex-start", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 9999, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--primary)" }} />
              <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "#fff" }}>
                {sm?.label ?? q.status}{q.location_text ? ` · ${q.location_text}` : ""}
              </span>
            </div>
          ) : (
            <SkBar w={180} h={22} r={9999} dark />
          )}
          {q ? (
            <h2 className="font-heading" style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "12px 0 0", lineHeight: 1.05 }}>
              {q.title}
              <span style={{ color: "#34d399" }}>.</span>
            </h2>
          ) : (
            <div style={{ margin: "12px 0 0" }}><SkBar w={280} h={30} r={8} dark /></div>
          )}
          {q ? (
            <>
              {q.description && (
                <p style={{ fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.82)", margin: "12px 0 0", maxWidth: 560, whiteSpace: "pre-wrap" }}>
                  {q.description}
                </p>
              )}
              {headerButtons}
            </>
          ) : (
            <div style={{ marginTop: 14 }}><SkBar w={220} h={12} r={6} dark /></div>
          )}
      </div>
    </div>
  );

  // Cards de stats, FUERA del banner, sobre el fondo de página. Valor = frase
  // (estilo mock) + subtítulo derivado de datos reales.
  const pendingPay = joinedCount - paidCount;
  const cuposSub =
    q == null
      ? undefined
      : q.max_players != null
        ? joinedCount >= q.max_players
          ? "Cupos llenos"
          : `${q.max_players - joinedCount} cupos libres`
        : "Sin límite de jugadores";
  const estadoValue =
    q == null
      ? "—"
      : q.status === "live" && currentRoundNo > 0
        ? `${engine?.roundLabel ?? "Ronda"} ${currentRoundNo} en vivo`
        : sm?.label ?? q.status;
  const statsRow = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, alignItems: "stretch" }}>
      {q ? (
        <>
          <StatCard label="Estado" value={estadoValue} sub={estadoSub(q)} valueColor={quedadaStatusSolid(q.status)} />
          <StatCard label="Jugadores" value={`${joinedCount} confirmados`} sub={cuposSub} />
          <StatCard label="Cobros" value={`${paidCount}/${joinedCount} pagados`} sub={pendingPay === 0 ? "Todos al día" : `${pendingPay} pendiente${pendingPay > 1 ? "s" : ""}`} />
          <StatCard label="Formato" value={quedadaFormatLabel(q.format)} sub={engine ? `${engine.tableEntityLabel} · ${q.match_mode === "singles" ? "Singles" : "Dobles"}` : q.match_mode === "singles" ? "Singles" : "Dobles"} />
        </>
      ) : (
        (["Estado", "Jugadores", "Cobros", "Formato"] as const).map((label) => (
          <div key={label} className="card" style={{ padding: "13px 15px", height: "100%", minHeight: 88, display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-fg)" }}>{label}</span>
            <div style={{ marginTop: 7 }}><SkBar w={90} h={20} r={5} /></div>
            <div style={{ marginTop: "auto", paddingTop: 7 }}><SkBar w={70} h={10} r={4} /></div>
          </div>
        ))
      )}
    </div>
  );

  const tabsBar = loading ? (
    <div style={{ display: "flex", gap: 16 }}>
      {[60, 56, 48, 70].map((w, i) => (
        <SkBar key={i} w={w} h={14} r={6} />
      ))}
    </div>
  ) : data && data.canManage ? (
      <div className="mp-touch-hscroll" style={{ display: "flex", gap: 2 }}>
        {sectionTabs.map((t) => {
          const on = t.k === activeTab;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                padding: "15px 14px",
                border: 0,
                borderBottom: on ? "2px solid var(--primary)" : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: on ? "var(--fg)" : "var(--muted-fg)",
                whiteSpace: "nowrap",
                transition: "color 150ms var(--ease-out)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    ) : null;

  // Switch de nivel superior: Gestión (setup) vs Juego (el motor).
  const sectionSwitch =
    !loading && data?.canManage ? (
      <div style={{ display: "flex", gap: 6 }}>
        {([["gestion", "Gestión"], ["juego", "Juego"]] as const).map(([k, label]) => {
          const on = section === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => switchSection(k)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 9999,
                border: on ? "0" : "1px solid var(--border)",
                background: on ? "var(--fg)" : "transparent",
                color: on ? "#fff" : "var(--muted-fg)",
                fontFamily: "inherit",
                fontWeight: 900,
                fontSize: 11.5,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "background 150ms var(--ease-out), color 150ms var(--ease-out)",
              }}
            >
              <Icon name={k === "juego" ? "swords" : "sliders-horizontal"} size={13} color={on ? "#fff" : "var(--muted-fg)"} />
              {label}
            </button>
          );
        })}
      </div>
    ) : null;

  // Barra de navegación (Gestión/Juego + sub-tabs) como card propia sobre el
  // fondo de página, separada del header.
  const nav =
    loading || (data && data.canManage) ? (
      <div className="card" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {sectionSwitch}
        {tabsBar}
      </div>
    ) : null;

  const body = (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {loading && <ManageSkeleton />}
      {!loading && loadError && (
        <div className="card" style={{ padding: 18, background: "var(--destructive-bg)", border: "1px solid var(--destructive-border)", color: "var(--destructive-fg)", fontSize: 13 }}>
          No se pudo cargar la gestión: {loadError}
        </div>
      )}
      {!loading && data && !data.canManage && (
        <div className="card" style={{ padding: 18, background: "var(--muted)", color: "var(--muted-fg)", fontSize: 13 }}>
          No tienes permiso para gestionar esta quedada.
        </div>
      )}

      {!loading && data && data.canManage && (
        <div key={activeTab} className="mp-tab-in" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {activeTab === "resumen" && <ResumenTab data={data} toast={toast} onGoToParejas={() => setTab("parejas")} />}
          {activeTab === "parejas" && <SlotsSection data={data} onChanged={afterMutation} />}
          {activeTab === "juego" && <JuegoTab data={data} onChanged={afterMutation} />}
          {activeTab === "pagos" && <PagosTab data={data} onTogglePaid={togglePaid} onSetAllPaid={setAllPaid} onToggleCheckedIn={toggleCheckedIn} onSetAllCheckedIn={setAllCheckedInLocal} onRemind={remindPayment} reminding={busy} />}
          {activeTab === "resultados" && <ResultadosTab data={data} onChanged={afterMutation} />}
          {activeTab === "config" && data.isCreator && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 18, alignItems: "start" }}>
              {[
                <CategoriesSection key="cat" data={data} onChanged={afterMutation} />,
                <LogisticsSection key="log" data={data} onSaved={afterMutation} />,
                <BankPrizesSection key="bank" data={data} onSaved={afterMutation} />,
                <CohostsSection key="co" data={data} onChanged={afterMutation} />,
              ].map((node, i) => (
                <div key={i} className="card mp-rise" style={{ padding: 16, animationDelay: `${i * 50}ms` }}>
                  {node}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // WIP — reestructuración paso a paso: por ahora la página muestra SOLO el
  // header. La barra de navegación (`nav`) y el contenido de tabs (`body`) quedan
  // construidos pero sin renderizar; se re-cablean sección por sección.
  void nav;
  void body;
  void doCancel; // Cancelar quedada volverá al reconstruir las secciones de gestión.

  // Tabs de nivel de página (arriba del banner). "Partidos" = la vista actual
  // (banner + stats + carrusel + tabla). Los demás cambian toda la interfaz.
  const pageTabs: { k: "resumen" | "partidos" | "roster" | "pagos" | "config"; l: string }[] = data
    ? [
        { k: "resumen", l: "Resumen" },
        { k: "partidos", l: "Partidos" },
        { k: "roster", l: rosterLabel },
        { k: "pagos", l: "Pagos" },
        ...(data.isCreator ? [{ k: "config" as const, l: "Configuración" }] : []),
      ]
    : [];
  const activePageTab = pageTabs.some((t) => t.k === pageTab) ? pageTab : "resumen";
  const pageTabsBar =
    loading ? (
      <div style={{ display: "flex", gap: 22, padding: "0 2px 12px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        {[72, 68, 80, 56, 108].map((w, i) => (
          <SkBar key={i} w={w} h={12} r={6} />
        ))}
      </div>
    ) : data && data.canManage ? (
      <div style={{ display: "flex", gap: 22, padding: "0 2px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        {pageTabs.map((t) => {
          const on = t.k === activePageTab;
          return (
            <button
              key={t.k}
              type="button"
              onClick={() => setPageTab(t.k)}
              style={{
                padding: "0 1px 12px",
                border: 0,
                borderBottom: on ? "2px solid var(--primary)" : "2px solid transparent",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: on ? "var(--fg)" : "var(--muted-fg)",
                whiteSpace: "nowrap",
                transition: "color 150ms var(--ease-out)",
              }}
            >
              {t.l}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div className="mp-quedada-root" style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
      {backLink}
      {pageTabsBar}
      {!loading && data && multiCategory && q && (q.status === "live" || q.status === "finished") && (
        <CategoryFlowStrip
          categories={sortedCategories}
          quedadaStatus={q.status}
          viewId={viewCategory?.id ?? null}
          onView={setViewCategoryId}
        />
      )}
      {!loading && isQuedadaLocked && <QuedadaLockedNotice />}

      {!loading && loadError && (
        <div className="card" style={{ padding: 18, background: "var(--destructive-bg)", border: "1px solid var(--destructive-border)", color: "var(--destructive-fg)", fontSize: 13 }}>
          No se pudo cargar la gestión: {loadError}
        </div>
      )}

      {activePageTab === "resumen" && (
        <div key="resumen" className="mp-tab-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {data && q && sortedCategories.some((c) => categoryFlowStatus(c, q.status) === "finished") && (
            <>
              {sortedCategories
                .filter((c) => categoryFlowStatus(c, q.status) === "finished")
                .map((cat) => {
                  const rows = standingsForCategory(data, cat.id, q, nameById);
                  if (rows.length === 0) return null;
                  return (
                    <PodiumHero
                      key={cat.id}
                      rows={rows}
                      nameOf={nameById}
                      avatarOf={avatarById}
                      categoryName={cat.name}
                    />
                  );
                })}
            </>
          )}
          {data && q?.status === "finished" ? (
            <CollapsibleResumenDetail title="Detalle de la quedada" sub="Banner, estadísticas, tabla completa y partidos">
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
                  {header}
                  {statsRow}
                  {loading ? (
                    <StandingsCardSkeleton />
                  ) : standings.length > 0 ? (
                    <StandingsCard rows={standings} nameOf={nameById} avatarOf={avatarById} />
                  ) : data && mainCategory ? (
                    <StandingsCardEmpty hint="El ranking se llena cuando empieces a jugar partidos." />
                  ) : null}
                </div>
                <div className="mp-quedada-side" style={{ maxWidth: "100%", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
                  {loading ? (
                    <>
                      <MatchCarouselSkeleton />
                      <InsightCardSkeleton />
                    </>
                  ) : (
                    <>
                      {isQuedadaLocked ? (
                        courtMatches.length > 0 ? (
                          <MatchCarouselCard
                            matches={courtMatches}
                            seqWord={seqWord}
                            timerFrozenAt={q ? quedadaTimerFrozenAt(q) : null}
                            canReport={false}
                            reporting={false}
                            onReport={() => {}}
                            emptyTitle="Sin partidos jugados"
                            emptySub="No hubo partidos con marcador en cancha."
                          />
                        ) : (
                          <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                            <div className="label-mp" style={{ color: "var(--muted-fg)" }}>● Cerrada</div>
                            <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase" }}>Quedada finalizada<span className="dot">.</span></div>
                            <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.5 }}>El podio y la tabla de posiciones tienen los resultados finales.</p>
                          </div>
                        )
                      ) : (
                        nextMatchCard
                      )}
                      {insightCard}
                    </>
                  )}
                </div>
              </div>
            </CollapsibleResumenDetail>
          ) : (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            {header}
            {statsRow}
            {loading ? (
              <StandingsCardSkeleton />
            ) : standings.length > 0 ? (
              <StandingsCard rows={standings} nameOf={nameById} avatarOf={avatarById} />
            ) : data && mainCategory ? (
              <StandingsCardEmpty hint="El ranking se llena cuando empieces a jugar partidos." />
            ) : null}
          </div>
          <div className="mp-quedada-side" style={{ maxWidth: "100%", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            {loading ? (
              <>
                <MatchCarouselSkeleton />
                <InsightCardSkeleton />
              </>
            ) : (
              <>
                {nextMatchCard}
                {insightCard}
              </>
            )}
          </div>
          </div>
          )}
        </div>
      )}

      {activePageTab === "partidos" && data && (
        <PartidosTabView
          matches={courtMatches}
          standings={standings}
          insights={insights}
          nameOf={nameById}
          seqWord={seqWord}
          canReport={!!data.canManage && q != null && q.status === "live" && viewCategoryIsActive}
          reporting={busy}
          onReport={isRolling ? reportRolling : (gameId, a, b) => {
            startBusy(async () => {
              const res = await reportGame({ gameId, pointsA: a, pointsB: b });
              if (!res.ok) { toast({ icon: "alert-triangle", title: "No se pudo guardar el marcador", sub: res.error.message }); return; }
              toast({ icon: "check", title: "Marcador guardado" });
              await afterMutation();
            });
          }}
          cards={gameViewCards}
          history={gameHistory}
          lastPerCourt={lastPerCourt}
          showNextRound={!!data.isCreator && q?.status === "live" && !!engine?.canGenerateRound && !isRolling && viewCategoryIsActive && viewCategory?.id === activeCategory?.id}
          showFillCourts={!!data.isCreator && q?.status === "live" && isRolling && q.format === "americano" && viewCategoryIsActive}
          roundLabel={engine?.roundLabel ?? "Ronda"}
          onNextRound={genRound}
          onFillCourts={startRolling}
          roundBusy={busy}
          showFinish={!!data.isCreator && q?.status === "live" && hasPlayedGames && !!activeCategory}
          finishLabel={finishActionLabel}
          onFinish={doFinishQuedada}
          isLocked={isQuedadaLocked}
          timerFrozenAt={q ? quedadaTimerFrozenAt(q) : null}
        />
      )}

      {activePageTab === "roster" && data && (
        <JugadoresTabView key="roster" data={data} nameOf={nameById} onChanged={afterMutation} />
      )}

      {activePageTab === "pagos" && data && (
        <div key="pagos" className="mp-tab-in" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <PagosTab data={data} onTogglePaid={togglePaid} onSetAllPaid={setAllPaid} onToggleCheckedIn={toggleCheckedIn} onSetAllCheckedIn={setAllCheckedInLocal} onRemind={remindPayment} reminding={busy} />
        </div>
      )}

      {activePageTab === "config" && data && data.isCreator && (
        <ConfigTab key="config" data={data} afterMutation={afterMutation} toast={toast} doCancel={doCancel} busy={busy} />
      )}
    </div>
  );
}

// ── Tab: Configuración (master-detail con stepper numerado) ──────────────────
// Nav vertical a la izquierda (8 pasos) + sección activa a la derecha. Cada
// sección trae su propio header (label/title/sub vía <Section>), así que el panel
// derecho ya muestra el encabezado del paso. "Zona de peligro" = rojo.
const CONFIG_STEPS = [
  { key: "general", n: 1, title: "General", sub: "Título, fecha, sede, visibilidad" },
  { key: "logistica", n: 2, title: "Logística", sub: "Canchas, horas, costos" },
  { key: "cobro", n: 3, title: "Cobro y premios", sub: "Banco, premios, reglas" },
  { key: "categorias", n: 4, title: "Categorías", sub: "Niveles y cupos" },
  { key: "cohosts", n: 5, title: "Co-hosts", sub: "Quién más puede gestionar" },
  { key: "motor", n: 6, title: "Motor de juego", sub: "Modo, puntos por partido" },
  { key: "compartir", n: 7, title: "Compartir", sub: "Link de inscripción" },
  { key: "peligro", n: 8, title: "Zona de peligro", sub: "Cancelar quedada", danger: true },
] as const;

type ConfigStepKey = (typeof CONFIG_STEPS)[number]["key"];

function ConfigTab({
  data,
  afterMutation,
  toast,
  doCancel,
  busy,
}: {
  data: ManageData;
  afterMutation: () => Promise<void>;
  toast: ReturnType<typeof useToast>;
  doCancel: () => void;
  busy: boolean;
}) {
  const [step, setStep] = useState<ConfigStepKey>("general");
  const readOnly = quedadaIsLocked(data.quedada.status);

  return (
    <div key="config" className="mp-tab-in" style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Nav stepper */}
      <nav style={{ flex: "1 1 240px", minWidth: 0, maxWidth: 300 }}>
        <div className="label-mp" style={{ color: "var(--primary)" }}>Setup</div>
        <div className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", marginBottom: 14 }}>
          Configurar<span className="dot">.</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {CONFIG_STEPS.map((s) => {
            const on = step === s.key;
            const danger = "danger" in s && s.danger;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(s.key)}
                aria-current={on}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 13px",
                  borderRadius: 12,
                  border: on ? 0 : "1px solid var(--border)",
                  background: on ? "var(--fg)" : "#fff",
                  color: on ? "#fff" : danger ? "#dc2626" : "var(--fg)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  transition: "background 150ms ease, border-color 150ms ease, transform 160ms var(--ease-out)",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 900,
                    background: on ? "rgba(255,255,255,0.16)" : danger ? "#fee2e2" : "var(--muted)",
                    color: on ? "#fff" : danger ? "#dc2626" : "var(--muted-fg)",
                  }}
                >
                  {s.n}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                  <span style={{ display: "block", fontSize: 11, color: on ? "rgba(255,255,255,0.65)" : "var(--muted-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.sub}</span>
                </span>
                {on && <Icon name="chevron-right" size={16} color="#fff" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Panel de la sección activa (trae su propio header). */}
      <div style={{ flex: "1 1 480px", minWidth: 0 }}>
        <div key={step} className="card mp-tab-in" style={{ padding: 18 }}>
          {step === "compartir" ? (
            <InviteLinkSection inviteCode={data.quedada.invite_code} toast={toast} quedadaId={data.quedada.id} onChanged={afterMutation} readOnly={readOnly} />
          ) : (
            <fieldset disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              {step === "general" && <DetailsSection data={data} onSaved={afterMutation} />}
              {step === "logistica" && <LogisticsSection data={data} onSaved={afterMutation} />}
              {step === "cobro" && <BankPrizesSection data={data} onSaved={afterMutation} />}
              {step === "categorias" && <CategoriesSection data={data} onChanged={afterMutation} />}
              {step === "cohosts" && <CohostsSection data={data} onChanged={afterMutation} />}
              {step === "motor" && <EngineSection data={data} onSaved={afterMutation} />}
              {step === "peligro" && <DangerZoneSection onCancel={doCancel} canceling={busy} status={data.quedada.status} />}
            </fieldset>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Bloque visual reutilizable ───────────────────────────────────────────────
// Header tipográfico (micro-label + título UPPERCASE, sin íconos decorativos,
// fiel al kit). Colapso animado con grid-template-rows (solo si collapsible).
function Section({
  label,
  title,
  titleTip,
  sub,
  children,
  collapsible = false,
  defaultOpen = true,
  badge,
}: {
  label?: string;
  title: string;
  titleTip?: string;
  sub?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        {label && <div className="label-mp" style={{ color: "var(--primary)", marginBottom: 3 }}>{label}</div>}
        <div
          className="font-heading"
          style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.01em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}
        >
          <LabelWithTip tip={titleTip}>{title}</LabelWithTip>
          {badge != null && (
            <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 9999, background: "var(--muted)", color: "var(--muted-fg)", letterSpacing: 0 }}>{badge}</span>
          )}
        </div>
        {sub && <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{sub}</div>}
      </div>
      {collapsible && (
        <span style={{ transition: "transform 200ms var(--ease-out)", transform: open ? "rotate(180deg)" : "none", display: "inline-flex", color: "var(--muted-fg)" }}>
          <Icon name="chevron-down" size={18} color="var(--muted-fg)" />
        </span>
      )}
    </div>
  );

  return (
    <section style={{ display: "flex", flexDirection: "column" }}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
        >
          {head}
        </button>
      ) : (
        head
      )}
      {collapsible ? (
        <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 240ms var(--ease-out)" }}>
          <div style={{ overflow: "hidden", minHeight: 0 }}>
            <div style={{ paddingTop: 12 }}>{children}</div>
          </div>
        </div>
      ) : (
        <div style={{ paddingTop: 12 }}>{children}</div>
      )}
    </section>
  );
}

const fieldInput: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12.5,
  fontFamily: "inherit",
  outline: "none",
  background: "#fff",
  color: "var(--fg)",
};

// ── Tab: Resumen (ver + compartir) ───────────────────────────────────────────
function ResumenTab({ data, toast, onGoToParejas }: { data: ManageData; toast: ReturnType<typeof useToast>; onGoToParejas: () => void }) {
  const q = data.quedada;
  const when = (() => {
    const d = new Date(q.starts_at);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("es-EC", { weekday: "short", day: "2-digit", month: "short" }) + " · " + hourLabel(q.starts_at);
  })();
  const cohostNames = data.cohosts.map((c) => nameOf(c.profiles));
  return (
    <>
      <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))", gap: "14px 18px" }}>
          <InfoRow label="Cuándo" value={when} />
          <InfoRow label="Lugar" value={q.location_text || "Sin definir"} />
          <InfoRow label="Formato" value={`${quedadaFormatLabel(q.format)} · ${q.match_mode === "singles" ? "Singles" : "Dobles"}`} />
          <InfoRow label="Cuota" value={q.fee_cents > 0 ? money(q.fee_cents) : "Gratis"} />
          {cohostNames.length > 0 && <InfoRow label="Co-hosts" value={cohostNames.join(", ")} />}
        </div>
        {q.perks_text && (
          <div style={{ fontSize: 12, color: "var(--color-mp-primary-active)", background: "var(--color-mp-primary-light)", borderRadius: 8, padding: "8px 10px", display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Icon name="sparkles" size={12} color="#10b981" />
            <span>{q.perks_text}</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onGoToParejas} className="btn btn-primary">
            <Icon name="grid-3x3" size={13} color="#fff" /> {rosterModeFor(q.format, q.match_mode) === "individual" ? "Gestionar jugadores" : "Gestionar parejas"}
          </button>
        </div>
      </div>

      {q.status === "finished" && <PodiumSection data={data} />}

      <div style={{ display: "grid", gridTemplateColumns: q.prizes && q.prizes.length > 0 ? "repeat(auto-fit, minmax(340px, 1fr))" : "1fr", gap: 18, alignItems: "start" }}>
        <InviteLinkSection inviteCode={q.invite_code} toast={toast} />

        {q.prizes && q.prizes.length > 0 && (
          <Section title="Premios">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {q.prizes.map((p, i) => (
                <div key={`${p.place}-${i}`} style={{ padding: "8px 11px", borderRadius: 9, background: "var(--muted)", border: "1px solid var(--border)" }}>
                  <QuedadaPrizeRow prize={p} />
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0, borderLeft: "2px solid var(--border)", paddingLeft: 10 }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-fg)" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 3 }}>{value}</div>
    </div>
  );
}

// Avatar circular para filas de ranking (podio / tabla).
function PlayerStandingAvatar({
  name,
  avatarUrl,
  size = 34,
  onDark = false,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
  onDark?: boolean;
}) {
  return (
    <span
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        background: onDark ? "rgba(255,255,255,0.12)" : "var(--muted)",
        border: onDark ? "1.5px solid rgba(255,255,255,0.22)" : "1px solid var(--border)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-heading, inherit)",
        fontSize: Math.max(10, size * 0.34),
        fontWeight: 900,
        color: onDark ? "#fff" : "var(--fg)",
        overflow: "hidden",
      }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

function CategoryFlowStrip({
  categories,
  quedadaStatus,
  viewId,
  onView,
}: {
  categories: ManageCategory[];
  quedadaStatus: string;
  viewId: string | null;
  onView: (id: string) => void;
}) {
  if (categories.length <= 1) return null;
  const badge = (st: CategoryFlowStatus) => {
    if (st === "active") return { label: "En juego", fg: "var(--primary)", bg: "var(--success-bg)" };
    if (st === "finished") return { label: "Finalizada", fg: "var(--muted-fg)", bg: "var(--muted)" };
    return { label: "Pendiente", fg: "#b45309", bg: "#fff7ed" };
  };
  return (
    <div className="card mp-tab-in" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
        Categorías · finaliza una y continúa con la siguiente
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {categories.map((c) => {
          const st = categoryFlowStatus(c, quedadaStatus);
          const on = c.id === viewId;
          const b = badge(st);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onView(c.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 10,
                border: on ? "1.5px solid var(--primary)" : "1px solid var(--border)",
                background: on ? "#fff" : "var(--muted)",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--fg)" }}>{c.name}</span>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 9999, color: b.fg, background: b.bg }}>{b.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CollapsibleResumenDetail({
  title,
  sub,
  defaultOpen = false,
  children,
}: {
  title: string;
  sub?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card mp-tab-in" style={{ padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 18px",
          border: 0,
          background: "transparent",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.01em" }}>
            {title}<span className="dot">.</span>
          </div>
          {sub && <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 3 }}>{sub}</div>}
        </div>
        <span style={{ flexShrink: 0, transition: "transform 200ms var(--ease-out)", transform: open ? "rotate(180deg)" : "none", display: "inline-flex", color: "var(--muted-fg)" }}>
          <Icon name="chevron-down" size={18} color="var(--muted-fg)" />
        </span>
      </button>
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 240ms var(--ease-out)" }}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div style={{ padding: open ? "16px 18px 18px" : "0 18px 18px", borderTop: open ? "1px solid var(--border)" : undefined }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// Podio (top 3) cuando la quedada está finalizada — filas con avatar como el ranking.
function PodiumHero({
  rows,
  nameOf,
  avatarOf,
  categoryName,
}: {
  rows: StandingRow[];
  nameOf: (id: string) => string;
  avatarOf: (id: string) => string | null;
  categoryName?: string;
}) {
  const [open, setOpen] = useState(true);
  const top3 = rows.slice(0, 3);
  if (top3.length === 0) return null;

  const cols = "28px 40px minmax(0,1fr) 36px 36px 42px";

  return (
    <div
      className="card mp-tab-in"
      style={{
        position: "relative",
        overflow: "hidden",
        padding: 0,
        background:
          "radial-gradient(115% 130% at 98% 112%, rgba(124,58,237,0.28) 0%, rgba(124,58,237,0) 52%), linear-gradient(135deg, #0a0a0a 0%, #18162e 58%, #3b0764 100%)",
        color: "#fff",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          fontFamily: "Plus Jakarta Sans",
          fontWeight: 900,
          fontSize: 140,
          color: "rgba(255,255,255,0.05)",
          letterSpacing: "-0.06em",
          lineHeight: 0.8,
          transform: "rotate(-6deg) translate(12%, -18%)",
          textTransform: "uppercase",
          pointerEvents: "none",
        }}
      >
        PODIO
      </div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          position: "relative",
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          padding: "22px 24px",
          border: 0,
          background: "transparent",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          color: "inherit",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Podio publicado</div>
          <h2 className="font-heading" style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
            Top 3<span style={{ color: "#34d399" }}>.</span>
          </h2>
          {categoryName && (
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.72)", marginTop: 6 }}>{categoryName} · ranking individual</div>
          )}
        </div>
        <span style={{ flexShrink: 0, marginTop: 4, transition: "transform 200ms var(--ease-out)", transform: open ? "rotate(180deg)" : "none", display: "inline-flex", color: "rgba(255,255,255,0.65)" }}>
          <Icon name="chevron-down" size={20} color="rgba(255,255,255,0.65)" />
        </span>
      </button>
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 240ms var(--ease-out)" }}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div style={{ position: "relative", padding: "0 20px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "0 4px 10px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
              <span>#</span>
              <span aria-hidden />
              <span>Jugador</span>
              <span style={{ textAlign: "center" }}>PJ</span>
              <span style={{ textAlign: "center" }}>PF</span>
              <span style={{ textAlign: "center" }}>DIF</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
              {top3.map((r, i) => {
                const rank = i + 1;
                const name = nameOf(r.userId);
                return (
                  <div
                    key={r.userId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: cols,
                      gap: 8,
                      alignItems: "center",
                      padding: "10px 4px",
                      borderRadius: 10,
                      background: rank === 1 ? "rgba(16,185,129,0.12)" : "transparent",
                    }}
                  >
                    <span className="font-heading tabular" style={{ fontWeight: 900, fontSize: 14, color: rank === 1 ? "#34d399" : "rgba(255,255,255,0.7)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {rank === 1 && <Icon name="trophy" size={13} color="#34d399" />}
                      {rank}
                    </span>
                    <PlayerStandingAvatar name={name} avatarUrl={avatarOf(r.userId)} size={36} onDark />
                    <span style={{ fontWeight: 800, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{name}</span>
                    <span className="tabular" style={{ textAlign: "center", fontSize: 12.5, color: "rgba(255,255,255,0.65)" }}>{r.played}</span>
                    <span className="tabular" style={{ textAlign: "center", fontSize: 13, fontWeight: 800 }}>{r.pf}</span>
                    <span className="tabular" style={{ textAlign: "center", fontSize: 12.5, fontWeight: 800, color: r.diff > 0 ? "#34d399" : "rgba(255,255,255,0.55)" }}>
                      {r.diff > 0 ? `+${r.diff}` : r.diff}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Podio por categoría (legacy / multi-categoría): parejas con final_rank en DB.
function PodiumSection({ data }: { data: ManageData }) {
  const partById = new Map(data.participants.map((p) => [p.user_id, p]));
  const guestById = new Map(data.guests.map((g) => [g.id, g]));
  const nameFor = (id: string): string =>
    guestById.get(id)?.display_name ?? nameOf(partById.get(id)?.profiles ?? null);
  const rankOf = (id: string): number | null =>
    partById.get(id)?.final_rank ?? guestById.get(id)?.final_rank ?? null;
  const cats = data.categories
    .map((c) => ({
      cat: c,
      pairs: data.pairs
        .filter((p) => p.category_id === c.id && rankOf(p.player_a_id) != null)
        .sort((a, b) => (rankOf(a.player_a_id) ?? 99) - (rankOf(b.player_a_id) ?? 99)),
    }))
    .filter((x) => x.pairs.length > 0);
  if (cats.length === 0) return null;
  return (
    <Section label="Podio" title="Resultados">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 12 }}>
        {cats.map(({ cat, pairs }) => (
          <div key={cat.id} className="card" style={{ padding: 12 }}>
            <div className="font-heading" style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.01em", marginBottom: 8 }}>{cat.name}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pairs.map((p) => {
                const r = rankOf(p.player_a_id);
                const top = r != null && r <= 3;
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                    <span className="font-heading tabular" style={{ width: 26, fontWeight: 900, color: top ? "var(--primary)" : "var(--muted-fg)" }}>{r}°</span>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {nameFor(p.player_a_id)}
                      {p.player_b_id ? <><span style={{ color: "var(--muted-fg)", fontWeight: 800, margin: "0 4px" }}>+</span>{nameFor(p.player_b_id)}</> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Tab: Pagos (estado de pago + datos bancarios) ────────────────────────────
function PagosTab({
  data,
  onTogglePaid,
  onSetAllPaid,
  onToggleCheckedIn,
  onSetAllCheckedIn,
  onRemind,
  reminding,
}: {
  data: ManageData;
  onTogglePaid: (userId: string) => void;
  onSetAllPaid: (paid: boolean) => void;
  onToggleCheckedIn: (userId: string) => void;
  onSetAllCheckedIn: (checkedIn: boolean) => void;
  onRemind: (userIds?: string[]) => void;
  reminding: boolean;
}) {
  const toast = useToast();
  const q = data.quedada;
  const readOnly = quedadaIsLocked(q.status);
  const acct = q.payment_account;
  // Fila unificada de cobro: inscritos con cuenta + walk-ins (guests). El aviso
  // de pago solo aplica a inscritos con cuenta (el walk-in no recibe notifs).
  type PayRow = {
    user_id: string;
    paid: boolean;
    checked_in_at: string | null;
    payment_reminded_at: string | null;
    name: string;
    username: string | null;
    isWalkIn: boolean;
  };
  const joinedParts = data.participants.filter((p) => p.status === "joined");
  const joined: PayRow[] = [
    ...joinedParts.map((p) => ({
      user_id: p.user_id,
      paid: p.paid,
      checked_in_at: p.checked_in_at,
      payment_reminded_at: p.payment_reminded_at,
      name: nameOf(p.profiles),
      username: p.profiles?.username ?? null,
      isWalkIn: false,
    })),
    ...data.guests.map((g) => ({
      user_id: g.id,
      paid: g.paid,
      checked_in_at: g.checked_in_at,
      payment_reminded_at: null,
      name: g.display_name,
      username: null,
      isWalkIn: true,
    })),
  ];
  const paidN = joined.filter((p) => p.paid).length;
  const checkedInN = joined.filter((p) => !!p.checked_in_at).length;
  const pendingPlayers = joined.filter((p) => !p.paid && !p.isWalkIn);
  const allPaid = joined.length > 0 && paidN === joined.length;
  const allCheckedIn = joined.length > 0 && checkedInN === joined.length;
  const fee = q.fee_cents;
  const collected = paidN * fee;
  const expected = joined.length * fee;
  const pendingCents = expected - collected;
  const pct = joined.length ? Math.round((paidN / joined.length) * 100) : 0;
  // Costo de las canchas (canchas × horas × precio) e ingreso neto estimado.
  const courts = q.courts_count ?? 0;
  const hrs = q.hours ?? 0;
  const courtCost = Math.round(courts * hrs * (q.court_price_cents ?? 0));
  const netCents = collected - courtCost;

  // Categoría por jugador (derivada de los slots de quedada_pairs).
  const catById = new Map(data.categories.map((c) => [c.id, c.name]));
  const catIdByUser = new Map<string, string>();
  data.pairs.forEach((pr) => {
    if (pr.player_a_id) catIdByUser.set(pr.player_a_id, pr.category_id);
    if (pr.player_b_id) catIdByUser.set(pr.player_b_id, pr.category_id);
  });
  const catNameOf = (uid: string): string => catById.get(catIdByUser.get(uid) ?? "") ?? "—";
  const hasCats = data.categories.length > 0;
  const sortedCats = data.categories.slice().sort((a, b) => a.sort_order - b.sort_order);

  // Filtros de la tabla de control.
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all"); // "all" | category id
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const qn = query.trim().toLowerCase();
  const visible = joined.filter((p) => {
    if (catFilter !== "all" && catIdByUser.get(p.user_id) !== catFilter) return false;
    if (!qn) return true;
    const nm = p.name.toLowerCase();
    const un = (p.username ?? "").toLowerCase();
    return nm.includes(qn) || un.includes(qn);
  });

  // Copiar los datos bancarios al portapapeles (para pasárselos a los inscritos).
  const copyAcct = () => {
    if (!acct) return;
    const lines = [
      acct.bank,
      `${acct.accountType === "ahorros" ? "Ahorros" : "Corriente"} · ${acct.accountNumber}`,
      acct.holderName + (acct.holderId ? ` · ${acct.holderId}` : ""),
      acct.note ?? "",
    ].filter(Boolean);
    navigator.clipboard?.writeText(lines.join("\n"));
    toast({ icon: "check-circle-2", title: "Datos copiados", sub: "Pásalos a los inscritos." });
  };

  const COLS = "minmax(0,1fr) 90px 116px 104px 110px";

  // Fila de la tabla: avatar + nombre, categoría, asistencia, aviso, pago.
  const Row = (p: PayRow) => {
    const present = !!p.checked_in_at;
    const reminded = !!p.payment_reminded_at;
    const name = p.name;
    return (
      <div key={p.user_id} style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center", gap: 10, padding: "9px 14px", borderTop: "1px solid var(--border)", background: p.paid ? "var(--success-bg)" : "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: "50%", background: "var(--muted)", color: "var(--muted-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 900 }}>{initialsOf(name)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            {p.username && <div style={{ fontSize: 10.5, color: "var(--muted-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>@{p.username}</div>}
            {p.isWalkIn && <div style={{ fontSize: 10.5, color: "var(--muted-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Walk-in</div>}
          </div>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{catNameOf(p.user_id)}</span>
        <button
          type="button"
          onClick={() => onToggleCheckedIn(p.user_id)}
          disabled={readOnly}
          className="btn"
          title={present ? "Marcar como ausente" : "Registrar check-in"}
          style={{ justifySelf: "start", gap: 5, padding: "5px 10px", fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", borderRadius: 9999, border: present ? 0 : "1px solid var(--border)", background: present ? "var(--fg)" : "#fff", color: present ? "#fff" : "var(--muted-fg)" }}
        >
          <Icon name={present ? "user-check" : "user"} size={12} color={present ? "#fff" : "var(--muted-fg)"} />
          {present ? "Presente" : "Check-in"}
        </button>
        {p.paid || p.isWalkIn ? (
          <span style={{ justifySelf: "start", fontSize: 12, color: "var(--muted-fg)" }}>—</span>
        ) : (
          <button
            type="button"
            onClick={() => onRemind([p.user_id])}
            disabled={reminding || readOnly}
            className="btn"
            title="Enviar aviso de pago"
            aria-label={`Avisar a ${name}`}
            style={{ justifySelf: "start", gap: 5, padding: "5px 10px", fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", borderRadius: 9999, border: "1px solid", borderColor: reminded ? "#fcd34d" : "var(--border)", background: reminded ? "#fffbeb" : "#fff", color: reminded ? "#b45309" : "var(--muted-fg)" }}
          >
            <Icon name="bell" size={12} color={reminded ? "#b45309" : "var(--muted-fg)"} />
            {reminded ? "Reenviado" : "Avisar"}
          </button>
        )}
        <button
          type="button"
          onClick={() => onTogglePaid(p.user_id)}
          disabled={readOnly}
          className="btn"
          title={p.paid ? "Marcar como pendiente" : "Marcar como pagado"}
          style={{ justifySelf: "start", gap: 6, padding: "5px 10px", fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", borderRadius: 9999, border: p.paid ? 0 : "1px solid var(--border)", background: p.paid ? "var(--success-fg)" : "#fff", color: p.paid ? "#fff" : "var(--muted-fg)" }}
        >
          <Icon name={p.paid ? "check-square" : "square"} size={12} color={p.paid ? "#fff" : "var(--muted-fg)"} />
          {p.paid ? "Pagado" : "Pendiente"}
        </button>
      </div>
    );
  };

  const headerCell = (txt: string) => (
    <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>{txt}</span>
  );
  const groupHeader = (txt: string) => (
    <div style={{ padding: "6px 14px", background: "var(--muted)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-fg)" }}>{txt}</div>
  );
  const acctRow = (label: string, value: string, first = false) => (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: first ? 0 : "1px dashed var(--border)" }}>
      <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-fg)" }}>{label}</span>
      <span style={{ minWidth: 0, fontSize: 12.5, fontWeight: 800, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Columna principal: hero de recaudación + control de pago/asistencia. */}
      <div style={{ flex: "1 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Hero — recaudación live. */}
        <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--radius-mp-card, 14.4px)", background: "linear-gradient(135deg, #0a0a0a 0%, #18162e 58%, #3b0764 100%)", color: "#fff", padding: 22 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div className="label-mp" style={{ color: "var(--primary)" }}>● Recaudación · Live</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
                <span className="font-heading tabular" style={{ fontSize: 46, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1 }}>{money(collected)}</span>
                <span className="font-heading tabular" style={{ fontSize: 20, fontWeight: 800, color: "rgba(255,255,255,0.45)" }}>/ {money(expected)}</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.7)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span>{paidN} de {joined.length} pagaron</span>
                <span style={{ color: "var(--primary)", fontWeight: 800 }}>· {pct}% cobrado</span>
                {pendingCents > 0 && <span>· {money(pendingCents)} por cobrar</span>}
              </div>
            </div>
            {courtCost > 0 && (
              <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 14px", minWidth: 92 }}>
                  <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>Costo canchas</div>
                  <div className="font-heading tabular" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 3 }}>{money(courtCost)}</div>
                  <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>{courts} × {hrs}h</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 14px", minWidth: 92 }}>
                  <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>Neto estimado</div>
                  <div className="font-heading tabular" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 3, color: netCents < 0 ? "#f87171" : "var(--primary)" }}>{money(netCents)}</div>
                  <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>{netCents < 0 ? "En rojo" : "Estimado"}</div>
                </div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ height: 8, borderRadius: 9999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--primary)", borderRadius: 9999, transition: "width 420ms var(--ease-out)" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
              <span>Pagado {paidN}/{joined.length}</span>
              <span>Presentes {checkedInN}/{joined.length}</span>
            </div>
          </div>
        </div>

        {/* Control — pago y asistencia (tabla). */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
            <div style={{ minWidth: 0, flex: "1 1 160px" }}>
              <div className="label-mp" style={{ color: "var(--primary)" }}>Control · {paidN}/{joined.length}</div>
              <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <LabelWithTip tip="Marca pagado cuando confirmes la transferencia. Check-in es asistencia el día del evento. Avisar envía notificación a quienes deben.">
                  Pago y asistencia
                </LabelWithTip>
                <span className="dot">.</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 160px", minWidth: 0, border: "1px solid var(--border)", borderRadius: 9999, padding: "6px 12px", background: "#fff" }}>
              <Icon name="search" size={13} color="var(--muted-fg)" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar jugador…" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 12.5, color: "var(--fg)" }} />
            </div>
            {hasCats && (
              <div style={{ position: "relative" }}>
                <button type="button" onClick={() => setCatMenuOpen((o) => !o)} className="btn" style={{ background: "#fff", border: "1px solid var(--border)", gap: 6, textTransform: "none", letterSpacing: 0 }}>
                  {catFilter === "all" ? "Todas las categorías" : (catById.get(catFilter) ?? "Categoría")}
                  <Icon name="chevrons-up-down" size={13} color="var(--muted-fg)" />
                </button>
                {catMenuOpen && (
                  <>
                    <div onClick={() => setCatMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 31, minWidth: 190, background: "#fff", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", padding: 4, display: "flex", flexDirection: "column" }}>
                      {[{ id: "all", name: "Todas las categorías" }, ...sortedCats.map((c) => ({ id: c.id, name: c.name }))].map((opt) => (
                        <button key={opt.id} type="button" onClick={() => { setCatFilter(opt.id); setCatMenuOpen(false); }} style={{ textAlign: "left", padding: "7px 10px", borderRadius: 7, border: 0, background: catFilter === opt.id ? "var(--muted)" : "transparent", fontFamily: "inherit", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "var(--fg)" }}>{opt.name}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {hasCats && (
              <button type="button" onClick={() => setGrouped((g) => !g)} className="btn" title="Agrupar por categoría" style={{ background: grouped ? "var(--fg)" : "#fff", color: grouped ? "#fff" : "var(--fg)", border: grouped ? 0 : "1px solid var(--border)", gap: 6 }}>
                <Icon name="layers" size={13} color={grouped ? "#fff" : "var(--muted-fg)"} /> Agrupar
              </button>
            )}
          </div>

          {joined.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: "var(--muted-fg)" }}>Aún no hay inscritos.</div>
          ) : (
            <>
              <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)" }}>Bulk:</span>
                <button type="button" onClick={() => onSetAllCheckedIn(!allCheckedIn)} disabled={readOnly} className="btn" style={{ background: "#fff", border: "1px solid var(--border)", gap: 5 }}>
                  <Icon name={allCheckedIn ? "circle-x" : "user-check"} size={12} /> {allCheckedIn ? "Quitar presentes" : "Todos presentes"}
                </button>
                <button type="button" onClick={() => onSetAllPaid(!allPaid)} disabled={readOnly} className="btn" style={{ background: "#fff", border: "1px solid var(--border)", gap: 5 }}>
                  <Icon name={allPaid ? "circle-x" : "check-check"} size={12} /> {allPaid ? "Quitar pagos" : "Todos pagado"}
                </button>
                <span style={{ flex: 1 }} />
                {pendingPlayers.length > 0 && (
                  <button type="button" onClick={() => onRemind()} disabled={reminding || readOnly} className="btn" title="Notif + mensaje a los inscritos que aún no pagan (cooldown 30 min)" style={{ background: "var(--fg)", color: "#fff", border: 0, gap: 6 }}>
                    <Icon name="bell" size={13} color="#fff" /> Avisar a {pendingPlayers.length} pendiente{pendingPlayers.length === 1 ? "" : "s"} · {money(pendingCents)}
                  </button>
                )}
              </div>

              <div className="mp-touch-hscroll">
              <div style={{ minWidth: 560 }}>
              <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 10, padding: "9px 14px" }}>
                {headerCell("Inscrito")}
                {headerCell("Categoría")}
                {headerCell("Asistencia")}
                {headerCell("Aviso")}
                {headerCell("Pago")}
              </div>

              {visible.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: "var(--muted-fg)", borderTop: "1px solid var(--border)" }}>No hay jugadores que coincidan.</div>
              ) : grouped && hasCats ? (
                <>
                  {sortedCats.map((c) => {
                    const rows = visible.filter((p) => catIdByUser.get(p.user_id) === c.id);
                    if (rows.length === 0) return null;
                    return (
                      <div key={c.id}>
                        {groupHeader(`${c.name} · ${rows.length}`)}
                        {rows.map(Row)}
                      </div>
                    );
                  })}
                  {(() => {
                    const rows = visible.filter((p) => !catIdByUser.has(p.user_id));
                    if (rows.length === 0) return null;
                    return (
                      <div>
                        {groupHeader(`Sin categoría · ${rows.length}`)}
                        {rows.map(Row)}
                      </div>
                    );
                  })()}
                </>
              ) : (
                visible.map(Row)
              )}
              </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Columna lateral: datos de cobro + premios. */}
      <div style={{ flex: "1 1 280px", maxWidth: 360, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {acct && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, background: "var(--success-bg)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="landmark" size={16} color="var(--success-fg)" />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="label-mp" style={{ color: "var(--primary)" }}>Cobro</div>
                <div className="font-heading" style={{ fontSize: 13.5, fontWeight: 900, textTransform: "uppercase" }}>Datos del organizador<span className="dot">.</span></div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {acctRow("Banco", acct.bank, true)}
              {acctRow("Cuenta", `${acct.accountType === "ahorros" ? "Ahorros" : "Corriente"} · ${acct.accountNumber}`)}
              {acctRow("Titular", acct.holderName)}
              {acct.holderId && acctRow("Cédula / RUC", acct.holderId)}
            </div>
            {acct.note && (
              <div style={{ marginTop: 12, display: "flex", gap: 7, alignItems: "flex-start", padding: "9px 11px", borderRadius: 9, background: "var(--muted)", fontSize: 11.5, color: "var(--muted-fg)" }}>
                <Icon name="info" size={13} color="var(--muted-fg)" />
                <span style={{ minWidth: 0 }}>{acct.note}</span>
              </div>
            )}
            <button type="button" onClick={copyAcct} className="btn" style={{ marginTop: 12, width: "100%", justifyContent: "center", background: "#fff", border: "1px solid var(--border)", gap: 7 }}>
              <Icon name="copy" size={13} color="var(--muted-fg)" /> Copiar datos
            </button>
          </div>
        )}

        {Array.isArray(q.prizes) && q.prizes.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>Recompensas</div>
            <div className="font-heading" style={{ fontSize: 13.5, fontWeight: 900, textTransform: "uppercase", marginBottom: 10 }}>Premios<span className="dot">.</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(q.prizes as Prize[]).map((pz, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border)" }}>
                  <span className="font-heading" style={{ flexShrink: 0, minWidth: 22, fontSize: 13, fontWeight: 900, color: i === 0 ? "var(--primary)" : i === 1 ? "#fbbf24" : "var(--muted-fg)" }}>{pz.place}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pz.prize}</span>
                  {pz.valueCents != null && pz.valueCents > 0 && (
                    <span className="tabular" style={{ flexShrink: 0, fontSize: 11, fontWeight: 900, color: "var(--muted-fg)" }}>{money(pz.valueCents)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Resultados (puestos por categoría + finalizar) ──────────────────────
function ResultadosTab({ data, onChanged }: { data: ManageData; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const finished = data.quedada.status === "finished";
  const partById = new Map(data.participants.map((p) => [p.user_id, p]));
  const guestById = new Map(data.guests.map((g) => [g.id, g]));
  const nameFor = (id: string): string =>
    guestById.get(id)?.display_name ?? nameOf(partById.get(id)?.profiles ?? null);

  const cats = data.categories
    .map((c) => ({ cat: c, pairs: data.pairs.filter((p) => p.category_id === c.id).sort((a, b) => a.slot_no - b.slot_no) }))
    .filter((x) => x.pairs.length > 0);

  const [pos, setPos] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of data.pairs) {
      const fr = partById.get(p.player_a_id)?.final_rank ?? guestById.get(p.player_a_id)?.final_rank;
      if (fr != null) init[p.id] = String(fr);
    }
    return init;
  });

  const save = () => {
    if (pending) return;
    const results: { userId: string; finalRank: number | null }[] = [];
    for (const { pairs } of cats) {
      for (const p of pairs) {
        const v = (pos[p.id] ?? "").trim();
        const n = v ? parseInt(v, 10) : NaN;
        const finalRank = Number.isFinite(n) && n > 0 ? n : null;
        results.push({ userId: p.player_a_id, finalRank });
        if (p.player_b_id) results.push({ userId: p.player_b_id, finalRank });
      }
    }
    if (results.length === 0) {
      toast({ icon: "alert-triangle", title: "No hay parejas para puntuar" });
      return;
    }
    start(async () => {
      const res = await setQuedadaResults({ quedadaId: data.quedada.id, results });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: finished ? "Resultados actualizados" : "Quedada finalizada" });
      await onChanged();
    });
  };

  if (cats.length === 0) {
    return (
      <Section label="Cierre" title="Resultados">
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          Asigna parejas a las categorías (pestaña Parejas) para poder cargar resultados.
        </div>
      </Section>
    );
  }

  const posInput: React.CSSProperties = { width: 46, textAlign: "center", padding: "7px 4px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, fontWeight: 800, fontFamily: "inherit", outline: "none", background: "#fff", color: "var(--fg)" };

  return (
    <Section
      label="Cierre"
      title="Resultados por categoría"
      sub={finished ? "Quedada finalizada — puedes ajustar los puestos." : "Pon el puesto de cada pareja (1°, 2°, 3°…) y finaliza."}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {cats.map(({ cat, pairs }) => (
          <div key={cat.id} className="card" style={{ padding: 12 }}>
            <div className="font-heading" style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.01em", marginBottom: 8 }}>{cat.name}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pairs.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    min={1}
                    max={pairs.length}
                    value={pos[p.id] ?? ""}
                    onChange={(e) => setPos((m) => ({ ...m, [p.id]: e.target.value }))}
                    placeholder="#"
                    style={posInput}
                    aria-label="Puesto"
                  />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {nameFor(p.player_a_id)}
                    {p.player_b_id ? <><span style={{ color: "var(--muted-fg)", fontWeight: 800, margin: "0 4px" }}>+</span>{nameFor(p.player_b_id)}</> : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={save} disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>
            {!pending && <Icon name="flag" size={13} color="#fff" />}
            {pending ? "Guardando…" : finished ? "Guardar resultados" : "Guardar y finalizar"}
          </button>
        </div>
      </div>
    </Section>
  );
}

// ── Tab: Juego (motor americano — rondas, puntos, tabla individual) ──────────
// Usa el componente compartido QuedadaGameView con canManage=true. Los callbacks
// llaman las nuevas actions y refetchean (reload del panel via onChanged).
function JuegoTab({ data, onChanged }: { data: ManageData; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [, startTx] = useTransition();
  const q = data.quedada;
  const engine = getQuedadaEngine(q.format);
  const standingsMode = engine.standingsMode(q.match_mode);
  const hasGames = data.games.length > 0;
  const finished = q.status === "finished";
  const cancelled = q.status === "cancelled";

  const generateRound = (categoryId: string) => {
    startTx(async () => {
      const res = await generateQuedadaRound({ quedadaId: q.id, categoryId });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo generar la ronda", sub: res.error.message });
        return;
      }
      const byes = res.data.byes;
      toast({
        icon: "check-circle-2",
        title: `Ronda ${res.data.roundNo} generada`,
        sub: byes > 0 ? `${byes} jugador(es) descansan esta ronda` : undefined,
      });
      await onChanged();
    });
  };

  const createManualGame = (args: { categoryId: string; sideA: string[]; sideB: string[]; courtNo: number | null }) => {
    startTx(async () => {
      const res = await createManualQuedadaGame({ quedadaId: q.id, ...args });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo crear el partido", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: `Partido ${res.data.roundNo} creado` });
      await onChanged();
    });
  };

  const report = (gameId: string, pointsA: number, pointsB: number) => {
    startTx(async () => {
      const res = await reportGame({ gameId, pointsA, pointsB });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar el marcador", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Marcador guardado" });
      await onChanged();
    });
  };

  const removeRound = async (roundId: string) => {
    const ok = await confirm({
      title: "Borrar ronda",
      body: "Se borra la ronda con sus partidos y marcadores. ¿Seguir?",
      confirmLabel: "Borrar ronda",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    startTx(async () => {
      const res = await deleteRound({ roundId });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo borrar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Ronda borrada" });
      await onChanged();
    });
  };

  const doFinish = async () => {
    const ok = await confirm({
      title: "Cerrar quedada",
      body: "Se calcula el podio según el motor del formato y la quedada pasa a finalizada. ¿Cerrar?",
      confirmLabel: "Cerrar y publicar podio",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    startTx(async () => {
      const res = await finishQuedada({ quedadaId: q.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo cerrar", sub: res.error.message });
        return;
      }
      toast({ icon: "trophy", title: "Podio publicado" });
      await onChanged();
    });
  };

  return (
    <Section label="Juego" title="Partidos por categoría" sub={`Motor ${engine.label}: genera o crea partidos, carga puntos y mira la tabla.`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <QuedadaGameView
          categories={data.categories}
          pairs={data.pairs}
          participants={data.participants}
          guests={data.guests}
          rounds={data.rounds}
          games={data.games}
          meUserId={data.meUserId}
          matchMode={q.match_mode}
          format={q.format}
          formatLabel={engine.label}
          roundLabel={engine.roundLabel}
          tableEntityLabel={engine.tableEntityLabel}
          standingsMode={standingsMode}
          canGenerateRound={engine.canGenerateRound}
          canManualGame={engine.canManualGame}
          quedadaTargetPoints={data.quedada.target_points}
          canManage
          onGenerateRound={generateRound}
          onCreateManualGame={createManualGame}
          onReportGame={report}
          onDeleteRound={removeRound}
        />
        {hasGames && !finished && !cancelled && data.isCreator && (
          <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}>
            <button type="button" onClick={doFinish} className="btn btn-primary">
              <Icon name="trophy" size={14} color="#fff" /> Cerrar quedada y publicar podio
            </button>
          </div>
        )}
        {finished && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", padding: 12, borderRadius: 10, background: "var(--success-bg)", color: "var(--success-fg)", fontSize: 12.5, fontWeight: 800 }}>
            <Icon name="check-circle-2" size={15} color="var(--success-fg)" /> Quedada finalizada · revisa el podio en Resumen
          </div>
        )}
      </div>
    </Section>
  );
}

// ── 6. Link de inscripción ───────────────────────────────────────────────────
// Reusable: en Resumen (solo copiar) y en Configuración (con regenerar, si se
// pasan quedadaId + onChanged).
function InviteLinkSection({
  inviteCode,
  toast,
  quedadaId,
  onChanged,
  readOnly = false,
}: {
  inviteCode: string | null;
  toast: ReturnType<typeof useToast>;
  quedadaId?: string;
  onChanged?: () => Promise<void>;
  readOnly?: boolean;
}) {
  const { confirm } = usePromptModal();
  const [regenerating, startRegen] = useTransition();
  const link =
    inviteCode && typeof window !== "undefined"
      ? `${window.location.origin}/q/${inviteCode}`
      : inviteCode
        ? `/q/${inviteCode}`
        : null;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ icon: "check-circle-2", title: "Link copiado", sub: "Compártelo para que se inscriban." });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar", sub: "Copia el link manualmente." });
    }
  };

  const regenerate = async () => {
    if (!quedadaId || !onChanged) return;
    const ok = await confirm({
      title: "Regenerar link",
      body: "El link actual dejará de funcionar y se creará uno nuevo. ¿Continuar?",
      confirmLabel: "Regenerar",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    startRegen(async () => {
      const res = await regenerateInviteCode({ quedadaId });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo regenerar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Link regenerado", sub: "El anterior ya no sirve." });
      await onChanged();
    });
  };

  const canRegen = !!quedadaId && !!onChanged;

  return (
    <Section label="Compartir" title="Link de inscripción" sub="Compártelo para que se unan a la quedada.">
      {link ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              flex: 1,
              minWidth: 200,
              padding: "9px 12px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--muted)",
              fontSize: 12.5,
              fontWeight: 700,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "var(--fg)",
            }}
          >
            {link}
          </div>
          <button className="btn btn-primary" onClick={copy} style={{ flexShrink: 0 }}>
            <Icon name="copy" size={13} color="#fff" />
            Copiar link
          </button>
          {canRegen && (
            <button className="btn btn-outline" onClick={regenerate} disabled={regenerating || readOnly} style={{ flexShrink: 0 }}>
              <Icon name="refresh-cw" size={13} />
              {regenerating ? "Regenerando…" : "Regenerar"}
            </button>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          Esta quedada aún no tiene un código de invitación.
        </div>
      )}
    </Section>
  );
}

// ── 7. Detalles generales (editar lo del wizard, sin formato/modo) ───────────
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DetailsSection({ data, onSaved }: { data: ManageData; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const q = data.quedada;
  const [title, setTitle] = useState(q.title);
  const [description, setDescription] = useState(q.description ?? "");
  const [when, setWhen] = useState(isoToLocalInput(q.starts_at));
  const [location, setLocation] = useState(q.location_text ?? "");
  const [visibility, setVisibility] = useState<"open" | "private">(q.visibility);
  const [maxPlayers, setMaxPlayers] = useState(q.max_players != null ? String(q.max_players) : "");
  const [perks, setPerks] = useState(q.perks_text ?? "");

  const save = () => {
    if (pending) return;
    if (title.trim().length < 3) {
      toast({ icon: "alert-triangle", title: "El título es muy corto", sub: "Mínimo 3 caracteres." });
      return;
    }
    if (!when) {
      toast({ icon: "alert-triangle", title: "Falta la fecha y hora" });
      return;
    }
    start(async () => {
      const res = await updateQuedadaDetails({
        quedadaId: q.id,
        title: title.trim(),
        description: description.trim() || null,
        startsAt: new Date(when).toISOString(),
        locationText: location.trim() || null,
        visibility,
        maxPlayers: maxPlayers.trim() ? parseInt(maxPlayers, 10) : null,
        perks: perks.trim() || null,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Datos actualizados", sub: "Si cambiaste la fecha, avisamos a los inscritos." });
      await onSaved();
    });
  };

  return (
    <Section label="General" title="Detalles de la quedada" sub="Edita lo básico. El formato y el modo (singles/dobles) no se cambian tras crear.">
      <Field label="Título">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} style={fieldInput} />
      </Field>
      <Field label="Descripción">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} style={{ ...fieldInput, resize: "vertical" }} />
      </Field>
      <div className="mp-grid-form-2 gap-2.5">
        <Field label="Fecha y hora">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={fieldInput} />
        </Field>
        <Field label="Cupo máximo (opcional)">
          <input type="number" min={2} max={64} value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} placeholder="Sin límite" style={fieldInput} />
        </Field>
      </div>
      <Field label="Sede / ubicación">
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={140} placeholder="Club, dirección…" style={fieldInput} />
      </Field>
      <Field label="Visibilidad">
        <div style={{ display: "flex", gap: 8 }}>
          {([["open", "Abierta"], ["private", "Privada"]] as const).map(([v, label]) => {
            const on = visibility === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                style={{ flex: 1, padding: "9px 12px", borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: "pointer", border: on ? 0 : "1px solid var(--border)", background: on ? "var(--fg)" : "#fff", color: on ? "#fff" : "var(--muted-fg)" }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Beneficios / notas (opcional)">
        <input value={perks} onChange={(e) => setPerks(e.target.value)} maxLength={280} placeholder="Hidratación, premios, etc." style={fieldInput} />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={save} disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>
          {!pending && <Icon name="save" size={13} color="#fff" />}
          {pending ? "Guardando…" : "Guardar detalles"}
        </button>
      </div>
    </Section>
  );
}

// ── 8. Motor de juego (engine_mode + target_points) ──────────────────────────
function EngineSection({ data, onSaved }: { data: ManageData; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const engine = getQuedadaEngine(data.quedada.format);
  const hasGames = data.games.length > 0;
  const [mode, setMode] = useState<"rounds" | "rolling">(data.quedada.engine_mode);
  const [target, setTarget] = useState(data.quedada.target_points != null ? String(data.quedada.target_points) : "");

  const save = () => {
    if (pending) return;
    start(async () => {
      const res = await updateQuedadaLogistics({
        quedadaId: data.quedada.id,
        targetPoints: target.trim() ? parseInt(target, 10) : null,
        ...(hasGames ? {} : { engineMode: mode === "rolling" ? "rounds" : mode }),
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Motor actualizado" });
      await onSaved();
    });
  };

  return (
    <Section
      label="Juego"
      title="Motor de juego"
      titleTip="Genera rondas automáticas o crea partidos a mano según el formato. No cambia el formato de la quedada."
      sub={`Formato ${engine.label}: ${engine.canGenerateRound ? "emparejamiento automático por rondas" : "partidos manuales"}.`}
    >
      <Field label="Modo de emparejamiento">
        <div style={{ display: "flex", gap: 8 }}>
          {([["rounds", "Por rondas"], ["rolling", "Continuo por cancha"]] as const).map(([v, label]) => {
            const on = mode === v;
            const rollingWip = v === "rolling";
            const disabled = hasGames || rollingWip;
            return (
              <button
                key={v}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setMode(v)}
                title={rollingWip ? "El modo continuo se habilitará cuando la vista por cancha esté completa para jugadores" : hasGames ? "No puedes cambiar el motor con partidos ya generados" : undefined}
                style={{ flex: 1, padding: "9px 12px", borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: disabled ? "default" : "pointer", opacity: disabled && !on ? 0.5 : 1, border: on ? 0 : "1px solid var(--border)", background: on ? "var(--fg)" : "#fff", color: on ? "#fff" : "var(--muted-fg)" }}
              >
                {label}{rollingWip ? " · En pausa" : ""}
              </button>
            );
          })}
        </div>
      </Field>
      <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
        Por ahora usamos rondas. El modo continuo se habilitará cuando la vista por cancha esté completa para jugadores.
      </div>
      {hasGames && (
        <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          El modo está bloqueado porque ya hay partidos generados.
        </div>
      )}
      <Field label="Puntos por partido (target)">
        <input type="number" min={1} max={999} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="24" style={fieldInput} />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={save} disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>
          {!pending && <Icon name="save" size={13} color="#fff" />}
          {pending ? "Guardando…" : "Guardar motor"}
        </button>
      </div>
    </Section>
  );
}

// ── 9. Zona de peligro (cancelar) ────────────────────────────────────────────
function DangerZoneSection({ onCancel, canceling, status }: { onCancel: () => void; canceling: boolean; status: string }) {
  const terminal = status === "cancelled" || status === "finished";
  return (
    <div className="card" style={{ padding: 16, border: "1px solid var(--destructive-border)", background: "var(--destructive-bg)" }}>
      <Section label="Cuidado" title="Zona de peligro" sub="Acciones irreversibles. Avisamos a los inscritos.">
        {terminal ? (
          <div style={{ fontSize: 12.5, color: "var(--muted-fg)" }}>
            Esta quedada ya está {status === "cancelled" ? "cancelada" : "finalizada"}.
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: "var(--fg)" }}>Cancelar la quedada notifica a los inscritos y no se puede deshacer.</span>
            <button
              type="button"
              onClick={onCancel}
              disabled={canceling}
              className="btn"
              style={{ flexShrink: 0, background: "#dc2626", color: "#fff", border: "1px solid #dc2626", opacity: canceling ? 0.6 : 1 }}
            >
              <Icon name="circle-x" size={13} color="#fff" />
              Cancelar quedada
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── 1. Logística ─────────────────────────────────────────────────────────────
function LogisticsSection({ data, onSaved }: { data: ManageData; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [courts, setCourts] = useState(data.quedada.courts_count != null ? String(data.quedada.courts_count) : "");
  const [hours, setHours] = useState(data.quedada.hours != null ? String(data.quedada.hours) : "");
  const [price, setPrice] = useState(centsToInput(data.quedada.court_price_cents));

  const courtsN = Number(courts);
  const hoursN = Number(hours);
  const priceCents = dollarsToCents(price);
  const hasAll =
    Number.isFinite(courtsN) && courtsN > 0 &&
    Number.isFinite(hoursN) && hoursN > 0 &&
    priceCents != null && priceCents > 0;
  const totalCents = hasAll ? Math.round(courtsN * hoursN * priceCents) : null;
  const playerCount = data.participants.filter((p) => p.status === "joined").length;
  const perPlayerCents = totalCents != null && playerCount > 0 ? Math.ceil(totalCents / playerCount) : null;

  const save = () => {
    if (pending) return;
    start(async () => {
      const res = await updateQuedadaLogistics({
        quedadaId: data.quedada.id,
        courtsCount: courts.trim() ? courtsN : null,
        hours: hours.trim() ? hoursN : null,
        courtPriceCents: priceCents,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Logística guardada" });
      await onSaved();
    });
  };

  return (
    <Section
      label="Costos"
      title="Logística de canchas"
      titleTip="Opcional. Calcula costo total y un reparto sugerido según los inscritos actuales."
      sub="Define cuántas canchas, horas y el precio por hora."
    >
      <div className="mp-grid-form-3 gap-2.5">
        <Field label="Canchas (#)">
          <input type="number" min={1} value={courts} onChange={(e) => setCourts(e.target.value)} placeholder="2" style={fieldInput} />
        </Field>
        <Field label="Horas">
          <input type="number" min={0.5} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="2" style={fieldInput} />
        </Field>
        <Field label="Precio cancha/hora ($)">
          <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="12" style={fieldInput} />
        </Field>
      </div>

      <div
        className="card"
        style={{
          padding: 14,
          background: "var(--color-mp-primary-light)",
          border: "1px solid var(--primary)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
          <span style={{ color: "var(--color-mp-primary-active)", fontWeight: 700 }}>Costo total estimado</span>
          <span className="font-heading" style={{ fontWeight: 900, color: "var(--color-mp-primary-active)" }}>
            {totalCents != null ? money(totalCents) : "—"}
          </span>
        </div>
        {totalCents != null && (
          <div style={{ fontSize: 11, color: "var(--color-mp-primary-active)" }}>
            {courtsN} cancha(s) × {hoursN} h × {money(priceCents!)} /hora
          </div>
        )}
        {perPlayerCents != null && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, paddingTop: 6, borderTop: "1px dashed rgba(6,95,70,0.3)" }}>
            <span style={{ color: "var(--color-mp-primary-active)" }}>Reparto sugerido · {playerCount} jugador(es)</span>
            <span style={{ fontWeight: 800, color: "var(--color-mp-primary-active)" }}>{money(perPlayerCents)} c/u</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={save} disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>
          {!pending && <Icon name="save" size={13} color="#fff" />}
          {pending ? "Guardando…" : "Guardar logística"}
        </button>
      </div>
    </Section>
  );
}

// ── 2. Datos bancarios + premios ─────────────────────────────────────────────
function BankPrizesSection({ data, onSaved }: { data: ManageData; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [bank, setBank] = useState<BankDraft>(accountToBankDraft(data.quedada.payment_account));
  const [prizeRows, setPrizeRows] = useState<PrizeDraft[]>(prizesToDrafts(data.quedada.prizes));
  const [ruleRows, setRuleRows] = useState<RuleDraft[]>(rulesToDrafts(data.quedada.rules));

  const save = () => {
    if (pending) return;
    if (bankDraftIsIncomplete(bank)) {
      toast({ icon: "alert-triangle", title: "Completa los datos del banco", sub: "Banco, tipo, número y titular, o déjalos vacíos." });
      return;
    }
    start(async () => {
      const res = await updateQuedadaLogistics({
        quedadaId: data.quedada.id,
        paymentAccount: bankDraftToAccount(bank),
        prizes: prizeDraftsToPrizes(prizeRows),
        rules: ruleDraftsToRules(ruleRows),
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Datos guardados" });
      await onSaved();
    });
  };

  return (
    <Section
      label="Cobro"
      title="Datos del organizador, premios y reglas"
      titleTip="Lo que guardes aquí lo ven los inscritos al pagar y en el detalle público de la quedada."
      sub="Para que los jugadores te transfieran y vean qué se juega y las reglas."
    >
      <Field
        label="Datos del organizador (para el pago)"
        tip="Aparecen en Pagos y al inscribirse. Completa todo o déjalo vacío si no usas transferencia."
      >
        <BankAccountFields value={bank} onChange={setBank} />
      </Field>
      <Field label="Premios" tip="Se listan en el resumen de la quedada. El valor en verde es opcional si solo describes el premio.">
        <PrizesEditor value={prizeRows} onChange={setPrizeRows} />
      </Field>
      <Field label="Reglas clave">
        <RulesEditor value={ruleRows} onChange={setRuleRows} />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={save} disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>
          {!pending && <Icon name="save" size={13} color="#fff" />}
          {pending ? "Guardando…" : "Guardar datos"}
        </button>
      </div>
    </Section>
  );
}

// ── 3. Co-hosts ──────────────────────────────────────────────────────────────
function CohostsSection({ data, onChanged }: { data: ManageData; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Player[]>([]);

  // Evitar elegir al creador o a co-hosts existentes en el picker.
  const excludeIds = [data.quedada.creator_id, ...data.cohosts.map((c) => c.user_id)];

  const add = () => {
    if (pending) return;
    if (picked.length === 0) {
      toast({ icon: "alert-triangle", title: "Elige a alguien primero" });
      return;
    }
    start(async () => {
      for (const p of picked) {
        const res = await addCohost({ quedadaId: data.quedada.id, userId: p.id });
        if (!res.ok) {
          toast({ icon: "alert-triangle", title: "No se pudo agregar", sub: res.error.message });
          return;
        }
      }
      toast({ icon: "check-circle-2", title: "Co-host agregado" });
      setPicked([]);
      await onChanged();
    });
  };

  const remove = async (c: ManageCohost) => {
    const ok = await confirm({
      title: "Quitar co-host",
      body: `¿Seguro que quieres quitar a ${nameOf(c.profiles)} como co-host?`,
      confirmLabel: "Quitar",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    start(async () => {
      const res = await removeCohost({ quedadaId: data.quedada.id, userId: c.user_id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo quitar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Co-host quitado" });
      await onChanged();
    });
  };

  return (
    <Section label="Equipo" title="Co-hosts" sub="Pueden gestionar parejas, cupos y pagos.">
      {data.cohosts.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.cohosts.map((c) => (
            <div
              key={c.user_id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "#fff",
              }}
            >
              <div style={{ minWidth: 0, overflow: "hidden" }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nameOf(c.profiles)}
                </div>
                {c.profiles?.username && (
                  <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>@{c.profiles.username}</div>
                )}
              </div>
              <button
                className="btn"
                onClick={() => remove(c)}
                disabled={pending}
                aria-label="Quitar co-host"
                style={{ background: "#fff", border: "1px solid var(--destructive-border)", color: "var(--destructive-fg)", padding: "6px 10px", flexShrink: 0 }}
              >
                <Icon name="x" size={12} color="var(--destructive-fg)" />
                Quitar
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Todavía no hay co-hosts.</div>
      )}

      <PlayerPicker label="Agregar co-host" max={5} selected={picked} onChange={setPicked} excludeIds={excludeIds} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-outline" onClick={add} disabled={pending || picked.length === 0}>
          <Icon name="user-plus" size={13} />
          Agregar co-host
        </button>
      </div>
    </Section>
  );
}

// ── 4. Categorías ────────────────────────────────────────────────────────────
function CategoriesSection({ data, onChanged }: { data: ManageData; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const del = async (c: ManageCategory) => {
    const ok = await confirm({
      title: "Borrar categoría",
      body: `¿Seguro que quieres borrar “${c.name}”? Se eliminan sus cupos y parejas.`,
      confirmLabel: "Borrar categoría",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteCategory({ categoryId: c.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo borrar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Categoría borrada" });
      await onChanged();
    });
  };

  return (
    <Section
      label="Setup"
      title="Categorías"
      titleTip="Un jugador puede estar en varias categorías; cada una genera su propio cupo y pago."
      sub="Cada categoría tiene su hora y cupos."
    >
      {data.categories.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.categories.map((c) =>
            editing === c.id ? (
              <CategoryForm
                key={c.id}
                quedadaId={data.quedada.id}
                category={c}
                onDone={async () => {
                  setEditing(null);
                  await onChanged();
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  background: "#fff",
                }}
              >
                <div style={{ minWidth: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                    {c.level_label ? <span style={{ color: "var(--muted-fg)", fontWeight: 600 }}> · {c.level_label}</span> : null}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {c.starts_at && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Icon name="clock" size={11} color="var(--muted-fg)" />
                        {hourLabel(c.starts_at)}
                      </span>
                    )}
                    <span>{c.max_slots ?? "—"} slot(s)</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    className="btn"
                    onClick={() => setEditing(c.id)}
                    disabled={pending}
                    aria-label="Editar categoría"
                    style={{ background: "#fff", border: "1px solid var(--border)", padding: "6px 9px" }}
                  >
                    <Icon name="pencil" size={12} />
                  </button>
                  <button
                    className="btn"
                    onClick={() => del(c)}
                    disabled={pending}
                    aria-label="Borrar categoría"
                    style={{ background: "#fff", border: "1px solid var(--destructive-border)", color: "var(--destructive-fg)", padding: "6px 9px" }}
                  >
                    <Icon name="trash-2" size={12} color="var(--destructive-fg)" />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Aún no hay categorías.</div>
      )}

      {showCreate ? (
        <CategoryForm
          quedadaId={data.quedada.id}
          onDone={async () => {
            setShowCreate(false);
            await onChanged();
          }}
          onCancel={() => setShowCreate(false)}
        />
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-outline" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={13} />
            Crear categoría
          </button>
        </div>
      )}
    </Section>
  );
}

// Form de crear/editar categoría. Si recibe `category`, edita; si no, crea.
function CategoryForm({
  quedadaId,
  category,
  onDone,
  onCancel,
}: {
  quedadaId: string;
  category?: ManageCategory;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const initLevel = category ? parseSuma(category.level_label) : { suma: 6, noLevel: false };
  const [name, setName] = useState(category?.name ?? "");
  const [suma, setSuma] = useState(initLevel.suma);
  const [noLevel, setNoLevel] = useState(initLevel.noLevel);
  const [hour, setHour] = useState(hourLabel(category?.starts_at ?? null));
  const [maxSlots, setMaxSlots] = useState(category?.max_slots != null ? String(category.max_slots) : "");
  const [targetPoints, setTargetPoints] = useState(category?.target_points != null ? String(category.target_points) : "");

  // Hora "HH:mm" → ISO usando hoy como fecha base (v1: solo importa la hora).
  const hourToIso = (hh: string): string | undefined => {
    const t = hh.trim();
    if (!t) return undefined;
    const m = /^(\d{1,2}):(\d{2})$/.exec(t);
    if (!m) return undefined;
    const d = new Date();
    d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
    return d.toISOString();
  };

  const submit = () => {
    if (pending) return;
    if (!name.trim()) {
      toast({ icon: "alert-triangle", title: "La categoría necesita un nombre" });
      return;
    }
    const slotsN = maxSlots.trim() ? parseInt(maxSlots, 10) : undefined;
    const targetN = targetPoints.trim() ? parseInt(targetPoints, 10) : undefined;
    start(async () => {
      const res = category
        ? await updateCategory({
            categoryId: category.id,
            name: name.trim(),
            levelLabel: noLevel ? null : sumaLabel(suma),
            startsAt: hourToIso(hour) ?? null,
            maxSlots: slotsN ?? null,
            targetPoints: targetN ?? null,
          })
        : await createCategory({
            quedadaId,
            name: name.trim(),
            levelLabel: noLevel ? undefined : sumaLabel(suma),
            startsAt: hourToIso(hour),
            maxSlots: slotsN,
            targetPoints: targetN,
          });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: category ? "Categoría actualizada" : "Categoría creada" });
      await onDone();
    });
  };

  return (
    <div className="card" style={{ padding: 14, background: "var(--muted)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="mp-grid-form-2 gap-2.5">
        <Field label="Nombre">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Suma 6.0 / Open Mixto" maxLength={60} style={fieldInput} />
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: noLevel ? "var(--muted-fg)" : "var(--fg)" }}>
              Nivel (Suma){noLevel ? "" : <span style={{ color: "var(--primary)", marginLeft: 6 }}>{suma.toFixed(1)}</span>}
            </span>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--muted-fg)", cursor: "pointer" }}>
              <input type="checkbox" checked={noLevel} onChange={(e) => setNoLevel(e.target.checked)} style={{ accentColor: "var(--primary)" }} />
              Sin nivel (Open)
            </label>
          </div>
          {!noLevel && (
            <>
              <input type="range" min={SUMA_MIN} max={SUMA_MAX} step={0.5} value={suma} onChange={(e) => setSuma(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "var(--primary)", cursor: "pointer" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--muted-fg)" }}>
                <span>{SUMA_MIN.toFixed(1)}</span>
                <span>{SUMA_MAX.toFixed(1)}</span>
              </div>
            </>
          )}
        </div>
        <Field label="Hora · opcional">
          <input type="time" value={hour} onChange={(e) => setHour(e.target.value)} style={fieldInput} />
        </Field>
        <Field label="Cupos">
          <input type="number" min={1} value={maxSlots} onChange={(e) => setMaxSlots(e.target.value)} placeholder="8" style={fieldInput} />
        </Field>
        <Field label="Partido a X puntos">
          <input type="number" min={1} max={999} value={targetPoints} onChange={(e) => setTargetPoints(e.target.value)} placeholder="24" style={fieldInput} />
        </Field>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="btn btn-outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>
          {!pending && <Icon name="check" size={13} color="#fff" />}
          {pending ? "Guardando…" : category ? "Guardar cambios" : "Crear categoría"}
        </button>
      </div>
    </div>
  );
}

// ── 5. Roster por categoría (parejas fijas o jugadores individuales) ──────────
function SlotsSection({ data, onChanged }: { data: ManageData; onChanged: () => Promise<void> }) {
  const readOnly = quedadaIsLocked(data.quedada.status);
  const individualRoster = rosterModeFor(data.quedada.format, data.quedada.match_mode) === "individual";
  const title = individualRoster ? "Jugadores por categoría" : "Parejas por categoría";
  const sub = individualRoster ? "Asigna un jugador a cada cupo; el motor decide cómo rota en los partidos." : "Asigna parejas a cada cupo.";
  return (
    <Section label="Roster" title={title} sub={sub}>
      {data.categories.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          Crea al menos una categoría (en Configurar) para asignar {individualRoster ? "jugadores" : "parejas"}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.categories.map((c, i) => (
            <div key={c.id} className="mp-rise" style={{ animationDelay: `${i * 50}ms` }}>
              <CategorySlots data={data} category={c} onChanged={onChanged} readOnly={readOnly} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function CategorySlots({
  data,
  category,
  onChanged,
  readOnly = false,
}: {
  data: ManageData;
  category: ManageCategory;
  onChanged: () => Promise<void>;
  readOnly?: boolean;
}) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [, startTx] = useTransition();
  const [open, setOpen] = useState(true);
  const [assigningSlot, setAssigningSlot] = useState<number | null>(null);
  const individualRoster = rosterModeFor(data.quedada.format, data.quedada.match_mode) === "individual";
  const isDoubles = !individualRoster && data.quedada.match_mode === "doubles";
  const unitWord = individualRoster ? "jugador" : "pareja";

  const slotCount = category.max_slots ?? 0;
  const pairsBySlot = new Map<number, ManagePair>();
  for (const p of data.pairs) if (p.category_id === category.id) pairsBySlot.set(p.slot_no, p);
  const slots = slotCount > 0 ? Array.from({ length: slotCount }, (_, i) => i + 1) : [];
  const filled = pairsBySlot.size;
  const partById = new Map(data.participants.map((p) => [p.user_id, p]));
  const guestById = new Map(data.guests.map((g) => [g.id, g]));
  const nameFor = (id: string | null): string | null =>
    id ? guestById.get(id)?.display_name ?? nameOf(partById.get(id)?.profiles ?? null) : null;

  // Inscritos joined + walk-ins que aún no están en un cupo de esta categoría
  // (candidatos para asignación manual y para el llenado al azar).
  const assignedInCat = new Set<string>();
  for (const p of pairsBySlot.values()) {
    assignedInCat.add(p.player_a_id);
    if (p.player_b_id) assignedInCat.add(p.player_b_id);
  }
  const available = [
    ...data.participants
      .filter((p) => p.status === "joined" && !assignedInCat.has(p.user_id))
      .map((p) => ({ id: p.user_id, name: nameOf(p.profiles) })),
    ...data.guests
      .filter((g) => !assignedInCat.has(g.id))
      .map((g) => ({ id: g.id, name: `${g.display_name} (walk-in)` })),
  ];
  const emptyCount = slots.length - pairsBySlot.size;

  const autoFill = () => {
    startTx(async () => {
      const res = await autoAssignCategory({ quedadaId: data.quedada.id, categoryId: category.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo llenar al azar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: `${res.data.assigned} cupo${res.data.assigned === 1 ? "" : "s"} llenado${res.data.assigned === 1 ? "" : "s"} al azar` });
      await onChanged();
    });
  };

  const removePairById = async (pairId: string, slotNo: number) => {
    const ok = await confirm({
      title: `Quitar ${unitWord}`,
      body: `¿Quitar ${individualRoster ? "el jugador" : "la pareja"} del cupo ${slotNo} de “${category.name}”?`,
      confirmLabel: "Quitar",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    startTx(async () => {
      const res = await removePair({ pairId });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo quitar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: individualRoster ? "Jugador quitado" : "Pareja quitada" });
      await onChanged();
    });
  };

  return (
    <div className="card" style={{ padding: 14 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 8, width: "100%" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.01em" }}>{category.name}</span>
            {category.starts_at && (
              <span style={{ fontSize: 11, color: "var(--muted-fg)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="clock" size={11} color="var(--muted-fg)" /> {hourLabel(category.starts_at)}
              </span>
            )}
          </div>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 900, padding: "2px 8px", borderRadius: 9999, background: filled > 0 ? "var(--color-mp-primary-light)" : "var(--muted)", color: filled > 0 ? "var(--color-mp-primary-active)" : "var(--muted-fg)", flexShrink: 0 }}>
          {filled}/{slotCount || "?"}
        </span>
        <span style={{ transition: "transform 200ms var(--ease-out)", transform: open ? "rotate(180deg)" : "none", display: "inline-flex", color: "var(--muted-fg)", flexShrink: 0 }}>
          <Icon name="chevron-down" size={16} color="var(--muted-fg)" />
        </span>
      </button>

      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 240ms var(--ease-out)" }}>
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div style={{ paddingTop: 12 }}>
            {slots.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Define cuántos cupos tiene esta categoría (en Configurar).</div>
            ) : (
              <>
                {emptyCount > 0 && available.length > 0 && !readOnly && (
                  <div style={{ marginBottom: 10 }}>
                    <button
                      type="button"
                      onClick={autoFill}
                      className="btn"
                      style={{ background: "#fff", border: "1px solid var(--border)" }}
                      title="Reparte los inscritos disponibles al azar en los cupos vacíos"
                    >
                      <Icon name="shuffle" size={12} /> Llenar al azar
                    </button>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8 }}>
                  {slots.map((n) => {
                    const pair = pairsBySlot.get(n) ?? null;
                    return (
                      <SlotCell
                        key={n}
                        slotNo={n}
                        filled={!!pair}
                        nameA={pair ? nameFor(pair.player_a_id) : null}
                        nameB={pair ? nameFor(pair.player_b_id) : null}
                        active={assigningSlot === n}
                        onAssign={readOnly ? undefined : () => setAssigningSlot(n)}
                        onRemove={readOnly || !pair ? undefined : () => removePairById(pair.id, n)}
                      />
                    );
                  })}
                </div>
                {assigningSlot != null && (
                  <div style={{ marginTop: 10 }} className="mp-tab-in">
                    <AssignPairForm
                      data={data}
                      category={category}
                      slotNo={assigningSlot}
                      isDoubles={isDoubles}
                      available={available}
                      onDone={async () => {
                        setAssigningSlot(null);
                        await onChanged();
                      }}
                      onCancel={() => setAssigningSlot(null)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlotCell({
  slotNo,
  filled,
  nameA,
  nameB,
  active,
  onAssign,
  onRemove,
}: {
  slotNo: number;
  filled: boolean;
  nameA: string | null;
  nameB: string | null;
  active: boolean;
  onAssign?: () => void;
  onRemove?: () => void;
}) {
  // Pestaña de número a la izquierda, de altura completa (ancla los dos pisos).
  const tab = (
    <div
      className="font-heading tabular"
      style={{
        width: 30,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 900,
        background: filled ? "var(--primary)" : "transparent",
        color: filled ? "#fff" : "var(--muted-fg)",
        borderRight: filled ? "0" : "1px dashed var(--border)",
      }}
    >
      {slotNo}
    </div>
  );

  const cellStyle: React.CSSProperties = {
    borderRadius: 10,
    border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)",
    background: filled ? "#fff" : "var(--muted)",
    overflow: "hidden",
    display: "flex",
    alignItems: "stretch",
    transition: "border-color 150ms var(--ease-out), background 150ms var(--ease-out)",
  };

  const nameStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--fg)" };
  const removeBtn = onRemove ? (
    <button
      type="button"
      onClick={onRemove}
      aria-label="Quitar del cupo"
      style={{ flexShrink: 0, background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", display: "inline-flex", padding: 2 }}
    >
      <Icon name="x" size={13} color="var(--muted-fg)" />
    </button>
  ) : null;

  if (!filled) {
    return (
      <div style={cellStyle}>
        {tab}
        {onAssign ? (
          <button
            type="button"
            onClick={onAssign}
            style={{ flex: 1, textAlign: "left", background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 11px" }}
          >
            <Icon name="plus" size={12} color="var(--muted-fg)" /> Asignar
          </button>
        ) : (
          <span style={{ flex: 1, padding: "9px 11px", fontSize: 12, fontWeight: 700, color: "var(--muted-fg)" }}>Vacío</span>
        )}
      </div>
    );
  }

  // Singles: un solo piso.
  if (nameB == null) {
    return (
      <div style={cellStyle}>
        {tab}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "9px 11px" }}>
          <span style={{ ...nameStyle, flex: 1 }}>{nameA}</span>
          {removeBtn}
        </div>
      </div>
    );
  }

  // Dobles: A arriba, raya, B abajo (la pestaña de número los ancla).
  return (
    <div style={cellStyle}>
      {tab}
      <div style={{ flex: 1, minWidth: 0, padding: "8px 11px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...nameStyle, flex: 1 }}>{nameA}</span>
          {removeBtn}
        </div>
        <div style={{ borderTop: "1px solid var(--border)", margin: "7px 0" }} />
        <span style={{ ...nameStyle, display: "block" }}>{nameB}</span>
      </div>
    </div>
  );
}

function AssignPairForm({
  data,
  category,
  slotNo,
  isDoubles,
  available,
  onDone,
  onCancel,
}: {
  data: ManageData;
  category: ManageCategory;
  slotNo: number;
  isDoubles: boolean;
  available: { id: string; name: string }[];
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");

  const submit = () => {
    if (pending) return;
    if (!aId) {
      toast({ icon: "alert-triangle", title: isDoubles ? "Elige al jugador A" : "Elige al jugador" });
      return;
    }
    if (isDoubles && !bId) {
      toast({ icon: "alert-triangle", title: "Elige al jugador B", sub: "En dobles la pareja necesita dos jugadores." });
      return;
    }
    start(async () => {
      const res = await assignPair({
        quedadaId: data.quedada.id,
        categoryId: category.id,
        slotNo,
        playerAId: aId,
        playerBId: isDoubles ? bId : null,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo asignar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: `${isDoubles ? "Pareja" : "Jugador"} asignad${isDoubles ? "a" : "o"} al cupo ${slotNo}` });
      await onDone();
    });
  };

  const selStyle: React.CSSProperties = { ...fieldInput, cursor: "pointer" };

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, background: "var(--muted)", borderRadius: 10, border: "1px solid var(--border)" }}>
      {available.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          No hay inscritos disponibles sin asignar en esta categoría.
        </div>
      ) : (
        <>
          <div className={isDoubles ? "mp-grid-form-2 gap-2.5" : "grid grid-cols-1 gap-2.5"}>
            <Field label={isDoubles ? "Jugador A" : "Jugador"}>
              <select value={aId} onChange={(e) => setAId(e.target.value)} style={selStyle}>
                <option value="">Elige inscrito…</option>
                {available.filter((p) => p.id !== bId).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            {isDoubles && (
              <Field label="Jugador B">
                <select value={bId} onChange={(e) => setBId(e.target.value)} style={selStyle}>
                  <option value="">Elige inscrito…</option>
                  {available.filter((p) => p.id !== aId).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-outline" onClick={onCancel} disabled={pending}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>
              {!pending && <Icon name="check" size={13} color="#fff" />}
              {pending ? "Asignando…" : isDoubles ? "Asignar pareja" : "Asignar jugador"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--muted-fg)",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        <LabelWithTip tip={tip}>{label}</LabelWithTip>
      </span>
      {children}
    </div>
  );
}
