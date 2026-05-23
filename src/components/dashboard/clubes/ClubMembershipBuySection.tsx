"use client";

// Sección de compra de membresía VIP en la página de un club. Lista los tiers
// activos y permite hacerse miembro (→ /pagos/[txId] para subir comprobante).
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../ToastProvider";
import { getClubMembershipTiers, getMyClubMemberships, requestClubMembership } from "@/server/actions/club-memberships";
import { membershipTemplate, isClubMembershipActive } from "@/lib/clubs/membership";

type Tier = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  duration_months: number;
  discount_pct: number;
  benefits: string[];
  card_design: { templateKey?: string } | null;
  is_active: boolean;
};
type Mine = { club_id: string; status: string; expires_at: string | null };

const money = (c: number) => `$${Number.isInteger(c / 100) ? c / 100 : (c / 100).toFixed(2)}`;

export function ClubMembershipBuySection({ clubId }: { clubId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [mine, setMine] = useState<Mine | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    const [t, m] = await Promise.all([getClubMembershipTiers({ clubId }), getMyClubMemberships({})]);
    if (t.ok) setTiers((t.data as Tier[]).filter((x) => x.is_active));
    if (m.ok) setMine(((m.data as Mine[]) ?? []).find((x) => x.club_id === clubId) ?? null);
  }, [clubId]);

  useEffect(() => { void load(); }, [load]);

  const buy = (tierId: string) => {
    start(async () => {
      const res = await requestClubMembership({ clubId, tierId });
      if (!res.ok) { toast({ icon: "alert-triangle", title: "No se pudo iniciar la compra", sub: res.error.message }); return; }
      router.push(`/pagos/${res.data.transactionId}`);
    });
  };

  if (!tiers || tiers.length === 0) return null; // el club no ofrece membresías

  const active = mine && isClubMembershipActive({ status: mine.status, expires_at: mine.expires_at });
  const isPending = mine?.status === "pending";

  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
          Membresías VIP<span className="dot">.</span>
        </h3>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--muted-fg)" }}>
          {active ? "Ya eres miembro de este club." : isPending ? "Tienes una compra pendiente: sube tu comprobante." : "Hazte miembro y obtén tu tarjeta + beneficios."}
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 12 }}>
        {tiers.map((t) => {
          const tpl = membershipTemplate(t.card_design?.templateKey);
          return (
            <div key={t.id} style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
              <div style={{ background: tpl.bg, color: tpl.fg, padding: 14, display: "flex", flexDirection: "column", gap: 8, minHeight: 92 }}>
                <span className="font-heading" style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase" }}>{t.name}</span>
                <span style={{ fontSize: 15, fontWeight: 900, color: tpl.accent }}>{money(t.price_cents)} <span style={{ fontSize: 11, color: tpl.muted, fontWeight: 600 }}>/ {t.duration_months}m</span></span>
                {t.discount_pct > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: tpl.muted }}>{t.discount_pct}% descuento en el club</span>}
              </div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {t.benefits?.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: "var(--muted-fg)", display: "flex", flexDirection: "column", gap: 2 }}>
                    {t.benefits.slice(0, 4).map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                )}
                <button
                  className="btn btn-primary"
                  onClick={() => buy(t.id)}
                  disabled={pending || !!active}
                  style={{ marginTop: "auto", justifyContent: "center", opacity: active ? 0.5 : 1 }}
                >
                  {active ? "Ya eres miembro" : isPending ? "Cambiar / re-pagar" : "Hazte miembro"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
