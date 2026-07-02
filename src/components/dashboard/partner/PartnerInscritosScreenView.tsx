// Client view de PartnerInscritosScreen — tabla con player real, status de
// pago según modo (online/onsite/free) y botón "Marcar pagado" para onsite.
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { markRegistrationPaidByPartner, setTournamentStatus } from "@/server/actions/tournaments";

export type PaymentMode = "online" | "onsite" | "free";
export type PayStatus =
  | "free"
  | "paid"
  | "onsite_pending"
  | "awaiting_proof"
  | "review"
  | "other";

export type InscritoRow = {
  id: string;
  team: string;
  avatarUrl: string | null;
  regStatus: string;
  paymentMode: PaymentMode;
  payStatus: PayStatus;
  amt: string;
  when: string;
};

export type InscritosData = {
  partnerId: string | null;
  tournamentId: string | null;
  tournamentStatus: string | null;
  tournamentName: string | null;
  capacity: number;
  rows: InscritoRow[];
};

const PAY_LABEL: Record<PayStatus, string> = {
  free: "GRATIS",
  paid: "PAGADO",
  onsite_pending: "EN CLUB · POR COBRAR",
  awaiting_proof: "ESPERA COMPROBANTE",
  review: "EN REVISIÓN",
  other: "—",
};

const PAY_COLOR: Record<PayStatus, string> = {
  free: "#0ea5e9",
  paid: "var(--primary)",
  onsite_pending: "#fbbf24",
  awaiting_proof: "#fbbf24",
  review: "#7c3aed",
  other: "var(--muted-fg)",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const PLACEHOLDER_ROWS: InscritoRow[] = Array.from({ length: 5 }).map((_, i) => ({
  id: `ph-${i}`,
  team: "—",
  avatarUrl: null,
  regStatus: "pending",
  paymentMode: "online",
  payStatus: "other",
  amt: "$—",
  when: "—",
}));

export function PartnerInscritosScreenView({ data }: { data: InscritosData }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [marking, setMarking] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const registrationsClosed =
    data.tournamentStatus === "registration_closed" ||
    data.tournamentStatus === "cancelled" ||
    data.tournamentStatus === "finished" ||
    data.tournamentStatus === "completed";
  const canCloseRegistrations =
    !!data.tournamentId && !!data.tournamentStatus && !registrationsClosed;

  // Filtrado por el torneo elegido — antes escuchaba TODAS las registrations
  // y TODAS las tx de torneo de la plataforma (audit de costos 2026-07-01).
  useRealtimeRefresh(
    data.partnerId && data.tournamentId
      ? [
          { table: "registrations", filter: `tournament_id=eq.${data.tournamentId}` },
          { table: "tournaments", filter: `id=eq.${data.tournamentId}` },
          { table: "transactions", filter: `ref_id=eq.${data.tournamentId}` },
        ]
      : [],
    { enabled: !!data.partnerId && !!data.tournamentId, debounceMs: 2000 },
  );

  const handleMarkPaid = (regId: string) => {
    if (marking) return;
    setMarking(regId);
    startTransition(async () => {
      const res = await markRegistrationPaidByPartner({ registrationId: regId });
      setMarking(null);
      if (res.ok) {
        toast({ icon: "check", title: "Marcado como pagado" });
        router.refresh();
      } else {
        toast({
          icon: "alert-triangle",
          title: "No se pudo marcar",
          sub: res.error.message,
        });
      }
    });
  };

  const handleCloseRegistrations = () => {
    if (!data.tournamentId || closing || !canCloseRegistrations) return;
    setClosing(true);
    startTransition(async () => {
      const res = await setTournamentStatus({
        tournamentId: data.tournamentId!,
        status: "registration_closed",
      });
      setClosing(false);
      if (res.ok) {
        toast({ icon: "lock", title: "Inscripciones cerradas" });
        router.refresh();
      } else {
        toast({
          icon: "alert-triangle",
          title: "No se pudo cerrar",
          sub: res.error.message,
        });
      }
    });
  };

  const hasReal = data.rows.length > 0;
  const displayRows = hasReal ? data.rows : PLACEHOLDER_ROWS;
  const capLabel = data.capacity > 0 ? data.capacity : "—";

  const cols: RSColumn<InscritoRow>[] = [
    {
      k: "team",
      l: "Jugador",
      render: (t) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: t.avatarUrl
                ? `url(${t.avatarUrl}) center/cover`
                : "linear-gradient(135deg, #10b981, #047857)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 900,
              flexShrink: 0,
            }}
          >
            {!t.avatarUrl && hasReal && initialsOf(t.team)}
          </div>
          <b style={{ fontSize: 12, color: hasReal ? "#0a0a0a" : "var(--muted-fg)" }}>{t.team}</b>
        </div>
      ),
    },
    {
      k: "paymentMode",
      l: "Modo",
      align: "center",
      render: (t) => {
        if (!hasReal) return <span style={{ color: "var(--muted-fg)", fontSize: 10 }}>—</span>;
        const label =
          t.paymentMode === "online"
            ? "Online"
            : t.paymentMode === "onsite"
              ? "En club"
              : "Gratis";
        return (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: "var(--muted-fg)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {label}
          </span>
        );
      },
    },
    {
      k: "amt",
      l: "Inscripción",
      align: "right",
      render: (t) => (
        <span
          className="font-heading"
          style={{ fontSize: 12, fontWeight: 900, color: hasReal ? "#0a0a0a" : "var(--muted-fg)" }}
        >
          {t.amt}
        </span>
      ),
    },
    {
      k: "payStatus",
      l: "Estado de pago",
      render: (t) =>
        hasReal ? (
          <RSPill bg={PAY_COLOR[t.payStatus]}>{PAY_LABEL[t.payStatus]}</RSPill>
        ) : (
          <RSPill bg="var(--muted-fg)">—</RSPill>
        ),
    },
    {
      k: "when",
      l: "Inscrito",
      render: (t) => <span style={{ color: "var(--muted-fg)" }}>{t.when}</span>,
    },
    {
      k: "id",
      l: "",
      align: "right",
      render: (t) => {
        if (!hasReal) return null;
        // Solo onsite_pending acepta acción manual del partner.
        if (t.payStatus !== "onsite_pending") return null;
        const isLoading = marking === t.id;
        return (
          <button
            onClick={() => handleMarkPaid(t.id)}
            disabled={!!marking}
            className="btn btn-primary"
            style={{ fontSize: 10.5, padding: "6px 10px", opacity: isLoading ? 0.7 : 1 }}
          >
            <Icon name="check" size={11} color="#fff" />
            {isLoading ? "Marcando…" : "Marcar pagado"}
          </button>
        );
      },
    },
  ];

  const headerLabel = data.tournamentName
    ? `Partner · ${data.tournamentName}`
    : "Partner · Sin torneo activo";

  return (
    <>
      <RSHeader
        label={headerLabel}
        title={
          <>
            Inscritos <span className="dot">●</span>{" "}
            {hasReal
              ? data.rows.filter((r) => r.regStatus === "pending" || r.regStatus === "accepted").length
              : 0}{" "}
            / {capLabel}
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{ background: "#fff", border: RS_BORDER, opacity: hasReal ? 1 : 0.5 }}
              disabled={!hasReal}
            >
              <Icon name="download" size={12} />
              CSV
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canCloseRegistrations || closing}
              onClick={handleCloseRegistrations}
            >
              <Icon name="lock" size={13} color="#fff" />
              {closing
                ? "Cerrando…"
                : registrationsClosed
                  ? "Inscripciones cerradas"
                  : "Cerrar inscripciones"}
            </button>
          </div>
        }
      />
      <RSTable cols={cols} rows={displayRows} rowKey={(t) => t.id} />
    </>
  );
}
