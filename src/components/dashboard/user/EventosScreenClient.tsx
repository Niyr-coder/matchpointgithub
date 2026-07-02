// Client child de EventosScreen — recibe tournaments + mis registrations.
"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import type { TournamentFeatured, TournamentDetail } from "@/lib/schemas/tournaments";
import { tournamentFormatBadge } from "@/lib/tournaments/event-badges";
import { getTournamentRegistrationEligibility } from "@/lib/tournaments/registration-eligibility";
import {
  getTournamentRegisterContext,
  registerToTournament,
} from "@/server/actions/tournaments";
import { TournamentCategoryJoinModal } from "@/components/dashboard/eventos/TournamentCategoryJoinModal";

type Props = {
  tournaments: TournamentFeatured[];
  myRegisteredIds: string[];
  userId: string | null;
};

// Pide al usuario elegir modo de pago cuando el torneo tiene policy 'flexible'.
function PaymentModeDialog({
  onChoose,
  onCancel,
}: {
  onChoose: (mode: "online" | "onsite") => void;
  onCancel: () => void;
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420 }}
      >
        <h3 className="font-heading" style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}>
          ¿Cómo prefieres pagar?
        </h3>
        <p style={{ margin: "8px 0 16px", fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          Este torneo te deja elegir entre pago online (sube comprobante de transferencia o DeUna) o pago en sitio (pagas en el mostrador el día del evento).
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            onClick={() => onChoose("online")}
            className="btn btn-primary"
            style={{ justifyContent: "flex-start" }}
          >
            <Icon name="upload" size={13} color="#fff" />
            Pago online (subir comprobante)
          </button>
          <button
            type="button"
            onClick={() => onChoose("onsite")}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)", justifyContent: "flex-start" }}
          >
            <Icon name="map-pin" size={13} />
            Pago en sitio
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn"
            style={{ background: "transparent", border: 0, color: "var(--muted-fg)", marginTop: 4 }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS = ["Próximos", "En curso", "Pasados", "Mis eventos"] as const;
type Tab = (typeof TABS)[number];

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function dateParts(startsAt: string, endsAt: string | null) {
  const s = new Date(startsAt);
  const e = endsAt ? new Date(endsAt) : s;
  const sd = s.getUTCDate();
  const ed = e.getUTCDate();
  const sameMonth = s.getUTCMonth() === e.getUTCMonth();
  const sameDay = sd === ed && sameMonth;
  const m = MONTHS_ES[s.getUTCMonth()];
  const year = s.getUTCFullYear();
  const d = sameDay ? `${sd}` : sameMonth ? `${sd}-${ed}` : `${sd}`;
  const long = sameDay
    ? `${sd} ${MONTHS_LONG[s.getUTCMonth()]} · ${year}`
    : sameMonth
      ? `${sd}-${ed} ${MONTHS_LONG[s.getUTCMonth()]} · ${year}`
      : `${sd} ${MONTHS_ES[s.getUTCMonth()]} – ${ed} ${MONTHS_ES[e.getUTCMonth()]} · ${year}`;
  return { d, m, long };
}

function sportLabel(s: string): string {
  if (s === "tennis") return "Tenis";
  if (s === "padel") return "Pádel";
  return "Pickleball";
}

function eventListEligibility(t: TournamentFeatured) {
  return getTournamentRegistrationEligibility({
    status: t.status,
    registrationOpensAt: null,
    registrationClosesAt: null,
    maxParticipants: t.maxParticipants,
    allowWaitlist: t.allowWaitlist,
    registrationCount: t.registrationsCount,
    categories: [],
    categoryRegistrationCounts: {},
  });
}

function EventTypeBadges({
  t,
  registered,
}: {
  t: TournamentFeatured;
  registered?: boolean;
}) {
  return (
    <>
      {t.isFeatured && (
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 900,
            padding: "2px 8px",
            borderRadius: 9999,
            background: "#fef3c7",
            color: "#92400e",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          ★ Estelar
        </span>
      )}
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 900,
          padding: "2px 8px",
          borderRadius: 9999,
          background: "#ecfdf5",
          color: "#065f46",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        {tournamentFormatBadge(t.format)}
      </span>
      {registered && (
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 900,
            padding: "2px 8px",
            borderRadius: 9999,
            background: "#fbbf24",
            color: "#0a0a0a",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          ✓ Inscrito
        </span>
      )}
    </>
  );
}
function formatLabel(format: string): string {
  switch (format) {
    case "single_elim": return "Eliminación directa";
    case "double_elim": return "Doble eliminación";
    case "round_robin": return "Round robin";
    case "swiss": return "Suizo";
    case "groups_to_knockout": return "Grupos + llave";
    default: return "Eliminación directa";
  }
}

function priceLabel(cents: number | null, fallback = "—"): string {
  if (cents == null || cents === 0) return fallback;
  const n = Math.round(cents / 100);
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `$${n}`;
}

function feeLabel(cents: number): string {
  if (cents === 0) return "Gratis";
  return priceLabel(cents);
}

function categorize(t: TournamentFeatured): "proximos" | "curso" | "pasados" {
  const now = Date.now();
  const start = +new Date(t.startsAt);
  // Sin endsAt: usamos starts_at + 1 día como ventana aproximada para "en curso".
  const end = t.endsAt ? +new Date(t.endsAt) : start + 24 * 60 * 60 * 1000;
  if (t.status === "live" || (start <= now && now <= end)) return "curso";
  if (t.status === "finished" || end < now) return "pasados";
  return "proximos";
}

const MIN_ROWS = 4;
type RowItem = (TournamentFeatured & { placeholder?: false }) | { placeholder: true; key: string };

function padRows(arr: TournamentFeatured[]): RowItem[] {
  const out: RowItem[] = arr.map((t) => ({ ...t, placeholder: false as const }));
  while (out.length < MIN_ROWS) {
    out.push({ placeholder: true, key: `ph-${out.length}` });
  }
  return out;
}

export function EventosScreenClient({ tournaments, myRegisteredIds, userId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [searchQ, setSearchQ] = useState("");
  const [registerCtx, setRegisterCtx] = useState<{
    detail: TournamentDetail;
    categoryCounts: Record<string, number>;
  } | null>(null);
  const [pickCategoryOpen, setPickCategoryOpen] = useState(false);
  const [pickPaymentOpen, setPickPaymentOpen] = useState(false);
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);
  const [registering, startRegister] = useTransition();
  // Realtime: solo INSERT de torneos nuevos. Drop registrations y UPDATEs
  // de tournaments para no refrescar a TODOS los users del país por cada
  // edit ajeno (ver docs/architecture/50-realtime.md §Carga global).
  useRealtimeRefresh(
    [{ table: "tournaments", event: "INSERT" }],
    { debounceMs: 5000 },
  );

  useEffect(() => {
    const fromUrl = searchParams.get("q")?.trim();
    if (fromUrl) setSearchQ(fromUrl);
  }, [searchParams]);

  const [tab, setTab] = useState<Tab>("Próximos");
  const myIds = new Set(myRegisteredIds);

  const matchesSearch = (t: TournamentFeatured) => {
    const needle = searchQ.trim().toLowerCase();
    if (!needle) return true;
    return (
      t.name.toLowerCase().includes(needle) ||
      (t.clubName?.toLowerCase().includes(needle) ?? false) ||
      (t.clubCity?.toLowerCase().includes(needle) ?? false)
    );
  };

  const visibleTournaments = useMemo(
    () => tournaments.filter(matchesSearch),
    [tournaments, searchQ],
  );
  // El click navega a /dashboard/eventos/[slug] — ruta real con shell del
  // dashboard. El flow de inscripción + paymentMode vive ahí, no aquí.
  const openTournament = (slug: string) => {
    router.push(`/dashboard/eventos/${slug}`);
  };

  const partitioned = {
    Próximos: visibleTournaments.filter((t) => categorize(t) === "proximos"),
    "En curso": visibleTournaments.filter((t) => categorize(t) === "curso"),
    Pasados: visibleTournaments.filter((t) => categorize(t) === "pasados"),
    "Mis eventos": visibleTournaments.filter((t) => myIds.has(t.id)),
  } satisfies Record<Tab, TournamentFeatured[]>;

  const list = partitioned[tab];
  const sortedList = useMemo(() => {
    if (tab !== "Próximos") return list;
    return [...list].sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      return +new Date(a.startsAt) - +new Date(b.startsAt);
    });
  }, [list, tab]);
  const featured =
    tab === "Próximos" ? sortedList.find((t) => t.isFeatured) ?? sortedList[0] ?? null : null;
  const rest = featured ? sortedList.filter((t) => t.id !== featured.id) : sortedList;
  const padded = padRows(rest);

  const runRegister = (
    detail: TournamentDetail,
    paymentMode?: "online" | "onsite",
    categoryId?: string,
  ) => {
    if (!userId) return;
    startRegister(async () => {
      const res = await registerToTournament({
        tournamentId: detail.tournament.id,
        body: {
          playerIds: [userId],
          categoryId: categoryId ?? pendingCategoryId ?? undefined,
        },
        paymentMode,
      });
      if (!res.ok) {
        const code = res.error.code;
        if (code === "TOURNAMENTS.CATEGORY_REQUIRED") {
          setPickCategoryOpen(true);
          return;
        }
        if (code === "TOURNAMENTS.CATEGORY_FULL") {
          toast({ icon: "alert-triangle", title: "Categoría llena", sub: "Prueba otra categoría." });
          setPickCategoryOpen(true);
          return;
        }
        if (code === "TOURNAMENTS.ALREADY_REGISTERED") {
          toast({ icon: "check-circle-2", title: "Ya estabas inscrito" });
          router.refresh();
          return;
        }
        toast({
          icon: "alert-triangle",
          title: "No se pudo inscribir",
          sub: res.error.message,
        });
        return;
      }
      if (res.data.status === "waitlist") {
        toast({
          icon: "clock",
          title: "Estás en lista de espera",
          sub: "Te avisaremos si se libera un cupo.",
        });
        setRegisterCtx(null);
        setPickCategoryOpen(false);
        setPickPaymentOpen(false);
        setPendingCategoryId(null);
        router.refresh();
        return;
      }
      const txId = res.data.paidTransactionId ?? null;
      const policy = detail.tournament.paymentPolicy;
      const effectiveMode = paymentMode ?? (policy === "prepay" ? "online" : policy === "onsite" ? "onsite" : null);
      if (txId && effectiveMode === "online") {
        toast({ icon: "upload", title: "Inscripción creada", sub: "Sube tu comprobante" });
        router.push(`/pagos/${txId}`);
        return;
      }
      const isOnsite = paymentMode === "onsite";
      toast({
        icon: isOnsite ? "map-pin" : "check",
        title: isOnsite ? "Cupo reservado" : "¡Inscrito!",
        sub: isOnsite ? "Pagas en el club al llegar" : undefined,
      });
      setRegisterCtx(null);
      setPickCategoryOpen(false);
      setPickPaymentOpen(false);
      setPendingCategoryId(null);
      router.refresh();
    });
  };

  const beginRegister = (t: TournamentFeatured) => {
    if (!userId) {
      router.push(`/login?next=${encodeURIComponent("/dashboard/user/eventos")}`);
      return;
    }
    const quick = eventListEligibility(t);
    if (!quick.canRegister) {
      toast({ icon: "lock", title: quick.label });
      return;
    }
    void (async () => {
      const res = await getTournamentRegisterContext({ idOrSlug: t.slug });
      if (!res.ok) {
        toast({
          icon: "alert-triangle",
          title: "No se pudo cargar el torneo",
          sub: res.error.message,
        });
        return;
      }
      const { detail, categoryRegistrationCounts } = res.data;
      const full = getTournamentRegistrationEligibility({
        status: detail.tournament.status,
        registrationOpensAt: detail.tournament.registrationOpensAt,
        registrationClosesAt: detail.tournament.registrationClosesAt,
        maxParticipants: detail.tournament.maxParticipants,
        allowWaitlist: detail.tournament.allowWaitlist,
        registrationCount: detail.registrationCount,
        categories: detail.categories.map((c) => ({ id: c.id, maxTeams: c.maxTeams })),
        categoryRegistrationCounts,
      });
      if (!full.canRegister) {
        toast({ icon: "lock", title: full.label });
        return;
      }
      setRegisterCtx({ detail, categoryCounts: categoryRegistrationCounts });
      setPendingCategoryId(null);
      if (detail.categories.length > 0) {
        setPickCategoryOpen(true);
        return;
      }
      if (detail.tournament.paymentPolicy === "flexible") {
        setPickPaymentOpen(true);
        return;
      }
      runRegister(detail);
    })();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="label-mp">Eventos · Torneos & ligas</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <h1 className="font-heading display-md" style={{ margin: 0 }}>
          Calendario <span className="dot">●</span> {new Date().getFullYear()}
        </h1>
        {searchQ.trim() ? (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 9999,
              background: "var(--muted)",
              fontSize: 12,
            }}
          >
            <Icon name="search" size={12} color="var(--muted-fg)" />
            <span>
              Resultados para <b>“{searchQ.trim()}”</b>
            </span>
            <button
              type="button"
              onClick={() => setSearchQ("")}
              aria-label="Quitar búsqueda"
              style={{
                border: 0,
                background: "transparent",
                cursor: "pointer",
                padding: 2,
                display: "inline-flex",
                color: "var(--muted-fg)",
              }}
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        ) : null}
      </div>

      <div
        className="mp-touch-hscroll"
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--border)",
          maxWidth: "100%",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "10px 18px",
              background: "transparent",
              border: 0,
              borderBottom: "2px solid " + (tab === t ? "#0a0a0a" : "transparent"),
              color: tab === t ? "#0a0a0a" : "var(--muted-fg)",
              fontWeight: tab === t ? 900 : 600,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
              fontFamily: "inherit",
              marginBottom: -1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {t}
            <span
              style={{
                fontSize: 9.5,
                padding: "1px 6px",
                borderRadius: 9999,
                background: tab === t ? "#0a0a0a" : "var(--muted)",
                color: tab === t ? "#fff" : "var(--muted-fg)",
              }}
            >
              {partitioned[t].length}
            </span>
          </button>
        ))}
      </div>

      {featured && (
        <FeaturedCard
          t={featured}
          registered={myIds.has(featured.id)}
          onOpen={() => openTournament(featured.slug)}
          onRegister={() => beginRegister(featured)}
          canRegister={eventListEligibility(featured).canRegister}
          registering={registering}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {padded.map((row) =>
          row.placeholder ? (
            <RowPlaceholder key={row.key} />
          ) : (
            <EventRow
              key={row.id}
              t={row}
              registered={myIds.has(row.id)}
              onOpen={() => openTournament(row.slug)}
              onRegister={() => beginRegister(row)}
              canRegister={eventListEligibility(row).canRegister}
              blockLabel={eventListEligibility(row).label}
              registering={registering}
            />
          ),
        )}
      </div>

      {tab === "Mis eventos" && partitioned["Mis eventos"].length === 0 && (
        <div
          style={{
            padding: "14px 18px",
            background: "var(--muted)",
            borderRadius: 12,
            fontSize: 12.5,
            color: "var(--muted-fg)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="info" size={16} color="var(--primary)" />
          <span>Aún no te has inscrito a ningún evento. Explora los próximos y elige uno.</span>
        </div>
      )}
      {registerCtx && pickCategoryOpen && (
        <TournamentCategoryJoinModal
          open={pickCategoryOpen}
          tournamentName={registerCtx.detail.tournament.name}
          entryFeeCents={registerCtx.detail.tournament.entryFeeCents ?? 0}
          categories={registerCtx.detail.categories}
          registrationCountByCategory={registerCtx.categoryCounts}
          pending={registering}
          onClose={() => {
            if (!registering) {
              setPickCategoryOpen(false);
              setPendingCategoryId(null);
            }
          }}
          onPick={(categoryId) => {
            setPendingCategoryId(categoryId);
            setPickCategoryOpen(false);
            if (registerCtx.detail.tournament.paymentPolicy === "flexible") {
              setPickPaymentOpen(true);
              return;
            }
            runRegister(registerCtx.detail, undefined, categoryId);
          }}
        />
      )}
      {registerCtx && pickPaymentOpen && (
        <PaymentModeDialog
          onChoose={(mode) => runRegister(registerCtx.detail, mode, pendingCategoryId ?? undefined)}
          onCancel={() => {
            if (!registering) setPickPaymentOpen(false);
          }}
        />
      )}
    </div>
  );
}

function FeaturedCard({
  t,
  registered,
  onOpen,
  onRegister,
  canRegister,
  registering,
}: {
  t: TournamentFeatured;
  registered: boolean;
  onOpen: () => void;
  onRegister: () => void;
  canRegister: boolean;
  registering: boolean;
}) {
  const { d, m } = dateParts(t.startsAt, t.endsAt);
  const filled = t.registrationsCount;
  const slots = t.maxParticipants ?? 0;
  const pct = slots > 0 ? Math.min(100, (filled / slots) * 100) : 0;
  const remaining = slots > 0 ? slots - filled : null;
  const club = [t.clubName, t.clubCity].filter(Boolean).join(" · ") || "Multi-club";

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        position: "relative",
        background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 60%, #064e3b 100%)",
        color: "#fff",
        textAlign: "left",
        display: "block",
        width: "100%",
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
          color: "rgba(16,185,129,0.06)",
          letterSpacing: "-0.06em",
          lineHeight: 0.8,
          textTransform: "uppercase",
          transform: "rotate(-6deg) translate(20%, -10%)",
          pointerEvents: "none",
        }}
      >
        {(t.name.split(" ")[0] ?? "OPEN").slice(0, 6).toUpperCase()}
      </div>
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          padding: "5px 12px",
          background: registered ? "#fbbf24" : "var(--primary)",
          borderRadius: 9999,
          fontSize: 9.5,
          fontWeight: 900,
          color: registered ? "#0a0a0a" : "#fff",
          textTransform: "uppercase",
          letterSpacing: "0.18em",
        }}
      >
        {registered
          ? "✓ Inscrito"
          : t.isFeatured
            ? "★ Evento estelar"
            : `★ Evento ${tournamentFormatBadge(t.format)}`}
      </div>
      <div className="relative p-5 md:p-8 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-8 items-end">
        <button
          type="button"
          onClick={onOpen}
          style={{
            margin: 0,
            padding: 0,
            border: 0,
            background: "transparent",
            color: "inherit",
            font: "inherit",
            textAlign: "left",
            cursor: "pointer",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8, marginTop: 24 }}>
            <span className="font-heading" style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.04em" }}>{d}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.18em" }}>{m}</span>
          </div>
          <h2
            className="font-heading"
            style={{ fontSize: 38, fontWeight: 900, lineHeight: 0.95, letterSpacing: "-0.03em", textTransform: "uppercase", margin: 0, maxWidth: 480 }}
          >
            {t.name}<span style={{ color: "#10b981" }}>.</span>
          </h2>
          <div style={{ display: "flex", gap: 18, marginTop: 16, fontSize: 12.5, color: "rgba(255,255,255,0.85)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="trophy" size={13} color="#fff" />
              {sportLabel(t.sport)}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="map-pin" size={13} color="#fff" />
              {club}
            </span>
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#10b981",
              marginTop: 14,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Ver detalles del evento <Icon name="arrow-right" size={12} color="#10b981" />
          </div>
        </button>
        <div className="flex flex-col gap-3 items-start md:items-end">
          <div style={{ display: "flex", gap: 18 }}>
            <Stat label="Premio" value={priceLabel(t.prizePoolCents, "—")} accent="#10b981" />
            <Stat label="Inscripción" value={feeLabel(t.entryFeeCents)} />
          </div>
          {slots > 0 && (
            <div style={{ width: 240 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "rgba(255,255,255,0.7)", marginBottom: 5 }}>
                <span>Cupos {filled}/{slots}</span>
                {remaining != null && remaining <= 0 && (
                  <span style={{ color: "#f87171", fontWeight: 800 }}>Lleno</span>
                )}
                {remaining != null && remaining > 0 && remaining <= 6 && (
                  <span style={{ color: "#fbbf24", fontWeight: 800 }}>¡Últimos lugares!</span>
                )}
              </div>
              <div style={{ height: 6, background: "rgba(255,255,255,0.15)", borderRadius: 9999, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background:
                      remaining != null && remaining <= 0
                        ? "#dc2626"
                        : "linear-gradient(90deg, #10b981, #fbbf24)",
                  }}
                />
              </div>
            </div>
          )}
          {!registered && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canRegister || registering}
              onClick={onRegister}
              style={{
                marginTop: 4,
                opacity: !canRegister || registering ? 0.65 : 1,
                cursor: !canRegister ? "not-allowed" : registering ? "wait" : "pointer",
              }}
            >
              <Icon name={canRegister ? "check" : "lock"} size={13} />
              {registering
                ? "Procesando…"
                : canRegister
                  ? "Inscribirme"
                  : eventListEligibility(t).label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.18em", fontWeight: 800, marginBottom: 2 }}>
        {label}
      </div>
      <div className="font-heading" style={{ fontSize: 22, fontWeight: 900, color: accent ?? "#fff", letterSpacing: "-0.02em" }}>
        {value}
      </div>
    </div>
  );
}

function EventRow({
  t,
  registered,
  onOpen,
  onRegister,
  canRegister,
  blockLabel,
  registering,
}: {
  t: TournamentFeatured;
  registered: boolean;
  onOpen: () => void;
  onRegister: () => void;
  canRegister: boolean;
  blockLabel: string;
  registering: boolean;
}) {
  const { d, m } = dateParts(t.startsAt, t.endsAt);
  const slots = t.maxParticipants ?? 0;
  const full = !canRegister && blockLabel === "Cupos llenos";
  const club = [t.clubName, t.clubCity].filter(Boolean).join(" · ") || "Multi-club";

  return (
    <div className="card grid grid-cols-[64px_1fr] md:grid-cols-[88px_1fr_auto_auto] items-stretch" style={{ padding: 0 }}>
      <div style={{ background: "var(--muted)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 14, borderRight: "1px solid var(--border)" }}>
        <div className="font-heading" style={{ fontSize: 30, fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.03em" }}>{d}</div>
        <div style={{ fontSize: 9.5, fontWeight: 900, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.18em", marginTop: 4 }}>{m}</div>
      </div>
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <EventTypeBadges t={t} registered={registered} />
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              padding: "2px 8px",
              borderRadius: 9999,
              background: "var(--muted)",
              color: "var(--muted-fg)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            {sportLabel(t.sport)}
          </span>
        </div>
        <button
          onClick={onOpen}
          className="font-heading"
          style={{
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: "-0.015em",
            lineHeight: 1.1,
            background: "transparent",
            border: 0,
            padding: 0,
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "inherit",
            color: "inherit",
          }}
        >
          {t.name}
        </button>
        <div style={{ fontSize: 11.5, color: "var(--muted-fg)", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="map-pin" size={11} />
          {club}
        </div>
      </div>
      <div className="hidden md:flex" style={{ padding: "14px 18px", flexDirection: "column", justifyContent: "center", alignItems: "flex-end", gap: 4, borderLeft: "1px dashed var(--border)" }}>
        <div style={{ fontSize: 9.5, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 800 }}>Premio</div>
        <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, color: "var(--primary)" }}>{priceLabel(t.prizePoolCents, "—")}</div>
        <div style={{ fontSize: 10.5, color: full ? "#dc2626" : "var(--muted-fg)", fontWeight: 700 }}>
          Cupos: {slots > 0 ? `${t.registrationsCount}/${slots}` : `${t.registrationsCount}`}
        </div>
      </div>
      <div className="hidden md:flex" style={{ padding: 14, alignItems: "center", paddingRight: 18, gap: 6 }}>
        <button type="button" onClick={onOpen} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>Ver</button>
        {registered ? (
          <button type="button" className="btn" style={{ background: "#ecfdf5", color: "#065f46", border: "1px solid #10b981" }} disabled>
            <Icon name="check" size={12} color="#065f46" />
            Inscrito
          </button>
        ) : !canRegister ? (
          <button type="button" className="btn" style={{ background: "var(--muted)", color: "var(--muted-fg)", cursor: "not-allowed" }} disabled>
            <Icon name="lock" size={12} />
            {blockLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRegister}
            disabled={registering}
            className="btn btn-primary"
            style={{ opacity: registering ? 0.7 : 1 }}
          >
            {registering ? "Procesando…" : "Inscribirme"}
            <Icon name="arrow-right" size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function RowPlaceholder() {
  return (
    <div
      className="card grid grid-cols-[64px_1fr] md:grid-cols-[88px_1fr_auto_auto] items-stretch"
      style={{
        padding: 0,
        opacity: 0.5,
        border: "1px dashed var(--border)",
        background: "#fafafa",
      }}
    >
      <div style={{ background: "var(--muted)", padding: 14, borderRight: "1px solid var(--border)", textAlign: "center" }}>
        <div className="font-heading" style={{ fontSize: 30, fontWeight: 900, color: "var(--muted-fg)" }}>—</div>
        <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 4 }}>—</div>
      </div>
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "var(--muted-fg)" }} className="font-heading">Próximamente</div>
        <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>—</div>
      </div>
      <div className="hidden md:block" style={{ padding: "14px 18px", textAlign: "right", color: "var(--muted-fg)" }}>
        <div style={{ fontSize: 9.5, fontWeight: 800 }}>Premio</div>
        <div className="font-heading" style={{ fontSize: 16, fontWeight: 900 }}>$—</div>
      </div>
      <div className="hidden md:flex" style={{ padding: 14, alignItems: "center", paddingRight: 18 }}>
        <span className="btn" style={{ background: "var(--muted)", color: "var(--muted-fg)", border: "1px dashed var(--border)", cursor: "default" }}>—</span>
      </div>
    </div>
  );
}

// === DETAIL ===

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
];

function EventDetail({
  ev,
  registered,
  onBack,
  onRegister,
}: {
  ev: TournamentFeatured;
  registered: boolean;
  onBack: () => void;
  onRegister: () => void;
}) {
  const reg = registered;
  const { long } = dateParts(ev.startsAt, ev.endsAt);
  const slots = ev.maxParticipants ?? 0;
  const filled = ev.registrationsCount;
  const isFull = slots > 0 && filled >= slots;
  const remaining = slots > 0 ? slots - filled : null;
  const tag = tournamentFormatBadge(ev.format, true);
  const club = [ev.clubName, ev.clubCity].filter(Boolean).join(" · ") || "Multi-club";

  // Cronograma mock — sin tabla de schedule en DB todavía.
  const schedule = [
    { d: long, items: [
      { t: "09:00", e: "Acreditación + check-in" },
      { t: "10:00", e: "Inicio del juego" },
      { t: "17:00", e: "Premiación" },
    ] },
  ];

  // Premios derivados del pool 50/30/20.
  const pool = ev.prizePoolCents ?? 0;
  const prizes = pool > 0
    ? [
        { p: "1°", amt: priceLabel(Math.round(pool * 0.5)), extra: "Trofeo + kit oficial" },
        { p: "2°", amt: priceLabel(Math.round(pool * 0.3)), extra: "Medalla + kit" },
        { p: "3°", amt: priceLabel(Math.round(pool * 0.2)), extra: "Medalla" },
      ]
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
        <Icon name="arrow-left" size={13} /> Volver al calendario
      </button>

      <div
        className="card"
        style={{
          padding: 0,
          overflow: "hidden",
          position: "relative",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 60%, #064e3b 100%)",
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
            fontSize: 240,
            color: "rgba(16,185,129,0.06)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(15%, -15%)",
            pointerEvents: "none",
            textTransform: "uppercase",
          }}
        >
          {tag.slice(0, 4)}
        </div>
        <div className="relative p-5 md:p-8 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-8 items-end">
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              <span style={{ padding: "4px 11px", background: "var(--primary)", borderRadius: 9999, fontSize: 9.5, fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.18em" }}>{tag}</span>
              <span style={{ padding: "4px 11px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", borderRadius: 9999, fontSize: 9.5, fontWeight: 900, color: "#fff", textTransform: "uppercase", letterSpacing: "0.18em" }}>{sportLabel(ev.sport)}</span>
            </div>
            <h1 className="font-heading" style={{ fontSize: 48, fontWeight: 900, lineHeight: 0.95, letterSpacing: "-0.03em", textTransform: "uppercase", margin: 0, maxWidth: 620 }}>
              {ev.name}<span style={{ color: "#10b981" }}>.</span>
            </h1>
            <div style={{ display: "flex", gap: 22, marginTop: 18, fontSize: 12.5, color: "rgba(255,255,255,0.85)", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="calendar" size={13} color="#fff" />
                {long}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="map-pin" size={13} color="#fff" />
                {club}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-3 items-start md:items-end md:min-w-[280px]">
            <div style={{ display: "flex", gap: 18 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.18em", fontWeight: 800, marginBottom: 2 }}>Premio total</div>
                <div className="font-heading" style={{ fontSize: 26, fontWeight: 900, color: "#10b981", letterSpacing: "-0.02em", lineHeight: 1 }}>{priceLabel(ev.prizePoolCents, "—")}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.18em", fontWeight: 800, marginBottom: 2 }}>Inscripción</div>
                <div className="font-heading" style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1 }}>{feeLabel(ev.entryFeeCents)}</div>
              </div>
            </div>
            {slots > 0 && (
              <div style={{ width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "rgba(255,255,255,0.7)", marginBottom: 5 }}>
                  <span>Cupos {filled}/{slots}</span>
                  <span style={{ color: isFull ? "#dc2626" : "#fbbf24", fontWeight: 800 }}>
                    {isFull ? "Lleno" : `${remaining} disponibles`}
                  </span>
                </div>
                <div style={{ height: 6, background: "rgba(255,255,255,0.15)", borderRadius: 9999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, (filled / slots) * 100)}%`, background: isFull ? "#dc2626" : "linear-gradient(90deg, #10b981, #fbbf24)" }} />
                </div>
              </div>
            )}
            {reg ? (
              <div style={{ width: "100%", padding: "12px 16px", background: "rgba(16,185,129,0.2)", border: "1px solid #10b981", borderRadius: 10, color: "#10b981", fontSize: 12.5, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <Icon name="check-circle-2" size={15} color="#10b981" /> Inscripción confirmada
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                <button
                  onClick={onRegister}
                  disabled={isFull}
                  className="btn btn-primary"
                  style={{ flex: 1, opacity: isFull ? 0.5 : 1, cursor: isFull ? "not-allowed" : "pointer" }}
                >
                  <Icon name={isFull ? "lock" : "check"} size={13} />
                  {isFull ? "Cupos llenos" : "Inscribirme ahora"}
                </button>
                <button className="btn" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <Icon name="bookmark" size={13} color="#fff" />
                </button>
                <button className="btn" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}>
                  <Icon name="share-2" size={13} color="#fff" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-4">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 22 }}>
            <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", margin: 0, marginBottom: 10 }}>
              Sobre el evento<span className="dot">.</span>
            </h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "#1f2937", margin: 0 }}>
              {`${tag} de ${sportLabel(ev.sport).toLowerCase()} organizado en ${club}. ${formatLabel(ev.format)}. ${feeLabel(ev.entryFeeCents) === "Gratis" ? "Inscripción gratuita." : `Inscripción ${feeLabel(ev.entryFeeCents)} por jugador.`} Premios para top 3 y kit oficial MATCHPOINT para todos los inscritos.`}
            </p>
            <div className="mp-event-detail-kv-grid" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed var(--border)" }}>
              <DetailKV label="Formato" value={formatLabel(ev.format)} />
              <DetailKV label="Estado" value={ev.status === "live" ? "En curso" : ev.status === "finished" ? "Finalizado" : "Inscripción abierta"} />
              <DetailKV label="Categoría" value={`${tag} · ${sportLabel(ev.sport)}`} />
            </div>
          </div>

          <div className="card" style={{ padding: 22 }}>
            <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", margin: 0, marginBottom: 14 }}>
              Cronograma<span className="dot">.</span>
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {schedule.map((day) => (
                <div key={day.d}>
                  <div className="label-mp" style={{ marginBottom: 8 }}>{day.d}</div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {day.items.map((it, ii) => (
                      <div key={it.t} style={{ display: "flex", gap: 14, padding: "9px 0", borderTop: ii ? "1px solid var(--border)" : "none" }}>
                        <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em", color: "var(--primary)", minWidth: 56 }}>{it.t}</div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{it.e}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 12, fontStyle: "italic" }}>
              * Cronograma genérico. Los horarios definitivos se publican 48h antes.
            </p>
          </div>

          <div className="card" style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", margin: 0 }}>
                Inscritos<span className="dot">.</span>
              </h2>
              <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                {filled} {slots > 0 ? `de ${slots}` : ""}
              </span>
            </div>
            {filled === 0 ? (
              <div style={{ padding: "20px 12px", background: "var(--muted)", borderRadius: 10, textAlign: "center", fontSize: 12, color: "var(--muted-fg)" }}>
                Sé el primero en inscribirte.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {Array.from({ length: Math.min(filled, 8) }).map((_, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>
                      <span className="font-heading" style={{ fontSize: 9.5, fontWeight: 900 }}>{String.fromCharCode(65 + i)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>Inscrito #{i + 1}</div>
                      <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>Confirmado</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {filled > 8 && (
              <p style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 10, textAlign: "center" }}>
                +{filled - 8} más
              </p>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 22 }}>
            <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", margin: 0, marginBottom: 14 }}>
              Premios<span className="dot">.</span>
            </h2>
            {prizes.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {prizes.map((p, i) => (
                  <div
                    key={p.p}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: 14,
                      borderRadius: 10,
                      background: i === 0 ? "linear-gradient(135deg, #fef3c7, #fde68a)" : "var(--muted)",
                      border: i === 0 ? "1px solid #fbbf24" : "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: i === 0 ? "#fbbf24" : i === 1 ? "#9ca3af" : "#d97706",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: i === 0 ? "#0a0a0a" : "#fff",
                        flexShrink: 0,
                      }}
                    >
                      <span className="font-heading" style={{ fontSize: 18, fontWeight: 900 }}>{p.p}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", color: i === 0 ? "#92400e" : "#0a0a0a" }}>
                        {p.amt}
                      </div>
                      <div style={{ fontSize: 11, color: i === 0 ? "#78350f" : "var(--muted-fg)" }}>{p.extra}</div>
                    </div>
                    {i === 0 && <Icon name="trophy" size={18} color="#92400e" />}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--muted-fg)", margin: 0 }}>Premios por anunciar.</p>
            )}
          </div>

          <div className="card" style={{ padding: 22 }}>
            <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", margin: 0, marginBottom: 12 }}>
              Reglas clave<span className="dot">.</span>
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { i: "check-circle-2", t: "Acreditación 30 min antes de tu primer partido" },
                { i: "check-circle-2", t: "Llegar con vestimenta deportiva y zapatillas adecuadas" },
                { i: "alert-triangle", t: "WO automático si no se presenta el equipo a la hora" },
                { i: "alert-triangle", t: "Sin reembolsos a partir de 48h antes del evento" },
              ].map((r) => (
                <div key={r.t} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.4 }}>
                  <span style={{ flexShrink: 0, marginTop: 2 }}>
                    <Icon name={r.i} size={13} color={r.i === "alert-triangle" ? "#d97706" : "var(--primary)"} />
                  </span>
                  <span>{r.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailKV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 800, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
