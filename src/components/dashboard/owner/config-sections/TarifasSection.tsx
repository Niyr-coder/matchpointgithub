"use client";
// Sección Tarifas del Club Config v2.
//   - Matriz court_pricing: READ-ONLY (derivada de bandas activas). Para
//     editar precio detallado el owner va a Canchas → Tarifas.
//   - Tiers: cableado a upsertMembershipTier / deleteMembershipTier.
//   - Surge: toggle peak_surge_enabled + input peak_surge_pct.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  updatePeakSurge,
  upsertMembershipTier,
  deleteMembershipTier,
} from "@/server/actions/club-config-tarifas";
import { VisualToggle, type SectionToast } from "./_shared";

export type TarifaCell = {
  morningCents: number;
  afternoonCents: number;
  peakCents: number;
  weekendCents: number;
};
export type TarifaRow = {
  key: string;
  label: string;
  sub: string;
  color: string;
  prices: TarifaCell;
};
export type MembershipTier = {
  id: string;
  name: string;
  priceMonthlyCents: number;
  discountPct: number;
  benefits: string[];
  color: string;
  activeCount: number;
  popular: boolean;
};
export type TarifasData = {
  clubId?: string;
  rows: TarifaRow[];
  tiers: MembershipTier[];
  peakSurgeEnabled: boolean;
  peakSurgePct: number;
};

const COLS = [
  { k: "morning", l: "Mañana", sub: "06:00–12:00", icon: "sunrise", highlight: false },
  { k: "afternoon", l: "Tarde", sub: "12:00–17:00", icon: "sun", highlight: false },
  { k: "peak", l: "Pico", sub: "17:00–22:00", icon: "flame", highlight: true },
  { k: "weekend", l: "Fin de semana", sub: "Sáb + Dom", icon: "calendar-days", highlight: true },
] as const;

const DEFAULT_ROWS: TarifaRow[] = [
  { key: "std", label: "Cancha estándar", sub: "5 canchas outdoor", color: "#10b981", prices: { morningCents: 1200, afternoonCents: 1400, peakCents: 1800, weekendCents: 2000 } },
  { key: "indoor", label: "Cancha indoor", sub: "1 cancha · Centro", color: "#0a0a0a", prices: { morningCents: 1400, afternoonCents: 1600, peakCents: 2200, weekendCents: 2400 } },
];

const DEFAULT_TIERS: MembershipTier[] = [
  { id: "demo-1", name: "Socio Plus", priceMonthlyCents: 2900, discountPct: 15, benefits: ["Reserva 14 días antes", "2 invitados/mes"], color: "#10b981", activeCount: 0, popular: false },
  { id: "demo-2", name: "Socio Pro", priceMonthlyCents: 5900, discountPct: 25, benefits: ["Reserva 21 días antes", "5 invitados/mes"], color: "#0a0a0a", activeCount: 0, popular: true },
];

function fmt(cents: number): number {
  return Math.round(cents / 100);
}

type TierDraft = {
  id?: string;
  name: string;
  priceMonthlyCents: number;
  durationMonths: number;
  discountPct: number;
  benefits: string[];
  color: string;
  popular: boolean;
};

function tierToDraft(t: MembershipTier): TierDraft {
  return {
    id: t.id,
    name: t.name,
    priceMonthlyCents: t.priceMonthlyCents,
    durationMonths: 1,
    discountPct: t.discountPct,
    benefits: t.benefits.length ? t.benefits : [""],
    color: t.color,
    popular: t.popular,
  };
}

function emptyDraft(): TierDraft {
  return { name: "", priceMonthlyCents: 0, durationMonths: 1, discountPct: 0, benefits: [""], color: "#10b981", popular: false };
}

export function TarifasSection({
  onAction,
  data,
}: {
  onAction: SectionToast;
  data?: TarifasData;
}) {
  const router = useRouter();
  const toast = useToast();
  const isDemo = !data;
  const rows = data?.rows ?? DEFAULT_ROWS;
  const tiers = data?.tiers ?? DEFAULT_TIERS;
  const clubId = data?.clubId ?? null;

  const [surgeEnabled, setSurgeEnabled] = useState<boolean>(data?.peakSurgeEnabled ?? false);
  const [surgePct, setSurgePct] = useState<number>(data?.peakSurgePct ?? 20);
  const [surgePending, startSurge] = useTransition();

  const [tierModal, setTierModal] = useState<TierDraft | null>(null);
  const [tierPending, startTier] = useTransition();
  const [tierErr, setTierErr] = useState<string | null>(null);

  const persistSurge = (enabled: boolean, pct: number) => {
    if (!clubId) {
      toast({ icon: "alert-circle", title: "No hay club activo" });
      return;
    }
    startSurge(async () => {
      const res = await updatePeakSurge({ clubId, enabled, pct });
      if (!res.ok) {
        toast({ icon: "alert-circle", title: "No se pudo guardar surge", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: enabled ? "Surge activado" : "Surge desactivado" });
      router.refresh();
    });
  };

  const onToggleSurge = () => {
    const next = !surgeEnabled;
    setSurgeEnabled(next);
    persistSurge(next, surgePct);
  };

  const onSaveTier = () => {
    setTierErr(null);
    if (!tierModal) return;
    if (!clubId) {
      setTierErr("No hay club activo");
      return;
    }
    if (tierModal.name.trim().length < 2) {
      setTierErr("El nombre del tier es obligatorio");
      return;
    }
    const benefitsClean = tierModal.benefits.map((b) => b.trim()).filter((b) => b.length > 0);
    startTier(async () => {
      const res = await upsertMembershipTier({
        clubId,
        tierId: tierModal.id,
        name: tierModal.name.trim(),
        priceMonthlyCents: Math.round(tierModal.priceMonthlyCents),
        durationMonths: tierModal.durationMonths,
        discountPct: tierModal.discountPct,
        benefits: benefitsClean,
        color: tierModal.color,
        popular: tierModal.popular,
      });
      if (!res.ok) {
        setTierErr(res.error.message);
        return;
      }
      toast({ icon: "check-circle-2", title: tierModal.id ? "Tier actualizado" : "Tier creado" });
      setTierModal(null);
      router.refresh();
    });
  };

  const onDeleteTier = (tier: MembershipTier) => {
    if (!tier.id || tier.id.startsWith("demo-")) return;
    if (!confirm(`¿Eliminar el tier "${tier.name}"? Los socios activos no se ven afectados.`)) return;
    startTier(async () => {
      const res = await deleteMembershipTier({ tierId: tier.id });
      if (!res.ok) {
        toast({ icon: "alert-circle", title: "No se pudo eliminar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Tier eliminado" });
      router.refresh();
    });
  };

  return (
    <>
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp">Tarifas · USD por hora</div>
            <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Matriz de precios<span className="dot">.</span></h3>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4 }}>Vista derivada de las bandas activas por cancha. Para editar precios detallados ve a <b>Canchas → Tarifas</b>.</div>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={() => onAction("Ve a Canchas → Tarifas para editar bandas detalladas")}><Icon name="external-link" size={11} color="#fff" />Editar tarifas detalladas</button>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--muted-fg)", fontSize: 12 }}>
            No hay canchas activas en este club todavía. Crea una cancha desde <b>Canchas</b> para configurar tarifas.
          </div>
        ) : (
          <div className="mp-table-scroll">
            <div style={{ minWidth: 620, display: "grid", gridTemplateColumns: "200px repeat(4, 1fr)", gap: 6 }}>
              <div />
              {COLS.map((c) => (
                <div key={c.k} style={{ padding: "10px 12px", background: c.highlight ? "rgba(251,191,36,0.1)" : "var(--muted)", borderRadius: 8, textAlign: "center", border: c.highlight ? "1px solid rgba(251,191,36,0.4)" : "1px solid transparent" }}>
                  <Icon name={c.icon} size={14} color={c.highlight ? "#92400e" : "var(--muted-fg)"} />
                  <div style={{ fontSize: 10.5, fontWeight: 900, marginTop: 4, color: c.highlight ? "#78350f" : "#0a0a0a" }}>{c.l}</div>
                  <div style={{ fontSize: 9, color: c.highlight ? "#92400e" : "var(--muted-fg)", marginTop: 1 }}>{c.sub}</div>
                </div>
              ))}
              {rows.map((r) => (
                <div key={r.key} style={{ display: "contents" }}>
                  <div style={{ padding: "14px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: r.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon name="land-plot" size={13} color="#fff" />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 900 }}>{r.label}</div>
                      <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{r.sub}</div>
                    </div>
                  </div>
                  {COLS.map((c) => {
                    const cents = c.k === "morning" ? r.prices.morningCents : c.k === "afternoon" ? r.prices.afternoonCents : c.k === "peak" ? r.prices.peakCents : r.prices.weekendCents;
                    const empty = cents === 0;
                    return (
                      <button
                        key={c.k}
                        onClick={() => onAction("Edita precios desde Canchas → Tarifas")}
                        style={{ padding: "14px 12px", background: empty ? "#fafafa" : c.highlight ? "#fffbeb" : "#fff", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}
                        title="Editar en Canchas → Tarifas"
                      >
                        <span className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", color: empty ? "var(--muted-fg)" : c.highlight ? "#92400e" : "#0a0a0a" }}>
                          {empty ? "—" : `$${fmt(cents)}`}
                        </span>
                        <span style={{ fontSize: 8.5, color: "var(--muted-fg)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>/ hora</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, padding: 14, background: "rgba(251,191,36,0.08)", borderRadius: 10, display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(251,191,36,0.25)" }}>
          <Icon name="zap" size={16} color="#92400e" />
          <div style={{ flex: 1, fontSize: 11, color: "#78350f" }}>
            <b>Surge {surgeEnabled ? "activado" : "desactivado"}.</b> Cuando la ocupación supera el 80% en franja pico, las tarifas suben +
            <input
              type="number"
              min={0}
              max={200}
              value={surgePct}
              onChange={(e) => setSurgePct(Math.max(0, Math.min(200, parseInt(e.target.value || "0", 10))))}
              onBlur={() => {
                if (surgeEnabled) persistSurge(surgeEnabled, surgePct);
              }}
              disabled={surgePending || isDemo}
              style={{ width: 48, padding: "2px 6px", margin: "0 4px", border: "1px solid rgba(251,191,36,0.5)", borderRadius: 6, fontFamily: "inherit", fontSize: 11, textAlign: "center", background: "#fff" }}
            />
            % por 1 hora.
          </div>
          <VisualToggle on={surgeEnabled} onClick={isDemo ? undefined : onToggleSurge} />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 10 }}>
          <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: 0 }}>Membresías y descuentos<span className="dot">.</span></h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{tiers.length} tiers · {tiers.reduce((s, t) => s + t.activeCount, 0)} socios activos</span>
            <button className="btn btn-primary" style={{ fontSize: 10 }} disabled={isDemo} onClick={() => setTierModal(emptyDraft())}>
              <Icon name="plus" size={11} color="#fff" />Nuevo tier
            </button>
          </div>
        </div>
        <div className="mp-ccfg-tiers mp-grid-form-3 gap-3.5">
          {tiers.map((m) => (
            <div key={m.id} className="card" style={{ padding: 18, position: "relative", borderColor: m.popular ? "var(--primary)" : "var(--border)", borderWidth: m.popular ? 2 : 1 }}>
              {m.popular && <span style={{ position: "absolute", top: -10, right: 14, padding: "3px 10px", borderRadius: 9999, background: "var(--primary)", color: "#fff", fontSize: 9, fontWeight: 900, letterSpacing: "0.12em" }}>● MÁS POPULAR</span>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 9999, background: m.color, color: m.color === "#fbbf24" ? "#78350f" : "#fff", fontSize: 9, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>{m.name}</div>
                  <div className="font-heading" style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.035em", marginTop: 8 }}>${fmt(m.priceMonthlyCents)}/mes</div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "var(--primary)", marginTop: 2 }}>● {m.discountPct}% en todas las reservas</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="label-mp">Socios</div>
                  <div className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{m.activeCount}</div>
                </div>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0" }}>
                {m.benefits.map((b) => (
                  <li key={b} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 11, color: "#0a0a0a" }}>
                    <Icon name="check" size={13} color="var(--primary)" style={{ flexShrink: 0 }} />{b}
                  </li>
                ))}
              </ul>
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                <button
                  className="btn"
                  style={{ flex: 1, background: "#fff", border: "1px solid var(--border)", fontSize: 10.5 }}
                  disabled={isDemo}
                  onClick={() => setTierModal(tierToDraft(m))}
                >
                  <Icon name="edit-3" size={11} />Editar
                </button>
                {!m.id.startsWith("demo-") && (
                  <button
                    className="btn"
                    style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10.5, color: "#dc2626" }}
                    disabled={isDemo || tierPending}
                    onClick={() => onDeleteTier(m)}
                    title="Eliminar tier"
                  >
                    <Icon name="trash-2" size={11} color="#dc2626" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {tierModal && (
        <TierModal
          draft={tierModal}
          setDraft={setTierModal}
          onSave={onSaveTier}
          onCancel={() => {
            setTierModal(null);
            setTierErr(null);
          }}
          pending={tierPending}
          err={tierErr}
        />
      )}
    </>
  );
}

function TierModal({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending,
  err,
}: {
  draft: TierDraft;
  setDraft: (d: TierDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
  err: string | null;
}) {
  const update = <K extends keyof TierDraft>(k: K, v: TierDraft[K]) => setDraft({ ...draft, [k]: v });
  const updateBenefit = (i: number, v: string) => {
    const next = [...draft.benefits];
    next[i] = v;
    setDraft({ ...draft, benefits: next });
  };
  const addBenefit = () => setDraft({ ...draft, benefits: [...draft.benefits, ""] });
  const removeBenefit = (i: number) => setDraft({ ...draft, benefits: draft.benefits.filter((_, idx) => idx !== i) });

  const COLORS = ["#10b981", "#0a0a0a", "#fbbf24", "#3b82f6", "#a855f7", "#ef4444"];

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
      onClick={onCancel}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 480, padding: 22, maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "0 0 14px" }}>
          {draft.id ? "Editar tier" : "Nuevo tier"}<span className="dot">.</span>
        </h3>

        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" }}>Nombre</span>
            <input
              value={draft.name}
              onChange={(e) => update("name", e.target.value)}
              style={{ width: "100%", marginTop: 4, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: "#fff" }}
              placeholder="Socio Plus"
            />
          </label>

          <div className="mp-tournament-form-grid-3">
            <label>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Precio /mes (¢)</span>
              <input
                type="number"
                min={0}
                value={draft.priceMonthlyCents}
                onChange={(e) => update("priceMonthlyCents", parseInt(e.target.value || "0", 10))}
                style={{ width: "100%", marginTop: 4, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: "#fff" }}
              />
            </label>
            <label>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Duración (meses)</span>
              <input
                type="number"
                min={1}
                max={60}
                value={draft.durationMonths}
                onChange={(e) => update("durationMonths", Math.max(1, parseInt(e.target.value || "1", 10)))}
                style={{ width: "100%", marginTop: 4, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: "#fff" }}
              />
            </label>
            <label>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Descuento %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={draft.discountPct}
                onChange={(e) => update("discountPct", Math.max(0, Math.min(100, parseInt(e.target.value || "0", 10))))}
                style={{ width: "100%", marginTop: 4, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: "#fff" }}
              />
            </label>
          </div>

          <div>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Color</span>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => update("color", c)}
                  style={{ width: 28, height: 28, borderRadius: 8, background: c, border: draft.color === c ? "3px solid #0a0a0a" : "1px solid var(--border)", cursor: "pointer" }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={draft.popular} onChange={(e) => update("popular", e.target.checked)} />
            <span style={{ fontSize: 12 }}>Marcar como <b>“Más popular”</b></span>
          </label>

          <div>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Beneficios</span>
            <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
              {draft.benefits.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 6 }}>
                  <input
                    value={b}
                    onChange={(e) => updateBenefit(i, e.target.value)}
                    placeholder={`Beneficio ${i + 1}`}
                    style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: "#fff" }}
                  />
                  {draft.benefits.length > 1 && (
                    <button type="button" onClick={() => removeBenefit(i)} className="btn" style={{ background: "#fff", border: "1px solid var(--border)", color: "#dc2626" }} aria-label="Quitar beneficio">
                      <Icon name="x" size={12} color="#dc2626" />
                    </button>
                  )}
                </div>
              ))}
              {draft.benefits.length < 12 && (
                <button type="button" onClick={addBenefit} className="btn" style={{ alignSelf: "flex-start", background: "#fff", border: "1px solid var(--border)", fontSize: 11 }}>
                  <Icon name="plus" size={11} />Agregar beneficio
                </button>
              )}
            </div>
          </div>

          {err && <div style={{ fontSize: 11, color: "#dc2626" }}>{err}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={onCancel} disabled={pending}>Cancelar</button>
            <button className="btn btn-primary" onClick={onSave} disabled={pending}>
              <Icon name={pending ? "loader-2" : "save"} size={13} color="#fff" />{pending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
