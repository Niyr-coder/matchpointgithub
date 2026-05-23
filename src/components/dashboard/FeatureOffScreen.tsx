// Pantalla mostrada cuando una sección está atada a un feature flag que está
// apagado. Honesta y simple — no es un error, es que el admin la deshabilitó.
import { Icon } from "@/components/Icon";

const LABELS: Record<string, string> = {
  "coach-ai": "Coach AI",
  quedadas: "Quedadas",
  "admin-theme-designer": "Theme designer",
  "club-membresias": "Membresías",
};

export function FeatureOffScreen({ section }: { section: string }) {
  const label = LABELS[section] ?? "Esta función";
  return (
    <div className="card" style={{ padding: 48, textAlign: "center", maxWidth: 520, margin: "40px auto" }}>
      <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--muted)", color: "var(--muted-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <Icon name="power-off" size={24} color="var(--muted-fg)" />
      </span>
      <h1 className="font-heading" style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: 0 }}>
        {label} no está disponible<span style={{ color: "var(--primary)" }}>.</span>
      </h1>
      <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "10px auto 0", maxWidth: 360, lineHeight: 1.5 }}>
        Esta función está temporalmente deshabilitada por la plataforma. Vuelve a intentarlo más tarde.
      </p>
    </div>
  );
}
