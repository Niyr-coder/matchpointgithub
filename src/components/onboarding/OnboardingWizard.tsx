// Wizard de onboarding post-signup (4 pasos).
//
// Dos modos:
//  · mode='page' (default actual del flujo): renderiza fullscreen sin overlay
//    cerrable, sin X ni "Saltar". Completar es obligatorio. Se usa en
//    /onboarding/page.tsx, que es a donde el layout del dashboard redirige
//    cuando profiles.onboarded_at es null.
//  · mode='modal' (legacy/back-compat): renderiza como modal cerrable con X
//    y botón "Saltar onboarding". No se gatilla automáticamente desde
//    DashboardModals — quedó disponible para casos puntuales.
//
// Cada paso persiste su campo con `saveOnboardingStep()` y avanza.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import {
  getOnboardingStatus,
  saveOnboardingStep,
  skipOnboarding,
  type OnboardingStatus,
} from "@/server/actions/onboarding";
import { listFeaturedClubs } from "@/server/actions/clubs";

type Sport = "pickleball" | "padel" | "tennis";
type Skill = "beginner" | "intermediate" | "advanced" | "pro";

type FeaturedClub = {
  id: string;
  name: string;
  city: string;
  coverUrl: string | null;
};

const SPORTS: { value: Sport; label: string; icon: string }[] = [
  { value: "pickleball", label: "Pickleball", icon: "circle-dot" },
  { value: "padel", label: "Pádel", icon: "square" },
  { value: "tennis", label: "Tenis", icon: "circle" },
];

const SKILLS: { value: Skill; label: string; sub: string }[] = [
  { value: "beginner", label: "Principiante", sub: "Recién empezando, aprendiendo lo básico" },
  { value: "intermediate", label: "Intermedio", sub: "Juego regular, controlo lo esencial" },
  { value: "advanced", label: "Avanzado", sub: "Competitivo, técnica sólida" },
  { value: "pro", label: "Profesional", sub: "Nivel torneo / federado" },
];

export function OnboardingWizard({
  mode = "page",
  initialStatus,
  nextOnFinish,
}: {
  mode?: "page" | "modal";
  initialStatus?: OnboardingStatus;
  // Solo aplica en mode='page': URL relativa a la que redirigir al terminar
  // el wizard. Si null/undefined cae a /dashboard/user.
  nextOnFinish?: string | null;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const inDashboard = pathname?.startsWith("/dashboard") ?? false;
  const isPage = mode === "page";

  // En mode='page' arrancamos open=true siempre; el server ya decidió que
  // toca onboardear (si no, no estaríamos en /onboarding).
  const [open, setOpen] = useState(isPage);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(
    initialStatus ? initialStatus.currentStep : 0,
  );
  const [status, setStatus] = useState<OnboardingStatus | null>(initialStatus ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkedRef = useRef(false);

  // Solo en modal: consulta de status al montar (en page el server ya lo hizo).
  useEffect(() => {
    if (isPage) return;
    if (!inDashboard) return;
    if (checkedRef.current) return;
    checkedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await getOnboardingStatus();
        if (cancelled) return;
        if (!res.ok) return;
        if (res.data.completed) return;
        setStatus(res.data);
        setStep(res.data.currentStep);
        setOpen(true);
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPage, inDashboard]);

  const close = useCallback(() => {
    if (isPage) return; // en page no se cierra
    setOpen(false);
  }, [isPage]);

  const handleSkip = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await skipOnboarding();
      if (!res.ok) {
        setError(res.error?.message ?? "No se pudo saltar el onboarding");
        return;
      }
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleSport = useCallback(async (sport: Sport) => {
    setBusy(true);
    setError(null);
    try {
      const res = await saveOnboardingStep({ step: "sport", primarySport: sport });
      if (!res.ok) {
        setError(res.error?.message ?? "No se pudo guardar el deporte");
        return;
      }
      setStatus((s) => (s ? { ...s, primarySport: sport } : s));
      setStep(1);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleSkill = useCallback(async (skill: Skill) => {
    setBusy(true);
    setError(null);
    try {
      const res = await saveOnboardingStep({ step: "level", skillLevel: skill });
      if (!res.ok) {
        setError(res.error?.message ?? "No se pudo guardar el nivel");
        return;
      }
      setStatus((s) => (s ? { ...s, skillLevel: skill } : s));
      setStep(2);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleClub = useCallback(async (clubId: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await saveOnboardingStep({ step: "club", favoriteClubId: clubId });
      if (!res.ok) {
        setError(res.error?.message ?? "No se pudo guardar el club");
        return;
      }
      setStatus((s) => (s ? { ...s, favoriteClubId: clubId } : s));
      setStep(3);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleFinish = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await saveOnboardingStep({ step: "finish" });
      if (!res.ok) {
        setError(res.error?.message ?? "No se pudo finalizar el onboarding");
        return;
      }
      if (isPage) {
        // En mode page navegamos al destino que el server pasó (caso típico:
        // el user venía de /clubes/<slug> y se registró, queremos devolverlo
        // ahí). Sin destino, fallback al dashboard del user.
        router.replace(nextOnFinish || "/dashboard/user");
      } else {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }, [router, isPage, nextOnFinish]);

  if (!open) return null;

  // Layout: en page tomamos toda la pantalla (sin overlay clickable, sin X).
  if (isPage) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bienvenido a MatchPoint"
        style={{
          position: "fixed",
          inset: 0,
          background: "linear-gradient(180deg, #0a0a0a 0%, #064e3b 100%)",
          zIndex: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden", width: 560, maxWidth: "100%" }}
        >
          <WizardHeader step={step} onSkip={null} onClose={null} busy={busy} />
          <div style={{ padding: 24, minHeight: 340 }}>
            {step === 0 && <StepSport busy={busy} onPick={handleSport} />}
            {step === 1 && <StepSkill busy={busy} onPick={handleSkill} onSkip={() => setStep(2)} />}
            {step === 2 && <StepClub busy={busy} onPick={handleClub} />}
            {step === 3 && (
              <StepFinish busy={busy} onFinish={handleFinish} summary={status} />
            )}
            {error && (
              <div
                style={{
                  marginTop: 14,
                  padding: "10px 12px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  color: "#991b1b",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenido a MatchPoint"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ padding: 0, overflow: "hidden", width: 560, maxWidth: "100%" }}
      >
        <WizardHeader step={step} onSkip={handleSkip} onClose={close} busy={busy} />
        <div style={{ padding: 24, minHeight: 340 }}>
          {step === 0 && <StepSport busy={busy} onPick={handleSport} />}
          {step === 1 && <StepSkill busy={busy} onPick={handleSkill} onSkip={() => setStep(2)} />}
          {step === 2 && <StepClub busy={busy} onPick={handleClub} />}
          {step === 3 && (
            <StepFinish
              busy={busy}
              onFinish={handleFinish}
              summary={status}
            />
          )}
          {error && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                color: "#991b1b",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── header con progreso y botón de skip ────────────────────────────────
function WizardHeader({
  step,
  onSkip,
  onClose,
  busy,
}: {
  step: 0 | 1 | 2 | 3;
  onSkip: (() => void) | null;
  onClose: (() => void) | null;
  busy: boolean;
}) {
  const pct = ((step + 1) / 4) * 100;
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        style={{
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
          Paso {step + 1} de 4
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onSkip && (
            <button
              onClick={onSkip}
              disabled={busy}
              className="btn"
              style={{
                background: "transparent",
                border: 0,
                color: "var(--muted-fg)",
                fontSize: 12,
                fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Saltar onboarding
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--muted)",
                border: 0,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
      </div>
      <div style={{ height: 3, background: "var(--muted)" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "#0a0a0a",
            transition: "width 220ms ease",
          }}
        />
      </div>
    </div>
  );
}

// ── step 0: deporte ─────────────────────────────────────────────────────
function StepSport({ busy, onPick }: { busy: boolean; onPick: (s: Sport) => void }) {
  return (
    <>
      <h2
        className="font-heading"
        style={{ fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}
      >
        Bienvenido a MatchPoint<span className="dot">.</span>
      </h2>
      <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 22px" }}>
        Para empezar, dinos cuál es tu deporte principal.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {SPORTS.map((s) => (
          <button
            key={s.value}
            onClick={() => onPick(s.value)}
            disabled={busy}
            className="card"
            style={{
              padding: "22px 14px",
              textAlign: "center",
              cursor: busy ? "not-allowed" : "pointer",
              border: "1px solid var(--border)",
              background: "#fff",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              transition: "transform 120ms ease, border-color 120ms ease",
            }}
          >
            <Icon name={s.icon} size={32} />
            <div style={{ fontWeight: 800, fontSize: 14 }}>{s.label}</div>
          </button>
        ))}
      </div>
    </>
  );
}

// ── step 1: nivel ───────────────────────────────────────────────────────
function StepSkill({
  busy,
  onPick,
  onSkip,
}: {
  busy: boolean;
  onPick: (s: Skill) => void;
  onSkip: () => void;
}) {
  return (
    <>
      <h2
        className="font-heading"
        style={{ fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}
      >
        ¿Cuál es tu nivel<span className="dot">?</span>
      </h2>
      <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 18px" }}>
        Esto nos ayuda a sugerirte rivales y torneos parejos. Puedes cambiarlo después.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SKILLS.map((s) => (
          <button
            key={s.value}
            onClick={() => onPick(s.value)}
            disabled={busy}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "#fff",
              cursor: busy ? "not-allowed" : "pointer",
              textAlign: "left",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{s.label}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>{s.sub}</div>
            </div>
            <Icon name="arrow-right" size={16} />
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14, textAlign: "center" }}>
        <button
          onClick={onSkip}
          disabled={busy}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--muted-fg)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Prefiero no decir mi nivel
        </button>
      </div>
    </>
  );
}

// ── step 2: club favorito ───────────────────────────────────────────────
function StepClub({ busy, onPick }: { busy: boolean; onPick: (id: string | null) => void }) {
  const [clubs, setClubs] = useState<FeaturedClub[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listFeaturedClubs({ limit: 12 });
      if (cancelled) return;
      if (res.ok) {
        setClubs(
          res.data.map((c) => ({
            id: c.id,
            name: c.name,
            city: c.city,
            coverUrl: c.coverUrl,
          })),
        );
      } else {
        setClubs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!clubs) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return clubs;
    return clubs.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.city.toLowerCase().includes(needle),
    );
  }, [clubs, q]);

  return (
    <>
      <h2
        className="font-heading"
        style={{ fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}
      >
        Tu club favorito<span className="dot">.</span>
      </h2>
      <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 14px" }}>
        Elige uno para ver primero sus canchas, eventos y torneos. Puedes cambiarlo cuando quieras.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre o ciudad…"
        style={{
          width: "100%",
          padding: "10px 12px",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 13,
          marginBottom: 12,
        }}
      />
      <div
        style={{
          maxHeight: 260,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 6,
          background: "#fafafa",
        }}
      >
        {filtered === null && (
          <div style={{ padding: 18, fontSize: 12, color: "var(--muted-fg)", textAlign: "center" }}>
            Cargando clubes…
          </div>
        )}
        {filtered && filtered.length === 0 && (
          <div style={{ padding: 18, fontSize: 12, color: "var(--muted-fg)", textAlign: "center" }}>
            No encontramos clubes para esa búsqueda.
          </div>
        )}
        {filtered?.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            disabled={busy}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 8,
              cursor: busy ? "not-allowed" : "pointer",
              textAlign: "left",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: c.coverUrl ? `center/cover url(${c.coverUrl})` : "var(--muted)",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {c.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>{c.city}</div>
            </div>
            <Icon name="arrow-right" size={14} />
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14, textAlign: "center" }}>
        <button
          onClick={() => onPick(null)}
          disabled={busy}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--muted-fg)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Ninguno por ahora
        </button>
      </div>
    </>
  );
}

// ── step 3: cierre ──────────────────────────────────────────────────────
function StepFinish({
  busy,
  onFinish,
  summary,
}: {
  busy: boolean;
  onFinish: () => void;
  summary: OnboardingStatus | null;
}) {
  return (
    <div style={{ textAlign: "center", padding: "30px 10px" }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "#dcfce7",
          color: "#166534",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 18px",
        }}
      >
        <Icon name="check" size={30} />
      </div>
      <h2
        className="font-heading"
        style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}
      >
        ¡Todo listo<span className="dot">!</span>
      </h2>
      <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "10px 0 22px" }}>
        Tu perfil quedó configurado. Vamos a mostrarte canchas, eventos y rivales acorde a tus preferencias.
      </p>
      {summary && (
        <div
          style={{
            margin: "0 auto 22px",
            padding: 12,
            maxWidth: 320,
            background: "#fafafa",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--muted-fg)",
            textAlign: "left",
          }}
        >
          {summary.primarySport && <div>Deporte: <strong style={{ color: "#0a0a0a" }}>{summary.primarySport}</strong></div>}
          {summary.skillLevel && <div>Nivel: <strong style={{ color: "#0a0a0a" }}>{summary.skillLevel}</strong></div>}
          <div>
            Club favorito:{" "}
            <strong style={{ color: "#0a0a0a" }}>
              {summary.favoriteClubId ? "Seleccionado" : "Ninguno"}
            </strong>
          </div>
        </div>
      )}
      <button
        onClick={onFinish}
        disabled={busy}
        className="btn"
        style={{
          background: "#0a0a0a",
          color: "#fff",
          border: "1px solid #0a0a0a",
          padding: "12px 22px",
          fontWeight: 800,
          fontSize: 13,
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        Empezar a jugar
      </button>
    </div>
  );
}
