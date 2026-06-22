"use client";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { VisualToggle, type SectionToast } from "./_shared";
import { updateCancellationPolicy } from "@/server/actions/club-config-cancel";

export type CancelTier = {
  hours: number;
  refundPct: number;
  label: string;
  sub: string;
  color: string;
};
export type CancelRule = {
  key: string;
  label: string;
  sub: string;
  enabled: boolean;
};
export type CancelStats = {
  reservationsMonth: number;
  cancellationsMonth: number;
  noShowsMonth: number;
};
export type CancelacionData = {
  tiers: CancelTier[];
  rules: CancelRule[];
  noShowPenaltyCents: number;
  stats: CancelStats;
};

const DEFAULT_TIERS: CancelTier[] = [
  { hours: 24, refundPct: 100, label: "24 h o más antes", sub: "Reembolso íntegro al método de pago", color: "var(--primary)" },
  { hours: 12, refundPct: 75, label: "Entre 24 y 12 h", sub: "25% se queda como crédito MP", color: "#34d399" },
  { hours: 4, refundPct: 50, label: "Entre 12 y 4 h", sub: "Mitad como crédito MP, mitad para el club", color: "#fbbf24" },
  { hours: 0, refundPct: 0, label: "Menos de 4 h", sub: "Sin reembolso — la cancha ya se separó", color: "#dc2626" },
  { hours: -1, refundPct: 0, label: "No se presentó", sub: "Penalización + bloqueo 24h para reservar", color: "#7c1d1d" },
];

const DEFAULT_RULES: CancelRule[] = [
  { key: "rain", label: "Lluvia en canchas outdoor", sub: "100% reembolso siempre · automático cuando el sensor activa", enabled: true },
  { key: "maintenance", label: "Cierre por mantenimiento", sub: "Si tú cancelas: 100% reembolso + crédito de 1 hora cortesía", enabled: true },
  { key: "members", label: "Socios Plus / Pro", sub: "Primer no-show del mes sin penalización", enabled: true },
  { key: "groups", label: "Reservas grupales (6+)", sub: "Política especial: 48h para cancelar al 100%", enabled: false },
];

const DEFAULT_STATS: CancelStats = {
  reservationsMonth: 0,
  cancellationsMonth: 0,
  noShowsMonth: 0,
};

const AGGRESSIVE_TIERS_PCT: Record<number, number> = {
  24: 60,
  12: 40,
  4: 25,
  0: 0,
};
const AGGRESSIVE_NO_SHOW_CENTS = 1000;

function fmtMoney(cents: number, neg = false): string {
  const dollars = Math.round(Math.abs(cents) / 100);
  return `${neg ? "–" : ""}$${dollars.toLocaleString("en-US")}`;
}

function hoursLabel(h: number): string {
  if (h < 0) return "N/S";
  if (h === 0) return "–4h";
  if (h >= 24) return `+${h}h`;
  return `${h}h`;
}

export function CancelacionSection({
  onAction,
  data,
  clubId,
}: {
  onAction: SectionToast;
  data?: CancelacionData;
  clubId?: string;
}) {
  const [tiers, setTiers] = useState<CancelTier[]>(data?.tiers ?? DEFAULT_TIERS);
  const rules = data?.rules ?? DEFAULT_RULES;
  const [noShowPenalty, setNoShowPenalty] = useState<number>(data?.noShowPenaltyCents ?? 500);
  const [editing, setEditing] = useState<number | null>(null);
  const [isSaving, startSave] = useTransition();
  const stats = data?.stats ?? DEFAULT_STATS;

  const cancRate = stats.reservationsMonth > 0
    ? `${((stats.cancellationsMonth / stats.reservationsMonth) * 100).toFixed(1)}%`
    : "—";
  const noShowRate = stats.reservationsMonth > 0
    ? `${((stats.noShowsMonth / stats.reservationsMonth) * 100).toFixed(1)}%`
    : "—";

  const setTierPct = (idx: number, pct: number) => {
    setTiers((prev) => prev.map((t, i) => (i === idx ? { ...t, refundPct: Math.max(0, Math.min(100, pct)) } : t)));
  };

  const applyAggressive = () => {
    setTiers((prev) =>
      prev.map((t) => {
        if (t.hours < 0) return t;
        const pct = AGGRESSIVE_TIERS_PCT[t.hours];
        return pct != null ? { ...t, refundPct: pct } : t;
      }),
    );
    setNoShowPenalty(AGGRESSIVE_NO_SHOW_CENTS);
    onAction("Política agresiva aplicada (no olvides guardar)");
  };

  const save = () => {
    if (!clubId) {
      onAction("Falta clubId — no se puede guardar");
      return;
    }
    const payload = {
      clubId,
      tiers: tiers.map((t) => ({ hours: t.hours, refundPct: t.refundPct })),
      noShowPenaltyCents: noShowPenalty,
    };
    startSave(async () => {
      const res = await updateCancellationPolicy(payload);
      if (res.ok) onAction("Política guardada");
      else onAction(`Error: ${res.error.message}`);
    });
  };

  return (
    <>
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp">Política · reservas regulares</div>
            <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Línea de tiempo de cancelación<span className="dot">.</span></h3>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>Cuánto le devuelves a un jugador según cuánto antes cancele.</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={applyAggressive}><Icon name="zap" size={11} />Política agresiva</button>
            <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={save} disabled={isSaving}><Icon name="check" size={11} color="#fff" />{isSaving ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>

        <div className="mp-touch-hscroll">
          <div style={{ minWidth: 560, position: "relative", padding: "20px 0 40px" }}>
            <div style={{ position: "absolute", top: 36, left: "5%", right: "5%", height: 4, borderRadius: 9999, background: "linear-gradient(90deg, var(--primary) 0%, #34d399 25%, #fbbf24 50%, #dc2626 75%, #7c1d1d 100%)" }} />
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiers.length}, 1fr)`, gap: 8, position: "relative" }}>
              {tiers.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setEditing(i)}
                  style={{ textAlign: "center", background: "transparent", border: 0, padding: 0, cursor: "pointer" }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: s.color, color: "#fff", margin: "0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "3px solid #fff", boxShadow: "0 0 0 1px " + s.color, position: "relative", zIndex: 1 }}>
                    <span className="font-heading" style={{ fontSize: 11, fontWeight: 900, letterSpacing: "-0.01em" }}>{hoursLabel(s.hours)}</span>
                  </div>
                  <div className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", marginTop: 10, color: s.color }}>
                    {s.hours < 0 ? fmtMoney(noShowPenalty, true) : `${s.refundPct}%`}
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 900, color: "#0a0a0a", marginTop: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 4, lineHeight: 1.35 }}>{s.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mp-tournament-form-grid-3" style={{ marginTop: 8, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
          {[
            { l: "Reservas /mes", v: String(stats.reservationsMonth), sub: "reservas pagas" },
            { l: "Cancelaciones", v: cancRate, sub: `${stats.cancellationsMonth} cancelaciones` },
            { l: "No-shows", v: noShowRate, sub: `${stats.noShowsMonth} multas cobradas` },
          ].map((k) => (
            <div key={k.l} style={{ padding: 12, background: "var(--muted)", borderRadius: 8 }}>
              <div className="label-mp">{k.l}</div>
              <div className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", marginTop: 4 }}>{k.v}</div>
              <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 1 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 22, marginTop: 14 }}>
        <div className="label-mp">Excepciones · reglas finas</div>
        <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>Casos especiales<span className="dot">.</span></h3>
        <div style={{ fontSize: 10, color: "var(--muted-fg)", marginBottom: 8, fontStyle: "italic" }}>
          Estas reglas aún no tienen backend. Se muestran como referencia y no son editables todavía.
        </div>
        {rules.map((r, i) => (
          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{r.label}</div>
              <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>{r.sub}</div>
            </div>
            <VisualToggle on={r.enabled} />
          </div>
        ))}
      </div>

      {editing != null && tiers[editing] && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={() => setEditing(null)}>
          <div className="card" style={{ padding: 22, width: "100%", maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="label-mp">Editar tier</div>
            <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>{tiers[editing].label}<span className="dot">.</span></h3>

            {tiers[editing].hours < 0 ? (
              <>
                <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Penalización por no-show (USD)</label>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={Math.round(noShowPenalty / 100)}
                  onChange={(e) => setNoShowPenalty(Math.max(0, Number(e.target.value) || 0) * 100)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, marginBottom: 14 }}
                />
              </>
            ) : (
              <>
                <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Reembolso (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={tiers[editing].refundPct}
                  onChange={(e) => setTierPct(editing, Number(e.target.value) || 0)}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, marginBottom: 14 }}
                />
              </>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => setEditing(null)}>Listo</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
