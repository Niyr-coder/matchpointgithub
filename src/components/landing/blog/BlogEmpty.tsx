"use client";
import { Icon } from "@/components/Icon";

type Reason = "no_results" | "coming_soon";

type Props = {
  reason: Reason;
  categoryLabel?: string;
  onReset?: () => void;
};

export function BlogEmpty({ reason, categoryLabel, onReset }: Props) {
  const { title, body, primary } = copyFor(reason, categoryLabel);

  return (
    <section
      aria-live="polite"
      className="mx-auto text-center"
      style={{ maxWidth: 480, paddingBlock: 80 }}
    >
      <div
        aria-hidden
        className="inline-flex items-center justify-center mb-4"
        style={{
          width: 56,
          height: 56,
          borderRadius: 9999,
          background: "var(--muted)",
          color: "var(--muted-fg)",
        }}
      >
        <Icon name="book-open" size={28} />
      </div>
      <h2
        className="font-heading"
        style={{
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.2,
          margin: 0,
          marginBottom: 8,
        }}
      >
        {title}
      </h2>
      <p style={{ fontSize: 15, color: "var(--muted-fg)", margin: 0 }}>
        {body}
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap mt-6">
        {reason === "no_results" && onReset && (
          <button
            type="button"
            onClick={onReset}
            className="btn btn-primary"
            style={{ paddingInline: 18 }}
          >
            {primary}
          </button>
        )}
        <a
          href="#newsletter"
          className={reason === "no_results" ? "btn btn-outline" : "btn btn-primary"}
          style={{ paddingInline: 18 }}
        >
          Suscribirme
        </a>
      </div>
    </section>
  );
}

function copyFor(reason: Reason, label?: string) {
  if (reason === "no_results") {
    return {
      title: `Aún no hay posts en "${label ?? "esa categoría"}".`,
      body: "Probá con otra categoría o suscribite y te avisamos cuando publiquemos.",
      primary: "Ver todos",
    };
  }
  return {
    title: "Estamos preparando el primer post.",
    body: "Suscribite y te avisamos cuando esté listo.",
    primary: "Suscribirme",
  };
}
