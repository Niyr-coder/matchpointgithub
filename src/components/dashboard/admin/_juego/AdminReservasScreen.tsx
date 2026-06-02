"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRealtimeRefresh } from "../../useRealtimeRefresh";
import { useToast } from "../../ToastProvider";
import { usePromptModal } from "../../widgets/PromptModal";
import {
  cancelReservationAdmin,
  listAdminReservations,
  refundReservationAdmin,
} from "@/server/actions/admin/reservations";
import {
  AJFilterBar,
  AJHero,
  AJIconButton,
  AJKpiStrip,
  AJSearchInput,
  AJStatusChip,
  ajFmtDate,
  ajFmtMoney,
} from "./components";
import {
  PAYMENT_METHOD_META,
  RESERVA_STATUS_META,
  RESERVAS_HERO_BG,
  type PaymentMethod,
  type ReservaStatus,
} from "./constants";

type AdminReserva = {
  id: string;
  club: string;
  clubCity: string;
  court: string;
  player: string;
  method: PaymentMethod;
  status: ReservaStatus;
  paymentStatus: string | null;
  transactionId: string | null;
  when: string;
  durationMin: number;
  priceCents: number;
  refundable: boolean;
  flag: string | null;
};

const RESERVAS_GRID_COLUMNS =
  "minmax(0,1.25fr) minmax(0,1.2fr) minmax(0,0.8fr) minmax(0,0.66fr) minmax(72px,0.55fr) minmax(84px,0.7fr) max-content";

function toStatus(status: string): ReservaStatus {
  if (status in RESERVA_STATUS_META) return status as ReservaStatus;
  return "booked";
}

function toMethod(method: string): PaymentMethod {
  if (method in PAYMENT_METHOD_META) return method as PaymentMethod;
  return "transfer";
}

export function AdminReservasScreen() {
  const toast = useToast();
  const router = useRouter();
  const { ask, confirm } = usePromptModal();
  const [pending, startTransition] = useTransition();
  const [list, setList] = useState<AdminReserva[]>([]);
  const [filter, setFilter] = useState({ status: "all", method: "all", q: "" });
  const rtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await listAdminReservations();
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se cargaron reservas", sub: res.error.message });
        return;
      }
      setList(
        res.data.map((r) => ({
          id: r.id,
          club: r.club,
          clubCity: r.clubCity,
          court: r.court,
          player: r.player,
          method: toMethod(r.method),
          status: toStatus(r.status),
          paymentStatus: r.paymentStatus,
          transactionId: r.transactionId,
          when: r.when,
          durationMin: r.durationMin,
          priceCents: r.priceCents,
          refundable: r.refundable,
          flag: r.flag,
        })),
      );
    });
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () => () => {
      if (rtTimer.current) clearTimeout(rtTimer.current);
    },
    [],
  );

  useRealtimeRefresh(
    [
      { table: "reservations" },
      { table: "reservation_payments" },
      { table: "transactions" },
      { table: "refunds" },
    ],
    {
      onChange: () => {
        if (rtTimer.current) clearTimeout(rtTimer.current);
        rtTimer.current = setTimeout(load, 900);
      },
    },
  );

  const todayMs = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const inToday = (iso: string) => {
    const t = Date.parse(iso);
    return t >= todayMs && t < todayMs + 86400000;
  };
  const gmvCents = list
    .filter((r) => ["booked", "confirmed", "checked_in", "completed", "no_show"].includes(r.status))
    .reduce((s, r) => s + r.priceCents, 0);

  const stats = [
    { v: list.filter((r) => r.paymentStatus === "pending" || r.paymentStatus === "pending_proof").length, l: "Pago pendiente", highlight: list.some((r) => r.paymentStatus === "pending" || r.paymentStatus === "pending_proof") },
    { v: list.filter((r) => inToday(r.when)).length, l: "Hoy" },
    { v: list.filter((r) => r.flag).length, l: "Con flag", highlight: list.some((r) => r.flag) },
    { v: ajFmtMoney(gmvCents), l: "GMV" },
  ];

  const filtered = useMemo(
    () =>
      list.filter((r) => {
        if (filter.status !== "all" && r.status !== filter.status) return false;
        if (filter.method !== "all" && r.method !== filter.method) return false;
        if (filter.q) {
          const blob = `${r.player} ${r.club} ${r.court} ${r.id}`.toLowerCase();
          if (!blob.includes(filter.q.toLowerCase())) return false;
        }
        return true;
      }),
    [filter, list],
  );

  const refund = async (r: AdminReserva) => {
    const reason = await ask({
      title: "Registrar reembolso",
      label: "Motivo",
      placeholder: "Ej: cancelación aprobada por soporte",
      multiline: true,
      required: true,
      confirmLabel: "Registrar reembolso",
    });
    if (reason == null) return;
    const reference = await ask({
      title: "Referencia de devolución",
      label: "Referencia bancaria o DeUna",
      placeholder: "Opcional",
      required: false,
      confirmLabel: "Continuar",
    });
    if (reference == null) return;
    startTransition(async () => {
      const res = await refundReservationAdmin({
        reservationId: r.id,
        reason: reason.trim(),
        refundReference: reference.trim() || undefined,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo reembolsar", sub: res.error.message });
        return;
      }
      setList((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? { ...x, status: "refunded", paymentStatus: "refunded", refundable: false, flag: "Reembolso registrado" }
            : x,
        ),
      );
      toast({ icon: "undo-2", title: "Reembolso registrado", sub: `${r.id} · ${ajFmtMoney(r.priceCents)}` });
      router.refresh();
    });
  };

  const cancel = async (r: AdminReserva) => {
    const ok = await confirm({
      title: "Cancelar reserva",
      body: `¿Cancelar reserva ${r.id}? No registra reembolso automático.`,
      confirmLabel: "Cancelar reserva",
      destructive: true,
    });
    if (!ok) return;
    const reason = await ask({
      title: "Motivo de cancelación",
      label: "Motivo",
      placeholder: "Ej: solicitado por soporte",
      multiline: true,
      required: false,
      confirmLabel: "Guardar",
    });
    if (reason == null) return;
    startTransition(async () => {
      const res = await cancelReservationAdmin({
        reservationId: r.id,
        reason: reason.trim() || "Cancelada por soporte MATCHPOINT",
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: res.error.message });
        return;
      }
      setList((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, status: "cancelled", refundable: false, flag: "Cancelada por admin" } : x)),
      );
      toast({ icon: "ban", title: "Reserva cancelada", sub: r.id });
      router.refresh();
    });
  };

  const investigate = (r: AdminReserva) => {
    toast({ icon: "search", title: "Reserva real", sub: `${r.id}${r.transactionId ? ` · tx ${r.transactionId.slice(0, 8)}` : ""}` });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AJHero
        chipText=""
        title="Reservas"
        sub="Visión cross-club de todas las reservas de cancha. Cancela, registra reembolsos manuales o investiga cualquiera."
        wordmark="RSRV"
        bg={RESERVAS_HERO_BG}
        accent="#38bdf8"
      />
      <AJKpiStrip stats={stats} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.02em" }}>
            Reservas recientes<span className="dot">.</span>
          </span>
          <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}>Cross-club · últimas 100</span>
          <span style={{ flex: 1 }} />
          <AJSearchInput value={filter.q} onChange={(v) => setFilter({ ...filter, q: v })} placeholder="Buscar por jugador, club, id…" />
        </div>
        <AJFilterBar
          totalAll={list.length}
          totalShown={filtered.length}
          onClear={() => setFilter({ status: "all", method: "all", q: "" })}
          groups={[
            {
              label: "Estado",
              value: filter.status,
              onChange: (v) => setFilter({ ...filter, status: v }),
              options: [
                { k: "all", l: "Todas" },
                { k: "booked", l: "Reservada" },
                { k: "confirmed", l: "Confirmada" },
                { k: "checked_in", l: "Check-in" },
                { k: "no_show", l: "No-show" },
                { k: "cancelled", l: "Cancelada" },
                { k: "refunded", l: "Reembolsada" },
                { k: "completed", l: "Jugada" },
              ],
            },
            {
              label: "Pago",
              value: filter.method,
              onChange: (v) => setFilter({ ...filter, method: v }),
              options: [
                { k: "all", l: "Todos" },
                { k: "cash", l: "Efectivo", icon: "banknote" },
                { k: "card", l: "Tarjeta", icon: "credit-card" },
                { k: "transfer", l: "Transferencia", icon: "landmark" },
                { k: "wallet", l: "Wallet", icon: "wallet" },
                { k: "free", l: "Gratis", icon: "ticket" },
              ],
            },
          ]}
        />

        {filtered.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted-fg)" }}>
            <Icon name="search-x" size={26} color="var(--muted-fg)" />
            <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, marginTop: 10, color: "var(--fg)" }}>
              Sin resultados<span className="dot">.</span>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="mp-admin-reservas-list">
              <div className="mp-admin-reservas-head" style={{ display: "grid", gridTemplateColumns: RESERVAS_GRID_COLUMNS, gap: 10, padding: "10px 16px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)", borderBottom: "1px solid var(--border)", background: "var(--muted)", alignItems: "center" }}>
                <span>Reserva</span>
                <span>Club · cancha</span>
                <span>Cuándo · duración</span>
                <span>Pago</span>
                <span>Precio</span>
                <span>Estado</span>
                <span />
              </div>
              {filtered.map((r, i) => {
                const sm = RESERVA_STATUS_META[r.status];
                const mm = PAYMENT_METHOD_META[r.method];
                const muted = ["cancelled", "refunded", "completed"].includes(r.status);
                return (
                  <div className="mp-admin-reservas-row" key={r.id} style={{ display: "grid", gridTemplateColumns: RESERVAS_GRID_COLUMNS, gap: 10, padding: "12px 16px", alignItems: "center", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : 0, background: muted ? "#fafafa" : "#fff", opacity: muted ? 0.78 : 1 }}>
                    <div className="mp-admin-reservas-cell mp-admin-reservas-primary" data-label="Reserva" style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.player}</div>
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: "var(--muted-fg)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.id}</div>
                      {r.flag ? (
                        <div style={{ fontSize: 10.5, color: r.paymentStatus === "pending" || r.status === "no_show" ? "#b45309" : "var(--muted-fg)", fontWeight: 700, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <Icon name="alert-triangle" size={10} />
                          {r.flag}
                        </div>
                      ) : null}
                    </div>
                    <div className="mp-admin-reservas-cell" data-label="Club · cancha" style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.club}</div>
                      <div style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.court} · {r.clubCity}
                      </div>
                    </div>
                    <div className="mp-admin-reservas-cell" data-label="Cuándo" style={{ minWidth: 0, fontSize: 11, color: "var(--muted-fg)" }}>
                      <span>
                        <b style={{ color: "var(--fg)" }}>{ajFmtDate(r.when)}</b>
                        <br />
                        <span style={{ fontSize: 10.5 }}>{r.durationMin} min</span>
                      </span>
                    </div>
                    <div className="mp-admin-reservas-cell" data-label="Pago" style={{ minWidth: 0, overflow: "hidden" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%", fontSize: 11, fontWeight: 700, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <Icon name={mm.icon} size={12} color="var(--muted-fg)" />
                        {mm.label}
                      </span>
                    </div>
                    <div className="mp-admin-reservas-cell font-heading tabular" data-label="Precio" style={{ minWidth: 0, fontSize: 12.5, fontWeight: 900, color: r.priceCents > 0 ? "var(--fg)" : "var(--muted-fg)" }}>
                      <span>{ajFmtMoney(r.priceCents)}</span>
                    </div>
                    <div className="mp-admin-reservas-cell mp-admin-reservas-status" data-label="Estado" style={{ minWidth: 0 }}>
                      <AJStatusChip {...sm} />
                    </div>
                    <div className="mp-admin-reservas-actions" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <AJIconButton title="Ver detalles" icon="eye" onClick={() => investigate(r)} disabled={pending} />
                      {r.refundable && r.priceCents > 0 ? (
                        <AJIconButton title="Registrar reembolso" icon="undo-2" onClick={() => void refund(r)} bg="#dbeafe" border="1px solid #93c5fd" color="#1d4ed8" disabled={pending} />
                      ) : null}
                      {r.status === "booked" || r.status === "confirmed" || r.status === "checked_in" ? (
                        <AJIconButton title="Cancelar reserva" icon="x" onClick={() => void cancel(r)} border="1px solid #fecaca" color="#dc2626" disabled={pending} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
