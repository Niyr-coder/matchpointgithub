"use client";

// Gestión de membresías VIP del club (owner/manager): tiers + miembros + aprobar.
import { useCallback, useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import {
  getClubMembershipTiers,
  getClubMembers,
  saveClubMembershipTier,
  deleteClubMembershipTier,
  approveClubMembership,
  rejectClubMembership,
  revokeClubMembership,
} from "@/server/actions/club-memberships";
import {
  MEMBERSHIP_CARD_TEMPLATES,
  membershipTemplate,
  DEFAULT_MEMBERSHIP_TEMPLATE_KEY,
  type MembershipCardDesign,
} from "@/lib/clubs/membership";

type Tier = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  duration_months: number;
  discount_pct: number;
  benefits: string[];
  card_design: MembershipCardDesign;
  sort_order: number;
  is_active: boolean;
};
type Member = {
  id: string;
  user_id: string;
  status: string;
  member_no: number | null;
  starts_at: string | null;
  expires_at: string | null;
  profiles: { display_name: string | null; username: string | null } | null;
  club_membership_tiers: { name: string | null } | null;
};

const money = (c: number) => `$${Number.isInteger(c / 100) ? c / 100 : (c / 100).toFixed(2)}`;
const dateLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }) : "—");
const nameOf = (p: Member["profiles"]) => p?.display_name || (p?.username ? `@${p.username}` : "Jugador");

const STATUS_META: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pendiente", tone: "#b45309" },
  active: { label: "Activa", tone: "var(--success-fg)" },
  expired: { label: "Vencida", tone: "var(--muted-fg)" },
  cancelled: { label: "Cancelada", tone: "var(--destructive-fg)" },
  rejected: { label: "Rechazada", tone: "var(--destructive-fg)" },
};

export function ClubMembershipsView({ clubId }: { clubId: string }) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Tier | "new" | null>(null);
  const [, startTx] = useTransition();

  const reload = useCallback(async () => {
    const [t, m] = await Promise.all([getClubMembershipTiers({ clubId }), getClubMembers({ clubId })]);
    if (t.ok) setTiers(t.data as Tier[]);
    if (m.ok) setMembers(m.data as Member[]);
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const del = async (tier: Tier) => {
    const ok = await confirm({ title: "Borrar tier", body: `¿Borrar la membresía "${tier.name}"?`, confirmLabel: "Borrar", cancelLabel: "Cancelar", destructive: true });
    if (!ok) return;
    startTx(async () => {
      const res = await deleteClubMembershipTier({ tierId: tier.id });
      if (!res.ok) { toast({ icon: "alert-triangle", title: "No se pudo borrar", sub: res.error.message }); return; }
      toast({ icon: "check", title: "Tier borrado" });
      await reload();
    });
  };

  const act = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>, okMsg: string) => {
    startTx(async () => {
      const res = await fn();
      if (!res.ok) { toast({ icon: "alert-triangle", title: "No se pudo", sub: res.error?.message }); return; }
      toast({ icon: "check", title: okMsg });
      await reload();
    });
  };

  const pending = members.filter((m) => m.status === "pending");
  const others = members.filter((m) => m.status !== "pending");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ position: "relative", overflow: "hidden", borderRadius: "var(--radius-mp-card, 14.4px)", padding: 22, background: "linear-gradient(135deg, #0a0a0a 0%, #18162e 58%, #3b0764 100%)", color: "#fff" }}>
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Membresías</div>
        <h2 className="font-heading" style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
          Membresías VIP<span style={{ color: "#34d399" }}>.</span>
        </h2>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", marginTop: 8 }}>
          {tiers.length} nivel{tiers.length === 1 ? "" : "es"} · {members.filter((m) => m.status === "active").length} miembros activos
        </div>
      </div>

      {/* Tiers */}
      <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>Niveles<span className="dot">.</span></h3>
          <button className="btn btn-primary" onClick={() => setEditing("new")}><Icon name="plus" size={13} color="#fff" /> Nuevo nivel</button>
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Cargando…</div>
        ) : tiers.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--muted-fg)" }}>Aún no creas niveles de membresía. Crea el primero para que tus socios compren.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 12 }}>
            {tiers.map((t) => {
              const tpl = membershipTemplate(t.card_design?.templateKey);
              return (
                <div key={t.id} style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
                  <div style={{ background: tpl.bg, color: tpl.fg, padding: 14, minHeight: 84, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                      <span className="font-heading" style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase" }}>{t.name}</span>
                      {!t.is_active && <span style={{ fontSize: 9, fontWeight: 900, padding: "2px 6px", borderRadius: 9999, background: "rgba(0,0,0,0.35)", color: "#fff" }}>OCULTO</span>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: tpl.accent }}>{money(t.price_cents)} <span style={{ color: tpl.muted, fontWeight: 600 }}>/ {t.duration_months}m</span></div>
                  </div>
                  <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                    {t.discount_pct > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--success-fg)" }}>{t.discount_pct}% de descuento</span>}
                    {t.benefits?.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: "var(--muted-fg)", display: "flex", flexDirection: "column", gap: 2 }}>
                        {t.benefits.slice(0, 4).map((b, i) => <li key={i}>{b}</li>)}
                      </ul>
                    )}
                    <div style={{ marginTop: "auto", display: "flex", gap: 6 }}>
                      <button className="btn" onClick={() => setEditing(t)} style={{ flex: 1, justifyContent: "center", background: "#fff", border: "1px solid var(--border)", padding: "7px 10px" }}><Icon name="pencil" size={12} /> Editar</button>
                      <button className="btn" onClick={() => del(t)} aria-label="Borrar" style={{ background: "#fff", border: "1px solid var(--destructive-border)", color: "var(--destructive-fg)", padding: "7px 10px" }}><Icon name="trash-2" size={12} color="var(--destructive-fg)" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Solicitudes pendientes de pago */}
      {pending.length > 0 && (
        <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>Por aprobar<span className="dot">.</span></h3>
          {pending.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", border: "1px solid var(--border)", borderRadius: 10, flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 120, fontSize: 13, fontWeight: 700 }}>{nameOf(m.profiles)}</span>
              <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>{m.club_membership_tiers?.name ?? "—"}</span>
              <button className="btn btn-primary" onClick={() => act(() => approveClubMembership({ membershipId: m.id }), "Membresía activada")} style={{ padding: "6px 12px" }}><Icon name="check" size={12} color="#fff" /> Aprobar</button>
              <button className="btn" onClick={() => act(() => rejectClubMembership({ membershipId: m.id }), "Comprobante rechazado")} style={{ padding: "6px 12px", background: "#fff", border: "1px solid var(--destructive-border)", color: "var(--destructive-fg)" }}>Rechazar</button>
            </div>
          ))}
        </div>
      )}

      {/* Miembros */}
      <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>Miembros<span className="dot">.</span></h3>
        {others.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--muted-fg)" }}>Todavía no hay miembros activos.</div>
        ) : (
          others.map((m) => {
            const sm = STATUS_META[m.status] ?? { label: m.status, tone: "var(--muted-fg)" };
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: "var(--muted-fg)", minWidth: 38 }}>{m.member_no != null ? `#${String(m.member_no).padStart(3, "0")}` : "—"}</span>
                <span style={{ flex: 1, minWidth: 120, fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(m.profiles)}</span>
                <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>{m.club_membership_tiers?.name ?? "—"}</span>
                <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>vence {dateLabel(m.expires_at)}</span>
                <span style={{ fontSize: 10.5, fontWeight: 900, color: sm.tone }}>{sm.label}</span>
                {m.status === "active" && (
                  <button className="btn" onClick={() => act(() => revokeClubMembership({ membershipId: m.id }), "Membresía cancelada")} aria-label="Revocar" style={{ padding: "5px 9px", background: "#fff", border: "1px solid var(--destructive-border)", color: "var(--destructive-fg)" }}><Icon name="x" size={12} color="var(--destructive-fg)" /></button>
                )}
              </div>
            );
          })
        )}
      </div>

      {editing && (
        <TierEditor
          clubId={clubId}
          tier={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
        />
      )}
    </div>
  );
}

function TierEditor({ clubId, tier, onClose, onSaved }: { clubId: string; tier: Tier | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(tier?.name ?? "");
  const [description, setDescription] = useState(tier?.description ?? "");
  const [price, setPrice] = useState(tier ? String(tier.price_cents / 100) : "");
  const [months, setMonths] = useState(tier ? String(tier.duration_months) : "1");
  const [discount, setDiscount] = useState(tier ? String(tier.discount_pct) : "0");
  const [benefits, setBenefits] = useState((tier?.benefits ?? []).join("\n"));
  const [templateKey, setTemplateKey] = useState(tier?.card_design?.templateKey ?? DEFAULT_MEMBERSHIP_TEMPLATE_KEY);
  const [isActive, setIsActive] = useState(tier?.is_active ?? true);

  const save = () => {
    if (pending) return;
    if (name.trim().length < 2) { toast({ icon: "alert-triangle", title: "Ponle un nombre al nivel" }); return; }
    const priceCents = Math.round(parseFloat(price || "0") * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) { toast({ icon: "alert-triangle", title: "Precio inválido" }); return; }
    start(async () => {
      const res = await saveClubMembershipTier({
        clubId,
        tierId: tier?.id,
        name: name.trim(),
        description: description.trim() || null,
        priceCents,
        durationMonths: parseInt(months, 10) || 1,
        discountPct: parseInt(discount, 10) || 0,
        benefits: benefits.split("\n").map((b) => b.trim()).filter(Boolean),
        cardTemplateKey: templateKey,
        isActive,
      });
      if (!res.ok) { toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message }); return; }
      toast({ icon: "check-circle-2", title: tier ? "Nivel actualizado" : "Nivel creado" });
      await onSaved();
    });
  };

  const tpl = membershipTemplate(templateKey);

  return (
    <div className="mp-modal-backdrop" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="mp-modal-panel card" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 12, background: "#fff" }}>
        <h3 className="font-heading" style={{ margin: 0, fontSize: 19, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>{tier ? "Editar nivel" : "Nuevo nivel"}<span className="dot">.</span></h3>

        {/* Preview de tarjeta */}
        <div style={{ background: tpl.bg, color: tpl.fg, borderRadius: 12, padding: 16, minHeight: 70, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <span className="font-heading" style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase" }}>{name || "Nombre del nivel"}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: tpl.accent }}>{price ? `$${price}` : "$0"} <span style={{ color: tpl.muted, fontWeight: 600 }}>/ {months}m</span></span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {MEMBERSHIP_CARD_TEMPLATES.map((t) => (
            <button key={t.key} type="button" onClick={() => setTemplateKey(t.key)} title={t.label} style={{ width: 30, height: 30, borderRadius: 8, background: t.bg, border: templateKey === t.key ? "2px solid var(--fg)" : "1px solid var(--border)", cursor: "pointer" }} />
          ))}
        </div>

        <Lbl t="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} style={inp} /></Lbl>
        <Lbl t="Descripción (opcional)"><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} style={inp} /></Lbl>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <Lbl t="Precio ($)"><input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} style={inp} /></Lbl>
          <Lbl t="Meses"><input type="number" min={1} max={60} value={months} onChange={(e) => setMonths(e.target.value)} style={inp} /></Lbl>
          <Lbl t="Desc. %"><input type="number" min={0} max={100} value={discount} onChange={(e) => setDiscount(e.target.value)} style={inp} /></Lbl>
        </div>
        <Lbl t="Beneficios (uno por línea)"><textarea value={benefits} onChange={(e) => setBenefits(e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} /></Lbl>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Visible para comprar
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose} style={{ background: "#fff", border: "1px solid var(--border)" }}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>{pending ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", padding: "9px 11px", border: "1px solid var(--border)", borderRadius: 9, fontFamily: "inherit", fontSize: 13, outline: "none", background: "#fff", color: "var(--fg)" };
function Lbl({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted-fg)" }}>{t}</span>
      {children}
    </label>
  );
}
