// Client view de QuedadasScreen — recibe quedadas ya fetcheadas (Descubrir +
// Mis quedadas). Permite organizar (CrearQuedadaModal), unirse/salir, y al
// creador invitar / cargar resultados / cancelar. v1 = social, no toca ranking.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { PlayerPicker, type Player } from "../widgets/PlayerPicker";
import { CrearQuedadaModal } from "./CrearQuedadaModal";
import {
  joinQuedada,
  leaveQuedada,
  inviteToQuedada,
  cancelQuedada,
  setQuedadaResults,
  reportQuedada,
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
  const [tab, setTab] = useState<Tab>("descubrir");
  const [creating, setCreating] = useState(false);
  // Modales secundarios (invitar / resultados) por quedada.
  const [inviteFor, setInviteFor] = useState<QuedadaLite | null>(null);
  const [resultsFor, setResultsFor] = useState<QuedadaLite | null>(null);

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
          onClick={() => setCreating(true)}
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
            />
          ))}
        </div>
      )}

      {creating && <CrearQuedadaModal onClose={() => setCreating(false)} />}
      {inviteFor && (
        <InviteModal quedada={inviteFor} meUserId={meUserId} onClose={() => setInviteFor(null)} />
      )}
      {resultsFor && (
        <ResultsModal quedada={resultsFor} onClose={() => setResultsFor(null)} />
      )}
    </div>
  );
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
}: {
  q: QuedadaLite;
  meUserId: string | null;
  onInvite: () => void;
  onResults: () => void;
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
            <button
              className="btn"
              onClick={doLeave}
              disabled={pending}
              style={{ background: "#fff", border: "1px solid var(--border)", flex: 1, justifyContent: "center" }}
            >
              <Icon name="log-out" size={12} />
              Salir
            </button>
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
