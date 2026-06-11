// Client view de ClubClientesScreen — layout del mock 1:1, valores reales.
// Sin socios → 6 filas placeholder neutras (dashed, "—") para preservar el mock.
"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";

type Tier = "VIP" | "PRO" | "STD";

export type ClienteRow = {
  id: string;
  name: string;
  av: string;
  avBg: string;
  tier: Tier;
  joined: string;
  visits: number;
  spendCents: number;
  lastVisit: string;
  favSport: string;
};

export type ClientesData = {
  clubId: string | null;
  totalSocios: number;
  clients: ClienteRow[];
};

const TIER_BG: Record<Tier, string> = {
  VIP: "#fbbf24",
  PRO: "#0a0a0a",
  STD: "var(--muted-fg)",
};

const PLACEHOLDER_GRADIENT = "linear-gradient(135deg, #e5e5e5, #d4d4d4)";

// Row tipo para la tabla — incluye el flag de placeholder.
type RowItem = ClienteRow | { placeholder: true; k: string };

function isPh(r: RowItem): r is { placeholder: true; k: string } {
  return "placeholder" in r;
}

function spendLabel(cents: number): string {
  if (cents === 0) return "$—";
  return `$${Math.round(cents / 100)}`;
}

export function ClubClientesScreenView({ data }: { data: ClientesData }) {
  useRealtimeRefresh(
    data.clubId ? [{ table: "reservations", filter: `club_id=eq.${data.clubId}` }] : [],
    { enabled: !!data.clubId },
  );

  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [detailClient, setDetailClient] = useState<ClienteRow | null>(null);
  const roleSegment = pathname.split("/")[2] ?? "owner";

  const goToReservas = () => {
    router.push(`/dashboard/${roleSegment}/club-reservas`);
  };

  const copyClientId = async (client: ClienteRow) => {
    try {
      await navigator.clipboard.writeText(client.id);
      toast({ icon: "check-circle-2", title: "ID copiado", sub: client.name });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar", sub: "Intenta de nuevo" });
    }
  };

  const hasReal = data.clients.length > 0;
  const rows: RowItem[] = hasReal
    ? data.clients
    : [1, 2, 3, 4, 5, 6].map((n) => ({ placeholder: true as const, k: `ph-${n}` }));

  const cols: RSColumn<RowItem>[] = [
    {
      k: "n",
      l: "Socio",
      minWidth: 148,
      render: (c) => {
        if (isPh(c)) {
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, opacity: 0.6 }}>
              <div
                style={{
                  flexShrink: 0,
                  width: 32,
                  height: 32,
                  minWidth: 32,
                  minHeight: 32,
                  borderRadius: "50%",
                  background: PLACEHOLDER_GRADIENT,
                  border: "1px dashed var(--border)",
                }}
              />
              <div style={{ minWidth: 0, overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted-fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>—</div>
                <div style={{ fontSize: 9.5, color: "var(--muted-fg)", whiteSpace: "nowrap" }}>Desde —</div>
              </div>
            </div>
          );
        }
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                minWidth: 32,
                minHeight: 32,
                borderRadius: "50%",
                background: c.avBg,
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Plus Jakarta Sans",
                fontWeight: 900,
                fontSize: 11,
              }}
            >
              {c.av}
            </div>
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
              <div style={{ fontSize: 9.5, color: "var(--muted-fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Desde {c.joined}</div>
            </div>
          </div>
        );
      },
    },
    {
      k: "tier",
      l: "Tier",
      render: (c) =>
        isPh(c) ? (
          <span style={{ color: "var(--muted-fg)" }}>—</span>
        ) : (
          <RSPill bg={TIER_BG[c.tier]}>{c.tier}</RSPill>
        ),
    },
    {
      k: "favSport",
      l: "Deporte fav.",
      render: (c) => (isPh(c) ? <span style={{ color: "var(--muted-fg)" }}>—</span> : c.favSport),
    },
    {
      k: "visits",
      l: "Visitas · mes",
      align: "center",
      render: (c) =>
        isPh(c) ? (
          <span style={{ color: "var(--muted-fg)" }}>—</span>
        ) : (
          <b className="font-heading">{c.visits}</b>
        ),
    },
    {
      k: "spend",
      l: "Gasto · mes",
      align: "right",
      render: (c) =>
        isPh(c) ? (
          <span style={{ color: "var(--muted-fg)" }}>—</span>
        ) : (
          <b style={{ color: "var(--primary)" }}>{spendLabel(c.spendCents)}</b>
        ),
    },
    {
      k: "last",
      l: "Última visita",
      render: (c) => (
        <span style={{ color: "var(--muted-fg)" }}>{isPh(c) ? "—" : c.lastVisit}</span>
      ),
    },
    {
      k: "a",
      l: "",
      align: "right",
      render: (c) =>
        isPh(c) ? null : (
          <ClienteRowMenu
            client={c}
            onDetail={() => setDetailClient(c)}
            onReserva={goToReservas}
            onCopyId={() => copyClientId(c)}
          />
        ),
    },
  ];

  return (
    <>
      <RSHeader
        label="Club · Clientes"
        title={
          <>
            Socios <span className="dot">●</span> {data.totalSocios}
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{
                background: "#fff",
                border: RS_BORDER,
                opacity: hasReal ? 1 : 0.5,
                cursor: hasReal ? "pointer" : "not-allowed",
              }}
              disabled={!hasReal}
            >
              <Icon name="download" size={12} />
              Exportar
            </button>
            <button
              className="btn btn-primary"
              style={{
                opacity: data.clubId ? 1 : 0.5,
                cursor: data.clubId ? "pointer" : "not-allowed",
              }}
              disabled={!data.clubId}
            >
              <Icon name="user-plus" size={13} color="#fff" />
              Agregar socio
            </button>
          </div>
        }
      />
      <RSTable cols={cols} rows={rows} rowKey={(r) => (isPh(r) ? r.k : r.id)} />
      {detailClient && (
        <ClienteDetailDrawer client={detailClient} onClose={() => setDetailClient(null)} onReserva={goToReservas} />
      )}
    </>
  );
}

const MENU_ITEM_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "9px 14px",
  background: "transparent",
  border: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  color: "#0a0a0a",
  textAlign: "left",
};

function ClienteRowMenu({
  client,
  onDetail,
  onReserva,
  onCopyId,
}: {
  client: ClienteRow;
  onDetail: () => void;
  onReserva: () => void;
  onCopyId: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  return (
    <div style={{ display: "inline-block" }}>
      <button
        ref={btnRef}
        type="button"
        aria-label={`Opciones de ${client.name}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--muted)",
          border: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          lineHeight: 1,
        }}
      >
        <Icon name="more-horizontal" size={13} />
      </button>
      {open && mounted && pos &&
        createPortal(
          <>
            <div
              onClick={() => setOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 9998 }}
            />
            <div
              style={{
                position: "fixed",
                top: pos.top,
                right: pos.right,
                zIndex: 9999,
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 12,
                boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
                overflow: "hidden",
                width: 220,
                fontSize: 12,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDetail();
                }}
                style={MENU_ITEM_STYLE}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--muted)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Icon name="user" size={13} />
                Ver detalle
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onReserva();
                }}
                style={MENU_ITEM_STYLE}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--muted)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Icon name="calendar-plus" size={13} />
                Crear reserva
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCopyId();
                }}
                style={MENU_ITEM_STYLE}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--muted)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Icon name="copy" size={13} />
                Copiar ID
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

function ClienteDetailDrawer({
  client,
  onClose,
  onReserva,
}: {
  client: ClienteRow;
  onClose: () => void;
  onReserva: () => void;
}) {
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.35)" }} />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="cliente-detail-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9999,
          width: "min(400px, calc(100vw - 32px))",
          background: "#fff",
          borderRadius: 14,
          border: "1px solid var(--border)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: client.avBg,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            {client.av}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="cliente-detail-title" className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em" }}>
              {client.name}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>Socio desde {client.joined}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="btn" style={{ background: "#fff", border: RS_BORDER, padding: "6px 8px" }}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <DetailStat label="Tier" value={client.tier} />
          <DetailStat label="Deporte fav." value={client.favSport} />
          <DetailStat label="Visitas · mes" value={String(client.visits)} />
          <DetailStat label="Gasto · mes" value={spendLabel(client.spendCents)} accent />
          <DetailStat label="Última visita" value={client.lastVisit} span2 />
        </div>
        <div style={{ padding: "12px 20px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose} style={{ background: "#fff", border: RS_BORDER }}>
            Cerrar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose();
              onReserva();
            }}
          >
            <Icon name="calendar-plus" size={13} color="#fff" />
            Crear reserva
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

function DetailStat({
  label,
  value,
  accent,
  span2,
}: {
  label: string;
  value: string;
  accent?: boolean;
  span2?: boolean;
}) {
  return (
    <div style={{ gridColumn: span2 ? "1 / -1" : undefined }}>
      <div className="label-mp">{label}</div>
      <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, marginTop: 4, color: accent ? "var(--primary)" : "#0a0a0a" }}>
        {value}
      </div>
    </div>
  );
}
