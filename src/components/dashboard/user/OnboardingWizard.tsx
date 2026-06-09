"use client";

// Wizard de primer login: 3 pasos (ciudad+deporte+nivel → clubes cercanos → amigos).
// Aparece la primera vez que el user ve UserHome con onboarded_at = null.
// Skippeable en cualquier paso; el "Listo" del paso 3 marca onboarded_at = now().
// La detección de show/hide la hace UserHomeView según el prop `onboardedAt`.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { listFeaturedClubs } from "@/server/actions/clubs";
import { completeOnboarding } from "@/server/actions/me";
import { useToast } from "../ToastProvider";
import { useEnabledSports } from "@/components/SportsProvider";

type Step = 1 | 2 | 3;
type Sport = "padel" | "tennis" | "pickleball";
type SkillLevel = "beginner" | "intermediate" | "advanced" | "pro";

const SPORTS: { value: Sport; label: string; icon: string }[] = [
  { value: "padel", label: "Pádel", icon: "circle-dot" },
  { value: "tennis", label: "Tenis", icon: "circle" },
  { value: "pickleball", label: "Pickleball", icon: "shapes" },
];

const LEVELS: { value: SkillLevel; label: string; sub: string }[] = [
  { value: "beginner", label: "Principiante", sub: "Recién empezando" },
  { value: "intermediate", label: "Intermedio", sub: "Algunos meses jugando" },
  { value: "advanced", label: "Avanzado", sub: "Compito en torneos" },
  { value: "pro", label: "Pro", sub: "Nivel profesional" },
];

type ClubSuggestion = {
  id: string;
  slug: string;
  name: string;
  city: string;
  coverUrl: string | null;
};

export function OnboardingWizard({
  defaultCity,
  onClose,
}: {
  defaultCity: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { single: singleSport } = useEnabledSports();
  const [step, setStep] = useState<Step>(1);
  const [city, setCity] = useState(defaultCity ?? "");
  // Si solo hay un deporte (pickleball), se preselecciona y la pregunta se oculta.
  const [sport, setSport] = useState<Sport | null>(singleSport ? "pickleball" : null);
  const [level, setLevel] = useState<SkillLevel | null>(null);
  const [suggestions, setSuggestions] = useState<ClubSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [pending, startTransition] = useTransition();

  // Al pasar al paso 2, cargar clubes (filtrados por ciudad si el user la puso).
  useEffect(() => {
    if (step !== 2) return;
    setLoadingSuggestions(true);
    void listFeaturedClubs({ limit: 6 }).then((res) => {
      if (res.ok) {
        const all = res.data.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          city: c.city,
          coverUrl: c.coverUrl,
        }));
        // Si el user puso ciudad, priorizar matches. Si no, mostrar los primeros.
        const cityLower = city.trim().toLowerCase();
        const filtered = cityLower
          ? all.filter((c) => c.city.toLowerCase().includes(cityLower))
          : [];
        setSuggestions(filtered.length > 0 ? filtered : all);
      }
      setLoadingSuggestions(false);
    });
  }, [step, city]);

  const finish = (markAsSkipped: boolean) => {
    startTransition(async () => {
      const payload: { city?: string; preferredSport?: Sport; skillLevel?: SkillLevel } = {};
      if (!markAsSkipped) {
        if (city.trim().length >= 2) payload.city = city.trim();
        if (sport) payload.preferredSport = sport;
        if (level) payload.skillLevel = level;
      }
      const res = await completeOnboarding(payload);
      if (res.ok) {
        if (!markAsSkipped) toast({ icon: "check", title: "¡Listo!", sub: "Bienvenido a MATCHPOINT" });
        onClose();
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const canAdvance1 = city.trim().length >= 2 && sport !== null && level !== null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 18,
          width: "100%",
          maxWidth: 560,
          maxHeight: "92vh",
          overflow: "auto",
          padding: 28,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <Header step={step} onSkip={() => finish(true)} skipDisabled={pending} />

        {step === 1 && (
          <Step1
            city={city}
            setCity={setCity}
            sport={sport}
            setSport={setSport}
            level={level}
            setLevel={setLevel}
          />
        )}
        {step === 2 && (
          <Step2 city={city} loading={loadingSuggestions} suggestions={suggestions} />
        )}
        {step === 3 && <Step3 />}

        <Footer
          step={step}
          canAdvance={canAdvance1}
          pending={pending}
          onBack={() => setStep((step - 1) as Step)}
          onNext={() => setStep((step + 1) as Step)}
          onFinish={() => finish(false)}
        />
      </div>
    </div>
  );
}

function Header({ step, onSkip, skipDisabled }: { step: Step; onSkip: () => void; skipDisabled: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div className="label-mp">Bienvenido</div>
        <h2
          className="font-heading"
          style={{
            margin: "4px 0 0",
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
          }}
        >
          Empecemos<span style={{ color: "var(--primary)" }}>.</span>
        </h2>
        <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                width: 32,
                height: 4,
                borderRadius: 2,
                background: n <= step ? "var(--primary)" : "var(--muted)",
              }}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onSkip}
        disabled={skipDisabled}
        style={{
          background: "transparent",
          border: 0,
          color: "var(--muted-fg)",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          cursor: skipDisabled ? "default" : "pointer",
          fontFamily: "inherit",
        }}
      >
        Saltar
      </button>
    </div>
  );
}

function Step1({
  city,
  setCity,
  sport,
  setSport,
  level,
  setLevel,
}: {
  city: string;
  setCity: (s: string) => void;
  sport: Sport | null;
  setSport: (s: Sport) => void;
  level: SkillLevel | null;
  setLevel: (l: SkillLevel) => void;
}) {
  const { sports } = useEnabledSports();
  const enabledSportSet = new Set<Sport>(sports);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        Cuéntanos un poco sobre ti para sugerirte clubes y partidos cerca tuyo.
      </p>

      <div>
        <label style={labelStyle}>¿En qué ciudad juegas?</label>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Quito, Guayaquil, Cuenca…"
          maxLength={80}
          style={inputStyle}
        />
      </div>

      {enabledSportSet.size > 1 && (
        <div>
          <label style={labelStyle}>¿Cuál es tu deporte principal?</label>
          <div className="mp-onboarding-sport-grid">
            {SPORTS.filter((s) => enabledSportSet.has(s.value)).map((s) => {
              const on = sport === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSport(s.value)}
                  style={{
                    ...pickerCard,
                    borderColor: on ? "var(--primary)" : "var(--border)",
                    background: on ? "#ecfdf5" : "#fff",
                  }}
                >
                  <Icon name={s.icon} size={20} color={on ? "var(--primary)" : "var(--fg)"} />
                  <span style={{ fontSize: 12, fontWeight: 800, marginTop: 6 }}>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label style={labelStyle}>¿Tu nivel?</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {LEVELS.map((l) => {
            const on = level === l.value;
            return (
              <button
                key={l.value}
                type="button"
                onClick={() => setLevel(l.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: `1px solid ${on ? "var(--primary)" : "var(--border)"}`,
                  background: on ? "#ecfdf5" : "#fff",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{l.label}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{l.sub}</div>
                </div>
                {on && <Icon name="check" size={16} color="var(--primary)" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Step2({
  city,
  loading,
  suggestions,
}: {
  city: string;
  loading: boolean;
  suggestions: ClubSuggestion[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        Estos son algunos clubes {city ? `cerca de ${city}` : "destacados"}. Puedes seguirlos
        más tarde desde la sección Clubes.
      </p>

      {loading ? (
        <div style={{ textAlign: "center", color: "var(--muted-fg)", fontSize: 13, padding: 20 }}>
          Buscando clubes…
        </div>
      ) : suggestions.length === 0 ? (
        <div
          style={{
            padding: 18,
            border: "1px dashed var(--border)",
            borderRadius: 12,
            fontSize: 13,
            color: "var(--muted-fg)",
            textAlign: "center",
          }}
        >
          Aún no hay clubes en MATCHPOINT. Vuelve pronto.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {suggestions.slice(0, 4).map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: c.coverUrl
                    ? `url(${c.coverUrl}) center/cover`
                    : "linear-gradient(135deg,#10b981,#047857)",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>{c.city}</div>
              </div>
              <a
                href={`/clubes/${c.slug}`}
                target="_blank"
                rel="noopener"
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "var(--primary)",
                  textDecoration: "none",
                }}
              >
                Ver →
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Step3() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        Para jugar con otra gente, agrega amigos o únete a un team. Te lleva 30 segundos.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <SuggestionRow
          icon="users"
          title="Buscar amigos"
          desc="Conecta con jugadores que ya conoces."
          href="/dashboard/user/amigos"
        />
        <SuggestionRow
          icon="shield"
          title="Unirme a un team"
          desc="Compite en ligas y armá un roster."
          href="/dashboard/user/team"
        />
        <SuggestionRow
          icon="trophy"
          title="Explorar torneos"
          desc="Encuentra torneos abiertos en tu ciudad."
          href="/dashboard/user/eventos"
        />
      </div>
      <p style={{ margin: 0, fontSize: 11, color: "var(--muted-fg)", textAlign: "center" }}>
        Puedes hacer todo esto cuando quieras desde el menú lateral.
      </p>
    </div>
  );
}

function SuggestionRow({
  icon,
  title,
  desc,
  href,
}: {
  icon: string;
  title: string;
  desc: string;
  href: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 14,
        border: "1px solid var(--border)",
        borderRadius: 12,
        textDecoration: "none",
        color: "var(--fg)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "var(--muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={18} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{desc}</div>
      </div>
      <Icon name="arrow-right" size={14} color="var(--muted-fg)" />
    </a>
  );
}

function Footer({
  step,
  canAdvance,
  pending,
  onBack,
  onNext,
  onFinish,
}: {
  step: Step;
  canAdvance: boolean;
  pending: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        paddingTop: 14,
        borderTop: "1px solid var(--border)",
      }}
    >
      {step > 1 ? (
        <button
          type="button"
          onClick={onBack}
          disabled={pending}
          className="btn"
          style={{ background: "#fff", border: "1px solid var(--border)" }}
        >
          ← Atrás
        </button>
      ) : (
        <span />
      )}
      {step < 3 ? (
        <button
          type="button"
          onClick={onNext}
          disabled={step === 1 ? !canAdvance : pending}
          className="btn btn-primary"
          style={{ opacity: step === 1 && !canAdvance ? 0.6 : 1 }}
        >
          Siguiente →
        </button>
      ) : (
        <button
          type="button"
          onClick={onFinish}
          disabled={pending}
          className="btn btn-primary"
          style={{ opacity: pending ? 0.6 : 1 }}
        >
          <Icon name="check" size={13} color="#fff" />
          {pending ? "Guardando…" : "¡Listo!"}
        </button>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: 8,
  color: "#0a0a0a",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontFamily: "inherit",
  fontSize: 13.5,
  outline: "none",
  background: "#fff",
};

const pickerCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 14,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "#fff",
  cursor: "pointer",
  fontFamily: "inherit",
};
