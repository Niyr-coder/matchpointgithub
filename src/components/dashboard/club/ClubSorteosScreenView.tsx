"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "@/components/dashboard/widgets/PolHero";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  MiniStat,
  MECHANIC_CATALOG,
} from "@/components/giveaways";
import { StripedImg, WizardShell } from "@/components/giveaways/handoff";
import type { GiveawayDetailView } from "@/lib/schemas/giveaways";
import {
  saveGiveawayPremio,
  saveGiveawayMechanics,
  saveGiveawayRules,
  publishGiveawayV2,
} from "@/server/actions/giveaways";
import type { ClubGiveawaysOrgOverview } from "@/server/actions/giveaways";
import { orgGiveawayPath } from "./giveaways/org-path";

const SORTEOS_TABLE_COLS = "minmax(180px,1fr) 100px 90px 140px 120px 120px";

type Props = {
  roleSegment: "owner" | "manager";
  clubId: string;
  overview: ClubGiveawaysOrgOverview;
  giveaways: GiveawayDetailView[];
  loadError?: string | null;
};

type WizardStep = 1 | 2 | 3 | 4;

export function ClubSorteosScreenView({ roleSegment, clubId, overview, giveaways, loadError }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"dashboard" | "wizard">("dashboard");
  const [step, setStep] = useState<WizardStep>(1);
  const [giveawayId, setGiveawayId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [prizeLabel, setPrizeLabel] = useState("");
  const [description, setDescription] = useState("");
  const [mechanics, setMechanics] = useState(
    MECHANIC_CATALOG.slice(0, 4).map((m) => ({
      kind: m.kind,
      enabled: m.kind === "follow" || m.kind === "reserve",
      weight: m.base,
    })),
  );
  const [eligibility, setEligibility] = useState<"followers" | "members" | "all">("followers");
  const [closesAt, setClosesAt] = useState("");
  const [drawAt, setDrawAt] = useState("");
  const [rulesText, setRulesText] = useState(
    "· Sorteo válido para jugadores en Ecuador.\n· Cada acción suma entradas según peso configurado.\n· El ganador se contacta por DM en 48h.",
  );

  const active = giveaways.filter((g) => g.status === "open" || g.status === "closing");
  const drafts = giveaways.filter((g) => g.status === "draft");
  const ended = giveaways.filter((g) => g.status === "drawn" || g.status === "closed");

  const maxEntriesPreview = mechanics.filter((m) => m.enabled).reduce((s, m) => s + m.weight, 0);

  const saveStep = () => {
    startTransition(async () => {
      if (step === 1) {
        const res = await saveGiveawayPremio({
          giveawayId: giveawayId ?? undefined,
          clubId,
          title,
          subtitle: subtitle || undefined,
          prizeLabel: prizeLabel || title,
          description: description || undefined,
        });
        if (!res.ok) {
          toast({ icon: "error", title: "Error", sub: res.error.message });
          return;
        }
        setGiveawayId(res.data.giveawayId);
        setStep(2);
        return;
      }
      if (step === 2 && giveawayId) {
        const res = await saveGiveawayMechanics({ giveawayId, mechanics });
        if (!res.ok) {
          toast({ icon: "error", title: "Error", sub: res.error.message });
          return;
        }
        setStep(3);
        return;
      }
      if (step === 3 && giveawayId) {
        const res = await saveGiveawayRules({
          giveawayId,
          eligibility,
          closesAt: closesAt ? new Date(closesAt).toISOString() : null,
          drawAt: drawAt ? new Date(drawAt).toISOString() : null,
          rules: rulesText.split("\n").map((l) => l.replace(/^·\s*/, "").trim()).filter(Boolean),
        });
        if (!res.ok) {
          toast({ icon: "error", title: "Error", sub: res.error.message });
          return;
        }
        setStep(4);
      }
    });
  };

  const onPublish = () => {
    if (!giveawayId) return;
    startTransition(async () => {
      const res = await publishGiveawayV2({ giveawayId });
      if (!res.ok) {
        toast({ icon: "error", title: "No se publicó", sub: res.error.message });
        return;
      }
      toast({ icon: "success", title: "Sorteo publicado", sub: "Ya aparece en el feed del club." });
      const publishedId = giveawayId;
      setMode("dashboard");
      setStep(1);
      setGiveawayId(null);
      router.push(orgGiveawayPath(roleSegment, publishedId!, "publicado"));
      router.refresh();
    });
  };

  if (mode === "wizard") {
    return (
      <WizardShell
        step={step}
        pending={pending}
        primaryLabel={step === 4 ? "Publicar sorteo" : "Continuar"}
        onBack={step > 1 ? () => setStep((s) => (s - 1) as WizardStep) : undefined}
        onPrimary={step === 4 ? onPublish : saveStep}
        onSaveDraft={() => toast({ icon: "info", title: "Borrador guardado", sub: "Puedes continuar cuando quieras." })}
      >
        {step === 1 && (
          <div className="mp-club-sorteos-wizard">
            <div>
              <span className="label-mp">Foto del premio</span>
              <div
                style={{
                  marginTop: 6,
                  height: 240,
                  borderRadius: 12,
                  border: "2px dashed var(--border)",
                  background: "var(--muted)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  color: "var(--muted-fg)",
                }}
              >
                <Icon name="image-up" size={28} />
                <div style={{ fontSize: 12, fontWeight: 700 }}>Sube una foto del premio</div>
                <div style={{ fontSize: 10.5 }}>PNG · JPG · máx. 4MB</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "block" }}>
                <span className="label-mp">Título del sorteo</span>
                <input
                  className="mp-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej. Sorteo de raquetas Pro"
                  style={{ marginTop: 6 }}
                />
              </label>
              <label style={{ display: "block" }}>
                <span className="label-mp">Subtítulo / valor</span>
                <input
                  className="mp-input"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="Ej. Valor $120 · patrocinado por Wilson"
                  style={{ marginTop: 6 }}
                />
              </label>
              <label style={{ display: "block" }}>
                <span className="label-mp">Descripción larga</span>
                <textarea
                  className="mp-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Cuenta qué incluye el premio, condiciones y detalles para los jugadores."
                  rows={4}
                  style={{ marginTop: 6 }}
                />
              </label>
              <label style={{ display: "block" }}>
                <span className="label-mp">Premio (etiqueta)</span>
                <input
                  className="mp-input"
                  value={prizeLabel}
                  onChange={(e) => setPrizeLabel(e.target.value)}
                  placeholder="Ej. Raqueta Pro · talla M"
                  style={{ marginTop: 6 }}
                />
              </label>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="mp-landing-split" style={{ gap: 28 }}>
            <div>
              <div style={{ fontSize: 12.5, color: "var(--fg)", lineHeight: 1.55, marginBottom: 14 }}>
                <b>Decide qué acciones suman entradas y cuánto pesan.</b> Cada acción es una vía para participar. El jugador puede combinarlas para maximizar sus entradas.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {MECHANIC_CATALOG.map((cat) => {
                  const row = mechanics.find((m) => m.kind === cat.kind);
                  const on = row?.enabled ?? false;
                  const weight = row?.weight ?? cat.base;
                  return (
                    <div
                      key={cat.kind}
                      className="card mp-club-sorteos-mechanic-row"
                      style={{
                        padding: 14,
                        borderColor: on ? "var(--primary)" : "var(--border)",
                        background: on ? "#fff" : "var(--muted)",
                      }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: on ? "var(--primary-light)" : "var(--card)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name={cat.icon} size={16} color={on ? "var(--primary-dark)" : "var(--muted-fg)"} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>{cat.label}</div>
                        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2, display: "flex", gap: 6 }}>
                          {cat.autoVerify ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--success-fg)" }}>
                              <Icon name="zap" size={10} /> Auto
                            </span>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--warn-fg)" }}>
                              <Icon name="user-check" size={10} /> Manual
                            </span>
                          )}
                          · {cat.hint}
                        </div>
                      </div>
                      {on ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700 }}>Peso</span>
                          <div style={{ flex: 1, height: 6, borderRadius: 9999, background: "var(--muted)", position: "relative" }}>
                            <div style={{ width: `${Math.min(100, weight * 30)}%`, height: "100%", background: "var(--primary)", borderRadius: 9999 }} />
                          </div>
                          <span className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900 }}>
                            +{weight}
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>—</div>
                      )}
                      <button
                        type="button"
                        aria-pressed={on}
                        style={{
                          width: 38,
                          height: 22,
                          borderRadius: 9999,
                          position: "relative",
                          cursor: "pointer",
                          background: on ? "var(--primary)" : "var(--border)",
                          border: "none",
                        }}
                        onClick={() => {
                          setMechanics((prev) => {
                            const exists = prev.find((m) => m.kind === cat.kind);
                            if (exists) return prev.map((m) => (m.kind === cat.kind ? { ...m, enabled: !m.enabled } : m));
                            return [...prev, { kind: cat.kind, enabled: true, weight: cat.base }];
                          });
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            top: 2,
                            left: on ? 18 : 2,
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            background: "#fff",
                            transition: "left 150ms",
                          }}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="card" style={{ padding: 18, background: "var(--primary-light)", borderColor: "var(--primary)" }}>
                <div className="label-mp" style={{ color: "var(--primary-dark)" }}>
                  Resumen de mecánica
                </div>
                <div className="font-heading tabular" style={{ fontSize: 32, fontWeight: 900, color: "var(--primary-dark)", letterSpacing: "-0.02em", marginTop: 8 }}>
                  {maxEntriesPreview || "—"}
                </div>
                <div style={{ fontSize: 11, color: "var(--primary-dark)", fontWeight: 700, marginTop: 2 }}>entradas máximas por jugador</div>
                <div style={{ height: 1, background: "rgba(16,185,129,0.2)", margin: "14px 0" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, color: "var(--primary-dark)" }}>
                  {mechanics
                    .filter((m) => m.enabled)
                    .map((m) => {
                      const cat = MECHANIC_CATALOG.find((c) => c.kind === m.kind);
                      return (
                        <div key={m.kind} style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>· {cat?.label ?? m.kind}</span>
                          <b>+{m.weight}</b>
                        </div>
                      );
                    })}
                </div>
              </div>
              <div className="card" style={{ padding: 14 }}>
                <div className="label-mp">Sugerencia</div>
                <div style={{ fontSize: 11.5, marginTop: 6, color: "var(--fg)", lineHeight: 1.5 }}>
                  Los sorteos con <b>2-4 mecánicas</b> y al menos una manual tienen más engagement. Evita más de 5 — confunden al jugador.
                </div>
              </div>
            </div>
          </div>
        )}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <span className="label-mp">¿Quién puede participar?</span>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {(
                  [
                    ["all", "Todos los jugadores de MATCHPOINT"],
                    ["followers", "Solo seguidores del club"],
                    ["members", "Solo miembros VIP activos"],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    className="btn btn-outline"
                    style={eligibility === k ? { background: "var(--primary-light)", borderColor: "var(--primary)", color: "var(--primary-dark)" } : undefined}
                    onClick={() => setEligibility(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="mp-tournament-form-grid-3">
              <label style={{ display: "block" }}>
                <span className="label-mp">Cierre de entradas</span>
                <input
                  type="datetime-local"
                  className="mp-input"
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                  style={{ marginTop: 6 }}
                />
              </label>
              <label style={{ display: "block" }}>
                <span className="label-mp">Sorteo en vivo</span>
                <input
                  type="datetime-local"
                  className="mp-input"
                  value={drawAt}
                  onChange={(e) => setDrawAt(e.target.value)}
                  style={{ marginTop: 6 }}
                />
              </label>
            </div>
            <label style={{ display: "block" }}>
              <span className="label-mp">Reglas y términos</span>
              <textarea
                className="mp-input"
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                rows={5}
                style={{ marginTop: 6, minHeight: 130 }}
              />
            </label>
          </div>
        )}
        {step === 4 && (
          <div className="mp-tournament-form-grid-2" style={{ gap: 28 }}>
            <div>
              <div className="label-mp">Así verán tu sorteo</div>
              <div style={{ marginTop: 10, border: "8px solid #0a0a0a", borderRadius: 22, overflow: "hidden", background: "#fff" }}>
                <div className="hero-emerald" style={{ padding: 14, color: "#fff" }}>
                  <span className="chip" style={{ background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", fontSize: 8.5 }}>
                    <Icon name="home" size={9} /> CLUB · {overview.clubName.toUpperCase()}
                  </span>
                  <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", margin: "8px 0 4px" }}>
                    {title || "Tu sorteo"}
                    <span style={{ color: "var(--gw-accent)" }}>.</span>
                  </h3>
                  {subtitle && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.72)" }}>{subtitle}</div>}
                </div>
                <StripedImg label={(prizeLabel || title || "PREMIO").slice(0, 20).toUpperCase()} height={120} style={{ borderRadius: 0 }} />
                <div style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, color: "var(--muted-fg)" }}>
                    <span>Hasta {maxEntriesPreview} entradas</span>
                    <span>{closesAt ? "Cierra pronto" : "Por definir"}</span>
                  </div>
                  <button type="button" className="btn btn-primary" style={{ width: "100%", marginTop: 10, padding: 10, fontSize: 11 }}>
                    Participar
                  </button>
                </div>
              </div>
            </div>
            <div>
              <div className="label-mp">Resumen para publicar</div>
              <div className="card" style={{ padding: 18, marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  ["Premio", title || prizeLabel],
                  ["Audiencia", eligibility === "all" ? "Todos MATCHPOINT" : eligibility === "followers" ? "Seguidores" : "Miembros VIP"],
                  ["Mecánicas", `${mechanics.filter((m) => m.enabled).length} activas · max ${maxEntriesPreview} entradas`],
                  ["Cierre", closesAt ? new Date(closesAt).toLocaleString("es-EC") : "Por definir"],
                  ["Sorteo", drawAt ? new Date(drawAt).toLocaleString("es-EC") : "Por definir"],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px dashed var(--border)", paddingBottom: 8 }}>
                    <span className="label-mp">{l}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", maxWidth: "60%" }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="card" style={{ padding: 14, marginTop: 12, background: "#0a0a0a", color: "#fff", borderColor: "#0a0a0a" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <Icon name="megaphone" size={16} color="var(--primary)" />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>Al publicar</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 3, lineHeight: 1.5 }}>
                      Se enviará una notificación a tus {overview.followerCount.toLocaleString("es-EC")} seguidores y aparecerá en el feed del club.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </WizardShell>
    );
  }

  const tableRows = [...active, ...drafts, ...ended];

  return (
    <div className="mp-club-sorteos-root">
      {loadError && (
        <div
          className="card"
          style={{
            padding: 14,
            borderColor: "#fecaca",
            background: "#fef2f2",
            fontSize: 13,
            color: "#991b1b",
          }}
        >
          No pudimos cargar la lista de sorteos: {loadError}
        </div>
      )}

      <PolHero
        tone="dark"
        wm="GIFT"
        label={`Organizador · ${overview.clubName}`}
        title="Sorteos del club"
        sub="Maneja todos los giveaways activos, borradores y los que ya cerraron."
        right={
          <div className="mp-club-sorteos-hero-wrap">
            <button type="button" className="btn btn-primary mp-club-sorteos-hero-cta" onClick={() => setMode("wizard")}>
              <Icon name="plus" size={13} color="#fff" />
              Crear sorteo
            </button>
          </div>
        }
      />

      <div className="mp-club-sorteos-kpis">
        {[
          { label: "Activos", value: String(active.length), hint: `${active.reduce((s, g) => s + g.entryCount, 0)} entradas`, color: "var(--primary-dark)" },
          { label: "En borrador", value: String(drafts.length), hint: "Listo para publicar" },
          { label: "Cerrados", value: String(ended.length), hint: "Historial del club" },
        ].map((s) => (
          <div key={s.label} className="card mp-club-sorteos-kpi-card">
            <MiniStat label={s.label} value={s.value} hint={s.hint} color={s.color} />
          </div>
        ))}
      </div>

      <div className="card mp-club-sorteos-table-scroll" style={{ padding: 0 }}>
        <div className="mp-club-sorteos-table-inner">
        <div style={{ display: "grid", gridTemplateColumns: SORTEOS_TABLE_COLS, padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
          {["Sorteo", "Estado", "Entradas", "Cierre / Sorteo", "Mecánica", ""].map((h) => (
            <div key={h} className="label-mp">
              {h}
            </div>
          ))}
        </div>
        {tableRows.length === 0 ? (
          <div style={{ padding: 24, color: "var(--muted-fg)", fontSize: 13 }}>Aún no hay sorteos. Crea el primero.</div>
        ) : (
          tableRows.map((g, i) => {
            const chip =
              g.status === "open" || g.status === "closing"
                ? ["chip-emerald", "En vivo"]
                : g.status === "draft"
                  ? ["", "Borrador"]
                  : ["chip-onyx", "Cerrado"];
            return (
              <div
                key={g.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: SORTEOS_TABLE_COLS,
                  padding: "14px 16px",
                  borderTop: i > 0 ? "1px solid var(--border)" : "none",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{g.title}</div>
                  {g.winners[0] && (
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                      Ganador: <b>{g.winners[0].displayName}</b>
                    </div>
                  )}
                </div>
                <div>
                  <span className={`chip ${chip[0]}`}>{chip[1]}</span>
                </div>
                <div className="font-heading tabular" style={{ fontSize: 14, fontWeight: 800 }}>
                  {g.entryCount}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
                  {g.drawAt ? new Date(g.drawAt).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" }) : "—"}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {["heart", "calendar-check-2", "share-2"].map((ic) => (
                    <span key={ic} style={{ width: 22, height: 22, borderRadius: 6, background: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name={ic} size={11} color="var(--muted-fg)" />
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {(g.status === "open" || g.status === "closing") && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => router.push(orgGiveawayPath(roleSegment, g.id))}>
                      Gestionar
                    </button>
                  )}
                  {g.status === "drawn" && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push(orgGiveawayPath(roleSegment, g.id, "ganador"))}>
                      Reporte
                    </button>
                  )}
                  {g.status === "draft" && (
                    <button
                      type="button"
                      className="btn btn-onyx btn-sm"
                      onClick={() => {
                        setGiveawayId(g.id);
                        setMode("wizard");
                      }}
                    >
                      Continuar
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        </div>
      </div>
    </div>
  );
}
