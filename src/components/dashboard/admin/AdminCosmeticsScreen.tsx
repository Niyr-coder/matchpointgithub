// Admin panel para otorgar/revocar bundles cosméticos.
// Flow: buscar user → ver sus grants actuales → otorgar bundle nuevo con
// nota (memo del pago) → revocar si aplica. Audit lo registra automático
// via setAuditActor en la server action.
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import {
  grantBundleToUser,
  revokeBundleFromUser,
  listGrantsForUser,
  searchUsersForCosmetics,
  setThemeActive,
  setAllThemesActive,
  listInactiveThemes,
  listBundles,
  setBundlePrice,
  setBundleActive,
  type CosmeticGrantRow,
  type CosmeticUserSearchRow,
  type BundleAdminRow,
} from "@/server/actions/admin/cosmetics";
import { FALLBACK_BUNDLES, priceLabel } from "@/lib/profile/bundles";
import { usePromptModal } from "../widgets/PromptModal";
import { PROFILE_THEMES_BY_RARITY, rarityOf, RARITY_META } from "@/lib/profile/customization-presets";

export function AdminCosmeticsScreen() {
  const toast = useToast();
  const router = useRouter();
  const { confirm } = usePromptModal();
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

  const handleRevoke = async (bundleKey: string) => {
    if (!selected || pending) return;
    const ok = await confirm({
      title: "Revocar bundle",
      body: `¿Revocar ${bundleKey} de ${selected.displayName}?`,
      confirmLabel: "Revocar",
      destructive: true,
    });
    if (!ok) return;
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

      <BundlesAdminSection />
      <ThemesAdminSection />
    </main>
  );
}

// ── Sección: bundles (precio editable + activar/desactivar) ──────────────────
function BundlesAdminSection() {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bundles, setBundles] = useState<BundleAdminRow[] | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    listBundles().then((r) => {
      if (alive && r.ok) {
        setBundles(r.data);
        setPrices(Object.fromEntries(r.data.map((b) => [b.key, (b.priceCents / 100).toFixed(2)])));
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const savePrice = (key: string) => {
    if (pending) return;
    const dollars = parseFloat(prices[key] ?? "");
    if (Number.isNaN(dollars) || dollars < 0) {
      toast({ icon: "alert-triangle", title: "Precio inválido" });
      return;
    }
    const cents = Math.round(dollars * 100);
    startTransition(async () => {
      const res = await setBundlePrice({ key, priceCents: cents });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: res.error.message });
        return;
      }
      setBundles((prev) => prev?.map((b) => (b.key === key ? { ...b, priceCents: cents } : b)) ?? null);
      toast({ icon: "check", title: "Precio actualizado" });
      router.refresh();
    });
  };

  const toggleActive = (key: string, label: string, nextActive: boolean) => {
    if (pending) return;
    startTransition(async () => {
      const res = await setBundleActive({ key, active: nextActive });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: res.error.message });
        return;
      }
      setBundles((prev) => prev?.map((b) => (b.key === key ? { ...b, active: nextActive } : b)) ?? null);
      toast({ icon: "check", title: nextActive ? `${label} activado` : `${label} desactivado` });
      router.refresh();
    });
  };

  return (
    <div className="card" style={{ padding: 18, marginTop: 18 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--muted-fg)",
          marginBottom: 4,
        }}
      >
        Bundles
      </div>
      <p style={{ fontSize: 12, color: "var(--muted-fg)", margin: "0 0 12px" }}>
        Cada bundle desbloquea un tema de pack. Edita su precio y actívalo/desactívalo — desactivar
        impide otorgarlo a nuevos usuarios (los que ya lo tienen lo conservan).
      </p>
      {bundles === null ? (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Cargando bundles…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {bundles.map((b) => (
            <div
              key={b.key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: b.active ? "#fff" : "#fafafa",
                opacity: b.active ? 1 : 0.7,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13, minWidth: 120 }}>{b.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 13, color: "var(--muted-fg)" }}>$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={prices[b.key] ?? ""}
                    onChange={(e) => setPrices((p) => ({ ...p, [b.key]: e.target.value }))}
                    style={{
                      width: 80,
                      padding: "7px 9px",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontFamily: "inherit",
                      fontSize: 13,
                    }}
                  />
                </div>
                <button
                  onClick={() => savePrice(b.key)}
                  disabled={pending}
                  className="btn"
                  style={{ background: "#fff", border: "1px solid var(--border)", padding: "7px 12px", fontSize: 10.5 }}
                >
                  Guardar
                </button>
                <button
                  onClick={() => toggleActive(b.key, b.label, !b.active)}
                  disabled={pending}
                  className="btn"
                  style={
                    b.active
                      ? { background: "#fff", border: "1px solid #fecaca", color: "#dc2626", padding: "7px 12px", fontSize: 10.5 }
                      : { background: "#0a0a0a", color: "#fff", padding: "7px 12px", fontSize: 10.5 }
                  }
                >
                  {b.active ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sección: activar/desactivar temas ───────────────────────────────────────
// Desactivar es hard-kill: revierte a Clásico a todos los que lo usan (lo
// maneja setThemeActive en server). 'default' (Clásico) no se lista.
function ThemesAdminSection() {
  const toast = useToast();
  const router = useRouter();
  const { confirm } = usePromptModal();
  const [pending, startTransition] = useTransition();
  const [inactive, setInactive] = useState<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    listInactiveThemes().then((r) => {
      if (alive && r.ok) setInactive(new Set(r.data));
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async (key: string, label: string, nextActive: boolean) => {
    if (pending || inactive === null) return;
    if (!nextActive) {
      const ok = await confirm({
        title: `Desactivar "${label}"`,
        body: "Se quitará del picker y quien lo tenga puesto volverá a Clásico.",
        confirmLabel: "Desactivar",
        destructive: true,
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const r = await setThemeActive({ key, active: nextActive });
      if (!r.ok) {
        toast({ icon: "alert-triangle", title: r.error.message });
        return;
      }
      setInactive((prev) => {
        const next = new Set(prev ?? []);
        if (nextActive) next.delete(key);
        else next.add(key);
        return next;
      });
      toast({ icon: "check", title: nextActive ? `"${label}" activado` : `"${label}" desactivado` });
      router.refresh();
    });
  };

  // Solo temas INCLUIDOS (mp_plus, sin pack). Los temas de pack se gestionan
  // desde su bundle en la sección "Bundles" — así no se duplican acá.
  const themes = PROFILE_THEMES_BY_RARITY.filter((t) => t.bundleKey === "mp_plus");

  const toggleAll = async (nextActive: boolean) => {
    if (pending || inactive === null) return;
    if (!nextActive) {
      const ok = await confirm({
        title: "Desactivar todos los temas",
        body: "Se quitarán TODOS los temas del picker y todos los perfiles volverán a Clásico. ¿Continuar?",
        confirmLabel: "Desactivar todo",
        destructive: true,
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const res = await setAllThemesActive({ active: nextActive });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: res.error.message });
        return;
      }
      setInactive((prev) => {
        const next = new Set(prev ?? []);
        for (const t of themes) {
          if (nextActive) next.delete(t.key);
          else next.add(t.key);
        }
        return next;
      });
      toast({ icon: "check", title: nextActive ? "Temas incluidos activados" : "Temas incluidos desactivados" });
      router.refresh();
    });
  };

  return (
    <div className="card" style={{ padding: 18, marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 10, flexWrap: "wrap" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
          }}
        >
          Temas incluidos (MATCHPOINT+)
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => toggleAll(true)}
            disabled={pending || inactive === null}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)", padding: "6px 12px", fontSize: 10.5 }}
          >
            Activar todos
          </button>
          <button
            onClick={() => toggleAll(false)}
            disabled={pending || inactive === null}
            className="btn"
            style={{ background: "#0a0a0a", color: "#fff", padding: "6px 12px", fontSize: 10.5 }}
          >
            Desactivar todo
          </button>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "var(--muted-fg)", margin: "0 0 12px" }}>
        Temas que vienen con MATCHPOINT+ (los de pack se gestionan en la sección Bundles).
        Desactivar uno lo quita del picker y revierte a Clásico a quien lo tenga aplicado.
      </p>
      {inactive === null ? (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Cargando temas…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {themes.map((t) => {
            const r = RARITY_META[rarityOf(t.key)];
            const isActive = !inactive.has(t.key);
            return (
              <div
                key={t.key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: isActive ? "#fff" : "#fafafa",
                  opacity: isActive ? 1 : 0.7,
                }}
              >
                <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 800, fontSize: 13 }}>{t.label}</span>
                  <span
                    style={{
                      fontSize: 8.5,
                      fontWeight: 900,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "2px 7px",
                      borderRadius: 6,
                      background: r.color,
                      color: "#fff",
                    }}
                  >
                    {r.label}
                  </span>
                  {t.bundleKey !== "free" && (
                    <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>
                      {t.bundleKey === "mp_plus" ? "MP+" : t.bundleKey}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => toggle(t.key, t.label, !isActive)}
                  disabled={pending}
                  className="btn"
                  style={
                    isActive
                      ? { background: "#fff", border: "1px solid #fecaca", color: "#dc2626", padding: "7px 14px" }
                      : { background: "#0a0a0a", color: "#fff", padding: "7px 14px" }
                  }
                >
                  {isActive ? "Desactivar" : "Activar"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
