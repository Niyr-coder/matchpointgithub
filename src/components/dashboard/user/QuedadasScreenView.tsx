// Client view de QuedadasScreen — recibe quedadas ya fetcheadas (Descubrir +
// Mis quedadas). Permite organizar (CrearQuedadaModal), unirse/salir, y al
// creador invitar / cargar resultados / cancelar. v1 = social, no toca ranking.
"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { PlayerPicker, type Player } from "../widgets/PlayerPicker";
import { CrearQuedadaModal, type QuedadaInitial } from "./CrearQuedadaModal";
import { accountToBankDraft } from "./quedada-fields/BankAccountFields";
import { prizesToDrafts } from "./quedada-fields/PrizesEditor";
import { QuedadaPrizeRow } from "./quedada-fields/QuedadaPrizeRow";
import { rulesToDrafts } from "./quedada-fields/RulesEditor";
import { parseSuma } from "@/lib/quedadas/level";
import { rosterModeFor } from "@/lib/quedadas/engines/registry";
import type { PaymentAccount, Prize, QuedadaRule } from "@/lib/schemas/quedadas";
import {
  joinQuedada,
  leaveQuedada,
  inviteToQuedada,
  cancelQuedada,
  deleteQuedada,
  reportQuedada,
  getQuedadaManageData,
  getQuedadaDetails,
} from "@/server/actions/quedadas";
import { QuedadaPlayerStatsPanel } from "./QuedadaPlayerStatsPanel";
import type { QuedadaProfileStats } from "@/lib/quedadas/profile-stats";
import { quedadaFormatLabel, quedadaFormatOptions, quedadaFormatShortLabel } from "@/lib/quedadas/format-labels";

export type QuedadaLite = {
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  description: string | null;
  format: string;
  matchMode: "singles" | "doubles";
  visibility: "open" | "private";
  status: string;
  startsAt: string;
  createdAt: string;
  locationText: string | null;
  maxPlayers: number | null;
  feeCents: number;
  perks: string | null;
  participantCount: number;
  iAmCreator: boolean;
  iAmJoined: boolean;
  iAmInvited: boolean;
  creatorIsPremium: boolean;
};

type Tab = "descubrir" | "organizo" | "juego" | "actividad";
type FilterState = { format: string; when: "all" | "today" | "tomorrow" | "week"; price: "all" | "free" | "paid" };

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = DAYS[d.getDay()];
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${day} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${hh}:${mm}`;
}

function feeLabel(cents: number): string {
  if (!cents || cents <= 0) return "Gratis";
  const n = cents / 100;
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

// Tiempo relativo hasta una fecha, en partes para poder resaltar el número.
// Puro: recibe `nowMs` (no llama Date.now() en render).
function relativeParts(iso: string, nowMs: number): { pre: string; n: number; unit: string } | { text: string } {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { text: "—" };
  const diff = t - nowMs;
  if (diff <= 0) return { text: "En curso" };
  const mins = Math.round(diff / 60000);
  if (mins < 60) return { pre: "en", n: mins, unit: "min" };
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return { pre: "en", n: hours, unit: hours === 1 ? "hora" : "horas" };
  const days = Math.floor(diff / 86400000);
  return { pre: "en", n: days, unit: days === 1 ? "día" : "días" };
}

// La quedada más próxima (por fecha) entre las que no están finished/cancelled.
// En función (no en render) para no disparar el chequeo de pureza del compiler.
function nearestQuedada(list: QuedadaLite[]): QuedadaLite | null {
  return (
    list
      .filter((q) => q.status !== "finished" && q.status !== "cancelled")
      .slice()
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0] ?? null
  );
}

function applyFilters(list: QuedadaLite[], filters: FilterState, nowMs: number): QuedadaLite[] {
  const dayMs = 86_400_000;
  return list.filter((q) => {
    if (filters.format !== "all" && q.format !== filters.format) return false;
    if (filters.price === "free" && q.feeCents > 0) return false;
    if (filters.price === "paid" && q.feeCents <= 0) return false;
    if (filters.when !== "all") {
      const startsAt = Date.parse(q.startsAt);
      if (Number.isNaN(startsAt)) return false;
      const diff = startsAt - nowMs;
      if (filters.when === "today" && (diff < 0 || diff > dayMs)) return false;
      if (filters.when === "tomorrow" && (diff < dayMs || diff > 2 * dayMs)) return false;
      if (filters.when === "week" && (diff < 0 || diff > 7 * dayMs)) return false;
    }
    return true;
  });
}

function pickFeatured(list: QuedadaLite[]): QuedadaLite | null {
  if (list.length < 3) return null;
  const eligible = list.filter((q) => q.maxPlayers != null && q.maxPlayers > 0 && q.participantCount / q.maxPlayers >= 0.5);
  const pool = eligible.length > 0 ? eligible : list;
  return pool.slice().sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))[0] ?? null;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "sin-fecha";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayHeadline(iso: string, nowMs: number): { headline: string; sub: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { headline: "Sin fecha", sub: "Fecha por confirmar" };
  const today = new Date(nowMs);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const delta = Math.round((target - start) / 86_400_000);
  const headline = delta === 0 ? "Hoy" : delta === 1 ? "Mañana" : d.toLocaleDateString("es-EC", { weekday: "long" });
  return {
    headline,
    sub: d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" }),
  };
}

export function QuedadasScreenView({
  meUserId,
  discover,
  mine,
  myActivityStats = null,
}: {
  meUserId: string | null;
  discover: QuedadaLite[];
  mine: QuedadaLite[];
  myActivityStats?: QuedadaProfileStats | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("descubrir");
  const [filters, setFilters] = useState<FilterState>({ format: "all", when: "all", price: "all" });
  const [featuredPending, startFeaturedTransition] = useTransition();
  // null = wizard cerrado; {} = nueva; {initial} = duplicada/plantilla.
  const [wizard, setWizard] = useState<{ initial?: QuedadaInitial } | null>(null);
  // Invitar es modal liviano; resultados/cierre viven en la página de gestión.
  const [inviteFor, setInviteFor] = useState<QuedadaLite | null>(null);
  const [featuredDetailsFor, setFeaturedDetailsFor] = useState<QuedadaLite | null>(null);
  const [featuredJoinFor, setFeaturedJoinFor] = useState<QuedadaLite | null>(null);
  // "Ahora" para el tiempo relativo de "Tu próxima" (refresca cada minuto).
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Duplicar: trae la config de una quedada propia y abre el wizard precargado
  // (sin fecha). Usa getQuedadaManageData (requiere ser creador/co-host).
  const doDuplicate = (id: string) => {
    getQuedadaManageData({ quedadaId: id }).then((res) => {
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo duplicar", sub: res.error.message });
        return;
      }
      setWizard({ initial: buildInitialFromManage(res.data) });
    });
  };

  const doFeaturedJoin = (q: QuedadaLite, categoryId?: string) => {
    if (!meUserId) {
      toast({ icon: "alert-triangle", title: "Inicia sesión para inscribirte" });
      return;
    }
    startFeaturedTransition(async () => {
      const res = await joinQuedada({ quedadaId: q.id, categoryId: categoryId ?? null });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo inscribir", sub: res.error.message });
        return;
      }
      setFeaturedJoinFor(null);
      setFeaturedDetailsFor(null);
      toast({ icon: "check-circle-2", title: "Te inscribiste en la quedada" });
      router.refresh();
    });
  };

  // Organizo: recién creada primero (lo que acabas de crear aparece al inicio).
  const organizadas = mine
    .filter((q) => q.iAmCreator)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  // Juego: la próxima por jugar primero (orden cronológico ascendente de mine).
  const juego = mine.filter((q) => !q.iAmCreator);
  const actividadCount = myActivityStats?.finishedCount ?? 0;
  const currentNowMs = nowMs;
  const filteredDiscover = useMemo(
    () => applyFilters(discover, filters, currentNowMs),
    [discover, filters, currentNowMs],
  );
  const list =
    tab === "descubrir" ? filteredDiscover : tab === "organizo" ? organizadas : tab === "juego" ? juego : [];
  const featured = tab === "descubrir" ? pickFeatured(filteredDiscover) : null;
  const rest = featured ? list.filter((q) => q.id !== featured.id) : list;

  const mainTabs: { k: Tab; l: string; n: number }[] = [
    { k: "descubrir", l: "Descubrir", n: discover.length },
    { k: "organizo", l: "Organizo", n: organizadas.length },
    { k: "juego", l: "Juego", n: juego.length },
  ];
  if (meUserId) {
    mainTabs.push({ k: "actividad", l: "Actividad", n: actividadCount });
  }

  // Métricas del hero (derivadas de la data que ya llega).
  const all = [...mine, ...discover];
  const activeCount = mine.filter((q) => q.status === "registration_open" || q.status === "live").length;
  const organizedCount = new Set(all.filter((q) => q.iAmCreator).map((q) => q.id)).size;
  const nearbyCount = discover.length;
  const nextQuedada = nearestQuedada(mine);
  let proximaNode: ReactNode = "—";
  if (nextQuedada) {
    const p = relativeParts(nextQuedada.startsAt, nowMs);
    proximaNode =
      "text" in p ? (
        p.text.toUpperCase()
      ) : (
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
          <span>{p.pre.toUpperCase()}</span>
          <span style={{ color: "#fbbf24" }}>{p.n}</span>
          <span>{p.unit.toUpperCase()}</span>
        </span>
      );
  }
  const heroStats: { v: ReactNode; l: string }[] = [
    { v: activeCount, l: "En curso / activas" },
    { v: proximaNode, l: "Tu próxima" },
    { v: organizedCount, l: "Organizadas por ti" },
    { v: nearbyCount, l: "Abiertas cerca" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Hero (header grande estilo role-home / RHWelcome) ────────────── */}
      <div
        className="mp-rise"
        style={{
          position: "relative",
          padding: "20px 24px",
          borderRadius: 14.4,
          overflow: "hidden",
          background: "radial-gradient(115% 130% at 98% 112%, rgba(124,58,237,0.3) 0%, rgba(124,58,237,0) 52%), linear-gradient(135deg, #0a0a0a 0%, #18162e 58%, #3b0764 100%)",
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
            fontSize: 150,
            color: "rgba(255,255,255,0.05)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(15%, -25%)",
            textTransform: "uppercase",
            pointerEvents: "none",
          }}
        >
          QUED
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "3px 10px",
                borderRadius: 9999,
                background: "rgba(255,255,255,0.12)",
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              ● Juego social
            </div>
            <h1
              className="font-heading"
              style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: "6px 0 2px", lineHeight: 1 }}
            >
              Quedadas<span style={{ color: "#34d399" }}>.</span>
            </h1>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", maxWidth: 420, lineHeight: 1.45 }}>
              Partidos sociales con tu comunidad. Organiza o únete.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "stretch", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
            {heroStats.map((s, i) => (
              <div
                key={i}
                className="mp-rise"
                style={{ animationDelay: `${i * 40}ms`, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 14px", minWidth: 88, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 4 }}
              >
                <span
                  className="font-heading"
                  style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {s.v}
                </span>
                <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.l}
                </span>
              </div>
            ))}
            </div>
            <button
              type="button"
              onClick={() => setWizard({})}
              disabled={!meUserId}
              title={meUserId ? undefined : "Inicia sesión para crear una quedada"}
              className="btn"
              style={{
                flexShrink: 0,
                background: "#fff",
                color: "var(--fg)",
                padding: "7px 12px",
                fontSize: 10.5,
                gap: 5,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                opacity: meUserId ? 1 : 0.6,
                cursor: meUserId ? "pointer" : "default",
              }}
            >
              <Icon name="plus" size={11} color="var(--fg)" />
              Crear quedada
            </button>
          </div>
        </div>
      </div>

      <div
        className="mp-msg-filter-scroll"
        style={{
          gap: 4,
          padding: 4,
          background: "var(--muted)",
          borderRadius: 9999,
          alignSelf: "flex-start",
          flexWrap: "nowrap",
          maxWidth: "100%",
          width: "max-content",
        }}
      >
        {mainTabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            style={{
              padding: "7px 16px",
              borderRadius: 9999,
              border: 0,
              background: tab === t.k ? "#fff" : "transparent",
              color: tab === t.k ? "var(--fg)" : "var(--muted-fg)",
              fontWeight: tab === t.k ? 800 : 600,
              fontSize: 11.5,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: tab === t.k ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {t.l}
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 900,
                padding: "1px 6px",
                borderRadius: 9999,
                background: tab === t.k ? "var(--fg)" : "transparent",
                color: tab === t.k ? "#fff" : "var(--muted-fg)",
                border: tab === t.k ? 0 : "1px solid var(--border)",
              }}
            >
              {t.n}
            </span>
          </button>
        ))}
      </div>

      {tab === "actividad" && meUserId ? (
        <QuedadaPlayerStatsPanel
          stats={myActivityStats}
          scope="mine"
          surface="quedadas"
          variant="plain"
        />
      ) : null}

      {tab !== "actividad" && tab === "descubrir" && discover.length > 0 && (
        <FilterBar filters={filters} onChange={setFilters} totalAll={discover.length} totalShown={filteredDiscover.length} />
      )}

      {tab !== "actividad" && list.length === 0 ? (
        <EmptyState
          icon={tab === "descubrir" ? "search-x" : tab === "organizo" ? "settings" : "calendar-days"}
          title={
            tab === "descubrir"
              ? discover.length === 0
                ? "No hay quedadas abiertas por ahora"
                : "Ninguna coincide con los filtros"
              : tab === "organizo"
                ? "Aún no organizas ninguna quedada"
                : "Aún no estás inscrito en ninguna quedada"
          }
          sub={
            tab === "descubrir"
              ? discover.length === 0
                ? "Sé el primero en organizar una. Toca “Crear quedada”."
                : "Prueba quitando filtros para ver más opciones."
              : tab === "organizo"
                ? "Crea tu primera quedada con “Crear quedada”."
                : "Únete a una abierta desde Descubrir."
          }
        />
      ) : tab !== "actividad" ? (
        <>
          {featured && (
            <FeaturedQuedadaCard
              q={featured}
              meUserId={meUserId}
              nowMs={currentNowMs}
              onOpenDetails={() => setFeaturedDetailsFor(featured)}
              onRequestJoin={() => setFeaturedJoinFor(featured)}
            />
          )}
          {tab === "juego" ? (
            <AgendaList
              list={rest}
              nowMs={currentNowMs}
              renderCard={(q, i) => (
                <QuedadaCard
                  q={q}
                  meUserId={meUserId}
                  onInvite={() => setInviteFor(q)}
                  onManage={() => router.push(`/dashboard/user/quedada/${q.id}`)}
                  onCalendar={() => router.push(`/dashboard/user/quedada/${q.id}?tab=calendario`)}
                  onDuplicate={() => doDuplicate(q.id)}
                  riseDelay={Math.min(i, 10) * 40}
                />
              )}
            />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 14,
              }}
            >
              {rest.map((q, i) => (
                <QuedadaCard
                  key={q.id}
                  q={q}
                  meUserId={meUserId}
                  onInvite={() => setInviteFor(q)}
                  onManage={() => router.push(`/dashboard/user/quedada/${q.id}`)}
                  onCalendar={() => router.push(`/dashboard/user/quedada/${q.id}?tab=calendario`)}
                  onDuplicate={() => doDuplicate(q.id)}
                  riseDelay={Math.min(i, 10) * 40}
                />
              ))}
            </div>
          )}
        </>
      ) : null}

      {wizard && <CrearQuedadaModal initial={wizard.initial} onClose={() => setWizard(null)} />}
      {inviteFor && (
        <InviteModal quedada={inviteFor} meUserId={meUserId} onClose={() => setInviteFor(null)} />
      )}
      {featuredDetailsFor && (
        <QuedadaDetailsModal
          q={featuredDetailsFor}
          onClose={() => setFeaturedDetailsFor(null)}
          onRequestJoin={() => {
            setFeaturedJoinFor(featuredDetailsFor);
            setFeaturedDetailsFor(null);
          }}
          onCalendar={() => router.push(`/dashboard/user/quedada/${featuredDetailsFor.id}?tab=calendario`)}
          onManage={() => router.push(`/dashboard/user/quedada/${featuredDetailsFor.id}`)}
          pending={featuredPending}
          getOriginRect={() => null}
          initialData={null}
        />
      )}
      {featuredJoinFor && (
        <JoinPickerModal
          q={featuredJoinFor}
          initialData={null}
          pending={featuredPending}
          onClose={() => setFeaturedJoinFor(null)}
          onPick={(categoryId) => doFeaturedJoin(featuredJoinFor, categoryId)}
        />
      )}
    </div>
  );
}

// Construye el QuedadaInitial (precarga del wizard) desde el payload de
// getQuedadaManageData. Omite fecha e invite_code (se generan nuevos).
type DupQuedada = {
  title: string;
  description: string | null;
  format: string;
  match_mode: "singles" | "doubles";
  visibility: "open" | "private";
  fee_cents: number;
  courts_count: number | null;
  hours: number | null;
  court_price_cents: number | null;
  perks_text: string | null;
  location_text: string | null;
  payment_account: PaymentAccount | null;
  prizes: Prize[] | null;
  rules: QuedadaRule[] | null;
};
type DupCategory = { name: string; level_label: string | null; starts_at: string | null; max_slots: number | null };

function buildInitialFromManage(data: unknown): QuedadaInitial {
  const d = data as { quedada: DupQuedada; categories: DupCategory[] };
  const q = d.quedada;
  const centsToStr = (c: number | null): string => (c != null && c > 0 ? String(c / 100) : "");
  return {
    title: q.title,
    description: q.description ?? undefined,
    format: q.format as QuedadaInitial["format"],
    matchMode: q.match_mode,
    visibility: q.visibility,
    locationText: q.location_text ?? undefined,
    feeUsd: q.fee_cents > 0 ? String(q.fee_cents / 100) : "0",
    courts: q.courts_count != null ? String(q.courts_count) : "",
    hours: q.hours != null ? String(q.hours) : "",
    courtPriceUsd: centsToStr(q.court_price_cents),
    bank: accountToBankDraft(q.payment_account),
    prizeRows: prizesToDrafts(q.prizes),
    ruleRows: rulesToDrafts(q.rules),
    perks: q.perks_text ?? undefined,
    categories: (d.categories ?? []).map((c) => {
      const { suma, noLevel } = parseSuma(c.level_label);
      return { name: c.name, suma, noLevel, hour: calHour(c.starts_at), slots: c.max_slots != null ? String(c.max_slots) : "" };
    }),
  };
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted-fg)" }}>
      <Icon name={icon} size={32} color="var(--muted-fg)" />
      <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, marginTop: 12, color: "var(--fg)" }}>
        {title}
        <span className="dot">.</span>
      </div>
      <p style={{ fontSize: 13, marginTop: 8, maxWidth: 360, margin: "8px auto 0" }}>{sub}</p>
    </div>
  );
}

function FilterBar({
  filters,
  onChange,
  totalAll,
  totalShown,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  totalAll: number;
  totalShown: number;
}) {
  const isActive = filters.format !== "all" || filters.when !== "all" || filters.price !== "all";
  const formats = [
    { k: "all", l: "Todos" },
    ...quedadaFormatOptions().map((f) => ({ k: f.k, l: f.label })),
  ];
  const when = [
    { k: "all" as const, l: "Todas" },
    { k: "today" as const, l: "Hoy" },
    { k: "tomorrow" as const, l: "Mañana" },
    { k: "week" as const, l: "Esta semana" },
  ];
  const price = [
    { k: "all" as const, l: "Todas" },
    { k: "free" as const, l: "Gratis" },
    { k: "paid" as const, l: "Pago" },
  ];
  const labelStyle: CSSProperties = {
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--muted-fg)",
    flexShrink: 0,
    marginRight: 4,
  };
  const pill = (active: boolean): CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 9999,
    border: `1px solid ${active ? "var(--fg)" : "var(--border)"}`,
    background: active ? "var(--fg)" : "#fff",
    color: active ? "#fff" : "var(--muted-fg)",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={labelStyle}>Formato</span>
        {formats.map((o) => (
          <button key={o.k} type="button" onClick={() => onChange({ ...filters, format: o.k })} style={pill(filters.format === o.k)}>
            {o.l}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={labelStyle}>Cuándo</span>
        {when.map((o) => (
          <button key={o.k} type="button" onClick={() => onChange({ ...filters, when: o.k })} style={pill(filters.when === o.k)}>
            {o.l}
          </button>
        ))}
        <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 2px" }} />
        <span style={labelStyle}>Precio</span>
        {price.map((o) => (
          <button key={o.k} type="button" onClick={() => onChange({ ...filters, price: o.k })} style={pill(filters.price === o.k)}>
            {o.l}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}>
          {isActive ? (
            <>
              <span style={{ color: "var(--fg)", fontWeight: 900 }}>{totalShown}</span> de {totalAll}
            </>
          ) : (
            <>{totalAll} {totalAll === 1 ? "quedada" : "quedadas"}</>
          )}
        </span>
        {isActive && (
          <button
            type="button"
            onClick={() => onChange({ format: "all", when: "all", price: "all" })}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)", background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", padding: "4px 6px" }}
          >
            <Icon name="x" size={11} color="var(--muted-fg)" />
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}

function FeaturedQuedadaCard({
  q,
  meUserId,
  nowMs,
  onOpenDetails,
  onRequestJoin,
}: {
  q: QuedadaLite;
  meUserId: string | null;
  nowMs: number;
  onOpenDetails: () => void;
  onRequestJoin: () => void;
}) {
  const cupoPct = q.maxPlayers ? Math.min(100, Math.round((q.participantCount / q.maxPlayers) * 100)) : 100;
  const rel = relativeParts(q.startsAt, nowMs);
  const relText = nowMs > 0 ? ("text" in rel ? rel.text : `${rel.pre} ${rel.n} ${rel.unit}`) : "—";
  const full = q.maxPlayers != null && q.participantCount >= q.maxPlayers;

  return (
    <div
      className="card mp-rise"
      style={{
        padding: 0,
        overflow: "hidden",
        position: "relative",
        background: "linear-gradient(135deg, #0a0a0a 0%, #1a1626 55%, #2d1b4e 100%)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div aria-hidden style={{ position: "absolute", top: 0, right: 0, fontFamily: "Plus Jakarta Sans", fontWeight: 900, fontSize: 220, color: "rgba(52,211,153,0.06)", letterSpacing: "-0.06em", lineHeight: 0.8, transform: "rotate(-8deg) translate(10%, -10%)", textTransform: "uppercase", pointerEvents: "none" }}>
        {quedadaFormatShortLabel(q.format).toUpperCase()}
      </div>
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, padding: "22px 24px", alignItems: "center" }}>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 9999, background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}>★ Destacada</span>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 9999, background: "rgba(16,185,129,0.18)", color: "#86efac" }}>● Abierta</span>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 9999, background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.14)" }}>{quedadaFormatLabel(q.format)} · {q.matchMode === "singles" ? "Singles" : "Dobles"}</span>
            {q.creatorIsPremium && <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 9999, background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#0a0a0a" }}>MP+</span>}
          </div>
          <h2 className="font-heading" style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.025em", textTransform: "uppercase", margin: 0, lineHeight: 1.05 }}>
            {q.title}<span style={{ color: "#34d399" }}>.</span>
          </h2>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: "rgba(255,255,255,0.78)", fontWeight: 600 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="calendar-days" size={13} color="#fbbf24" />
              {formatWhen(q.startsAt)} · <span style={{ color: "#fbbf24", fontWeight: 900 }}>{relText}</span>
            </span>
            {q.locationText && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="map-pin" size={13} color="rgba(255,255,255,0.5)" />
                {q.locationText}
              </span>
            )}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="ticket" size={13} color="rgba(255,255,255,0.5)" />
              {feeLabel(q.feeCents)}
            </span>
          </div>
          {q.description && <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.5, maxWidth: 560 }}>{q.description}</p>}
        </div>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14, alignItems: "stretch" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Cupo</span>
              <span className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>
                {q.participantCount}
                {q.maxPlayers != null && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>/{q.maxPlayers}</span>}
              </span>
            </div>
            {q.maxPlayers != null && (
              <>
                <div style={{ height: 6, background: "rgba(255,255,255,0.10)", borderRadius: 9999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${cupoPct}%`, background: cupoPct >= 90 ? "#f87171" : "#34d399", borderRadius: 9999 }} />
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 700, marginTop: 4 }}>
                  {full ? "Sin cupos disponibles" : `${Math.max(0, q.maxPlayers - q.participantCount)} cupos libres`}
                </div>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            {full ? (
              <button disabled style={{ flex: 1, justifyContent: "center", padding: "12px 20px", borderRadius: 9999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 900, fontFamily: "inherit" }}>
                Llena
              </button>
            ) : (
              <button onClick={onRequestJoin} disabled={!meUserId} className="btn btn-primary" style={{ flex: 1, justifyContent: "center", padding: "12px 20px", fontSize: 12, opacity: meUserId ? 1 : 0.6 }}>
                <Icon name="check" size={13} color="#fff" />
                Inscribirme · {feeLabel(q.feeCents)}
              </button>
            )}
            <button onClick={onOpenDetails} style={{ padding: "12px 16px", borderRadius: 9999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="info" size={12} color="#fff" />
              Detalles
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgendaList({
  list,
  nowMs,
  renderCard,
}: {
  list: QuedadaLite[];
  nowMs: number;
  renderCard: (q: QuedadaLite, index: number) => ReactNode;
}) {
  const groups = useMemo(() => {
    const sorted = list.slice().sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    const map = new Map<string, QuedadaLite[]>();
    for (const q of sorted) {
      const key = dayKey(q.startsAt);
      const current = map.get(key) ?? [];
      current.push(q);
      map.set(key, current);
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items, ...dayHeadline(items[0]?.startsAt ?? "", nowMs) }));
  }, [list, nowMs]);

  let index = 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {groups.map((g) => (
        <section key={g.key} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
            <span className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.02em", color: "var(--fg)" }}>
              {g.headline}<span className="dot">.</span>
            </span>
            <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}>{g.sub}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {g.items.map((q) => {
              const rendered = renderCard(q, index);
              index += 1;
              return <div key={q.id}>{rendered}</div>;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Chip({
  children,
  bg,
  color,
  border,
}: {
  children: ReactNode;
  bg: string;
  color: string;
  border?: string;
}) {
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 900,
        padding: "2px 8px",
        borderRadius: 9999,
        background: bg,
        color,
        border: border ?? 0,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function QuedadaCard({
  q,
  meUserId,
  onInvite,
  onManage,
  onCalendar,
  onDuplicate,
  riseDelay = 0,
}: {
  q: QuedadaLite;
  meUserId: string | null;
  onInvite: () => void;
  onManage: () => void;
  onCalendar: () => void;
  onDuplicate: () => void;
  riseDelay?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, ask } = usePromptModal();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [joinPickerOpen, setJoinPickerOpen] = useState(false);
  const [detailsData, setDetailsData] = useState<QuedadaDetailData | null>(null);
  const prefetchedRef = useRef(false);
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Prefetch con intención: evita pegarle al server si el mouse solo cruza la
  // grilla, pero mantiene apertura rápida cuando sí se queda sobre una card.
  const prefetchDetails = () => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    getQuedadaDetails({ quedadaId: q.id }).then((res) => {
      if (res.ok) setDetailsData(res.data as QuedadaDetailData);
      else prefetchedRef.current = false;
    });
  };
  const schedulePrefetchDetails = () => {
    if (prefetchTimerRef.current || prefetchedRef.current) return;
    prefetchTimerRef.current = setTimeout(() => {
      prefetchTimerRef.current = null;
      prefetchDetails();
    }, 180);
  };
  const cancelScheduledPrefetch = () => {
    if (!prefetchTimerRef.current) return;
    clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = null;
  };

  useEffect(() => cancelScheduledPrefetch, []);

  // Cierra el menú "⋯" al hacer click fuera.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const cancelled = q.status === "cancelled";
  const finished = q.status === "finished";
  const cupo = q.maxPlayers != null ? `${q.participantCount}/${q.maxPlayers}` : `${q.participantCount}`;
  const full = q.maxPlayers != null && q.participantCount >= q.maxPlayers;
  // El menú "⋯" siempre tiene algo para no-creadores (Reportar); para el creador,
  // solo cuando la quedada sigue activa (invitar/duplicar/cancelar).
  const hasMenu = q.iAmCreator ? !cancelled && !finished : true;

  const doJoin = (categoryId?: string) => {
    if (!meUserId) {
      toast({ icon: "alert-triangle", title: "Inicia sesión para inscribirte" });
      return;
    }
    startTransition(async () => {
      const res = await joinQuedada({ quedadaId: q.id, categoryId: categoryId ?? null });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo inscribir", sub: res.error.message });
        return;
      }
      setJoinPickerOpen(false);
      toast({ icon: "check-circle-2", title: "Te inscribiste en la quedada" });
      router.refresh();
    });
  };

  // Abre el selector de categoría (o inscribe directo si la quedada no tiene
  // categorías y ya lo sabemos por el prefetch).
  const handleInscribirme = () => {
    if (!meUserId) {
      toast({ icon: "alert-triangle", title: "Inicia sesión para inscribirte" });
      return;
    }
    if (detailsData && detailsData.categories.length === 0) {
      doJoin();
      return;
    }
    setJoinPickerOpen(true);
  };

  const doLeave = () => {
    startTransition(async () => {
      const res = await leaveQuedada({ quedadaId: q.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo salir", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Saliste de la quedada" });
      router.refresh();
    });
  };

  const doCancel = async () => {
    const ok = await confirm({
      title: "Cancelar quedada",
      body: `¿Seguro que quieres cancelar “${q.title}”? Se avisará a los inscritos y no se puede deshacer.`,
      confirmLabel: "Cancelar quedada",
      cancelLabel: "No, volver",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelQuedada({ quedadaId: q.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Quedada cancelada" });
      router.refresh();
    });
  };

  // Borrar (solo canceladas, solo creador) — limpia la lista de "Organizo".
  const doDelete = async () => {
    const ok = await confirm({
      title: "Borrar quedada",
      body: `¿Borrar “${q.title}” definitivamente? Desaparece de tu lista y no se puede recuperar.`,
      confirmLabel: "Borrar",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteQuedada({ quedadaId: q.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo borrar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Quedada borrada" });
      router.refresh();
    });
  };

  const doReport = async () => {
    const reason = await ask({
      title: "Reportar quedada",
      label: "¿Qué problema hay?",
      placeholder: "Cuéntanos qué pasó…",
      multiline: true,
      required: true,
      confirmLabel: "Enviar reporte",
      validate: (v) => (v.trim().length < 3 ? "Escribe al menos 3 caracteres." : null),
    });
    if (reason == null) return;
    startTransition(async () => {
      const res = await reportQuedada({ quedadaId: q.id, reason: reason.trim() });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo reportar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Reporte enviado", sub: "Gracias, lo revisaremos." });
    });
  };

  return (
    <div
      ref={cardRef}
      className="card mp-rise"
      onMouseEnter={schedulePrefetchDetails}
      onMouseLeave={cancelScheduledPrefetch}
      onFocus={schedulePrefetchDetails}
      onBlur={cancelScheduledPrefetch}
      style={{
        padding: 0,
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        opacity: cancelled ? 0.78 : 1,
        animationDelay: `${riseDelay}ms`,
      }}
    >
      {cancelled && q.iAmCreator && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); doDelete(); }}
          disabled={pending}
          aria-label={`Borrar ${q.title}`}
          title="Borrar quedada cancelada"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 2,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 9999,
            border: "1px solid var(--destructive-border)",
            background: "#fff",
            color: "var(--destructive-fg)",
            cursor: "pointer",
          }}
        >
          <Icon name="x" size={14} color="var(--destructive-fg)" />
        </button>
      )}
      <div
        onClick={() => setDetailsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDetailsOpen(true);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Ver detalles de ${q.title}`}
        style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, flex: 1, cursor: "pointer", textAlign: "left" }}
      >
        {/* Chips: estado (coloreado) + formato·modo + invitado */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {cancelled ? (
            <Chip bg="var(--destructive-bg)" color="var(--destructive-fg)">Cancelada</Chip>
          ) : finished ? (
            <Chip bg="var(--muted)" color="var(--muted-fg)">Finalizada</Chip>
          ) : q.status === "live" ? (
            <Chip bg="#fef3c7" color="#92400e">● En curso</Chip>
          ) : q.visibility === "private" ? (
            <Chip bg="#1f2937" color="#fff">Privada</Chip>
          ) : (
            <Chip bg="var(--color-mp-primary-light)" color="var(--color-mp-primary-active)">● Abierta</Chip>
          )}
          <Chip bg="var(--muted)" color="var(--muted-fg)">
            {quedadaFormatLabel(q.format)} · {q.matchMode === "singles" ? "Singles" : "Dobles"}
          </Chip>
          {!q.iAmCreator && q.iAmInvited && !q.iAmJoined && <Chip bg="#1f2937" color="#fff">Invitado</Chip>}
        </div>

        {/* Título */}
        <div
          className="font-heading"
          style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.015em", lineHeight: 1.15 }}
        >
          {q.title}
        </div>

        {/* Descripción */}
        {q.description && (
          <p
            style={{
              fontSize: 12.5,
              color: "var(--muted-fg)",
              margin: 0,
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {q.description}
          </p>
        )}

        {/* Organizador (identidad) */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, fontSize: 12 }}>
          <span style={{ flexShrink: 0 }}>
            <Icon name="user-round" size={12} color="var(--muted-fg)" />
          </span>
          <span style={{ fontWeight: 700, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            {q.creatorName}
          </span>
          {q.creatorIsPremium && (
            <span
              style={{
                fontSize: 8.5,
                fontWeight: 900,
                letterSpacing: "0.04em",
                padding: "2px 6px",
                borderRadius: 9999,
                background: "linear-gradient(135deg,#fbbf24,#f59e0b)",
                color: "#0a0a0a",
                flexShrink: 0,
              }}
            >
              MP+
            </span>
          )}
        </div>

        {/* Bloque logística: cuándo / dónde / cupo+barra / cuota */}
        <div style={{ background: "var(--muted)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, fontSize: 12, color: "#1f2937" }}>
          <Row icon="calendar-days">{formatWhen(q.startsAt)}</Row>
          {q.locationText && <Row icon="map-pin">{q.locationText}</Row>}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 130, display: "flex", flexDirection: "column", gap: 5 }}>
              <Row icon="users">Cupo {cupo}{full && !cancelled ? " · lleno" : ""}</Row>
              {q.maxPlayers != null && (
                <div style={{ height: 5, borderRadius: 9999, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, Math.round((q.participantCount / q.maxPlayers) * 100))}%`,
                      background: full ? "var(--destructive-fg)" : "var(--primary)",
                      borderRadius: 9999,
                      transition: "width 320ms var(--ease-out)",
                    }}
                  />
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <Icon name="ticket" size={13} color="var(--muted-fg)" />
              <span className="font-heading" style={{ fontSize: 15, fontWeight: 900, color: q.feeCents > 0 ? "var(--fg)" : "var(--color-mp-primary-active)" }}>
                {feeLabel(q.feeCents)}
              </span>
            </div>
          </div>
        </div>

        {/* Perks */}
        {q.perks && (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--color-mp-primary-active)",
              background: "var(--color-mp-primary-light)",
              borderRadius: 8,
              padding: "8px 10px",
              display: "flex",
              gap: 6,
              alignItems: "flex-start",
            }}
          >
            <span style={{ flexShrink: 0, marginTop: 1 }}>
              <Icon name="sparkles" size={12} color="#10b981" />
            </span>
            <span>{q.perks}</span>
          </div>
        )}
      </div>

      {/* Acciones: una acción principal + menú "⋯" con el resto */}
      <div
        ref={menuRef}
        style={{
          borderTop: "1px solid var(--border)",
          padding: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--muted)",
          position: "relative",
        }}
      >
        {/* Acción principal según rol/estado */}
        {q.iAmCreator && !cancelled && !finished && (
          <button className="btn btn-primary" onClick={onManage} disabled={pending} style={{ flex: 1, justifyContent: "center" }}>
            <Icon name="settings" size={12} color="#fff" /> Gestionar
          </button>
        )}
        {q.iAmCreator && (cancelled || finished) && (
          <button className="btn" onClick={onDuplicate} disabled={pending} style={{ flex: 1, justifyContent: "center", background: "#fff", border: "1px solid var(--border)" }}>
            <Icon name="copy" size={12} /> Duplicar
          </button>
        )}
        {!q.iAmCreator && !cancelled && !finished && (
          q.iAmJoined ? (
            <button className="btn btn-primary" onClick={onCalendar} disabled={pending} style={{ flex: 1, justifyContent: "center" }}>
              <Icon name="calendar-days" size={12} color="#fff" /> Tu calendario
            </button>
          ) : full && !q.iAmInvited ? (
            <FullButton flex />
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleInscribirme}
              disabled={pending}
              style={{ flex: 1, justifyContent: "center" }}
            >
              <Icon name="plus" size={12} color="#fff" />
              {q.feeCents > 0 ? `Inscribirme · ${feeLabel(q.feeCents)}` : "Inscribirme"}
            </button>
          )
        )}
        {!q.iAmCreator && (cancelled || finished) && (
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "var(--muted-fg)" }}>
            {cancelled ? "Quedada cancelada" : "Quedada finalizada"}
          </span>
        )}

        {/* Menú ⋯ */}
        {hasMenu && (
          <>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          disabled={pending}
          aria-label="Más acciones"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            flexShrink: 0,
            background: menuOpen ? "#0a0a0a" : "#fff",
            border: `1px solid ${menuOpen ? "#0a0a0a" : "var(--border)"}`,
            cursor: pending ? "default" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            lineHeight: 1,
            transition: "background 150ms var(--ease-out)",
          }}
        >
          <Icon name="more-horizontal" size={15} color={menuOpen ? "#fff" : "var(--fg)"} />
        </button>
        {menuOpen && (
          <div
            className="mp-modal-panel"
            role="menu"
            style={{
              position: "absolute",
              bottom: "100%",
              right: 12,
              marginBottom: 6,
              width: 240,
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
              zIndex: 50,
              transformOrigin: "bottom right",
              fontSize: 12,
            }}
          >
            {q.iAmCreator && !cancelled && !finished && (
              <QKebabItem icon="user-plus" label="Invitar jugadores" onClick={() => { setMenuOpen(false); onInvite(); }} />
            )}
            {/* El creador ya no queda inscrito al crear (opt-in): puede entrar
                o salir como jugador desde aquí. */}
            {q.iAmCreator && !q.iAmJoined && !full && !cancelled && !finished && (
              <QKebabItem icon="plus" label="Inscribirme como jugador" onClick={() => { setMenuOpen(false); handleInscribirme(); }} />
            )}
            {q.iAmCreator && q.iAmJoined && !cancelled && !finished && (
              <QKebabItem icon="log-out" label="Salir como jugador" danger onClick={() => { setMenuOpen(false); doLeave(); }} />
            )}
            {q.iAmCreator && !cancelled && !finished && (
              <QKebabItem icon="copy" label="Duplicar" onClick={() => { setMenuOpen(false); onDuplicate(); }} />
            )}
            {q.iAmJoined && !q.iAmCreator && !cancelled && !finished && (
              <QKebabItem icon="log-out" label="Salir de la quedada" danger onClick={() => { setMenuOpen(false); doLeave(); }} />
            )}
            {q.iAmCreator && !cancelled && !finished && (
              <QKebabItem icon="x" label="Cancelar quedada" danger onClick={() => { setMenuOpen(false); doCancel(); }} />
            )}
            {!q.iAmCreator && (
              <QKebabItem icon="flag" label="Reportar" onClick={() => { setMenuOpen(false); doReport(); }} />
            )}
          </div>
        )}
          </>
        )}
      </div>
      {detailsOpen && (
        <QuedadaDetailsModal
          q={q}
          onClose={() => setDetailsOpen(false)}
          onRequestJoin={() => setJoinPickerOpen(true)}
          onCalendar={onCalendar}
          onManage={onManage}
          pending={pending}
          getOriginRect={() => cardRef.current?.getBoundingClientRect() ?? null}
          initialData={detailsData}
        />
      )}
      {joinPickerOpen && (
        <JoinPickerModal
          q={q}
          initialData={detailsData}
          pending={pending}
          onClose={() => setJoinPickerOpen(false)}
          onPick={(categoryId) => doJoin(categoryId)}
        />
      )}
    </div>
  );
}

function QKebabItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const color = danger ? "#dc2626" : "#0a0a0a";
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        background: "transparent",
        border: 0,
        cursor: "pointer",
        fontSize: 12,
        color,
        textAlign: "left",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--muted)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon name={icon} size={14} color={color} />
      {label}
    </button>
  );
}

function Row({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
      <span style={{ flexShrink: 0 }}>
        <Icon name={icon} size={12} color="var(--muted-fg)" />
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
    </div>
  );
}

// ── Invitar ──────────────────────────────────────────────────────────────────
function InviteModal({
  quedada,
  meUserId,
  onClose,
}: {
  quedada: QuedadaLite;
  meUserId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Player[]>([]);
  const [pending, startTransition] = useTransition();

  const send = () => {
    if (pending) return;
    if (selected.length === 0) {
      toast({ icon: "alert-triangle", title: "Elige al menos una persona" });
      return;
    }
    startTransition(async () => {
      const res = await inviteToQuedada({ quedadaId: quedada.id, userIds: selected.map((p) => p.id) });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo invitar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: `Invitación enviada a ${selected.length} persona(s)` });
      onClose();
      router.refresh();
    });
  };

  return (
    <ModalShell title="Invitar a la quedada" icon="user-plus" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: "var(--muted-fg)", margin: "0 0 14px", lineHeight: 1.5 }}>
        Invita jugadores a <b style={{ color: "var(--fg)" }}>{quedada.title}</b>. Recibirán una notificación.
      </p>
      <PlayerPicker
        label="A quién invitas"
        max={50}
        selected={selected}
        onChange={setSelected}
        excludeIds={meUserId ? [meUserId] : []}
      />
      <ModalFooter
        onClose={onClose}
        pending={pending}
        confirmLabel="Enviar invitaciones"
        confirmIcon="user-plus"
        onConfirm={send}
      />
    </ModalShell>
  );
}


function calHour(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

// ── Shells reutilizables para los modales secundarios ─────────────────────────
// ── Modal de detalles (preview desde la tarjeta) ─────────────────────────────
type DetailParticipant = { userId: string; name: string; mpr: number | null; teamTag: string | null; categoryIds: string[] };
type QuedadaDetailData = {
  quedada: {
    creator_id: string;
    format: string;
    match_mode: "singles" | "doubles";
    perks_text: string | null;
    prizes: Prize[] | null;
    rules: QuedadaRule[] | null;
  };
  meUserId: string;
  joinedCount: number;
  categories: { id: string; name: string; maxSlots: number | null; taken: number }[];
  participants: DetailParticipant[];
};

function detailInitials(name: string): string {
  return name.trim().split(/\s+/).map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

const Q_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
// Colores de avatar para la lista de inscritos (variados, como en el mockup).
const AVATAR_COLORS = ["#10b981", "#0a0a0a", "#7c3aed", "#f59e0b", "#f97316", "#0ea5e9", "#dc2626", "#14b8a6"];

// Estado "Lleno": botón inactivo (gris + candado), claramente no clickeable.
function FullButton({ flex }: { flex?: boolean }) {
  return (
    <button
      type="button"
      disabled
      aria-label="Quedada llena"
      style={{
        ...(flex ? { flex: 1 } : {}),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "10px 18px",
        borderRadius: 9999,
        border: "1px solid var(--border)",
        background: "var(--muted)",
        color: "var(--muted-fg)",
        fontSize: 12,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        cursor: "not-allowed",
        fontFamily: "inherit",
      }}
    >
      <Icon name="lock" size={12} color="var(--muted-fg)" /> Lleno
    </button>
  );
}

function QuedadaDetailsModal({
  q,
  onClose,
  onRequestJoin,
  onCalendar,
  onManage,
  pending,
  getOriginRect,
  initialData,
}: {
  q: QuedadaLite;
  onClose: () => void;
  onRequestJoin: () => void;
  onCalendar: () => void;
  onManage: () => void;
  pending: boolean;
  getOriginRect: () => DOMRect | null;
  initialData: QuedadaDetailData | null;
}) {
  const [data, setData] = useState<QuedadaDetailData | null>(initialData);
  const [loading, setLoading] = useState(initialData == null);
  const [error, setError] = useState<string | null>(null);
  const [catTab, setCatTab] = useState<string>("all");
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    if (initialData) return; // ya precargado por el prefetch del hover
    let active = true;
    getQuedadaDetails({ quedadaId: q.id }).then((res) => {
      if (!active) return;
      if (!res.ok) setError(res.error.message);
      else setData(res.data as QuedadaDetailData);
      setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id]);

  // Entrada: el panel "crece" desde el rect de la card (FLIP con WAAPI). El
  // backdrop hace fade en paralelo. Reduced-motion → solo fade, sin movimiento.
  useEffect(() => {
    const panel = panelRef.current;
    const overlay = overlayRef.current;
    if (!panel || !overlay) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 140 : 300, easing: Q_EASE, fill: "both" });
    const origin = getOriginRect();
    if (reduce || !origin) {
      panel.animate([{ opacity: 0, transform: "scale(0.98)" }, { opacity: 1, transform: "none" }], { duration: reduce ? 140 : 200, easing: Q_EASE, fill: "both" });
      return;
    }
    const m = panel.getBoundingClientRect();
    const scale = Math.min(origin.width / m.width, 1);
    const tx = origin.left + origin.width / 2 - (m.left + m.width / 2);
    const ty = origin.top + origin.height / 2 - (m.top + m.height / 2);
    panel.animate(
      [
        { transform: `translate(${tx}px, ${ty}px) scale(${scale})`, opacity: 0.35 },
        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
      ],
      { duration: 360, easing: Q_EASE, fill: "both" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cierre: colapsa de vuelta hacia la card, más rápido que la entrada.
  const close = () => {
    const panel = panelRef.current;
    const overlay = overlayRef.current;
    if (closingRef.current) return;
    if (!panel || !overlay) {
      onClose();
      return;
    }
    closingRef.current = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce ? 120 : 200, easing: Q_EASE, fill: "both" });
    const origin = getOriginRect();
    let anim: Animation;
    if (reduce || !origin) {
      anim = panel.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(0.98)" }], { duration: reduce ? 120 : 180, easing: Q_EASE, fill: "both" });
    } else {
      const m = panel.getBoundingClientRect();
      const scale = Math.min(origin.width / m.width, 1);
      const tx = origin.left + origin.width / 2 - (m.left + m.width / 2);
      const ty = origin.top + origin.height / 2 - (m.top + m.height / 2);
      anim = panel.animate(
        [
          { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
          { transform: `translate(${tx}px, ${ty}px) scale(${scale})`, opacity: 0.2 },
        ],
        { duration: 230, easing: Q_EASE, fill: "both" },
      );
    }
    anim.onfinish = () => onClose();
  };

  // Escape cierra (con animación).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelled = q.status === "cancelled";
  const finished = q.status === "finished";
  const full = q.maxPlayers != null && q.participantCount >= q.maxPlayers;
  const cupo = q.maxPlayers != null ? `${q.participantCount}/${q.maxPlayers}` : `${q.participantCount}`;
  const rules = data?.quedada.rules ?? [];
  const prizes = data?.quedada.prizes ?? [];
  const participants = data?.participants ?? [];
  const joinedCount = data?.joinedCount ?? q.participantCount;
  const categories = data?.categories ?? [];
  const activeTab = categories.some((c) => c.id === catTab) ? catTab : "all";
  const shownParticipants = activeTab === "all" ? participants : participants.filter((p) => p.categoryIds.includes(activeTab));
  const catTabs = [{ id: "all", name: "Todos" }, ...categories];
  // Tabs de categoría: mobile = chips que envuelven; desktop = pill segmentado.
  const renderCatTab = (t: { id: string; name: string }, variant: "chip" | "seg") => {
    const on = activeTab === t.id;
    const base: CSSProperties = { whiteSpace: "nowrap", borderRadius: 9999, fontSize: 11.5, fontWeight: on ? 800 : 600, cursor: "pointer", fontFamily: "inherit" };
    const style: CSSProperties =
      variant === "chip"
        ? { ...base, padding: "6px 13px", border: `1px solid ${on ? "var(--fg)" : "var(--border)"}`, background: on ? "var(--fg)" : "#fff", color: on ? "#fff" : "var(--muted-fg)" }
        : { ...base, flexShrink: 0, padding: "7px 16px", border: 0, background: on ? "#fff" : "transparent", color: on ? "var(--fg)" : "var(--muted-fg)", boxShadow: on ? "0 1px 3px rgba(0,0,0,0.08)" : "none" };
    return (
      <button key={t.id} type="button" onClick={() => setCatTab(t.id)} style={style}>
        {t.name}
      </button>
    );
  };
  const act = (fn: () => void) => {
    fn();
    close();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={overlayRef}
      onClick={close}
      style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.7)", backdropFilter: "blur(6px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "inherit", opacity: 0 }}
      className="mp-quedada-detail-overlay"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="card mp-quedada-detail-modal"
        style={{ width: "100%", maxWidth: 720, maxHeight: "92vh", overflow: "auto", padding: 22, borderRadius: 18, background: "#fff", boxShadow: "0 32px 64px rgba(0,0,0,0.5)", opacity: 0, willChange: "transform, opacity" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#10b981,#047857)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="info" size={15} color="#fff" />
            </div>
            <h2 className="font-heading" style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.title}</h2>
          </div>
          <button onClick={close} className="btn" style={{ background: "transparent", border: 0, padding: 4, color: "var(--muted-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }} aria-label="Cerrar">
            <Icon name="x" size={18} color="var(--muted-fg)" />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Chips + organizador */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {cancelled ? (
            <Chip bg="var(--destructive-bg)" color="var(--destructive-fg)">Cancelada</Chip>
          ) : finished ? (
            <Chip bg="var(--muted)" color="var(--muted-fg)">Finalizada</Chip>
          ) : q.status === "live" ? (
            <Chip bg="#fef3c7" color="#92400e">● En curso</Chip>
          ) : q.visibility === "private" ? (
            <Chip bg="#1f2937" color="#fff">Privada</Chip>
          ) : (
            <Chip bg="var(--color-mp-primary-light)" color="var(--color-mp-primary-active)">● Abierta</Chip>
          )}
          <Chip bg="var(--muted)" color="var(--muted-fg)">
            {quedadaFormatLabel(q.format)} · {q.matchMode === "singles" ? "Singles" : "Dobles"}
          </Chip>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, fontSize: 12 }}>
          <Icon name="user-round" size={12} color="var(--muted-fg)" />
          <span style={{ fontWeight: 700, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.creatorName}</span>
          {q.creatorIsPremium && (
            <span style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.04em", padding: "2px 6px", borderRadius: 9999, background: "linear-gradient(135deg,#fbbf24,#f59e0b)", color: "#0a0a0a", flexShrink: 0 }}>MP+</span>
          )}
        </div>

        {/* Resumen + Reglas (cada uno en su card; reglas a la derecha) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, alignItems: "stretch" }}>
          {/* Resumen */}
          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
            <div className="font-heading" style={{ fontSize: 13.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em" }}>
              Resumen<span className="dot">.</span>
            </div>
            {q.description && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{q.description}</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12, color: "#1f2937" }}>
              <Row icon="calendar-days">{formatWhen(q.startsAt)}</Row>
              {q.locationText && <Row icon="map-pin">{q.locationText}</Row>}
              {categories.length > 0 && <Row icon="layers">{categories.length} {categories.length === 1 ? "categoría" : "categorías"}</Row>}
              <Row icon="users">Cupo {cupo}{full && !cancelled ? " · lleno" : ""}</Row>
              {q.maxPlayers != null && (
                <div style={{ height: 5, borderRadius: 9999, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, Math.round((q.participantCount / q.maxPlayers) * 100))}%`, background: full ? "var(--destructive-fg)" : "var(--primary)", borderRadius: 9999 }} />
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="ticket" size={13} color="var(--muted-fg)" />
                <span className="font-heading" style={{ fontSize: 15, fontWeight: 900, color: q.feeCents > 0 ? "var(--fg)" : "var(--color-mp-primary-active)" }}>{feeLabel(q.feeCents)}</span>
              </div>
            </div>
            {prizes.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: "1px solid var(--border)", paddingTop: 9 }}>
                {prizes.map((p, i) => (
                  <QuedadaPrizeRow key={`${p.place}-${i}`} prize={p} compact />
                ))}
              </div>
            )}
          </div>

          {/* Reglas clave */}
          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
            <div className="font-heading" style={{ fontSize: 13.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em" }}>
              Reglas clave<span className="dot">.</span>
            </div>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[0, 1, 2].map((k) => <div key={k} style={{ height: 14, borderRadius: 6, background: "var(--muted)" }} />)}
              </div>
            ) : rules.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>El organizador no agregó reglas.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rules.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ flexShrink: 0, marginTop: 1 }}>
                      <Icon name={r.warn ? "alert-triangle" : "check"} size={14} color={r.warn ? "#b45309" : "var(--color-mp-primary-active)"} />
                    </span>
                    <span style={{ fontSize: 12.5, lineHeight: 1.4, color: "var(--fg)" }}>{r.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {q.perks && (
          <div style={{ fontSize: 11.5, color: "var(--color-mp-primary-active)", background: "var(--color-mp-primary-light)", borderRadius: 8, padding: "8px 10px", display: "flex", gap: 6, alignItems: "flex-start" }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="sparkles" size={12} color="#10b981" /></span>
            <span>{q.perks}</span>
          </div>
        )}

        {/* Inscritos (card con mini-cards de jugador en 2 columnas) */}
        <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <div className="font-heading" style={{ fontSize: 13.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em" }}>
              Inscritos<span className="dot">.</span>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--muted-fg)", fontWeight: 700 }}>{joinedCount}{q.maxPlayers != null ? ` de ${q.maxPlayers}` : ""}</span>
          </div>
          {categories.length > 0 && (
            <>
              {/* Mobile: chips que envuelven */}
              <div className="flex flex-wrap md:hidden" style={{ gap: 6 }}>
                {catTabs.map((t) => renderCatTab(t, "chip"))}
              </div>
              {/* Desktop: pill segmentado deslizable */}
              <div
                className="hidden md:flex mp-noscroll"
                style={{ alignItems: "center", gap: 4, padding: 4, background: "var(--muted)", borderRadius: 9999, overflowX: "auto", maxWidth: "100%", overscrollBehavior: "contain" }}
              >
                {catTabs.map((t) => renderCatTab(t, "seg"))}
              </div>
            </>
          )}
          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
              {[0, 1, 2, 3].map((k) => <div key={k} style={{ height: 48, borderRadius: 10, background: "var(--muted)" }} />)}
            </div>
          ) : shownParticipants.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>{activeTab === "all" ? "Aún no hay inscritos." : "Nadie asignado en esta categoría."}</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
              {shownParticipants.map((p, i) => (
                <div key={p.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10, minWidth: 0 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: AVATAR_COLORS[i % AVATAR_COLORS.length], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900 }}>
                    {detailInitials(p.name)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.mpr != null ? `Nivel ${(p.mpr / 1000).toFixed(1)}` : "Sin nivel"}
                      {p.teamTag ? ` · ${p.teamTag.toUpperCase()}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div style={{ fontSize: 12, color: "var(--destructive-fg)", background: "var(--destructive-bg)", border: "1px solid var(--destructive-border)", borderRadius: 8, padding: "8px 10px" }}>
            No se pudo cargar el detalle: {error}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <button className="btn btn-outline" onClick={close}>Cerrar</button>
          {q.iAmCreator && !cancelled && !finished && (
            <button className="btn btn-primary" onClick={() => act(onManage)} disabled={pending}>
              <Icon name="settings" size={12} color="#fff" /> Gestionar
            </button>
          )}
          {!q.iAmCreator && !cancelled && !finished && (
            q.iAmJoined ? (
              <button className="btn btn-primary" onClick={() => act(onCalendar)} disabled={pending}>
                <Icon name="calendar-days" size={12} color="#fff" /> Tu calendario
              </button>
            ) : full && !q.iAmInvited ? (
              <FullButton />
            ) : (
              <button className="btn btn-primary" onClick={() => act(onRequestJoin)} disabled={pending}>
                <Icon name="plus" size={12} color="#fff" />
                {q.feeCents > 0 ? `Inscribirme · ${feeLabel(q.feeCents)}` : "Inscribirme"}
              </button>
            )
          )}
        </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Selector de categoría al inscribirse. Si la quedada no tiene categorías,
// muestra una confirmación simple. El pago es offline (no hay pantalla de pago).
function JoinPickerModal({
  q,
  initialData,
  pending,
  onClose,
  onPick,
}: {
  q: QuedadaLite;
  initialData: QuedadaDetailData | null;
  pending: boolean;
  onClose: () => void;
  onPick: (categoryId?: string) => void;
}) {
  const [data, setData] = useState<QuedadaDetailData | null>(initialData);
  const [loading, setLoading] = useState(initialData == null);

  useEffect(() => {
    if (initialData) return;
    let active = true;
    getQuedadaDetails({ quedadaId: q.id }).then((res) => {
      if (!active) return;
      if (res.ok) setData(res.data as QuedadaDetailData);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [q.id, initialData]);

  const categories = data?.categories ?? [];
  const individualRoster = rosterModeFor(q.format, q.matchMode) === "individual";

  return (
    <ModalShell title="Inscribirme" icon="user-plus" onClose={onClose} maxWidth={440}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          {q.feeCents > 0 ? (
            <>
              Cuota <b style={{ color: "var(--fg)" }}>{feeLabel(q.feeCents)}</b> — el pago es por transferencia o en el lugar.
            </>
          ) : (
            "Inscripción gratuita."
          )}
        </p>

        {loading ? (
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Cargando detalles…</div>
        ) : categories.length === 0 || !individualRoster ? (
          <>
            {!individualRoster && categories.length > 0 && (
              <div style={{ fontSize: 12, color: "var(--muted-fg)", background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", lineHeight: 1.45 }}>
                El organizador armará tu pareja y categoría desde el roster. Tu inscripción queda reservada en la quedada.
              </div>
            )}
          <button
            className="btn btn-primary"
            onClick={() => onPick()}
            disabled={pending}
            style={{ justifyContent: "center" }}
          >
            <Icon name="plus" size={13} color="#fff" /> Confirmar inscripción
          </button>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="label-mp">Elige tu categoría</div>
            {categories.map((c) => {
              const cap = c.maxSlots ?? 0;
              const isFull = cap > 0 && c.taken >= cap;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => !isFull && onPick(c.id)}
                  disabled={pending || isFull}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "11px 13px",
                    borderRadius: 11,
                    border: `1px solid ${isFull ? "var(--border)" : "var(--border)"}`,
                    background: isFull ? "var(--muted)" : "#fff",
                    cursor: isFull ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    opacity: pending ? 0.6 : 1,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: isFull ? "var(--destructive-fg)" : "var(--muted-fg)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {cap > 0 ? `${c.taken}/${cap}` : `${c.taken}`}{isFull ? " · Lleno" : ""}
                    {!isFull && <Icon name="chevron-right" size={14} color="var(--primary)" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-outline" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  icon,
  onClose,
  children,
  maxWidth = 520,
}: {
  title: string;
  icon: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      onClick={onClose}
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
        animation: "mp-q2-fade 160ms var(--ease-out, ease)",
      }}
    >
      <style>{`@keyframes mp-q2-fade{from{opacity:0}to{opacity:1}}
        @keyframes mp-q2-pop{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`}</style>
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="card"
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "92vh",
          overflow: "auto",
          padding: 22,
          borderRadius: 18,
          background: "#fff",
          boxShadow: "0 32px 64px rgba(0,0,0,0.5)",
          animation: "mp-q2-pop 180ms var(--ease-out, ease)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: "linear-gradient(135deg,#10b981,#047857)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={icon} size={15} color="#fff" />
            </div>
            <h2 className="font-heading" style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", margin: 0 }}>
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="btn"
            style={{ background: "transparent", border: 0, padding: 4, color: "var(--muted-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
            aria-label="Cerrar"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ModalFooter({
  onClose,
  pending,
  confirmLabel,
  confirmIcon,
  onConfirm,
}: {
  onClose: () => void;
  pending: boolean;
  confirmLabel: string;
  confirmIcon: string;
  onConfirm: () => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
      <button onClick={onClose} className="btn btn-outline" disabled={pending}>
        Cancelar
      </button>
      <button
        onClick={onConfirm}
        className="btn btn-primary"
        disabled={pending}
        style={{ opacity: pending ? 0.6 : 1 }}
      >
        {!pending && <Icon name={confirmIcon} size={13} color="#fff" />}
        {pending ? "Guardando…" : confirmLabel}
      </button>
    </div>
  );
}

