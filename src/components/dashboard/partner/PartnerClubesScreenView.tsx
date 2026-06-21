// Client view de PartnerClubesScreen — layout 1:1 (RoleScreens2.jsx 321-337).
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RSHeader, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { linkClubToPartner } from "@/server/actions/partners";

export type ClubRow = {
  id: string;
  n: string;
  city: string;
  events: number;
  revenue: string;
  since: string;
};

export type ClubesData = { partnerId: string | null; rows: ClubRow[] };

const PLACEHOLDER_ROWS: ClubRow[] = Array.from({ length: 4 }).map((_, i) => ({
  id: `ph-${i}`,
  n: "—",
  city: "—",
  events: 0,
  revenue: "$—",
  since: "—",
}));

export function PartnerClubesScreenView({ data }: { data: ClubesData }) {
  const toast = useToast();
  const router = useRouter();
  const { ask } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const handleLink = async () => {
    if (!data.partnerId) {
      toast({ icon: "alert-triangle", title: "Sin partner activo" });
      return;
    }
    const linkCode = await ask({
      title: "Vincular club · 1/2",
      label: "Código del club",
      placeholder: "CLB-XXXX-XXXX",
      required: true,
      confirmLabel: "Siguiente",
      validate: (v) => (v.trim().length < 4 ? "Ingresa el código completo." : null),
    });
    if (linkCode == null) return;
    const shareStr = await ask({
      title: "Vincular club · 2/2",
      label: "Revenue share (%)",
      initialValue: "10",
      required: true,
      validate: (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 && n <= 100 ? null : "Entre 0 y 100";
      },
      confirmLabel: "Vincular",
    });
    if (shareStr == null) return;
    startTransition(async () => {
      const res = await linkClubToPartner({
        partnerId: data.partnerId!,
        linkCode: linkCode.trim(),
        revenueSharePct: Number(shareStr) || 0,
      });
      if (res.ok) {
        toast({ icon: "check", title: "Club vinculado" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  useRealtimeRefresh(
    data.partnerId
      ? [{ table: "partner_club_links", filter: `partner_id=eq.${data.partnerId}` }]
      : [],
    { enabled: !!data.partnerId },
  );

  const hasReal = data.rows.length > 0;
  const displayRows = hasReal ? data.rows : PLACEHOLDER_ROWS;

  const cols: RSColumn<ClubRow>[] = [
    {
      k: "n",
      l: "Club",
      render: (c) => (
        <div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 900,
              color: hasReal ? "#0a0a0a" : "var(--muted-fg)",
            }}
          >
            {c.n}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
            {c.city} · alianza desde {c.since}
          </div>
        </div>
      ),
    },
    {
      k: "events",
      l: "Eventos · año",
      align: "center",
      render: (c) => (
        <b className="font-heading" style={{ color: hasReal ? "#0a0a0a" : "var(--muted-fg)" }}>
          {c.events}
        </b>
      ),
    },
    {
      k: "revenue",
      l: "Revenue",
      align: "right",
      render: (c) => (
        <b style={{ color: hasReal ? "var(--primary)" : "var(--muted-fg)" }}>{c.revenue}</b>
      ),
    },
    {
      k: "a",
      l: "",
      align: "right",
      render: (c) => (
        <button
          type="button"
          className="btn"
          style={{
            fontSize: 10.5,
            background: "#fff",
            border: "1px solid var(--border)",
          }}
          disabled={!hasReal}
          onClick={() => {
            router.push(`/dashboard/partner/p-torneos?club=${encodeURIComponent(c.id)}`);
          }}
        >
          Ver eventos
        </button>
      ),
    },
  ];

  return (
    <>
      <RSHeader
        label="Partner · Clubes"
        title={
          <>
            Clubes asociados <span className="dot">●</span> {hasReal ? data.rows.length : 0}
          </>
        }
        action={
          <button className="btn btn-primary" onClick={handleLink} disabled={isPending || !data.partnerId}>
            <Icon name="building-2" size={13} color="#fff" />
            {isPending ? "Vinculando…" : "Vincular club"}
          </button>
        }
      />
      <RSTable cols={cols} rows={displayRows} rowKey={(c) => c.id} />
    </>
  );
}
