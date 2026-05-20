// Client view de QuedadasScreen — recibe quedadas ya fetcheadas (Descubrir +
// Mis quedadas). Permite organizar (CrearQuedadaModal), unirse/salir, y al
// creador invitar / cargar resultados / cancelar. v1 = social, no toca ranking.
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { PlayerPicker, type Player } from "../widgets/PlayerPicker";
import { CrearQuedadaModal, type QuedadaInitial } from "./CrearQuedadaModal";
import { accountToBankDraft } from "./quedada-fields/BankAccountFields";
import { prizesToDrafts } from "./quedada-fields/PrizesEditor";
import { parseSuma } from "@/lib/quedadas/level";
import { SkeletonRows } from "@/components/ui/Skeleton";
import type { PaymentAccount, Prize } from "@/lib/schemas/quedadas";
import {
  joinQuedada,
  leaveQuedada,
  inviteToQuedada,
  cancelQuedada,
  setQuedadaResults,
  reportQuedada,
  getQuedadaManageData,
} from "@/server/actions/quedadas";

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
  locationText: string | null;
  maxPlayers: number | null;
  feeCents: number;
  perks: string | null;
  participantCount: number;
  iAmCreator: boolean;
  iAmJoined: boolean;
  iAmInvited: boolean;
};

type Tab = "descubrir" | "mias";

const FORMAT_LABEL: Record<string, string> = {
  americano: "Americano",
  mexicano: "Mexicano",
  round_robin: "Round Robin",
  kotc: "Rey de Cancha",
  canguil: "Canguil",
  libre: "Libre",
};

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

export function QuedadasScreenView({
  meUserId,
  discover,
  mine,
}: {
  meUserId: string | null;
  discover: QuedadaLite[];
  mine: QuedadaLite[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("descubrir");
  // null = wizard cerrado; {} = nueva; {initial} = duplicada/plantilla.
  const [wizard, setWizard] = useState<{ initial?: QuedadaInitial } | null>(null);
  // Modales secundarios (invitar / resultados) por quedada.
  const [inviteFor, setInviteFor] = useState<QuedadaLite | null>(null);
  const [resultsFor, setResultsFor] = useState<QuedadaLite | null>(null);
  // El calendario del participante es modal liviano; la gestión es una página.
  const [calendarFor, setCalendarFor] = useState<QuedadaLite | null>(null);

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

  const list = tab === "descubrir" ? discover : mine;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="label-mp">Comunidad · Juego social</div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <h1 className="font-heading display-md" style={{ margin: 0 }}>
          Quedadas <span className="dot">●</span> {discover.length + mine.length}
        </h1>
        <button
          className="btn btn-primary"
          onClick={() => setWizard({})}
          disabled={!meUserId}
          title={meUserId ? undefined : "Inicia sesión para crear una quedada"}
          style={{ opacity: meUserId ? 1 : 0.6 }}
        >
          <Icon name="plus" size={13} color="#fff" />
          Crear quedada
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "var(--muted)",
          borderRadius: 9999,
          alignSelf: "flex-start",
        }}
      >
        {([
          { k: "descubrir" as const, l: "Descubrir", n: discover.length },
          { k: "mias" as const, l: "Mis quedadas", n: mine.length },
        ]).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            style={{
              padding: "7px 16px",
              borderRadius: 9999,
              border: 0,
              background: tab === t.k ? "#fff" : "transparent",
              color: tab === t.k ? "#0a0a0a" : "var(--muted-fg)",
              fontWeight: tab === t.k ? 800 : 600,
              fontSize: 11.5,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: tab === t.k ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {t.l}
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 900,
                padding: "1px 6px",
                borderRadius: 9999,
                background: tab === t.k ? "#0a0a0a" : "transparent",
                color: tab === t.k ? "#fff" : "var(--muted-fg)",
                border: tab === t.k ? 0 : "1px solid var(--border)",
              }}
            >
              {t.n}
            </span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={tab === "descubrir" ? "party-popper" : "calendar-days"}
          title={
            tab === "descubrir"
              ? "No hay quedadas abiertas por ahora"
              : "Aún no tienes quedadas"
          }
          sub={
            tab === "descubrir"
              ? "Sé el primero en organizar una. Toca “Crear quedada”."
              : "Organiza una o únete a alguna desde Descubrir."
          }
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {list.map((q) => (
            <QuedadaCard
              key={q.id}
              q={q}
              meUserId={meUserId}
              onInvite={() => setInviteFor(q)}
              onResults={() => setResultsFor(q)}
              onManage={() => router.push(`/dashboard/user/quedada/${q.id}`)}
              onCalendar={() => setCalendarFor(q)}
              onDuplicate={() => doDuplicate(q.id)}
            />
          ))}
        </div>
      )}

      {wizard && <CrearQuedadaModal initial={wizard.initial} onClose={() => setWizard(null)} />}
      {inviteFor && (
        <InviteModal quedada={inviteFor} meUserId={meUserId} onClose={() => setInviteFor(null)} />
      )}
      {resultsFor && (
        <ResultsModal quedada={resultsFor} onClose={() => setResultsFor(null)} />
      )}
      {calendarFor && (
        <CalendarModal quedada={calendarFor} onClose={() => setCalendarFor(null)} />
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
      <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, marginTop: 12, color: "#0a0a0a" }}>
        {title}
        <span className="dot">.</span>
      </div>
      <p style={{ fontSize: 13, marginTop: 8, maxWidth: 360, margin: "8px auto 0" }}>{sub}</p>
    </div>
  );
}

function Chip({
  children,
  bg,
  color,
  border,
}: {
  children: React.ReactNode;
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
  onResults,
  onManage,
  onCalendar,
  onDuplicate,
}: {
  q: QuedadaLite;
  meUserId: string | null;
  onInvite: () => void;
  onResults: () => void;
  onManage: () => void;
  onCalendar: () => void;
  onDuplicate: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, ask } = usePromptModal();
  const [pending, startTransition] = useTransition();

  const cancelled = q.status === "cancelled";
  const finished = q.status === "finished";
  const cupo = q.maxPlayers != null ? `${q.participantCount}/${q.maxPlayers}` : `${q.participantCount}`;
  const full = q.maxPlayers != null && q.participantCount >= q.maxPlayers;

  const doJoin = () => {
    if (!meUserId) {
      toast({ icon: "alert-triangle", title: "Inicia sesión para unirte" });
      return;
    }
    startTransition(async () => {
      const res = await joinQuedada({ quedadaId: q.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo unir", sub: res.error.message });
        return;
      }
      if (res.data.transactionId) {
        router.push(`/pagos/${res.data.transactionId}`);
        return;
      }
      toast({ icon: "check-circle-2", title: "Te uniste a la quedada" });
      router.refresh();
    });
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
      className="card"
      style={{
        padding: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        opacity: cancelled ? 0.78 : 1,
      }}
    >
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {cancelled ? (
            <Chip bg="#fee2e2" color="#b91c1c">Cancelada</Chip>
          ) : finished ? (
            <Chip bg="var(--muted)" color="var(--muted-fg)">Finalizada</Chip>
          ) : q.visibility === "private" ? (
            <Chip bg="#1f2937" color="#fff">Privada</Chip>
          ) : (
            <Chip bg="#ecfdf5" color="#065f46">Abierta</Chip>
          )}
          <Chip bg="var(--muted)" color="var(--muted-fg)">
            {FORMAT_LABEL[q.format] ?? q.format}
          </Chip>
          <Chip bg="var(--muted)" color="var(--muted-fg)">
            {q.matchMode === "singles" ? "Singles" : "Dobles"}
          </Chip>
          {q.iAmCreator && <Chip bg="#fbbf24" color="#0a0a0a">Organizas</Chip>}
        </div>

        <div
          className="font-heading"
          style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.015em", lineHeight: 1.15 }}
        >
          {q.title}
        </div>

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

        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#1f2937" }}>
          <Row icon="calendar-days">{formatWhen(q.startsAt)}</Row>
          {q.locationText && <Row icon="map-pin">{q.locationText}</Row>}
          <Row icon="users">Cupo {cupo}{full && !cancelled ? " · lleno" : ""}</Row>
          <Row icon="ticket">{feeLabel(q.feeCents)}</Row>
          <Row icon="user-round">Organiza {q.creatorName}</Row>
        </div>

        {q.perks && (
          <div
            style={{
              fontSize: 11.5,
              color: "#065f46",
              background: "#ecfdf5",
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

      {/* Acciones */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          background: "#fafafa",
        }}
      >
        {!cancelled && !finished && !q.iAmCreator && (
          q.iAmJoined ? (
            <>
              <button
                className="btn"
                onClick={onCalendar}
                disabled={pending}
                style={{ background: "#fff", border: "1px solid var(--border)", flex: 1, justifyContent: "center" }}
              >
                <Icon name="calendar-days" size={12} />
                Tu calendario
              </button>
              <button
                className="btn"
                onClick={doLeave}
                disabled={pending}
                style={{ background: "#fff", border: "1px solid #fecaca", color: "#b91c1c", flex: 1, justifyContent: "center" }}
              >
                <Icon name="log-out" size={12} color="#b91c1c" />
                Salir
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              onClick={doJoin}
              disabled={pending || (full && !q.iAmInvited)}
              style={{ flex: 1, justifyContent: "center", opacity: full && !q.iAmInvited ? 0.6 : 1 }}
            >
              <Icon name="plus" size={12} color="#fff" />
              {full && !q.iAmInvited ? "Lleno" : q.feeCents > 0 ? "Unirme (con cuota)" : "Unirme"}
            </button>
          )
        )}

        {q.iAmCreator && !cancelled && (
          <>
            <button
              className="btn btn-primary"
              onClick={onManage}
              disabled={pending}
              style={{ flex: 1, justifyContent: "center" }}
            >
              <Icon name="settings" size={12} color="#fff" />
              Gestionar
            </button>
            <button
              className="btn"
              onClick={onInvite}
              disabled={pending}
              style={{ background: "#fff", border: "1px solid var(--border)", flex: 1, justifyContent: "center" }}
            >
              <Icon name="user-plus" size={12} />
              Invitar
            </button>
            <button
              className="btn"
              onClick={onResults}
              disabled={pending}
              style={{ background: "#fff", border: "1px solid var(--border)", flex: 1, justifyContent: "center" }}
            >
              <Icon name="clipboard-list" size={12} />
              Resultados
            </button>
            <button
              className="btn"
              onClick={doCancel}
              disabled={pending}
              style={{ background: "#fff", border: "1px solid #fecaca", color: "#b91c1c", flex: 1, justifyContent: "center" }}
            >
              <Icon name="x" size={12} color="#b91c1c" />
              Cancelar
            </button>
          </>
        )}

        {q.iAmCreator && (
          <button
            className="btn"
            onClick={onDuplicate}
            disabled={pending}
            title="Duplicar esta quedada"
            style={{ background: "#fff", border: "1px solid var(--border)", flex: cancelled || finished ? 1 : undefined, justifyContent: "center", padding: "8px 12px" }}
          >
            <Icon name="copy" size={12} />
            Duplicar
          </button>
        )}

        {!q.iAmCreator && (
          <button
            className="btn"
            onClick={doReport}
            disabled={pending}
            title="Reportar"
            aria-label="Reportar quedada"
            style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted-fg)", padding: "8px 10px" }}
          >
            <Icon name="flag" size={12} color="var(--muted-fg)" />
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ icon, children }: { icon: string; children: React.ReactNode }) {
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
        Invita jugadores a <b style={{ color: "#0a0a0a" }}>{quedada.title}</b>. Recibirán una notificación.
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

// ── Cargar resultados ─────────────────────────────────────────────────────────
function ResultsModal({ quedada, onClose }: { quedada: QuedadaLite; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [participants, setParticipants] = useState<Player[]>([]);
  const [byId, setById] = useState<Record<string, { points: string; finalRank: string }>>({});
  const [pending, startTransition] = useTransition();

  const updateRow = (id: string, field: "points" | "finalRank", value: string) => {
    setById((prev) => {
      const base = prev[id] ?? { points: "", finalRank: "" };
      return { ...prev, [id]: { ...base, [field]: value } };
    });
  };

  const save = () => {
    if (pending) return;
    if (participants.length === 0) {
      toast({ icon: "alert-triangle", title: "Agrega al menos un jugador" });
      return;
    }
    const results = participants.map((p) => {
      const v = byId[p.id] ?? { points: "", finalRank: "" };
      const points = v.points.trim() ? parseInt(v.points, 10) : null;
      const finalRank = v.finalRank.trim() ? parseInt(v.finalRank, 10) : null;
      return {
        userId: p.id,
        points: points != null && Number.isFinite(points) ? points : null,
        finalRank: finalRank != null && Number.isFinite(finalRank) ? finalRank : null,
      };
    });
    startTransition(async () => {
      const res = await setQuedadaResults({ quedadaId: quedada.id, results });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudieron guardar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Resultados guardados" });
      onClose();
      router.refresh();
    });
  };

  return (
    <ModalShell title="Cargar resultados" icon="clipboard-list" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: "var(--muted-fg)", margin: "0 0 14px", lineHeight: 1.5 }}>
        Resultados casuales de <b style={{ color: "#0a0a0a" }}>{quedada.title}</b>. No afectan tu ranking.
      </p>
      <PlayerPicker
        label="Participantes"
        max={64}
        selected={participants}
        onChange={setParticipants}
      />
      {participants.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="label-mp">Puntos y posición · opcional</div>
          {participants.map((p) => {
            const v = byId[p.id] ?? { points: "", finalRank: "" };
            return (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 80px",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.displayName}
                </div>
                <input
                  type="number"
                  min={0}
                  value={v.points}
                  onChange={(e) => updateRow(p.id, "points", e.target.value)}
                  placeholder="Pts"
                  style={miniInput}
                />
                <input
                  type="number"
                  min={1}
                  value={v.finalRank}
                  onChange={(e) => updateRow(p.id, "finalRank", e.target.value)}
                  placeholder="Pos"
                  style={miniInput}
                />
              </div>
            );
          })}
        </div>
      )}
      <ModalFooter
        onClose={onClose}
        pending={pending}
        confirmLabel="Guardar resultados"
        confirmIcon="check"
        onConfirm={save}
      />
    </ModalShell>
  );
}

// ── Calendario del participante (lectura) ─────────────────────────────────────
// Muestra, por cada categoría de la quedada, su hora + cancha y el slot/pareja
// del usuario si está asignado. v1.x = nivel categoría (no partido-por-partido).
type CalCategory = {
  id: string;
  name: string;
  level_label: string | null;
  starts_at: string | null;
  court_label: string | null;
};
type CalPair = { category_id: string; slot_no: number; player_a_id: string; player_b_id: string | null };
type CalParticipant = { user_id: string; profiles: { display_name: string | null; username: string | null } | null };
type CalData = {
  meUserId: string;
  categories: CalCategory[];
  pairs: CalPair[];
  participants: CalParticipant[];
};

function calHour(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function CalendarModal({ quedada, onClose }: { quedada: QuedadaLite; onClose: () => void }) {
  const [data, setData] = useState<CalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await getQuedadaManageData({ quedadaId: quedada.id });
      if (!active) return;
      if (!res.ok) {
        setError(res.error.message);
        setLoading(false);
        return;
      }
      setData(res.data as CalData);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [quedada.id]);

  const nameOf = (p: { display_name: string | null; username: string | null } | null): string =>
    p?.display_name || (p?.username ? `@${p.username}` : "Jugador");

  return (
    <ModalShell title="Tu calendario" icon="calendar-days" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: "var(--muted-fg)", margin: "0 0 14px", lineHeight: 1.5 }}>
        Tus categorías en <b style={{ color: "#0a0a0a" }}>{quedada.title}</b> con su hora y cancha.
      </p>

      {loading && (
        <SkeletonRows rows={3} height={56} />
      )}
      {!loading && error && (
        <div style={{ padding: 14, borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 12.5 }}>
          No se pudo cargar: {error}
        </div>
      )}
      {!loading && data && data.categories.length === 0 && (
        <div style={{ padding: 14, borderRadius: 8, background: "#fafafa", color: "var(--muted-fg)", fontSize: 12.5 }}>
          El organizador todavía no definió categorías.
        </div>
      )}

      {!loading && data && data.categories.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.categories.map((c) => {
            const mine = data.pairs.find(
              (p) =>
                p.category_id === c.id &&
                (p.player_a_id === data.meUserId || p.player_b_id === data.meUserId),
            );
            const partById = new Map(data.participants.map((p) => [p.user_id, p]));
            const partnerId =
              mine == null
                ? null
                : mine.player_a_id === data.meUserId
                  ? mine.player_b_id
                  : mine.player_a_id;
            const partnerName = partnerId ? nameOf(partById.get(partnerId)?.profiles ?? null) : null;

            return (
              <div
                key={c.id}
                className="card"
                style={{
                  padding: 12,
                  background: mine ? "#ecfdf5" : "#fff",
                  border: mine ? "1px solid var(--primary)" : "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <div className="font-heading" style={{ fontSize: 13.5, fontWeight: 900 }}>
                    {c.name}
                    {c.level_label ? <span style={{ color: "var(--muted-fg)", fontWeight: 600 }}> · {c.level_label}</span> : null}
                  </div>
                  {mine && (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 900,
                        padding: "2px 8px",
                        borderRadius: 9999,
                        background: "var(--primary)",
                        color: "#fff",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        flexShrink: 0,
                      }}
                    >
                      Slot {mine.slot_no}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 5, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {c.starts_at && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Icon name="clock" size={11} color="var(--muted-fg)" />
                      {calHour(c.starts_at)}
                    </span>
                  )}
                </div>
                {mine ? (
                  <div style={{ fontSize: 12, color: "#065f46", marginTop: 6, fontWeight: 700 }}>
                    {partnerName ? `Juegas con ${partnerName}` : "Estás inscrito en esta categoría"}
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 6 }}>
                    Aún no estás asignado en esta categoría.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button onClick={onClose} className="btn btn-primary">
          Listo
        </button>
      </div>
    </ModalShell>
  );
}

// ── Shells reutilizables para los modales secundarios ─────────────────────────
function ModalShell({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
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
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="card"
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "92vh",
          overflow: "auto",
          padding: 22,
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
            style={{ background: "transparent", border: 0, padding: 4, color: "var(--muted-fg)" }}
            aria-label="Cerrar"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
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

const miniInput: React.CSSProperties = {
  width: "100%",
  padding: "8px 8px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12.5,
  fontFamily: "inherit",
  outline: "none",
  textAlign: "center",
  background: "#fff",
  color: "#0a0a0a",
};
