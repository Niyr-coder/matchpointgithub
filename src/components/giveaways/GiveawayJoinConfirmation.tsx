"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MobileHeroStat, MobileMechanicRow } from "@/components/giveaways/handoff";
import type { GiveawayDetailView } from "@/lib/schemas/giveaways";
import type { MechanicKind } from "@/components/giveaways/types";

type Props = {
  data: GiveawayDetailView;
  onRefreshMechanics: () => void;
  onMechanicAction: (kind: MechanicKind) => void;
  mechanicActionLabel: (kind: MechanicKind) => string | undefined;
  onBackToDetail: () => void;
  pending?: boolean;
};

/** Pantalla 05 — JoinConfirmation (gw-join-mobile.jsx) */
export function GiveawayJoinConfirmation({
  data,
  onRefreshMechanics,
  onMechanicAction,
  mechanicActionLabel,
  onBackToDetail,
  pending,
}: Props) {
  const pct = data.entryCount > 0 ? data.myProbabilityPct.toFixed(2) : "0.00";

  return (
    <div className="gw-join-confirmation" style={{ background: "#fafafa", minHeight: "100%" }}>
      <div className="hero-emerald" style={{ position: "relative", color: "#fff", padding: "40px 20px 32px", textAlign: "center" }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--gw-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            boxShadow: "0 0 0 8px rgba(52,211,153,0.2)",
          }}
        >
          <Icon name="check" size={32} color="#052e22" />
        </div>
        <div className="label-mp" style={{ color: "var(--gw-accent-soft)" }}>
          Estás dentro
        </div>
        <h1
          className="font-heading"
          style={{
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            margin: "4px 0 8px",
            lineHeight: 1,
          }}
        >
          {data.myEntries} entrada{data.myEntries !== 1 ? "s" : ""} conseguida{data.myEntries !== 1 ? "s" : ""}
          <span style={{ color: "var(--gw-accent)" }}>.</span>
        </h1>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.78)", maxWidth: 280, margin: "0 auto", lineHeight: 1.5 }}>
          Te seguiste a {data.clubName}. Suma hasta {Math.max(0, data.maxEntriesPerUser - data.myEntries)} entradas más para subir tus chances.
        </div>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="card" style={{ padding: 14, background: "var(--primary-light)", borderColor: "var(--primary)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div className="label-mp" style={{ color: "var(--primary-dark)" }}>
                Tus entradas
              </div>
              <div
                className="font-heading tabular"
                style={{ fontSize: 26, fontWeight: 900, color: "var(--primary-dark)", letterSpacing: "-0.02em", marginTop: 2 }}
              >
                {data.myEntries}{" "}
                <span style={{ fontSize: 13, opacity: 0.6 }}>
                  / {data.maxEntriesPerUser}
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="label-mp" style={{ color: "var(--primary-dark)" }}>
                Probabilidad
              </div>
              <div className="font-heading tabular" style={{ fontSize: 17, fontWeight: 900, color: "var(--primary-dark)", marginTop: 2 }}>
                {pct}%
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12, height: 6, borderRadius: 9999, background: "rgba(16,185,129,0.18)" }}>
            <div
              style={{
                width: `${(data.myEntries / Math.max(data.maxEntriesPerUser, 1)) * 100}%`,
                height: "100%",
                background: "var(--primary)",
                borderRadius: 9999,
              }}
            />
          </div>
        </div>

        <div className="label-mp">Suma más entradas</div>
        {data.mechanics.map((m) => (
          <MobileMechanicRow
            key={m.kind}
            kind={m.kind}
            label={m.label}
            weight={m.weight}
            done={m.done}
            pending={m.pending}
            actionLabel={mechanicActionLabel(m.kind)}
            onAction={
              !m.done && !m.pending && (m.autoVerify || m.kind === "share" || m.kind === "pay" || m.kind === "invite")
                ? () =>
                    m.autoVerify && m.kind !== "share" && m.kind !== "pay" && m.kind !== "invite"
                      ? onRefreshMechanics()
                      : onMechanicAction(m.kind)
                : undefined
            }
          />
        ))}

        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <Link href="/dashboard/user/mis-sorteos" className="btn btn-outline" style={{ flex: 1, padding: 10, textDecoration: "none", justifyContent: "center" }}>
            <Icon name="bookmark" size={11} /> Mis sorteos
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 2, padding: 10 }}
            disabled={pending}
            onClick={onBackToDetail}
          >
            <Icon name="bell" size={11} color="#fff" /> Ver sorteo
          </button>
        </div>
      </div>
    </div>
  );
}
