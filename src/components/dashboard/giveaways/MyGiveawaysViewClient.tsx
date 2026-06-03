"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Countdown, OwnerBadge } from "@/components/giveaways";
import type { MyGiveawayRow } from "@/lib/schemas/giveaways";

function closesInFromIso(iso: string | null): { days: number; hours: number } | undefined {
  if (!iso) return undefined;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { days: 0, hours: 0 };
  const hours = Math.floor(ms / 3_600_000);
  return { days: Math.floor(hours / 24), hours: hours % 24 };
}

const FILTERS = ["Activos", "Cierran pronto", "Ganados", "Pasados"];

/** Mis sorteos — 1:1 con gw-join-mobile.jsx JoinTracker */
export function MyGiveawaysViewClient({ rows }: { rows: MyGiveawayRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("Activos");

  const filtered = useMemo(() => {
    if (filter === "Activos") return rows.filter((r) => r.status === "open" || r.status === "closing");
    if (filter === "Cierran pronto") return rows.filter((r) => r.status === "closing");
    if (filter === "Ganados") return rows.filter((r) => r.won === true);
    return rows.filter((r) => r.status === "drawn" || r.status === "closed" || r.status === "cancelled");
  }, [filter, rows]);

  const activeCount = rows.filter((r) => r.status === "open" || r.status === "closing").length;
  const totalEntries = rows.reduce((s, r) => s + r.myEntries, 0);
  const wonCount = rows.filter((r) => r.won === true).length;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ padding: "14px 0 12px" }}>
        <div className="label-mp" style={{ color: "var(--primary-dark)" }}>
          Tu actividad
        </div>
        <h1 className="font-heading" style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: "4px 0 0", lineHeight: 1 }}>
          Mis sorteos<span style={{ color: "var(--primary)" }}>.</span>
        </h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 0,
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-mp-card)",
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        {[
          ["Activos", String(activeCount), "var(--primary-dark)"],
          ["Entradas", String(totalEntries), "var(--fg)"],
          ["Ganados", String(wonCount), "var(--muted-fg)"],
        ].map(([l, v, c], i) => (
          <div key={l} style={{ padding: 14, textAlign: "center", borderLeft: i > 0 ? "1px solid var(--border)" : "none" }}>
            <div className="label-mp">{l}</div>
            <div className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, color: c as string, letterSpacing: "-0.02em", marginTop: 4 }}>
              {v}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "12px 0",
          overflowX: "auto",
          whiteSpace: "nowrap",
          marginBottom: 10,
        }}
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`chip ${filter === f ? "chip-onyx" : ""}`}
            style={{ flexShrink: 0, cursor: "pointer", border: "none", fontFamily: "inherit" }}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted-fg)", fontSize: 13 }}>
            No hay sorteos en este filtro.
          </div>
        ) : (
          filtered.map((g) => {
            const ended = g.status === "drawn" || g.status === "closed";
            const urgent = g.status === "closing";
            const closesIn = closesInFromIso(g.closesAt);
            return (
              <button
                key={g.id}
                type="button"
                className="card"
                style={{
                  padding: 12,
                  display: "grid",
                  gridTemplateColumns: "60px 1fr",
                  gap: 12,
                  textAlign: "left",
                  cursor: "pointer",
                  opacity: ended && g.won === false ? 0.7 : 1,
                  borderColor: urgent ? "var(--destructive-border)" : "var(--border)",
                }}
                onClick={() => router.push(`/dashboard/clubes/giveaways/${g.id}`)}
              >
                <div
                  className="img-slot"
                  style={{
                    height: 60,
                    width: 60,
                    borderRadius: 9,
                    backgroundImage: g.prizeImageUrl ? `url(${g.prizeImageUrl}) center/cover` : undefined,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <OwnerBadge owner={g.ownerType} name={g.clubName} />
                  <div style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.2, marginTop: 3 }}>{g.title}</div>
                  {!ended ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
                        <span className="font-heading tabular" style={{ fontSize: 11, fontWeight: 900, color: "var(--primary-dark)" }}>
                          {g.myEntries}/{g.maxEntries} entradas
                        </span>
                        {closesIn && <Countdown days={closesIn.days} hours={closesIn.hours} urgent={urgent} />}
                      </div>
                      <div style={{ marginTop: 5, height: 4, borderRadius: 9999, background: "var(--muted)" }}>
                        <div
                          style={{
                            width: `${Math.min(100, (g.myEntries / Math.max(g.maxEntries, 1)) * 100)}%`,
                            height: "100%",
                            background: "var(--primary)",
                            borderRadius: 9999,
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>
                      {g.won === true ? "Ganaste" : g.won === false ? "No fue esta vez" : "Finalizado"} · {g.myEntries}/{g.maxEntries} entradas
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
