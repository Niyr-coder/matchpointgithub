// Panel de gestión del organizador de una Quedada (juego social).
//
// Se renderiza como PÁGINA (variant="page", default de la ruta
// /dashboard/[role]/quedada/[id]) o como modal (variant="modal"). En página no
// recibe onClose: el botón "Volver" navega a la lista. Recibe `quedadaId`.
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
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
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
  updateQuedadaLogistics,
  addCohost,
  removeCohost,
  setQuedadaStatus,
  setQuedadaResults,
  cancelQuedada,
  generateGroupStage,
  reportQuedadaMatch,
  deleteQuedadaMatch,
} from "@/server/actions/quedadas";
import type { PaymentAccount, Prize } from "@/lib/schemas/quedadas";
import {
  BankAccountFields,
  accountToBankDraft,
  bankDraftToAccount,
  bankDraftIsIncomplete,
  type BankDraft,
} from "./quedada-fields/BankAccountFields";
import { PrizesEditor, prizesToDrafts, prizeDraftsToPrizes, type PrizeDraft } from "./quedada-fields/PrizesEditor";
import { SUMA_MIN, SUMA_MAX, parseSuma, sumaLabel } from "@/lib/quedadas/level";
import { Skeleton as SkBar } from "@/components/ui/Skeleton";

// ── Tipos del payload (la action devuelve `unknown`) ─────────────────────────
type ManageQuedada = {
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
  perks_text: string | null;
  fee_cents: number;
  max_players: number | null;
  courts_count: number | null;
  hours: number | null;
  court_price_cents: number | null;
  payment_account: PaymentAccount | null;
  prizes: Prize[] | null;
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
  sort_order: number;
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
  points: number | null;
  final_rank: number | null;
  profiles: { display_name: string | null; username: string | null } | null;
};
type ManageCohost = {
  user_id: string;
  profiles: { display_name: string | null; username: string | null } | null;
};
type ManageMatch = {
  id: string;
  category_id: string;
  group_no: number;
  court_no: number | null;
  round_no: number;
  pair_a_id: string;
  pair_b_id: string | null;
  points_a: number | null;
  points_b: number | null;
  status: string;
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
  matches: ManageMatch[];
};

const FORMAT_LABEL: Record<string, string> = {
  americano: "Americano",
  mexicano: "Mexicano",
  round_robin: "Round Robin",
  kotc: "Rey de Cancha",
  canguil: "Canguil",
  libre: "Libre",
};

type TabKey = "resumen" | "parejas" | "partidos" | "posiciones" | "pagos" | "resultados" | "config";

function quedadaStatusMeta(status: string): { label: string; bg: string; fg: string } {
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
  tone?: "neutral" | "primary" | "danger";
}) {
  // Botones sólidos (sin glass) según su función.
  const palette =
    tone === "danger"
      ? { bg: "#dc2626", fg: "#fff", border: "#dc2626" }
      : tone === "primary"
        ? { bg: "var(--primary)", fg: "#fff", border: "var(--primary)" }
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

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 10, padding: "8px 12px", minWidth: 78 }}>
      <div className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900, lineHeight: 1, color: "#fff" }}>{value}</div>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.62)", marginTop: 4 }}>{label}</div>
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
function hourLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}


export function QuedadaManagePanel({
  quedadaId,
  onClose,
  variant = "modal",
}: {
  quedadaId: string;
  onClose?: () => void;
  variant?: "modal" | "page";
}) {
  const router = useRouter();
  // En modo página no se pasa onClose: el botón "Volver" navega a la lista.
  const close = onClose ?? (() => router.push("/dashboard/user/quedadas"));
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [busy, startBusy] = useTransition();
  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("resumen");
  const [section, setSection] = useState<"gestion" | "juego">("gestion");

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
      { table: "quedada_categories", filter: `quedada_id=eq.${quedadaId}` },
      { table: "quedada_matches", filter: `quedada_id=eq.${quedadaId}` },
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
      if (targets.length === 0) return;
      setData((d) =>
        d ? { ...d, participants: d.participants.map((p) => (p.status === "joined" ? { ...p, paid } : p)) } : d,
      );
      let failed = false;
      Promise.all(targets.map((t) => setParticipantPaid({ quedadaId, userId: t.user_id, paid }))).then((results) => {
        if (results.some((r) => !r.ok)) failed = true;
        if (failed) {
          toast({ icon: "alert-triangle", title: "Algunos pagos no se guardaron", sub: "Recarga para ver el estado real." });
        }
      });
    },
    [data, quedadaId, toast],
  );

  // Transiciones de estado (creador): cerrar inscripciones / iniciar / reabrir.
  const changeStatus = (status: "registration_open" | "registration_closed" | "live") => {
    startBusy(async () => {
      const res = await setQuedadaStatus({ quedadaId, status });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo cambiar el estado", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Estado actualizado" });
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

  const isPage = variant === "page";
  const q = data?.quedada ?? null;
  const joinedCount = data ? data.participants.filter((p) => p.status === "joined").length : 0;
  const paidCount = data ? data.participants.filter((p) => p.paid).length : 0;
  const sm = q ? quedadaStatusMeta(q.status) : null;

  // Dos niveles: arriba GESTIÓN vs JUEGO (el motor), abajo los sub-tabs de cada uno.
  const showResultados =
    !!data?.isCreator &&
    !!q &&
    (q.status === "registration_closed" || q.status === "live" || q.status === "finished");
  // Gestión = setup; Juego = el motor (partidos + resultados/podio).
  const gestionTabs: { k: TabKey; label: string }[] = [
    { k: "resumen", label: "Resumen" },
    { k: "parejas", label: "Parejas" },
    { k: "pagos", label: "Pagos" },
    ...(data?.isCreator ? [{ k: "config" as TabKey, label: "Configurar" }] : []),
  ];
  const juegoTabs: { k: TabKey; label: string }[] = [
    { k: "partidos", label: "Partidos" },
    { k: "posiciones", label: "Posiciones" },
    ...(showResultados ? [{ k: "resultados" as TabKey, label: "Resultados" }] : []),
  ];
  const sectionTabs = section === "juego" ? juegoTabs : gestionTabs;
  const activeTab: TabKey = sectionTabs.some((t) => t.k === tab) ? tab : sectionTabs[0].k;
  const switchSection = (s: "gestion" | "juego") => {
    setSection(s);
    setTab(s === "juego" ? "partidos" : "resumen");
  };

  const backBtn = (
    <button
      onClick={close}
      aria-label={isPage ? "Volver" : "Cerrar"}
      style={{
        height: 30,
        borderRadius: 9999,
        padding: isPage ? "0 12px" : 0,
        width: isPage ? undefined : 30,
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
      <Icon name={isPage ? "arrow-left" : "x"} size={14} color="#fff" />
      {isPage ? "Volver" : null}
    </button>
  );

  const headerActions =
    q && data?.isCreator && q.status !== "finished" && q.status !== "cancelled" ? (
      <>
        {q.status === "registration_open" && (
          <HeaderBtn onClick={() => changeStatus("registration_closed")} disabled={busy} icon="lock" tone="neutral">Cerrar inscripciones</HeaderBtn>
        )}
        {q.status === "registration_closed" && (
          <>
            <HeaderBtn onClick={() => changeStatus("live")} disabled={busy} icon="play" tone="primary">Iniciar</HeaderBtn>
            <HeaderBtn onClick={() => changeStatus("registration_open")} disabled={busy} icon="rotate-ccw" tone="neutral">Reabrir</HeaderBtn>
          </>
        )}
        {q.status === "live" && (
          <HeaderBtn onClick={() => { setSection("juego"); setTab("resultados"); }} disabled={busy} icon="flag" tone="primary">Finalizar</HeaderBtn>
        )}
        <HeaderBtn onClick={doCancel} disabled={busy} icon="x" tone="danger">Cancelar</HeaderBtn>
      </>
    ) : null;

  const header = (
    <div
      style={{
        padding: "20px 22px 18px",
        background: "linear-gradient(135deg,var(--fg) 0%,#064e3b 72%,#10b981 100%)",
        color: "#fff",
        flexShrink: 0,
        borderTopLeftRadius: isPage ? 16 : undefined,
        borderTopRightRadius: isPage ? 16 : undefined,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Gestión · Quedada</div>
          {q ? (
            <h2 className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "8px 0 0" }}>
              {q.title}
              <span style={{ color: "#34d399" }}>.</span>
            </h2>
          ) : (
            <div style={{ margin: "10px 0 0" }}><SkBar w={260} h={24} r={8} dark /></div>
          )}
          {q ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap", fontSize: 11.5, color: "rgba(255,255,255,0.82)" }}>
              {sm && (
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 9999, background: sm.bg, color: sm.fg }}>{sm.label}</span>
              )}
              <span>
                {FORMAT_LABEL[q.format] ?? q.format} · {q.match_mode === "singles" ? "Singles" : "Dobles"} · {data?.isCreator ? "Organizador" : "Co-host"}
              </span>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}><SkBar w={200} h={12} r={6} dark /></div>
          )}
        </div>
        {/* Arriba a la derecha: solo Volver/Cerrar */}
        <div style={{ flexShrink: 0 }}>{backBtn}</div>
      </div>
      {/* Abajo: stats (izq) + acciones de estado (der, lado a lado) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {q ? (
            <>
              <StatChip label="Inscritos" value={String(joinedCount)} />
              <StatChip label="Pagados" value={`${paidCount}/${joinedCount}`} />
              <StatChip label="Cuota" value={q.fee_cents > 0 ? money(q.fee_cents) : "Gratis"} />
              <StatChip label="Categorías" value={String(data?.categories.length ?? 0)} />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 10, padding: "8px 12px", minWidth: 78 }}>
                <SkBar w={36} h={18} r={5} dark />
                <div style={{ marginTop: 6 }}><SkBar w={54} h={8} r={4} dark /></div>
              </div>
            ))
          )}
        </div>
        {headerActions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>{headerActions}</div>}
      </div>
    </div>
  );

  const tabsBar = loading ? (
    <div style={{ display: "flex", gap: 16, padding: "13px 14px", borderBottom: "1px solid var(--border)", background: "#fff", flexShrink: 0 }}>
      {[60, 56, 48, 70].map((w, i) => (
        <SkBar key={i} w={w} h={14} r={6} />
      ))}
    </div>
  ) : data && data.canManage ? (
      <div style={{ display: "flex", gap: 2, padding: "0 12px", borderBottom: "1px solid var(--border)", background: "#fff", flexShrink: 0, overflowX: "auto" }}>
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
      <div style={{ display: "flex", gap: 6, padding: "12px 14px 0", background: "#fff", flexShrink: 0 }}>
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

  const body = (
    <div
      style={
        isPage
          ? { padding: 22, display: "flex", flexDirection: "column", gap: 18 }
          : { flex: 1, overflow: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 18 }
      }
    >
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
          {activeTab === "partidos" && <PartidosTab data={data} onChanged={afterMutation} />}
          {activeTab === "posiciones" && <PosicionesTab data={data} />}
          {activeTab === "pagos" && <PagosTab data={data} onTogglePaid={togglePaid} onSetAllPaid={setAllPaid} />}
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

  // Variante página: tarjeta de ancho completo, scroll natural de la página.
  if (isPage) {
    return (
      <div
        className="card"
        style={{
          width: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#fff",
        }}
      >
        {header}
        {sectionSwitch}
        {tabsBar}
        {body}
      </div>
    );
  }

  // Variante modal (overlay, no cierra por click afuera para no perder cambios).
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.7)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "inherit",
        animation: "mp-qmp-fade 160ms var(--ease-out, ease)",
      }}
    >
      <style>{`@keyframes mp-qmp-fade{from{opacity:0}to{opacity:1}}
        @keyframes mp-qmp-pop{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:scale(1)}}`}</style>
      <div
        role="dialog"
        aria-modal="true"
        className="card"
        style={{
          width: "100%",
          maxWidth: 760,
          maxHeight: "92vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#fff",
          boxShadow: "0 32px 64px rgba(0,0,0,0.5)",
          animation: "mp-qmp-pop 180ms var(--ease-out, ease)",
        }}
      >
        {header}
        {sectionSwitch}
        {tabsBar}
        {body}
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
  sub,
  children,
  collapsible = false,
  defaultOpen = true,
  badge,
}: {
  label?: string;
  title: string;
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
          {title}
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
          <InfoRow label="Formato" value={`${FORMAT_LABEL[q.format] ?? q.format} · ${q.match_mode === "singles" ? "Singles" : "Dobles"}`} />
          <InfoRow label="Cuota" value={q.fee_cents > 0 ? money(q.fee_cents) : "Gratis"} />
          {cohostNames.length > 0 && <InfoRow label="Co-hosts" value={cohostNames.join(", ")} />}
        </div>
        {q.description && (
          <p style={{ fontSize: 12.5, color: "var(--muted-fg)", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{q.description}</p>
        )}
        {q.perks_text && (
          <div style={{ fontSize: 12, color: "var(--color-mp-primary-active)", background: "var(--color-mp-primary-light)", borderRadius: 8, padding: "8px 10px", display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Icon name="sparkles" size={12} color="#10b981" />
            <span>{q.perks_text}</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onGoToParejas} className="btn btn-primary">
            <Icon name="grid-3x3" size={13} color="#fff" /> Gestionar parejas
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
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 11px", borderRadius: 9, background: "var(--muted)", border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: "var(--primary)", minWidth: 44 }}>{p.place}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>{p.prize}</span>
                  {p.valueCents != null && <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>{money(p.valueCents)}</span>}
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

// Podio por categoría (cuando la quedada está finalizada): parejas ordenadas por
// final_rank. Sin emoji (regla del kit): puesto en texto, top 3 en primary.
function PodiumSection({ data }: { data: ManageData }) {
  const partById = new Map(data.participants.map((p) => [p.user_id, p]));
  const nameFor = (id: string): string => nameOf(partById.get(id)?.profiles ?? null);
  const rankOf = (id: string): number | null => partById.get(id)?.final_rank ?? null;
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
                      {p.player_b_id ? <span style={{ color: "var(--muted-fg)" }}> · {nameFor(p.player_b_id)}</span> : null}
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
}: {
  data: ManageData;
  onTogglePaid: (userId: string) => void;
  onSetAllPaid: (paid: boolean) => void;
}) {
  const acct = data.quedada.payment_account;
  const joined = data.participants.filter((p) => p.status === "joined");
  const paidN = joined.filter((p) => p.paid).length;
  const allPaid = joined.length > 0 && paidN === joined.length;
  const fee = data.quedada.fee_cents;
  const collected = paidN * fee;
  const pct = joined.length ? Math.round((paidN / joined.length) * 100) : 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: acct ? "repeat(auto-fit, minmax(340px, 1fr))" : "1fr", gap: 18, alignItems: "start" }}>
      {acct && (
        <Section label="Cobro" title="Datos del organizador" sub="Lo que ven los inscritos para transferir.">
          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
            <div style={{ fontWeight: 900 }}>{acct.bank}</div>
            <div style={{ color: "var(--muted-fg)" }}>
              {acct.accountType === "ahorros" ? "Ahorros" : "Corriente"} · {acct.accountNumber}
            </div>
            <div>{acct.holderName}{acct.holderId ? ` · ${acct.holderId}` : ""}</div>
            {acct.note && <div style={{ color: "var(--muted-fg)" }}>{acct.note}</div>}
          </div>
        </Section>
      )}

      <Section label="Control" title="Estado de pago" sub="Marca quién ya transfirió." badge={`${paidN}/${joined.length}`}>
        {joined.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Aún no hay inscritos.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span className="font-heading tabular" style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em" }}>
                  {paidN}
                  <span style={{ color: "var(--muted-fg)", fontSize: 15 }}>/{joined.length}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-fg)", marginLeft: 8, letterSpacing: "0.04em" }}>PAGADOS</span>
                </span>
                {fee > 0 && (
                  <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
                    ≈ <b style={{ color: "var(--fg)" }}>{money(collected)}</b> recaudado
                  </span>
                )}
              </div>
              <div style={{ height: 6, borderRadius: 9999, background: "var(--muted)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "var(--success-fg)", borderRadius: 9999, transition: "width 320ms var(--ease-out)" }} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSetAllPaid(!allPaid)}
              className="btn"
              style={{ alignSelf: "flex-start", background: "#fff", border: "1px solid var(--border)", marginBottom: 2 }}
            >
              <Icon name={allPaid ? "circle-x" : "check-check"} size={12} />
              {allPaid ? "Quitar todos" : "Marcar todos como pagado"}
            </button>
            {joined.map((p) => (
              <label
                key={p.user_id}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 9, border: "1px solid var(--border)", background: p.paid ? "var(--success-bg)" : "#fff", cursor: "pointer" }}
              >
                <input type="checkbox" checked={p.paid} onChange={() => onTogglePaid(p.user_id)} style={{ accentColor: "var(--success-fg)", cursor: "pointer" }} />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(p.profiles)}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: p.paid ? "var(--success-fg)" : "var(--muted-fg)", display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  {p.paid && <Icon name="check" size={12} color="var(--success-fg)" />}
                  {p.paid ? "Pagado" : "Pendiente"}
                </span>
              </label>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Tab: Resultados (puestos por categoría + finalizar) ──────────────────────
function ResultadosTab({ data, onChanged }: { data: ManageData; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const finished = data.quedada.status === "finished";
  const partById = new Map(data.participants.map((p) => [p.user_id, p]));
  const nameFor = (id: string): string => nameOf(partById.get(id)?.profiles ?? null);

  const cats = data.categories
    .map((c) => ({ cat: c, pairs: data.pairs.filter((p) => p.category_id === c.id).sort((a, b) => a.slot_no - b.slot_no) }))
    .filter((x) => x.pairs.length > 0);

  const [pos, setPos] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of data.pairs) {
      const fr = partById.get(p.player_a_id)?.final_rank;
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
                    {p.player_b_id ? <span style={{ color: "var(--muted-fg)" }}> · {nameFor(p.player_b_id)}</span> : null}
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

// ── Tab: Partidos (motor — rondas, puntos, tabla) ────────────────────────────
function PartidosTab({ data, onChanged }: { data: ManageData; onChanged: () => Promise<void> }) {
  const cats = data.categories.filter((c) => data.pairs.some((p) => p.category_id === c.id));
  return (
    <Section label="Juego" title="Partidos por categoría" sub="Genera los partidos, carga los puntos y mira la tabla.">
      {cats.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Asigna parejas (pestaña Parejas) para poder generar partidos.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {cats.map((c) => (
            <div key={c.id} className="mp-rise">
              <CategoryMatches data={data} category={c} onChanged={onChanged} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// Etiqueta de pareja (nombres) para una categoría.
function usePairLabeler(data: ManageData, categoryId: string) {
  const partById = new Map(data.participants.map((p) => [p.user_id, p]));
  const pairs = data.pairs.filter((p) => p.category_id === categoryId);
  return (pairId: string | null): string => {
    if (!pairId) return "Bye";
    const p = pairs.find((x) => x.id === pairId);
    if (!p) return "—";
    const a = nameOf(partById.get(p.player_a_id)?.profiles ?? null);
    const b = p.player_b_id ? nameOf(partById.get(p.player_b_id)?.profiles ?? null) : null;
    return b ? `${a} · ${b}` : a;
  };
}
const groupLetter = (n: number): string => String.fromCharCode(64 + n);

function CategoryMatches({ data, category, onChanged }: { data: ManageData; category: ManageCategory; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [, startTx] = useTransition();
  const courts = data.quedada.courts_count ?? 0;
  const [numGroups, setNumGroups] = useState(String(courts > 0 ? Math.min(courts, 8) : 1));

  const pairLabel = usePairLabeler(data, category.id);
  const matches = data.matches.filter((m) => m.category_id === category.id);
  const hasMatches = matches.length > 0;
  const groupNos = Array.from(new Set(matches.map((m) => m.group_no))).sort((a, b) => a - b);
  const multiGroup = groupNos.length > 1;

  const doGenerate = () => {
    startTx(async () => {
      const res = await generateGroupStage({ quedadaId: data.quedada.id, categoryId: category.id, numGroups: parseInt(numGroups || "1", 10) });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo generar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: `${res.data.groups} grupo${res.data.groups === 1 ? "" : "s"} · ${res.data.created} partidos al azar` });
      await onChanged();
    });
  };
  const doRegen = async () => {
    const ok = await confirm({
      title: "Regenerar partidos",
      body: "Borra los partidos y marcadores actuales y re-sortea las parejas al azar. ¿Seguir?",
      confirmLabel: "Regenerar",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (ok) doGenerate();
  };

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.01em", flex: 1, minWidth: 0 }}>{category.name}</span>
        {hasMatches && (
          <button type="button" onClick={doRegen} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>
            <Icon name="shuffle" size={12} /> Regenerar
          </button>
        )}
      </div>

      {!hasMatches ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 10, background: "var(--muted)" }}>
          <div style={{ fontSize: 12.5, color: "var(--muted-fg)" }}>
            Reparte las parejas <b>al azar</b> en grupos (round robin por grupo). {courts > 0 ? `Cada grupo va a una cancha (tienes ${courts}).` : "Define las canchas en Configurar para asignarlas."}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700 }}>
              Grupos
              <input type="number" min={1} max={16} value={numGroups} onChange={(e) => setNumGroups(e.target.value)} style={{ ...fieldInput, width: 64 }} />
            </label>
            <button type="button" onClick={doGenerate} className="btn btn-primary">
              <Icon name="shuffle" size={13} color="#fff" /> Generar fase de grupos
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {groupNos.map((gn) => {
            const gm = matches.filter((m) => m.group_no === gn);
            const court = gm.find((m) => m.court_no != null)?.court_no ?? null;
            const grounds = Array.from(new Set(gm.map((m) => m.round_no))).sort((a, b) => a - b);
            return (
              <div key={gn} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                  {multiGroup && (
                    <span className="font-heading" style={{ fontSize: 12.5, fontWeight: 900, textTransform: "uppercase" }}>Grupo {groupLetter(gn)}</span>
                  )}
                  {court != null && (
                    <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 9999, background: "var(--color-mp-primary-light)", color: "var(--color-mp-primary-active)" }}>
                      Cancha {court}
                    </span>
                  )}
                  {!multiGroup && court == null && <span className="label-mp">Round robin</span>}
                </div>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  {grounds.map((r) => (
                    <div key={r}>
                      <div className="label-mp" style={{ marginBottom: 6 }}>Ronda {r}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {gm.filter((m) => m.round_no === r).map((m) => (
                          <MatchRow key={m.id} match={m} labelA={pairLabel(m.pair_a_id)} labelB={pairLabel(m.pair_b_id)} onChanged={onChanged} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MatchRow({ match, labelA, labelB, onChanged }: { match: ManageMatch; labelA: string; labelB: string; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [, startTx] = useTransition();
  const [a, setA] = useState(match.points_a != null ? String(match.points_a) : "");
  const [b, setB] = useState(match.points_b != null ? String(match.points_b) : "");
  const played = match.status === "played";

  const report = () => {
    const pa = parseInt(a, 10);
    const pb = parseInt(b, 10);
    if (!Number.isFinite(pa) || !Number.isFinite(pb)) {
      toast({ icon: "alert-triangle", title: "Pon los puntos de ambos lados" });
      return;
    }
    startTx(async () => {
      const res = await reportQuedadaMatch({ matchId: match.id, pointsA: pa, pointsB: pb });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Resultado guardado" });
      await onChanged();
    });
  };
  const remove = async () => {
    const ok = await confirm({ title: "Quitar partido", body: "¿Quitar este partido?", confirmLabel: "Quitar", cancelLabel: "Cancelar", destructive: true });
    if (!ok) return;
    startTx(async () => {
      const res = await deleteQuedadaMatch({ matchId: match.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo quitar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Partido quitado" });
      await onChanged();
    });
  };

  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const aWins = played && Number.isFinite(na) && Number.isFinite(nb) && na > nb;
  const bWins = played && Number.isFinite(na) && Number.isFinite(nb) && nb > na;

  const scoreBox = (val: string, set: (v: string) => void, win: boolean, label: string) => (
    <input
      value={val}
      onChange={(e) => set(e.target.value)}
      type="number"
      min={0}
      placeholder="–"
      aria-label={label}
      className="font-heading tabular"
      style={{
        width: 64,
        height: 56,
        flexShrink: 0,
        textAlign: "center",
        border: win ? "2px solid var(--primary)" : "1.5px solid var(--border)",
        borderRadius: 12,
        fontSize: 26,
        fontWeight: 900,
        fontFamily: "inherit",
        outline: "none",
        background: win ? "var(--color-mp-primary-light)" : "#fff",
        color: win ? "var(--color-mp-primary-active)" : "var(--fg)",
      }}
    />
  );
  const nameRow = (name: string, win: boolean, score: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: win ? 900 : 700, color: win ? "var(--color-mp-primary-active)" : "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      {score}
    </div>
  );

  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--border)", background: played ? "var(--success-bg)" : "#fff", overflow: "hidden" }}>
      {nameRow(labelA, aWins, scoreBox(a, setA, aWins, "Puntos A"))}
      <div style={{ borderTop: "1px solid var(--border)" }} />
      {nameRow(labelB, bWins, scoreBox(b, setB, bWins, "Puntos B"))}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, padding: "8px 10px", borderTop: "1px solid var(--border)", background: played ? "transparent" : "var(--muted)" }}>
        {played && <span style={{ flex: 1, fontSize: 10.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--success-fg)" }}>Jugado</span>}
        <button type="button" onClick={report} className="btn" style={{ background: "#fff", border: "1px solid var(--border)", padding: "6px 12px" }}>
          <Icon name="check" size={12} /> {played ? "Actualizar" : "Guardar"}
        </button>
        <button type="button" onClick={remove} aria-label="Quitar partido" style={{ flexShrink: 0, background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", display: "inline-flex", padding: 4 }}>
          <Icon name="x" size={14} color="var(--muted-fg)" />
        </button>
      </div>
    </div>
  );
}

// ── Tab: Posiciones (tabla por grupo de cada categoría) ──────────────────────
function PosicionesTab({ data }: { data: ManageData }) {
  const cats = data.categories.filter((c) => data.matches.some((m) => m.category_id === c.id));
  return (
    <Section label="Juego" title="Tabla de posiciones" sub="Por grupo, según los puntos de los partidos jugados.">
      {cats.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Genera partidos (pestaña Partidos) para ver la tabla.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {cats.map((c) => (
            <div key={c.id} className="mp-rise"><CategoryStandings data={data} category={c} /></div>
          ))}
        </div>
      )}
    </Section>
  );
}

function CategoryStandings({ data, category }: { data: ManageData; category: ManageCategory }) {
  const pairLabel = usePairLabeler(data, category.id);
  const matches = data.matches.filter((m) => m.category_id === category.id);
  const groupNos = Array.from(new Set(matches.map((m) => m.group_no))).sort((a, b) => a - b);
  const multiGroup = groupNos.length > 1;

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.01em", marginBottom: 10 }}>{category.name}</div>
      <div style={{ display: "grid", gridTemplateColumns: multiGroup ? "repeat(auto-fit, minmax(260px, 1fr))" : "1fr", gap: 12 }}>
        {groupNos.map((gn) => {
          const gm = matches.filter((m) => m.group_no === gn);
          const court = gm.find((m) => m.court_no != null)?.court_no ?? null;
          const pairIds = Array.from(new Set(gm.flatMap((m) => [m.pair_a_id, m.pair_b_id].filter((x): x is string => !!x))));
          const rows = pairIds
            .map((pid) => {
              let pj = 0;
              let pts = 0;
              let w = 0;
              for (const m of gm) {
                if (m.status !== "played") continue;
                if (m.pair_a_id === pid) { pj++; pts += m.points_a ?? 0; if ((m.points_a ?? 0) > (m.points_b ?? 0)) w++; }
                else if (m.pair_b_id === pid) { pj++; pts += m.points_b ?? 0; if ((m.points_b ?? 0) > (m.points_a ?? 0)) w++; }
              }
              return { pid, pj, pts, w };
            })
            .sort((a, b) => b.pts - a.pts || b.w - a.w || b.pj - a.pj);
          return (
            <div key={gn} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", background: "var(--muted)" }}>
                {multiGroup && <span className="font-heading" style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>Grupo {groupLetter(gn)}</span>}
                {court != null && <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 9999, background: "var(--color-mp-primary-light)", color: "var(--color-mp-primary-active)" }}>Cancha {court}</span>}
              </div>
              <div style={{ padding: "4px 0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 32px 32px 44px", gap: 6, padding: "4px 11px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
                  <span>#</span><span>Pareja</span><span style={{ textAlign: "center" }}>PJ</span><span style={{ textAlign: "center" }}>G</span><span style={{ textAlign: "right" }}>Pts</span>
                </div>
                {rows.map((s, i) => (
                  <div key={s.pid} style={{ display: "grid", gridTemplateColumns: "26px 1fr 32px 32px 44px", gap: 6, alignItems: "center", padding: "7px 11px", fontSize: 12.5, background: i === 0 ? "var(--color-mp-primary-light)" : "transparent" }}>
                    <span className="font-heading tabular" style={{ fontWeight: 900, color: i === 0 ? "var(--color-mp-primary-active)" : "var(--muted-fg)" }}>{i + 1}</span>
                    <span style={{ minWidth: 0, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pairLabel(s.pid)}</span>
                    <span className="tabular" style={{ textAlign: "center", color: "var(--muted-fg)" }}>{s.pj}</span>
                    <span className="tabular" style={{ textAlign: "center", color: "var(--muted-fg)" }}>{s.w}</span>
                    <span className="font-heading tabular" style={{ textAlign: "right", fontWeight: 900 }}>{s.pts}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 6. Link de inscripción ───────────────────────────────────────────────────
function InviteLinkSection({
  inviteCode,
  toast,
}: {
  inviteCode: string | null;
  toast: ReturnType<typeof useToast>;
}) {
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
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          Esta quedada aún no tiene un código de invitación.
        </div>
      )}
    </Section>
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
    <Section label="Costos" title="Logística de canchas" sub="Define cuántas canchas, horas y el precio por hora.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
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
    <Section label="Cobro" title="Datos del organizador y premios" sub="Para que los jugadores te transfieran y vean qué se juega.">
      <Field label="Datos del organizador (para el pago)">
        <BankAccountFields value={bank} onChange={setBank} />
      </Field>
      <Field label="Premios">
        <PrizesEditor value={prizeRows} onChange={setPrizeRows} />
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
    <Section label="Setup" title="Categorías" sub="Cada categoría tiene su hora y cupos.">
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
    start(async () => {
      const res = category
        ? await updateCategory({
            categoryId: category.id,
            name: name.trim(),
            levelLabel: noLevel ? null : sumaLabel(suma),
            startsAt: hourToIso(hour) ?? null,
            maxSlots: slotsN ?? null,
          })
        : await createCategory({
            quedadaId,
            name: name.trim(),
            levelLabel: noLevel ? undefined : sumaLabel(suma),
            startsAt: hourToIso(hour),
            maxSlots: slotsN,
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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

// ── 5. Slots / Parejas por categoría ─────────────────────────────────────────
function SlotsSection({ data, onChanged }: { data: ManageData; onChanged: () => Promise<void> }) {
  return (
    <Section label="Roster" title="Parejas por categoría" sub="Asigna parejas a cada cupo.">
      {data.categories.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          Crea al menos una categoría (en Configurar) para asignar parejas.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.categories.map((c, i) => (
            <div key={c.id} className="mp-rise" style={{ animationDelay: `${i * 50}ms` }}>
              <CategorySlots data={data} category={c} onChanged={onChanged} />
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
}: {
  data: ManageData;
  category: ManageCategory;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [, startTx] = useTransition();
  const [open, setOpen] = useState(true);
  const [assigningSlot, setAssigningSlot] = useState<number | null>(null);
  const isDoubles = data.quedada.match_mode === "doubles";

  const slotCount = category.max_slots ?? 0;
  const pairsBySlot = new Map<number, ManagePair>();
  for (const p of data.pairs) if (p.category_id === category.id) pairsBySlot.set(p.slot_no, p);
  const slots = slotCount > 0 ? Array.from({ length: slotCount }, (_, i) => i + 1) : [];
  const filled = pairsBySlot.size;
  const partById = new Map(data.participants.map((p) => [p.user_id, p]));
  const nameFor = (id: string | null): string | null => (id ? nameOf(partById.get(id)?.profiles ?? null) : null);

  // Inscritos joined que aún no están en un cupo de esta categoría (candidatos
  // para asignación manual y para el llenado al azar).
  const assignedInCat = new Set<string>();
  for (const p of pairsBySlot.values()) {
    assignedInCat.add(p.player_a_id);
    if (p.player_b_id) assignedInCat.add(p.player_b_id);
  }
  const available = data.participants
    .filter((p) => p.status === "joined" && !assignedInCat.has(p.user_id))
    .map((p) => ({ id: p.user_id, name: nameOf(p.profiles) }));
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
      title: "Quitar pareja",
      body: `¿Quitar la pareja del cupo ${slotNo} de “${category.name}”?`,
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
      toast({ icon: "check", title: "Pareja quitada" });
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
                {emptyCount > 0 && available.length > 0 && (
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
                        onAssign={() => setAssigningSlot(n)}
                        onRemove={pair ? () => removePairById(pair.id, n) : undefined}
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
  onAssign: () => void;
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
      aria-label="Quitar pareja"
      style={{ flexShrink: 0, background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", display: "inline-flex", padding: 2 }}
    >
      <Icon name="x" size={13} color="var(--muted-fg)" />
    </button>
  ) : null;

  if (!filled) {
    return (
      <div style={cellStyle}>
        {tab}
        <button
          type="button"
          onClick={onAssign}
          style={{ flex: 1, textAlign: "left", background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 11px" }}
        >
          <Icon name="plus" size={12} color="var(--muted-fg)" /> Asignar
        </button>
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
          <div style={{ display: "grid", gridTemplateColumns: isDoubles ? "1fr 1fr" : "1fr", gap: 10 }}>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--muted-fg)",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
