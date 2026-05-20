// Panel de gestión del organizador de una Quedada (juego social).
//
// Se renderiza como PÁGINA (variant="page", default de la ruta
// /dashboard/[role]/quedada/[id]) o como modal (variant="modal"). En página no
// recibe onClose: el botón "Volver" navega a la lista. Recibe `quedadaId`.
// Al montar llama `getQuedadaManageData` → estado. Secciones:
//   1. Logística (solo creador): canchas, horas, precio → costo total + reparto.
//   2. Datos bancarios + premios (solo creador).
//   3. Co-hosts (solo creador): lista + agregar (PlayerPicker) + quitar.
//   4. Categorías (solo creador): crear / editar / borrar.
//   5. Slots/Parejas por categoría (creador o co-host): asignar/quitar pareja,
//      marcar pago por jugador.
//   6. Link de inscripción: copia ${origin}/q/${invite_code}.
//
// Las tablas de quedadas aún no están en los tipos generados → la action de
// lectura devuelve `unknown`, así que tipamos el resultado localmente.
"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  removePair,
  setParticipantPaid,
  updateQuedadaLogistics,
  addCohost,
  removeCohost,
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

// ── Tipos del payload (la action devuelve `unknown`) ─────────────────────────
type ManageQuedada = {
  id: string;
  creator_id: string;
  title: string;
  format: string;
  match_mode: "singles" | "doubles";
  visibility: "open" | "private";
  status: string;
  starts_at: string;
  location_text: string | null;
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
  profiles: { display_name: string | null; username: string | null } | null;
};
type ManageCohost = {
  user_id: string;
  profiles: { display_name: string | null; username: string | null } | null;
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
};

const FORMAT_LABEL: Record<string, string> = {
  americano: "Americano",
  mexicano: "Mexicano",
  round_robin: "Round Robin",
  kotc: "Rey de Cancha",
  canguil: "Canguil",
  libre: "Libre",
};

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
  const [data, setData] = useState<ManageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const isPage = variant === "page";

  const header = (
    <div
      style={{
        padding: "18px 22px",
        background: "linear-gradient(135deg,#0a0a0a 0%,#064e3b 70%,#10b981 100%)",
        color: "#fff",
        position: "relative",
        flexShrink: 0,
        borderTopLeftRadius: isPage ? 16 : undefined,
        borderTopRightRadius: isPage ? 16 : undefined,
      }}
    >
      <button
        onClick={close}
        aria-label={isPage ? "Volver" : "Cerrar"}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
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
        }}
      >
        <Icon name={isPage ? "arrow-left" : "x"} size={14} color="#fff" />
        {isPage ? "Volver" : null}
      </button>
      <div className="label-mp" style={{ color: "var(--primary)" }}>
        ● Gestión · Quedada
      </div>
      <h2
        className="font-heading"
        style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", margin: "8px 0 0", paddingRight: isPage ? 100 : 40 }}
      >
        {data ? data.quedada.title : loading ? "Cargando…" : "Quedada"}
      </h2>
      {data && (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
          {FORMAT_LABEL[data.quedada.format] ?? data.quedada.format} ·{" "}
          {data.quedada.match_mode === "singles" ? "Singles" : "Dobles"}
          {data.isCreator ? " · Eres el organizador" : data.canManage ? " · Eres co-host" : ""}
        </div>
      )}
    </div>
  );

  const body = (
    <div
      style={
        isPage
          ? { padding: 22, display: "flex", flexDirection: "column", gap: 20 }
          : { flex: 1, overflow: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 20 }
      }
    >
      {loading && (
        <div style={{ padding: 24, textAlign: "center", color: "var(--muted-fg)", fontSize: 13 }}>
          Cargando datos de la quedada…
        </div>
      )}
      {!loading && loadError && (
        <div
          className="card"
          style={{ padding: 18, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13 }}
        >
          No se pudo cargar la gestión: {loadError}
        </div>
      )}
      {!loading && data && !data.canManage && (
        <div
          className="card"
          style={{ padding: 18, background: "#fafafa", color: "var(--muted-fg)", fontSize: 13 }}
        >
          No tienes permiso para gestionar esta quedada.
        </div>
      )}

      {!loading && data && data.canManage && (
        <>
          <InviteLinkSection inviteCode={data.quedada.invite_code} toast={toast} />

          {data.isCreator && <LogisticsSection data={data} onSaved={afterMutation} />}
          {data.isCreator && <BankPrizesSection data={data} onSaved={afterMutation} />}
          {data.isCreator && <CohostsSection data={data} onChanged={afterMutation} />}
          {data.isCreator && <CategoriesSection data={data} onChanged={afterMutation} />}

          <SlotsSection data={data} onChanged={afterMutation} />
        </>
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
        {body}
      </div>
    </div>
  );
}

// ── Bloque visual reutilizable ───────────────────────────────────────────────
function Section({
  icon,
  title,
  sub,
  children,
  collapsible = false,
  defaultOpen = true,
  badge,
}: {
  icon: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = !collapsible || open;

  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          background: "linear-gradient(135deg,#10b981,#047857)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={14} color="#fff" />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.015em", display: "flex", alignItems: "center", gap: 8 }}>
          {title}
          {badge != null && (
            <span style={{ fontSize: 10, fontWeight: 900, padding: "1px 7px", borderRadius: 9999, background: "var(--muted)", color: "var(--muted-fg)" }}>{badge}</span>
          )}
        </div>
        {sub && <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 1 }}>{sub}</div>}
      </div>
      {collapsible && (
        <Icon name={open ? "chevron-up" : "chevron-down"} size={18} color="var(--muted-fg)" />
      )}
    </div>
  );

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
      {expanded && children}
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
  color: "#0a0a0a",
};

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
    <Section icon="link" title="Link de inscripción" sub="Compártelo para que se unan a la quedada.">
      {link ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              flex: 1,
              minWidth: 200,
              padding: "9px 12px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "#fafafa",
              fontSize: 12.5,
              fontWeight: 700,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "#0a0a0a",
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
    <Section icon="building-2" title="Logística de canchas" sub="Define cuántas canchas, horas y el precio por hora.">
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
          background: "#ecfdf5",
          border: "1px solid var(--primary)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
          <span style={{ color: "#065f46", fontWeight: 700 }}>Costo total estimado</span>
          <span className="font-heading" style={{ fontWeight: 900, color: "#065f46" }}>
            {totalCents != null ? money(totalCents) : "—"}
          </span>
        </div>
        {totalCents != null && (
          <div style={{ fontSize: 11, color: "#065f46" }}>
            {courtsN} cancha(s) × {hoursN} h × {money(priceCents!)} /hora
          </div>
        )}
        {perPlayerCents != null && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, paddingTop: 6, borderTop: "1px dashed rgba(6,95,70,0.3)" }}>
            <span style={{ color: "#065f46" }}>Reparto sugerido · {playerCount} jugador(es)</span>
            <span style={{ fontWeight: 800, color: "#065f46" }}>{money(perPlayerCents)} c/u</span>
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
    <Section icon="banknote" title="Datos del organizador y premios" sub="Para que los jugadores te transfieran y vean qué se juega.">
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
    <Section icon="users" title="Co-hosts" sub="Pueden gestionar parejas, slots y marcar pagos.">
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
                style={{ background: "#fff", border: "1px solid #fecaca", color: "#b91c1c", padding: "6px 10px", flexShrink: 0 }}
              >
                <Icon name="x" size={12} color="#b91c1c" />
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
      body: `¿Seguro que quieres borrar “${c.name}”? Se eliminan sus slots y parejas.`,
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
    <Section icon="layers" title="Categorías" sub="Cada categoría tiene su hora, cancha y cupo de slots.">
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
                    {c.starts_at && <span>🕒 {hourLabel(c.starts_at)}</span>}
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
                    style={{ background: "#fff", border: "1px solid #fecaca", color: "#b91c1c", padding: "6px 9px" }}
                  >
                    <Icon name="trash-2" size={12} color="#b91c1c" />
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
    <div className="card" style={{ padding: 14, background: "#fafafa", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Nombre">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Suma 6.0 / Open Mixto" maxLength={60} style={fieldInput} />
        </Field>
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: noLevel ? "var(--muted-fg)" : "#0a0a0a" }}>
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
        <Field label="Cupo (slots)">
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
  const filled = data.pairs.length;
  return (
    <Section
      icon="grid-3x3"
      title="Parejas y slots"
      sub="Asigna parejas a cada slot y marca quién pagó."
      collapsible
      defaultOpen={data.categories.length > 0}
      badge={data.categories.length > 0 ? `${filled} pareja${filled === 1 ? "" : "s"}` : undefined}
    >
      {data.categories.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          Crea al menos una categoría para poder asignar parejas.
        </div>
      ) : (
        data.categories.map((c) => <CategorySlots key={c.id} data={data} category={c} onChanged={onChanged} />)
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
  const [open, setOpen] = useState(true);
  const slotCount = category.max_slots ?? 0;
  const pairsBySlot = new Map<number, ManagePair>();
  for (const p of data.pairs) {
    if (p.category_id === category.id) pairsBySlot.set(p.slot_no, p);
  }
  const slots = slotCount > 0 ? Array.from({ length: slotCount }, (_, i) => i + 1) : [];
  const filled = pairsBySlot.size;

  return (
    <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: open ? 10 : 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 8, width: "100%" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span className="font-heading" style={{ fontSize: 13.5, fontWeight: 900 }}>{category.name}</span>
            <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
              {category.starts_at ? `${hourLabel(category.starts_at)} · ` : ""}
              {slotCount} slot(s)
            </span>
          </div>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 900, padding: "2px 8px", borderRadius: 9999, background: filled > 0 ? "#ecfdf5" : "var(--muted)", color: filled > 0 ? "#065f46" : "var(--muted-fg)", flexShrink: 0 }}>
          {filled}/{slotCount || "?"}
        </span>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color="var(--muted-fg)" />
      </button>

      {open &&
        (slots.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Define un cupo de slots para esta categoría.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {slots.map((slotNo) => (
              <SlotRow
                key={slotNo}
                data={data}
                category={category}
                slotNo={slotNo}
                pair={pairsBySlot.get(slotNo) ?? null}
                onChanged={onChanged}
              />
            ))}
          </div>
        ))}
    </div>
  );
}

function SlotRow({
  data,
  category,
  slotNo,
  pair,
  onChanged,
}: {
  data: ManageData;
  category: ManageCategory;
  slotNo: number;
  pair: ManagePair | null;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [pending, start] = useTransition();
  const [assigning, setAssigning] = useState(false);
  const isDoubles = data.quedada.match_mode === "doubles";

  const partById = new Map(data.participants.map((p) => [p.user_id, p]));
  const playerA = pair ? partById.get(pair.player_a_id) ?? null : null;
  const playerB = pair?.player_b_id ? partById.get(pair.player_b_id) ?? null : null;

  const aName = playerA ? nameOf(playerA.profiles) : pair ? "Jugador" : null;
  const bName = playerB ? nameOf(playerB.profiles) : pair?.player_b_id ? "Jugador" : null;

  const remove = async () => {
    if (!pair) return;
    const ok = await confirm({
      title: "Quitar pareja",
      body: `¿Quitar la pareja del slot ${slotNo} de “${category.name}”?`,
      confirmLabel: "Quitar",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    start(async () => {
      const res = await removePair({ pairId: pair.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo quitar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Pareja quitada" });
      await onChanged();
    });
  };

  const togglePaid = (userId: string, current: boolean) => {
    start(async () => {
      const res = await setParticipantPaid({ quedadaId: data.quedada.id, userId, paid: !current });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo actualizar el pago", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: !current ? "Marcado como pagado" : "Pago desmarcado" });
      await onChanged();
    });
  };

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, background: "#fff", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px" }}>
        <div
          className="font-heading"
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: pair ? "var(--primary)" : "var(--muted)",
            color: pair ? "#fff" : "var(--muted-fg)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          {slotNo}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {pair ? (
            <PaidPlayers
              playerA={{ id: pair.player_a_id, name: aName ?? "Jugador", paid: playerA?.paid ?? false }}
              playerB={
                pair.player_b_id
                  ? { id: pair.player_b_id, name: bName ?? "Jugador", paid: playerB?.paid ?? false }
                  : null
              }
              pending={pending}
              onTogglePaid={togglePaid}
            />
          ) : (
            <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>Slot vacío</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {pair ? (
            <button
              className="btn"
              onClick={remove}
              disabled={pending}
              aria-label="Quitar pareja"
              style={{ background: "#fff", border: "1px solid #fecaca", color: "#b91c1c", padding: "6px 9px" }}
            >
              <Icon name="x" size={12} color="#b91c1c" />
            </button>
          ) : (
            <button
              className="btn"
              onClick={() => setAssigning((v) => !v)}
              disabled={pending}
              style={{ background: "#fff", border: "1px solid var(--border)", padding: "6px 10px" }}
            >
              <Icon name="user-plus" size={12} />
              Asignar
            </button>
          )}
        </div>
      </div>

      {assigning && !pair && (
        <AssignPairForm
          data={data}
          category={category}
          slotNo={slotNo}
          isDoubles={isDoubles}
          onDone={async () => {
            setAssigning(false);
            await onChanged();
          }}
          onCancel={() => setAssigning(false)}
        />
      )}
    </div>
  );
}

function PaidPlayers({
  playerA,
  playerB,
  pending,
  onTogglePaid,
}: {
  playerA: { id: string; name: string; paid: boolean };
  playerB: { id: string; name: string; paid: boolean } | null;
  pending: boolean;
  onTogglePaid: (userId: string, current: boolean) => void;
}) {
  const renderItem = (p: { id: string; name: string; paid: boolean }) => (
    <label
      key={p.id}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 700,
        cursor: pending ? "default" : "pointer",
        minWidth: 0,
      }}
    >
      <input
        type="checkbox"
        checked={p.paid}
        disabled={pending}
        onChange={() => onTogglePaid(p.id, p.paid)}
        style={{ accentColor: "var(--primary)", cursor: pending ? "default" : "pointer" }}
        aria-label={`Marcar pago de ${p.name}`}
      />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
      <span style={{ fontSize: 11, flexShrink: 0 }}>{p.paid ? "✅" : "⬜"}</span>
    </label>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
      {renderItem(playerA)}
      {playerB && renderItem(playerB)}
    </div>
  );
}

function AssignPairForm({
  data,
  category,
  slotNo,
  isDoubles,
  onDone,
  onCancel,
}: {
  data: ManageData;
  category: ManageCategory;
  slotNo: number;
  isDoubles: boolean;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [a, setA] = useState<Player[]>([]);
  const [b, setB] = useState<Player[]>([]);

  const submit = () => {
    if (pending) return;
    if (a.length === 0) {
      toast({ icon: "alert-triangle", title: isDoubles ? "Elige al jugador A" : "Elige al jugador" });
      return;
    }
    // En dobles ambos son obligatorios; en singles solo el jugador.
    if (isDoubles && b.length === 0) {
      toast({ icon: "alert-triangle", title: "Elige al jugador B", sub: "En dobles la pareja necesita dos jugadores." });
      return;
    }
    start(async () => {
      const res = await assignPair({
        quedadaId: data.quedada.id,
        categoryId: category.id,
        slotNo,
        playerAId: a[0].id,
        playerBId: isDoubles ? b[0].id : null,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo asignar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: `${isDoubles ? "Pareja" : "Jugador"} asignad${isDoubles ? "a" : "o"} al slot ${slotNo}` });
      await onDone();
    });
  };

  return (
    <div style={{ padding: "0 11px 12px", display: "flex", flexDirection: "column", gap: 10, background: "#fafafa", borderTop: "1px solid var(--border)" }}>
      <div style={{ paddingTop: 10 }}>
        <PlayerPicker label={isDoubles ? "Jugador A" : "Jugador"} max={1} selected={a} onChange={setA} excludeIds={b[0] ? [b[0].id] : []} />
      </div>
      {isDoubles && (
        <PlayerPicker label="Jugador B" max={1} selected={b} onChange={setB} excludeIds={a[0] ? [a[0].id] : []} />
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="btn btn-outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>
          {!pending && <Icon name="check" size={13} color="#fff" />}
          {pending ? "Asignando…" : isDoubles ? "Asignar pareja" : "Asignar jugador"}
        </button>
      </div>
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
