// Wizard de onboarding post-signup (4 pasos).
//
// Dos modos:
//  · mode='page' (default): renderiza fullscreen sin overlay cerrable, sin X
//    ni "Saltar". Completar es obligatorio. Lo usa /onboarding/page.tsx.
//  · mode='modal' (legacy): renderiza como modal cerrable, con botón Saltar.
//    Disponible para casos puntuales pero no se monta hoy automáticamente.
//
// Steps:
//  0. Identidad: nombre, apellido, username (pre-fill desde signup).
//  1. Datos personales: fecha de nacimiento (requerida), teléfono (opcional).
//  2. Mano hábil: izquierda / derecha.
//  3. Cierre: resumen + CTA "Empezar".
//
// Cada paso persiste con `saveOnboardingStep()` y avanza.
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
import { LATAM_COUNTRIES, findCountry, findProvince } from "@/lib/geo/latam";
import { formatPersonNameInput, formatPhoneInput } from "@/lib/identity/person-name";

type Hand = "left" | "right";

// Parse "Provincia / Ciudad" → ["Provincia", "Ciudad"]. Si no matchea el
// separador, devuelve [null, valor] (legacy data sin split).
function splitCity(raw: string | null): [string | null, string | null] {
  if (!raw) return [null, null];
  const idx = raw.indexOf(" / ");
  if (idx < 0) return [null, raw];
  return [raw.slice(0, idx), raw.slice(idx + 3)];
}

export function OnboardingWizard({
  mode = "page",
  initialStatus,
  nextOnFinish,
}: {
  mode?: "page" | "modal";
  initialStatus?: OnboardingStatus;
  nextOnFinish?: string | null;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const inDashboard = pathname?.startsWith("/dashboard") ?? false;
  const isPage = mode === "page";

  const [open, setOpen] = useState(isPage);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(
    initialStatus ? initialStatus.currentStep : 0,
  );
  const identityComplete = initialStatus?.identityComplete ?? false;
  const minStep = identityComplete ? 1 : 0;
  const [status, setStatus] = useState<OnboardingStatus | null>(initialStatus ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const checkedRef = useRef(false);

  // Solo en modal: consulta de status al montar.
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
    if (isPage) return;
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

  const handleIdentity = useCallback(
    async (firstName: string, lastName: string, username: string) => {
      setBusy(true);
      setError(null);
      setFieldErrors({});
      try {
        const res = await saveOnboardingStep({
          step: "identity",
          firstName,
          lastName,
          username,
        });
        if (!res.ok) {
          const fields = res.error?.fields as Record<string, string[]> | undefined;
          if (fields) {
            const flat: Record<string, string> = {};
            for (const [k, arr] of Object.entries(fields)) {
              if (arr?.[0]) flat[k] = arr[0];
            }
            setFieldErrors(flat);
          }
          setError(res.error?.message ?? "Revisa los campos");
          return;
        }
        setStatus((s) => (s ? { ...s, firstName, lastName, username } : s));
        setStep(1);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handlePersonal = useCallback(
    async (args: {
      birthdate: string;
      phone: string;
      country: string;
      province: string;
      cityName: string;
    }) => {
      setBusy(true);
      setError(null);
      setFieldErrors({});
      try {
        const res = await saveOnboardingStep({ step: "personal", ...args });
        if (!res.ok) {
          const fields = res.error?.fields as Record<string, string[]> | undefined;
          if (fields) {
            const flat: Record<string, string> = {};
            for (const [k, arr] of Object.entries(fields)) {
              if (arr?.[0]) flat[k] = arr[0];
            }
            setFieldErrors(flat);
          }
          setError(res.error?.message ?? "Revisa los campos");
          return;
        }
        setStatus((s) =>
          s
            ? {
                ...s,
                birthdate: args.birthdate,
                phone: args.phone || null,
                country: args.country,
                city: `${args.province} / ${args.cityName}`,
              }
            : s,
        );
        setStep(2);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const handleHand = useCallback(async (hand: Hand) => {
    setBusy(true);
    setError(null);
    try {
      const res = await saveOnboardingStep({ step: "hand", dominantHand: hand });
      if (!res.ok) {
        setError(res.error?.message ?? "No se pudo guardar");
        return;
      }
      setStatus((s) => (s ? { ...s, dominantHand: hand } : s));
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

  const body = (
    <>
      <WizardHeader
        step={step}
        identityComplete={identityComplete}
        onBack={
          step > minStep
            ? () => setStep((s) => (s > minStep ? ((s - 1) as 0 | 1 | 2 | 3) : s))
            : null
        }
        onSkip={isPage ? null : handleSkip}
        onClose={isPage ? null : close}
        busy={busy}
      />
      <div style={{ padding: 24, minHeight: 340 }}>
        {step === 0 && (
          <StepIdentity
            busy={busy}
            initial={status}
            errors={fieldErrors}
            onSubmit={handleIdentity}
          />
        )}
        {step === 1 && (
          <StepPersonal
            busy={busy}
            initial={status}
            errors={fieldErrors}
            onSubmit={handlePersonal}
          />
        )}
        {step === 2 && <StepHand busy={busy} initial={status} onPick={handleHand} />}
        {step === 3 && <StepFinish busy={busy} onFinish={handleFinish} summary={status} />}
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
    </>
  );

  if (isPage) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bienvenido a MATCHPOINT"
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
          {body}
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenido a MATCHPOINT"
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
        {body}
      </div>
    </div>
  );
}

// ── header con progreso ────────────────────────────────────────────────
function WizardHeader({
  step,
  identityComplete,
  onBack,
  onSkip,
  onClose,
  busy,
}: {
  step: 0 | 1 | 2 | 3;
  identityComplete: boolean;
  onBack: (() => void) | null;
  onSkip: (() => void) | null;
  onClose: (() => void) | null;
  busy: boolean;
}) {
  const totalSteps = identityComplete ? 3 : 4;
  const stepNumber = identityComplete ? step : step + 1;
  const pct = (stepNumber / totalSteps) * 100;
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
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              disabled={busy}
              aria-label="Paso anterior"
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--muted)",
                border: 0,
                cursor: busy ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Icon name="arrow-left" size={13} />
            </button>
          )}
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--muted-fg)",
            }}
          >
            Paso {stepNumber} de {totalSteps}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onSkip && (
            <button
              onClick={onSkip}
              disabled={busy}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--muted-fg)",
                fontSize: 12,
                fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Saltar
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

// ── input styles ───────────────────────────────────────────────────────
const inp = {
  padding: "11px 13px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
  background: "#fff",
  width: "100%",
} as const;

function FieldLabel({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label
        style={{
          fontSize: 10.5,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "#0a0a0a",
        }}
      >
        {label}
      </label>
      {children}
      {error ? (
        <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 700 }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{hint}</span>
      ) : null}
    </div>
  );
}

// ── step 0: identidad ──────────────────────────────────────────────────
function StepIdentity({
  busy,
  initial,
  errors,
  onSubmit,
}: {
  busy: boolean;
  initial: OnboardingStatus | null;
  errors: Record<string, string>;
  onSubmit: (firstName: string, lastName: string, username: string) => void;
}) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");

  const canSubmit = firstName.trim() && lastName.trim() && username.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || busy) return;
        onSubmit(
          firstName.trim(),
          lastName.trim(),
          username.trim().toLowerCase(),
        );
      }}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div>
        <h2
          className="font-heading"
          style={{ fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}
        >
          Bienvenido a MATCHPOINT<span className="dot">.</span>
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0" }}>
          Confirma tu nombre y elige tu usuario en MATCHPOINT.
        </p>
      </div>

      <div className="mp-grid-form-2 gap-2.5">
        <FieldLabel label="Nombre" error={errors.firstName}>
          <input
            value={firstName}
            onChange={(e) => setFirstName(formatPersonNameInput(e.target.value))}
            placeholder="Vicente"
            autoComplete="given-name"
            required
            style={inp}
          />
        </FieldLabel>
        <FieldLabel label="Apellido" error={errors.lastName}>
          <input
            value={lastName}
            onChange={(e) => setLastName(formatPersonNameInput(e.target.value))}
            placeholder="Maldonado"
            autoComplete="family-name"
            style={inp}
          />
        </FieldLabel>
      </div>

      <FieldLabel
        label="Usuario"
        hint="Letras, números, guion bajo y punto. Es tu URL pública."
        error={errors.username}
      >
        {/* autoComplete="off" + name no estándar para evitar que Chrome
            vuelque el apellido aquí cuando autofillea given/family-name de
            los inputs de arriba. */}
        <input
          name="mp_username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          placeholder="vicente"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          required
          style={inp}
        />
      </FieldLabel>

      <button
        type="submit"
        disabled={busy || !canSubmit}
        style={{
          background: "#0a0a0a",
          color: "#fff",
          border: "1px solid #0a0a0a",
          padding: "12px 22px",
          fontWeight: 800,
          fontSize: 13,
          cursor: busy || !canSubmit ? "not-allowed" : "pointer",
          opacity: busy || !canSubmit ? 0.6 : 1,
          borderRadius: 10,
          marginTop: 4,
        }}
      >
        {busy ? "Guardando..." : "Continuar"}
      </button>
    </form>
  );
}

// ── step 1: ubicación + fecha + teléfono ───────────────────────────────
function StepPersonal({
  busy,
  initial,
  errors,
  onSubmit,
}: {
  busy: boolean;
  initial: OnboardingStatus | null;
  errors: Record<string, string>;
  onSubmit: (args: {
    birthdate: string;
    phone: string;
    country: string;
    province: string;
    cityName: string;
  }) => void;
}) {
  // Inicializar país desde nombre guardado (mapeamos a code).
  const initialCountryCode = useMemo(() => {
    if (!initial?.country) return "";
    const match = LATAM_COUNTRIES.find((c) => c.name === initial.country);
    return match?.code ?? "";
  }, [initial?.country]);

  const [initialProv, initialCity] = useMemo(() => splitCity(initial?.city ?? null), [initial?.city]);

  const [countryCode, setCountryCode] = useState(initialCountryCode);
  const [provinceName, setProvinceName] = useState(initialProv ?? "");
  const [cityName, setCityName] = useState(initialCity ?? "");
  const [birthdate, setBirthdate] = useState(initial?.birthdate ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  // Track si el user editó el phone para no pisarle el valor al cambiar país.
  const phoneTouched = useRef(initial?.phone != null);

  const country = useMemo(() => findCountry(countryCode), [countryCode]);
  const province = useMemo(
    () => (countryCode && provinceName ? findProvince(countryCode, provinceName) : null),
    [countryCode, provinceName],
  );

  // Cuando cambia el país, sugerir prefijo telefónico si el user no editó.
  useEffect(() => {
    if (!country) return;
    if (phoneTouched.current) return;
    setPhone(country.phoneCode + " ");
  }, [country]);

  const canSubmit =
    birthdate.length === 10 && countryCode && provinceName && cityName && phone.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || busy || !country) return;
        onSubmit({
          birthdate,
          phone: phone.trim(),
          country: country.name,
          province: provinceName,
          cityName: cityName.trim(),
        });
      }}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div>
        <h2
          className="font-heading"
          style={{ fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}
        >
          Datos personales<span className="dot">.</span>
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0" }}>
          Confirmamos tu edad (mínimo 13 años). Luego tu ubicación nos ayuda a
          sugerirte clubes y torneos cerca. El teléfono es opcional.
        </p>
      </div>

      <FieldLabel
        label="Fecha de nacimiento"
        hint="Debes tener al menos 13 años para usar MATCHPOINT."
        error={errors.birthdate}
      >
        <input
          type="date"
          value={birthdate}
          onChange={(e) => setBirthdate(e.target.value)}
          required
          max={new Date().toISOString().slice(0, 10)}
          style={inp}
        />
      </FieldLabel>

      <FieldLabel label="País" error={errors.country}>
        <select
          value={countryCode}
          onChange={(e) => {
            setCountryCode(e.target.value);
            setProvinceName("");
            setCityName("");
          }}
          required
          style={inp}
        >
          <option value="">Selecciona un país…</option>
          {LATAM_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </FieldLabel>

      <FieldLabel label="Provincia / Estado / Región" error={errors.province}>
        <select
          value={provinceName}
          onChange={(e) => {
            setProvinceName(e.target.value);
            setCityName("");
          }}
          required
          disabled={!country}
          style={{ ...inp, opacity: !country ? 0.55 : 1, cursor: !country ? "not-allowed" : "pointer" }}
        >
          <option value="">
            {country ? "Selecciona una provincia…" : "Elige país primero"}
          </option>
          {country?.provinces.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </FieldLabel>

      <FieldLabel label="Ciudad" error={errors.cityName}>
        <select
          value={cityName}
          onChange={(e) => setCityName(e.target.value)}
          required
          disabled={!province}
          style={{ ...inp, opacity: !province ? 0.55 : 1, cursor: !province ? "not-allowed" : "pointer" }}
        >
          <option value="">
            {province ? "Selecciona una ciudad…" : "Elige provincia primero"}
          </option>
          {province?.cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </FieldLabel>

      <FieldLabel
        label="Teléfono"
        hint="Incluye el prefijo del país. Ej: +593 99 123 4567"
        error={errors.phone}
      >
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => {
            phoneTouched.current = true;
            setPhone(formatPhoneInput(e.target.value));
          }}
          placeholder="+593 99 123 4567"
          autoComplete="tel"
          style={inp}
        />
      </FieldLabel>

      <button
        type="submit"
        disabled={busy || !canSubmit}
        style={{
          background: "#0a0a0a",
          color: "#fff",
          border: "1px solid #0a0a0a",
          padding: "12px 22px",
          fontWeight: 800,
          fontSize: 13,
          cursor: busy || !canSubmit ? "not-allowed" : "pointer",
          opacity: busy || !canSubmit ? 0.6 : 1,
          borderRadius: 10,
          marginTop: 4,
        }}
      >
        {busy ? "Guardando..." : "Continuar"}
      </button>
    </form>
  );
}

// ── step 2: mano hábil ─────────────────────────────────────────────────
function StepHand({
  busy,
  initial,
  onPick,
}: {
  busy: boolean;
  initial: OnboardingStatus | null;
  onPick: (hand: Hand) => void;
}) {
  const current = initial?.dominantHand ?? null;
  // Orden visual: izquierda a la izquierda, derecha a la derecha. Lucide solo
  // tiene un ícono `hand`; para representar la mano izquierda lo espejamos
  // horizontal con scaleX(-1).
  const options: { value: Hand; label: string; sub: string; mirror: boolean }[] = [
    { value: "left", label: "Izquierda", sub: "Soy zurdo", mirror: true },
    { value: "right", label: "Derecha", sub: "Soy diestro", mirror: false },
  ];
  return (
    <>
      <h2
        className="font-heading"
        style={{ fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}
      >
        ¿Cuál es tu mano hábil<span className="dot">?</span>
      </h2>
      <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 18px" }}>
        Lo usamos para emparejarte mejor en dobles y mostrarlo en tu perfil.
      </p>
      <div className="mp-grid-form-2 gap-3">
        {options.map((o) => {
          const active = current === o.value;
          return (
            <button
              key={o.value}
              onClick={() => onPick(o.value)}
              disabled={busy}
              style={{
                padding: "20px 14px",
                borderRadius: 12,
                border: active ? "2px solid #0a0a0a" : "1px solid var(--border)",
                background: "#fff",
                cursor: busy ? "not-allowed" : "pointer",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                fontFamily: "inherit",
              }}
            >
              <Icon
                name="hand"
                size={28}
                style={o.mirror ? { transform: "scaleX(-1)" } : undefined}
              />
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{o.label}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>
                  {o.sub}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ── step 3: primeros pasos ────────────────────────────────────────────
const FIRST_STEPS = [
  {
    icon: "calendar",
    title: "Reserva una cancha",
    sub: "Busca disponibilidad en tu club y agenda tu horario.",
    href: "/dashboard/user/clubes",
  },
  {
    icon: "search",
    title: "Busco partido",
    sub: "Encuentra jugadores de tu nivel para un partido.",
    href: "/dashboard/user/busco-partido",
  },
  {
    icon: "trophy",
    title: "Torneos cerca de ti",
    sub: "Inscríbete en el próximo torneo MATCHPOINT.",
    href: "/dashboard/user/eventos",
  },
  {
    icon: "user",
    title: "Completa tu perfil",
    sub: "Agrega tu foto y nivel de juego.",
    href: "/dashboard/user/perfil",
  },
] as const;

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
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "#dcfce7",
          color: "#166534",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 14px",
        }}
      >
        <Icon name="check" size={26} />
      </div>
      <h2
        className="font-heading"
        style={{ fontSize: 22, fontWeight: 900, margin: 0, letterSpacing: "-0.02em" }}
      >
        ¡Bienvenido{summary?.firstName ? `, ${summary.firstName}` : ""}
        <span className="dot">!</span>
      </h2>
      <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 20px" }}>
        Tu perfil está listo. Empiezas con <strong>MPR 2.5</strong> en los tres deportes.
        Aquí tienes todo lo que puedes hacer:
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 20,
          textAlign: "left",
        }}
      >
        {FIRST_STEPS.map((s) => (
          <div
            key={s.href}
            style={{
              padding: "12px 13px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "#fafafa",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#ecfdf5",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={s.icon} size={15} color="var(--primary)" />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#0a0a0a" }}>{s.title}</div>
              <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.4 }}>
                {s.sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onFinish}
        disabled={busy}
        style={{
          background: "#0a0a0a",
          color: "#fff",
          border: "1px solid #0a0a0a",
          padding: "12px 22px",
          fontWeight: 800,
          fontSize: 13,
          cursor: busy ? "not-allowed" : "pointer",
          borderRadius: 10,
          width: "100%",
        }}
      >
        {busy ? "Finalizando..." : "Empezar a jugar →"}
      </button>
    </div>
  );
}
