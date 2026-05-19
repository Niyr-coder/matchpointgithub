// Admin panel para otorgar/revocar bundles cosméticos.
// Flow: buscar user → ver sus grants actuales → otorgar bundle nuevo con
// nota (memo del pago) → revocar si aplica. Audit lo registra automático
// via setAuditActor en la server action.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import {
  grantBundleToUser,
  revokeBundleFromUser,
  listGrantsForUser,
  searchUsersForCosmetics,
  type CosmeticGrantRow,
  type CosmeticUserSearchRow,
} from "@/server/actions/admin/cosmetics";
import { FALLBACK_BUNDLES, priceLabel } from "@/lib/profile/bundles";

export function AdminCosmeticsScreen() {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CosmeticUserSearchRow[]>([]);
  const [selected, setSelected] = useState<CosmeticUserSearchRow | null>(null);
  const [grants, setGrants] = useState<CosmeticGrantRow[] | null>(null);
  const [grantBundleKey, setGrantBundleKey] = useState("pack_neon");
  const [note, setNote] = useState("");

  const handleSearch = () => {
    if (!q.trim() || pending) return;
    startTransition(async () => {
      const r = await searchUsersForCosmetics({ q });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: r.error.message });
        return;
      }
      setResults(r.data);
    });
  };

  const handleSelect = (row: CosmeticUserSearchRow) => {
    setSelected(row);
    setGrants(null);
    startTransition(async () => {
      const r = await listGrantsForUser({ userId: row.userId });
      if (r.ok) setGrants(r.data);
    });
  };

  const handleGrant = () => {
    if (!selected || pending) return;
    startTransition(async () => {
      const r = await grantBundleToUser({
        userId: selected.userId,
        bundleKey: grantBundleKey,
        note: note.trim() || undefined,
      });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: r.error.message });
        return;
      }
      toast({ icon: "check", title: `Bundle ${grantBundleKey} otorgado` });
      setNote("");
      const refreshed = await listGrantsForUser({ userId: selected.userId });
      if (refreshed.ok) setGrants(refreshed.data);
      router.refresh();
    });
  };

  const handleRevoke = (bundleKey: string) => {
    if (!selected || pending) return;
    if (!confirm(`¿Revocar ${bundleKey} de ${selected.displayName}?`)) return;
    startTransition(async () => {
      const r = await revokeBundleFromUser({ userId: selected.userId, bundleKey });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: r.error.message });
        return;
      }
      toast({ icon: "check", title: `Revocado ${bundleKey}` });
      const refreshed = await listGrantsForUser({ userId: selected.userId });
      if (refreshed.ok) setGrants(refreshed.data);
      router.refresh();
    });
  };

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
      <header style={{ marginBottom: 22 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
            marginBottom: 6,
          }}
        >
          ● Admin · Cosméticos
        </div>
        <h1
          className="font-heading"
          style={{
            fontSize: "clamp(1.8rem, 3vw, 2.4rem)",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          Bundles cosméticos
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", marginTop: 6 }}>
          Otorga o revoca bundles a usuarios tras confirmar el pago manual (transferencia / DeUna).
        </p>
      </header>

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
            marginBottom: 10,
          }}
        >
          Buscar usuario
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="Nombre o username (min 2 caracteres)"
            style={{
              flex: 1,
              padding: "11px 13px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontFamily: "inherit",
              fontSize: 13,
            }}
          />
          <button onClick={handleSearch} disabled={pending || q.trim().length < 2} className="btn btn-primary">
            <Icon name="search" size={13} color="#fff" />
            Buscar
          </button>
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            {results.map((r) => (
              <button
                key={r.userId}
                onClick={() => handleSelect(r)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: selected?.userId === r.userId ? "2px solid #0a0a0a" : "1px solid var(--border)",
                  background: "#fff",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{r.displayName}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>@{r.username ?? "—"}</div>
                </div>
                <Icon name="chevron-right" size={14} />
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <>
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--muted-fg)",
                marginBottom: 10,
              }}
            >
              Bundles activos de {selected.displayName}
            </div>
            {grants === null && (
              <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Cargando...</div>
            )}
            {grants !== null && grants.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Sin bundles otorgados.</div>
            )}
            {grants !== null && grants.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {grants.map((g) => (
                  <div
                    key={g.bundleKey}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "#fafafa",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{g.bundleLabel}</div>
                      <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                        Otorgado {new Date(g.grantedAt).toLocaleDateString("es-EC")}
                        {g.note ? ` · "${g.note}"` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevoke(g.bundleKey)}
                      disabled={pending}
                      className="btn"
                      style={{
                        background: "#fff",
                        border: "1px solid #fecaca",
                        color: "#dc2626",
                      }}
                    >
                      Revocar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--muted-fg)",
                marginBottom: 10,
              }}
            >
              Otorgar bundle nuevo
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={labelStyle}>Bundle</label>
                <select
                  value={grantBundleKey}
                  onChange={(e) => setGrantBundleKey(e.target.value)}
                  style={inputStyle}
                >
                  {FALLBACK_BUNDLES.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label} ({priceLabel(b.priceCents)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Nota (memo del pago, opcional)</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ej: transferencia Banco Pichincha 12-may $5"
                  maxLength={280}
                  style={inputStyle}
                />
              </div>
              <button
                onClick={handleGrant}
                disabled={pending}
                className="btn btn-primary"
                style={{ alignSelf: "flex-start" }}
              >
                <Icon name="gift" size={13} color="#fff" />
                {pending ? "Procesando..." : "Otorgar bundle"}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 10.5,
  fontWeight: 900,
  textTransform: "uppercase" as const,
  letterSpacing: "0.14em",
  color: "#0a0a0a",
  marginBottom: 5,
};

const inputStyle = {
  width: "100%",
  padding: "11px 13px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 13,
  background: "#fff",
};
