// RetarModal — reto rápido en 2 pasos (reglas → cuándo y dónde).
// Evento `mp-open-retar`: detail opcional { id?, name, level?, sport?, city?, av?, avBg? }.
"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import Link from "next/link";
import {
  createMatch,
  getMatchConversationId,
  getRetarHeroContext,
  getRetarScheduleOptions,
  type RetarScheduleClubOption,
} from "@/server/actions/matches";
import { listCourtsByClub } from "@/server/actions/courts";
import { listReservations } from "@/server/actions/reservations";
import { getCurrentPlan } from "@/server/actions/player-subscriptions";
import {
  buildStartSlots,
  computeTakenSlots,
  dayRangeIso,
  type ExistingReservation,
} from "@/lib/booking/court-slots";
import { PlayerPicker, type Player } from "@/components/dashboard/widgets/PlayerPicker";
import type { Court } from "@/lib/schemas/courts";
import type { RetarHeroWho } from "@/lib/match/retar-hero-present";

type Rival = {
  id?: string;
  name: string;
  level: number;
  sport?: string;
  city?: string;
  av?: string;
  avBg: string;
};

type Form = {
  mode: "singles" | "dobles";
  bestOf: 1 | 3 | 5;
  ranked: boolean;
  dateIso: string;
  time: string;
  clubId: string | null;
  clubName: string;
  courtId: string | null;
  courtLabel: string;
  msg: string;
};

type DayChip = { iso: string; dow: string; sub: string };

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildNextDays(count: number): DayChip[] {
  const subFmt = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short" });
  const out: DayChip[] = [];
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = todayIsoFromDate(d);
    const dow = i === 0 ? "HOY" : i === 1 ? "MAÑ" : weekdayShort(d);
    out.push({ iso, dow, sub: subFmt.format(d) });
  }
  return out;
}

function todayIsoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekdayShort(d: Date): string {
  const w = d.getDay();
  return ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"][w] ?? "DÍA";
}

function dateTimeToIso(dateIso: string, time: string): string {
  const [h, m] = time.split(":").map((n) => parseInt(n, 10));
  const [y, mo, da] = dateIso.split("-").map((n) => parseInt(n, 10));
  return new Date(y, mo - 1, da, h, m, 0, 0).toISOString();
}

function formatWhenLabel(dateIso: string, time: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  const day = new Intl.DateTimeFormat("es-EC", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d);
  return `${day} · ${time}`;
}

function sportFromRivalLabel(s?: string): "pickleball" | "padel" | "tennis" {
  if (!s) return "pickleball";
  const n = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (n.includes("pickle")) return "pickleball";
  if (n.includes("padel")) return "padel";
  if (n.includes("tenis") || n.includes("tennis")) return "tennis";
  return "pickleball";
}

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const INITIAL_FORM: Form = {
  mode: "singles",
  bestOf: 3,
  ranked: false,
  dateIso: todayIso(),
  time: "19:00",
  clubId: null,
  clubName: "",
  courtId: null,
  courtLabel: "",
  msg: "",
};

type HeroWho = RetarHeroWho;
type HeroH2h = { you: number; rival: number; total: number; streak: string | null };

const FALLBACK_H2H: HeroH2h = { you: 0, rival: 0, total: 0, streak: null };

function defaultYou(initialYou: RetarHeroWho | null | undefined): HeroWho {
  return (
    initialYou ?? {
      name: "",
      level: 2.5,
      av: "?",
      avBg: "linear-gradient(135deg,#10b981,#047857)",
    }
  );
}

function heroPlayerToWho(p: {
  name: string;
  level: number;
  av: string;
  avBg: string;
}): HeroWho {
  return { name: p.name, level: p.level, av: p.av, avBg: p.avBg };
}

export function RetarModal({
  currentUserId,
  initialYou = null,
}: {
  currentUserId: string | null;
  initialYou?: RetarHeroWho | null;
}) {
  const [open, setOpen] = useState(false);
  const [rival, setRival] = useState<Rival | null>(null);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState<Form>(INITIAL_FORM);
  // Oponente real (UUID). Si llega `id` en el evento, lo prefillamos como Player.
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [yourPartner, setYourPartner] = useState<Player | null>(null);
  const [rivalPartner, setRivalPartner] = useState<Player | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [you, setYou] = useState<HeroWho>(() => defaultYou(initialYou));
  const [h2h, setH2h] = useState<HeroH2h>(FALLBACK_H2H);
  const [canRank, setCanRank] = useState(false);
  const [clubs, setClubs] = useState<RetarScheduleClubOption[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [pickingClub, setPickingClub] = useState(false);
  const [createdConvId, setCreatedConvId] = useState<string | null>(null);
  const [existingReservations, setExistingReservations] = useState<ExistingReservation[]>([]);
  const [availLoading, setAvailLoading] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const dayChips = buildNextDays(7);
  const timeSlots = buildStartSlots(60);
  const takenSlots = computeTakenSlots(
    form.dateIso,
    timeSlots,
    60,
    existingReservations,
  );

  const opponentIdForHero = rival?.id ?? opponent?.id;

  useEffect(() => {
    if (!open) {
      setCanRank(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await getCurrentPlan();
      if (cancelled) return;
      setCanRank(res.ok && res.data.tier === "premium" && res.data.active);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (initialYou) setYou(initialYou);
  }, [initialYou]);

  // Precarga perfil + H2H al montar (no esperar a abrir el modal).
  useEffect(() => {
    if (!currentUserId) {
      setYou(defaultYou(null));
      setH2h(FALLBACK_H2H);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await getRetarHeroContext({
        opponentId: opponentIdForHero ?? undefined,
      });
      if (cancelled || !res.ok) return;
      setYou(heroPlayerToWho(res.data.me));
      setH2h({
        you: res.data.h2h.youWins,
        rival: res.data.h2h.rivalWins,
        total: res.data.h2h.total,
        streak: res.data.h2h.streak,
      });
      if (res.data.opponent) {
        const o = res.data.opponent;
        setRival((prev) =>
          prev
            ? {
                ...prev,
                name: o.name,
                level: o.level,
                av: o.av,
                avBg: o.avBg,
              }
            : prev,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, opponentIdForHero]);

  useEffect(() => {
    if (!open || !currentUserId || !rival) {
      setClubs([]);
      setCourts([]);
      setPickingClub(false);
      return;
    }
    let cancelled = false;
    setScheduleLoading(true);
    void (async () => {
      const res = await getRetarScheduleOptions({
        sport: sportFromRivalLabel(rival?.sport),
      });
      if (cancelled) return;
      setScheduleLoading(false);
      if (!res.ok) return;
      setClubs(res.data.clubs);
      setForm((f) => {
        if (f.clubId) return f;
        const first = res.data.clubs[0];
        if (!first) return { ...f, clubId: null, clubName: "" };
        return { ...f, clubId: first.id, clubName: first.name };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentUserId, rival?.sport]);

  useEffect(() => {
    if (!form.clubId) {
      setCourts([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await listCourtsByClub({ clubId: form.clubId! });
      if (cancelled || !res.ok) return;
      setCourts(res.data);
      setForm((f) => {
        if (f.courtId) return f;
        const first = res.data[0];
        if (!first) return { ...f, courtId: null, courtLabel: "" };
        const label = first.name?.trim() || `Cancha ${first.code}`;
        return { ...f, courtId: first.id, courtLabel: label };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [form.clubId]);

  useEffect(() => {
    if (!form.clubId || !form.courtId) {
      setExistingReservations([]);
      return;
    }
    let cancelled = false;
    setAvailLoading(true);
    const { from, to } = dayRangeIso(form.dateIso);
    void (async () => {
      const res = await listReservations({
        clubId: form.clubId!,
        courtId: form.courtId!,
        from,
        to,
        pageSize: 100,
      });
      if (cancelled) return;
      setAvailLoading(false);
      if (!res.ok) {
        setExistingReservations([]);
        return;
      }
      setExistingReservations(
        res.data.map((r) => ({
          id: r.id,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          status: r.status,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [form.clubId, form.courtId, form.dateIso]);

  useEffect(() => {
    if (takenSlots.has(form.time)) {
      const free = timeSlots.find((s) => !takenSlots.has(s));
      if (free) setForm((f) => ({ ...f, time: free }));
    }
  }, [takenSlots, form.time, timeSlots]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Partial<Rival>>).detail;
      const name = detail?.name?.trim() || "Rival";
      const r: Rival = {
        id: detail?.id,
        name,
        level: detail?.level ?? 2.5,
        sport: detail?.sport,
        city: detail?.city,
        av: detail?.av ?? initialsFromDisplayName(name),
        avBg: detail?.avBg || "linear-gradient(135deg,#ca8a04,#facc15)",
      };
      setRival(r);
      setOpponent(
        r.id
          ? {
              id: r.id,
              username: r.name.toLowerCase().replace(/\s+/g, ""),
              displayName: r.name,
            }
          : null,
      );
      setYourPartner(null);
      setRivalPartner(null);
      setOpen(true);
      setStep(0);
      setDone(false);
      setCreatedConvId(null);
      setPickingClub(false);
      setForm({ ...INITIAL_FORM, dateIso: todayIso() });
    };
    window.addEventListener("mp-open-retar", handler);
    return () => window.removeEventListener("mp-open-retar", handler);
  }, []);

  if (!open || !rival) return null;
  const close = () => setOpen(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const isDoubles = form.mode === "dobles";
  const scheduleLine = formatWhenLabel(form.dateIso, form.time);
  const venueLine =
    form.clubName +
    (form.courtLabel ? ` · ${form.courtLabel}` : "");

  const selectClub = (club: RetarScheduleClubOption) => {
    setForm((f) => ({
      ...f,
      clubId: club.id,
      clubName: club.name,
      courtId: null,
      courtLabel: "",
    }));
    setPickingClub(false);
  };
  const canSend =
    !!currentUserId &&
    !!opponent &&
    (!isDoubles || (!!yourPartner && !!rivalPartner));

  const sendChallenge = () => {
    if (!currentUserId) {
      toast({ icon: "alert-triangle", title: "Inicia sesión para retar" });
      return;
    }
    if (!opponent) {
      toast({ icon: "alert-triangle", title: "Elige un oponente" });
      return;
    }
    if (isDoubles && (!yourPartner || !rivalPartner)) {
      toast({
        icon: "alert-triangle",
        title: "Faltan partners",
        sub: "En dobles necesitas elegir tu partner y el del rival para armar el 2v2.",
      });
      return;
    }
    if (!form.clubId || !form.courtId) {
      toast({
        icon: "alert-triangle",
        title: "Elige club y cancha",
        sub: "Necesitamos un lugar para bloquear el horario en reservas.",
      });
      return;
    }
    if (takenSlots.has(form.time)) {
      toast({
        icon: "alert-triangle",
        title: "Horario ocupado",
        sub: "Ese slot ya está reservado. Elige otra hora.",
      });
      return;
    }
    startSubmit(async () => {
      const playedAt = dateTimeToIso(form.dateIso, form.time);
      const res = await createMatch({
        sport: sportFromRivalLabel(rival.sport),
        mode: isDoubles ? "doubles" : "singles",
        clubId: form.clubId,
        courtId: form.courtId,
        playedAt,
        durationMin: 60,
        teamAPlayerIds: isDoubles
          ? [currentUserId, yourPartner!.id]
          : [currentUserId],
        teamBPlayerIds: isDoubles
          ? [opponent.id, rivalPartner!.id]
          : [opponent.id],
        isRanked: form.ranked,
        plannedBestOf: form.bestOf,
        challengeMessage: form.msg.trim() || undefined,
      });
      if (!res.ok) {
        toast({
          icon: "alert-triangle",
          title: "No se pudo enviar el reto",
          sub: res.error.message,
        });
        return;
      }
      const convRes = await getMatchConversationId({ matchId: res.data.id });
      setCreatedConvId(convRes.ok ? convRes.data.conversationId : null);
      toast({ icon: "check-circle-2", title: "Reto enviado" });
      setDone(true);
      router.refresh();
    });
  };

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
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "92vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#fff",
          boxShadow: "0 32px 64px rgba(0,0,0,0.5)",
        }}
      >
        <RTHero you={you} h2h={h2h} rival={rival} done={done} onClose={close} />

        {!done && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 24px 12px",
              borderBottom: "1px solid var(--border)",
              background: "#fff",
            }}
          >
            {["Reglas", "Cuándo & dónde"].map((s, i) => {
              const dn = i < step;
              const cur = i === step;
              return (
                <div key={s} style={{ display: "contents" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      opacity: dn || cur ? 1 : 0.45,
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: dn ? "var(--primary)" : cur ? "#0a0a0a" : "#fff",
                        border: dn || cur ? "0" : "1px solid var(--border)",
                        color: dn || cur ? "#fff" : "#0a0a0a",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 900,
                        fontFamily: "Plus Jakarta Sans",
                      }}
                    >
                      {dn ? "✓" : i + 1}
                    </div>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: cur ? 900 : 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        color: cur ? "#0a0a0a" : "var(--muted-fg)",
                      }}
                    >
                      {s}
                    </div>
                  </div>
                  {i < 1 && (
                    <div
                      style={{
                        flex: 1,
                        height: 1,
                        background: i < step ? "var(--primary)" : "var(--border)",
                        margin: "0 12px",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: "14px 22px 22px" }}>
          {done ? (
            <RTDone
              you={you}
              rival={rival}
              form={form}
              scheduleLine={scheduleLine}
              venueLine={venueLine}
              conversationId={createdConvId}
              onClose={close}
            />
          ) : step === 0 ? (
            <RTStep1
              form={form}
              set={set}
              rival={rival}
              currentUserId={currentUserId}
              opponent={opponent}
              setOpponent={setOpponent}
              yourPartner={yourPartner}
              setYourPartner={setYourPartner}
              rivalPartner={rivalPartner}
              setRivalPartner={setRivalPartner}
              canRank={canRank}
            />
          ) : (
            <RTStep2
              form={form}
              set={set}
              rival={rival}
              dayChips={dayChips}
              clubs={clubs}
              courts={courts}
              scheduleLoading={scheduleLoading}
              availLoading={availLoading}
              timeSlots={timeSlots}
              takenSlots={takenSlots}
              pickingClub={pickingClub}
              onTogglePickClub={() => setPickingClub((v) => !v)}
              onSelectClub={selectClub}
            />
          )}
        </div>

        {!done && (
          <div
            style={{
              padding: "12px 24px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#0a0a0a",
              color: "#fff",
            }}
          >
            <button
              onClick={() => (step === 0 ? close() : setStep(0))}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 9999,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="arrow-left" size={12} color="#fff" />
              {step === 0 ? "Cancelar" : "Atrás"}
            </button>
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.6)",
                textTransform: "uppercase",
                letterSpacing: "0.14em",
              }}
            >
              {step === 0 ? "1 · Reglas del duelo" : "2 · Acuerda cuándo"}
            </div>
            <button
              onClick={() => {
                if (step === 1) {
                  sendChallenge();
                  return;
                }
                setStep(1);
              }}
              disabled={step === 1 ? submitting || !canSend : false}
              className="btn btn-primary"
              style={{
                padding: "9px 18px",
                opacity: step === 1 && !canSend ? 0.55 : 1,
                cursor: step === 1 && (!canSend || submitting) ? "not-allowed" : "pointer",
              }}
              title={
                step === 1 && !canSend
                  ? !currentUserId
                    ? "Inicia sesión para retar"
                    : "Elige un oponente"
                  : undefined
              }
            >
              {step === 1 ? (
                <>
                  <Icon name="swords" size={13} color="#fff" />
                  {submitting ? "Enviando…" : "Enviar reto"}
                </>
              ) : (
                <>
                  Siguiente
                  <Icon name="arrow-right" size={13} color="#fff" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RTHero({
  you,
  h2h,
  rival,
  done,
  onClose,
}: {
  you: HeroWho;
  h2h: HeroH2h;
  rival: Rival;
  done: boolean;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "relative",
        padding: "20px 48px 28px 24px",
        minHeight: 168,
        background: done
          ? "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 100%)"
          : "linear-gradient(135deg, #0a0a0a 0%, #1f1f23 60%, #7c2d12 100%)",
        color: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          fontFamily: "Plus Jakarta Sans",
          fontWeight: 900,
          fontSize: 200,
          color: "rgba(255,255,255,0.05)",
          letterSpacing: "-0.06em",
          lineHeight: 0.8,
          pointerEvents: "none",
        }}
      >
        VS
      </div>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          zIndex: 2,
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.2)",
          color: "#fff",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="x" size={13} color="#fff" />
      </button>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
          alignItems: "start",
          marginTop: 8,
          gap: 12,
          position: "relative",
        }}
      >
        <AvatarBlock who={you} side="you" />
        <div style={{ textAlign: "center", padding: "8px 4px 0", justifySelf: "center", alignSelf: "center" }}>
          <div
            className="font-heading"
            style={{
              fontSize: 38,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 0.9,
              color: "#fff",
            }}
          >
            <span style={{ color: "var(--primary)" }}>{h2h.you}</span>
            <span style={{ color: "rgba(255,255,255,0.4)", margin: "0 6px", fontSize: 22 }}>
              —
            </span>
            <span style={{ color: "#fbbf24" }}>{h2h.rival}</span>
          </div>
          <div
            style={{
              fontSize: 8.5,
              fontWeight: 900,
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            Cara a cara · {h2h.total}
          </div>
          {h2h.total === 0 ? (
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.45)",
                fontWeight: 700,
                marginTop: 4,
              }}
            >
              Aún no se han enfrentado
            </div>
          ) : h2h.streak ? (
            <div style={{ fontSize: 9, color: "var(--primary)", fontWeight: 800, marginTop: 4 }}>
              ● {h2h.streak}
            </div>
          ) : null}
        </div>
        <AvatarBlock who={rival} side="rival" />
      </div>
    </div>
  );
}

function AvatarBlock({
  who,
  side,
}: {
  who: { name: string; level: number; av?: string; avBg: string };
  side: "you" | "rival";
}) {
  const isYou = side === "you";
  const av = who.av || who.name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  return (
    <div
      style={{
        minWidth: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: isYou ? "flex-start" : "flex-end",
        gap: 8,
        justifySelf: isYou ? "start" : "end",
      }}
    >
      <div style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: who.avBg,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "3px solid #fff",
            boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          }}
        >
          <span
            className="font-heading"
            style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em" }}
          >
            {av}
          </span>
        </div>
        <span
          style={{
            position: "absolute",
            top: -4,
            [isYou ? "left" : "right"]: 0,
            padding: "2px 6px",
            borderRadius: 4,
            background: isYou ? "var(--primary)" : "#fbbf24",
            color: isYou ? "#fff" : "#0a0a0a",
            fontSize: 8,
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          {isYou ? "TÚ" : "RIVAL"}
        </span>
      </div>
      <div style={{ textAlign: isYou ? "left" : "right", maxWidth: "100%" }}>
        {who.name ? (
          <div style={{ fontSize: 11.5, fontWeight: 800, lineHeight: 1.2, wordBreak: "break-word" }}>
            {who.name}
          </div>
        ) : (
          <div
            aria-hidden
            style={{
              width: 88,
              height: 12,
              borderRadius: 4,
              background: "rgba(255,255,255,0.14)",
            }}
          />
        )}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 7px",
            background: "rgba(255,255,255,0.12)",
            borderRadius: 9999,
            fontSize: 9.5,
            fontWeight: 800,
            marginTop: 4,
          }}
        >
          <Icon name="zap" size={9} color="#fbbf24" />
          Nivel {who.level}
        </div>
      </div>
    </div>
  );
}

function RTStep1({
  form,
  set,
  rival,
  currentUserId,
  opponent,
  setOpponent,
  yourPartner,
  setYourPartner,
  rivalPartner,
  setRivalPartner,
  canRank,
}: {
  form: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  rival: Rival;
  currentUserId: string | null;
  opponent: Player | null;
  setOpponent: (p: Player | null) => void;
  yourPartner: Player | null;
  setYourPartner: (p: Player | null) => void;
  rivalPartner: Player | null;
  setRivalPartner: (p: Player | null) => void;
  canRank: boolean;
}) {
  const opponentId = opponent?.id ?? rival.id;
  const partnerExclude = [currentUserId, opponentId].filter((id): id is string => !!id);
  const rivalPartnerExclude = [
    currentUserId,
    opponentId,
    yourPartner?.id,
  ].filter((id): id is string => !!id);

  const pickPartner = (arr: Player[], setter: (p: Player | null) => void) => {
    setter(arr[0] ?? null);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Selector de oponente real. Si el evento ya trajo `rival.id`, lo
          mostramos como chip fijo; si no, abrimos el PlayerPicker para elegir. */}
      {!rival.id && (
        <>
          <div className="label-mp">Oponente</div>
          {currentUserId == null ? (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                border: "1px dashed var(--border)",
                background: "#fafafa",
                fontSize: 12,
                color: "var(--muted-fg)",
              }}
            >
              Inicia sesión para enviar un reto.
            </div>
          ) : (
            <PlayerPicker
              label="A quién retas"
              max={1}
              selected={opponent ? [opponent] : []}
              onChange={(arr) => setOpponent(arr[0] ?? null)}
              excludeIds={[currentUserId]}
            />
          )}
        </>
      )}

      <div className="label-mp">Modalidad</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { k: "singles" as const, l: "Singles", s: "1v1 · tú vs " + rival.name.split(" ")[0], i: "user" },
          { k: "dobles" as const, l: "Dobles", s: "2v2 · eliges tu partner", i: "users" },
        ].map((o) => {
          const on = form.mode === o.k;
          return (
            <button
              key={o.k}
              onClick={() => {
                set("mode", o.k);
                if (o.k === "singles") {
                  setYourPartner(null);
                  setRivalPartner(null);
                }
              }}
              style={{
                padding: 11,
                borderRadius: 10,
                border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: on ? "#ecfdf5" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: on ? "var(--primary)" : "var(--muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={o.i} size={14} color={on ? "#fff" : "#0a0a0a"} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900 }}>{o.l}</div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>{o.s}</div>
              </div>
            </button>
          );
        })}
      </div>

      {form.mode === "dobles" && (
        <div
          style={{
            padding: 12,
            background: "var(--muted)",
            borderRadius: 10,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <div>
            {currentUserId == null ? (
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>Inicia sesión para elegir partners.</div>
            ) : (
              <PlayerPicker
                label="Tu partner"
                max={1}
                selected={yourPartner ? [yourPartner] : []}
                onChange={(arr) => pickPartner(arr, setYourPartner)}
                excludeIds={partnerExclude}
              />
            )}
          </div>
          <div>
            {currentUserId == null ? (
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>Inicia sesión para elegir partners.</div>
            ) : (
              <PlayerPicker
                label="Partner del rival"
                max={1}
                selected={rivalPartner ? [rivalPartner] : []}
                onChange={(arr) => pickPartner(arr, setRivalPartner)}
                excludeIds={rivalPartnerExclude}
              />
            )}
          </div>
        </div>
      )}

      <div className="label-mp" style={{ marginTop: 4 }}>
        Formato
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[
          { b: 1 as const, l: "Set único" },
          { b: 3 as const, l: "Mejor de 3" },
          { b: 5 as const, l: "Mejor de 5" },
        ].map((o) => {
          const on = form.bestOf === o.b;
          return (
            <button
              key={o.b}
              onClick={() => set("bestOf", o.b)}
              style={{
                flex: 1,
                padding: "9px 6px",
                borderRadius: 8,
                border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: on ? "#ecfdf5" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div
                className="font-heading"
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  color: on ? "var(--primary)" : "#0a0a0a",
                }}
              >
                {o.b === 1 ? "1" : "BO" + o.b}
              </div>
              <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 1 }}>{o.l}</div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => {
          if (!canRank) return;
          set("ranked", !form.ranked);
        }}
        style={{
          padding: 12,
          borderRadius: 10,
          border: form.ranked && canRank ? "2px solid var(--primary)" : "1px solid var(--border)",
          background: form.ranked && canRank ? "#ecfdf5" : "#fff",
          cursor: canRank ? "pointer" : "not-allowed",
          fontFamily: "inherit",
          textAlign: "left",
          display: "flex",
          gap: 11,
          alignItems: "center",
          opacity: canRank ? 1 : 0.92,
        }}
      >
        <div
          style={{
            width: 32,
            height: 18,
            borderRadius: 9999,
            background: form.ranked && canRank ? "var(--primary)" : "#d4d4d8",
            position: "relative",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 2,
              left: form.ranked && canRank ? 16 : 2,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              transition: "left 0.2s",
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900 }}>Cuenta para el ranking</div>
          <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.35 }}>
            {canRank ? (
              "Actívalo si quieres que el resultado mueva tu MP Rating."
            ) : (
              <>
                Solo con{" "}
                <Link
                  href="/dashboard/user/mi-plan"
                  style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "underline" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  MATCHPOINT+
                </Link>
                .
              </>
            )}
          </div>
        </div>
        {form.ranked && canRank && (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 9999,
              background: "var(--primary)",
              color: "#fff",
              fontSize: 8.5,
              fontWeight: 900,
              letterSpacing: "0.14em",
              flexShrink: 0,
            }}
          >
            RANKED
          </span>
        )}
      </button>
    </div>
  );
}

function RTStep2({
  form,
  set,
  rival,
  dayChips,
  clubs,
  courts,
  scheduleLoading,
  availLoading,
  timeSlots,
  takenSlots,
  pickingClub,
  onTogglePickClub,
  onSelectClub,
}: {
  form: Form;
  set: <K extends keyof Form>(k: K, v: Form[K]) => void;
  rival: Rival;
  dayChips: DayChip[];
  clubs: RetarScheduleClubOption[];
  courts: Court[];
  scheduleLoading: boolean;
  availLoading: boolean;
  timeSlots: string[];
  takenSlots: Set<string>;
  pickingClub: boolean;
  onTogglePickClub: () => void;
  onSelectClub: (club: RetarScheduleClubOption) => void;
}) {
  const selectedClub = clubs.find((c) => c.id === form.clubId);
  const clubSub = selectedClub
    ? `${selectedClub.city}${rival.city && rival.city !== selectedClub.city ? ` · cerca de ${rival.name.split(" ")[0]}` : ""}`
    : scheduleLoading
      ? "Cargando clubes…"
      : "Elige un club para el duelo";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="label-mp">¿Cuándo?</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {dayChips.map((d) => {
          const on = form.dateIso === d.iso;
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => set("dateIso", d.iso)}
              style={{
                flex: "1 1 72px",
                minWidth: 72,
                padding: "10px 4px",
                borderRadius: 8,
                border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: on ? "#ecfdf5" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  color: "var(--muted-fg)",
                  letterSpacing: "0.1em",
                }}
              >
                {d.dow}
              </div>
              <div
                className="font-heading"
                style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.02em" }}
              >
                {d.sub}
              </div>
            </button>
          );
        })}
      </div>

      <div className="label-mp" style={{ marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Hora</span>
        {availLoading && form.clubId && form.courtId ? (
          <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700 }}>Actualizando…</span>
        ) : null}
      </div>
      <div className="mp-table-scroll">
      <div style={{ minWidth: 170, display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 5 }}>
        {timeSlots.map((t) => {
          const on = form.time === t;
          const busy = takenSlots.has(t);
          return (
            <button
              key={t}
              type="button"
              disabled={busy}
              onClick={() => !busy && set("time", t)}
              style={{
                padding: "9px 4px",
                borderRadius: 8,
                border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: busy ? "#f4f4f5" : on ? "var(--primary)" : "#ecfdf5",
                color: busy ? "#a1a1aa" : on ? "#fff" : "#065f46",
                cursor: busy ? "not-allowed" : "pointer",
                fontSize: 11,
                fontWeight: 900,
                fontFamily: "inherit",
                opacity: busy ? 0.65 : 1,
              }}
            >
              {t}
            </button>
          );
        })}
      </div>
      </div>
      {form.clubId && form.courtId && !availLoading && timeSlots.every((t) => takenSlots.has(t)) ? (
        <div style={{ fontSize: 11, color: "#b45309", fontWeight: 700, marginTop: 4 }}>
          No hay horarios libres este día. Prueba otro día o cancha.
        </div>
      ) : null}

      <div className="label-mp" style={{ marginTop: 4 }}>
        Club y cancha
      </div>
      {pickingClub && clubs.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            maxHeight: 160,
            overflow: "auto",
            padding: 8,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "#fafafa",
          }}
        >
          {clubs.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectClub(c)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border:
                  form.clubId === c.id ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: form.clubId === c.id ? "#ecfdf5" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900 }}>{c.name}</div>
              <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>{c.city}</div>
            </button>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: 10,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "#fff",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg,#10b981,#064e3b)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <Icon name="building-2" size={14} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>
              {form.clubName || "Sin club"}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{clubSub}</div>
          </div>
          <button
            type="button"
            onClick={onTogglePickClub}
            disabled={clubs.length === 0}
            style={{
              padding: "6px 11px",
              background: "var(--muted)",
              border: 0,
              borderRadius: 9999,
              fontSize: 10,
              fontWeight: 800,
              fontFamily: "inherit",
              cursor: clubs.length === 0 ? "not-allowed" : "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              opacity: clubs.length === 0 ? 0.5 : 1,
            }}
          >
            {clubs.length === 0 ? "Sin clubes" : "Cambiar"}
          </button>
        </div>
      )}
      {courts.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {courts.map((court) => {
            const label = court.name?.trim() || `Cancha ${court.code}`;
            const on = form.courtId === court.id;
            return (
              <button
                key={court.id}
                type="button"
                onClick={() => {
                  set("courtId", court.id);
                  set("courtLabel", label);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: on ? "#ecfdf5" : "#fff",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="label-mp" style={{ marginTop: 4 }}>
        Mensaje · opcional
      </div>
      <div style={{ position: "relative" }}>
        <textarea
          value={form.msg}
          maxLength={180}
          onChange={(e) => set("msg", e.target.value)}
          placeholder={'"Vamos por la revancha del último set 🔥"'}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12.5,
            fontFamily: "inherit",
            background: "#fff",
            minHeight: 60,
            resize: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 8,
            right: 12,
            fontSize: 9.5,
            color: "var(--muted-fg)",
          }}
        >
          {form.msg.length}/180
        </div>
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {["Revancha 🔥", "Te aguanto", "Sin excusas", "Hagamos historia"].map((t) => (
          <button
            key={t}
            onClick={() => set("msg", (form.msg ? form.msg + " " : "") + t)}
            style={{
              padding: "4px 9px",
              borderRadius: 9999,
              background: "var(--muted)",
              border: 0,
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function RTDone({
  you,
  rival,
  form,
  scheduleLine,
  venueLine,
  conversationId,
  onClose,
}: {
  you: HeroWho;
  rival: Rival;
  form: Form;
  scheduleLine: string;
  venueLine: string;
  conversationId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <div>
      <div
        className="card"
        style={{
          padding: 16,
          marginBottom: 14,
          background: "#ecfdf5",
          border: "1px solid var(--primary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--primary)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="send-horizonal" size={17} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div
              className="font-heading"
              style={{
                fontSize: 16,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              ¡Reto enviado!<span style={{ color: "var(--primary)" }}>.</span>
            </div>
            <div style={{ fontSize: 11.5, color: "#065f46", marginTop: 3 }}>
              {rival.name} recibirá una notificación para aceptar el reto. El chat del duelo se abre cuando todos confirmen.
            </div>
          </div>
        </div>
      </div>

      <div className="label-mp" style={{ marginBottom: 8 }}>
        Resumen del duelo
      </div>
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        {[
          ["Modalidad", form.mode === "singles" ? "Singles · 1v1" : "Dobles · 2v2"],
          ["Formato", form.bestOf === 1 ? "Set único" : "Mejor de " + form.bestOf + " sets"],
          [
            "Ranking",
            form.ranked ? "Sí · cuenta para MP Rating" : "No · partido casual",
          ],
          ["Cuándo", scheduleLine],
          ["Lugar", venueLine || "Por confirmar"],
        ].map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "5px 0",
              fontSize: 11.5,
              borderTop: "1px dashed var(--border)",
            }}
          >
            <span style={{ color: "var(--muted-fg)" }}>{k}</span>
            <span style={{ fontWeight: 800 }}>{v}</span>
          </div>
        ))}
        {form.msg && (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: "#fafafa",
              borderRadius: 8,
              fontSize: 11.5,
              fontStyle: "italic",
              color: "#0a0a0a",
              borderLeft: "3px solid var(--primary)",
            }}
          >
            &quot;{form.msg}&quot;
          </div>
        )}
      </div>

      <div className="label-mp" style={{ marginBottom: 8 }}>
        Lo que ve {rival.name.split(" ")[0]}
      </div>
      <div style={{ padding: 14, background: "#0a0a0a", color: "#fff", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ color: "var(--primary)", fontSize: 12, fontWeight: 900 }}>●</span>
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 9.5,
                color: "rgba(255,255,255,0.5)",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
              }}
            >
              MATCHPOINT · ahora
            </div>
            <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.4 }}>
              <b>{you.name}</b> te retó a un duelo · {form.mode === "singles" ? "1v1" : "2v2"}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              {scheduleLine}
              {venueLine ? ` · ${venueLine}` : ""}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button
                style={{
                  padding: "6px 12px",
                  borderRadius: 9999,
                  background: "var(--primary)",
                  color: "#fff",
                  border: 0,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                  cursor: "default",
                  display: "inline-flex",
                  gap: 5,
                  alignItems: "center",
                }}
              >
                <Icon name="swords" size={11} color="#fff" />
                Aceptar reto
              </button>
              <button
                style={{
                  padding: "6px 12px",
                  borderRadius: 9999,
                  background: "transparent",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.25)",
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontFamily: "inherit",
                  cursor: "default",
                }}
              >
                Proponer otra hora
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          className="btn"
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            flex: 1,
            justifyContent: "center",
          }}
          onClick={onClose}
        >
          Cerrar
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1, justifyContent: "center", opacity: conversationId ? 1 : 0.65 }}
          disabled={!conversationId}
          onClick={() => {
            if (conversationId) {
              router.push(`/dashboard/user/chat?conv=${conversationId}`);
            }
            onClose();
          }}
        >
          <Icon name="message-circle" size={13} color="#fff" />
          Ir al chat del duelo
        </button>
      </div>
    </div>
  );
}
