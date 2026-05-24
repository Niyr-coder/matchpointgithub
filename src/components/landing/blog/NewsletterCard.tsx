import { Icon } from "@/components/Icon";
import { NewsletterForm } from "./NewsletterForm";

type Variant = "default" | "compact" | "band";

type Source = "blog_index" | "blog_post_sidebar" | "blog_post_band";

type Props = {
  variant?: Variant;
  source?: Source;
  id?: string;
  className?: string;
};

const MICROCOPY =
  "0 spam · 1 email al mes · te puedes desuscribir cuando quieras";

export function NewsletterCard({
  variant = "default",
  source = "blog_index",
  id = "newsletter",
  className,
}: Props) {
  if (variant === "compact") {
    return (
      <section
        id={id}
        className={`mp-newsletter mp-newsletter--compact${className ? ` ${className}` : ""}`}
        style={cardStyle("compact")}
      >
        <h3
          className="font-heading"
          style={{
            fontSize: 16,
            fontWeight: 800,
            lineHeight: 1.2,
            margin: 0,
            marginBottom: 4,
          }}
        >
          Recibí guías nuevas
        </h3>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--muted-fg)",
            lineHeight: 1.45,
            margin: "0 0 12px",
          }}
        >
          1 email al mes. Sin spam.
        </p>
        <NewsletterForm source={mapSource(source)} microcopy={MICROCOPY} />
      </section>
    );
  }

  if (variant === "band") {
    return (
      <section
        id={id}
        className={`mp-newsletter mp-newsletter--band${className ? ` ${className}` : ""}`}
        style={cardStyle("band")}
      >
        <div className="mx-auto" style={{ maxWidth: 720 }}>
          <div className="flex items-center gap-3 mb-3">
            <span
              aria-hidden
              className="inline-flex items-center justify-center"
              style={{
                width: 36,
                height: 36,
                borderRadius: 9999,
                background: "var(--primary)",
                color: "#fff",
              }}
            >
              <Icon name="mail" size={18} />
            </span>
            <h2
              className="font-heading"
              style={{
                fontSize: 22,
                fontWeight: 800,
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              Recibí nuevas guías y novedades en tu email.
            </h2>
          </div>
          <NewsletterForm source={mapSource(source)} microcopy={MICROCOPY} />
        </div>
      </section>
    );
  }

  return (
    <section
      id={id}
      className={`mp-newsletter mp-newsletter--default${className ? ` ${className}` : ""}`}
      style={cardStyle("default")}
    >
      <div className="flex items-start gap-4 mb-4 flex-wrap">
        <span
          aria-hidden
          className="inline-flex items-center justify-center shrink-0"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "var(--primary)",
            color: "#fff",
          }}
        >
          <Icon name="mail" size={22} />
        </span>
        <div className="flex-1 min-w-[220px]">
          <h2
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 800,
              lineHeight: 1.2,
              margin: 0,
              marginBottom: 6,
            }}
          >
            Recibí nuevas guías y novedades en tu email.
          </h2>
          <p style={{ fontSize: 14, color: "var(--muted-fg)", margin: 0 }}>
            Mandamos máximo un email al mes con lo más útil del blog.
          </p>
        </div>
      </div>
      <NewsletterForm source={mapSource(source)} microcopy={MICROCOPY} />
    </section>
  );
}

function cardStyle(variant: Variant): React.CSSProperties {
  if (variant === "band") {
    return {
      marginTop: 48,
      paddingBlock: 48,
      paddingInline: 24,
      background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
      borderRadius: 20,
    };
  }
  if (variant === "compact") {
    return {
      padding: 18,
      borderRadius: 16,
      background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
      border: "1px solid color-mix(in srgb, var(--primary) 14%, transparent)",
    };
  }
  return {
    marginTop: 56,
    padding: 28,
    borderRadius: 20,
    background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
    border: "1px solid color-mix(in srgb, var(--primary) 14%, transparent)",
  };
}

// La firma actual de <NewsletterForm /> (MAT-24) acepta "blog" | "footer" |
// "popup" | "embed" | "other". El parámetro `source` queda en el contrato del
// card (spec §5.8) para que cuando la firma se amplíe sólo cambie este map.
function mapSource(source: Source): "blog" {
  void source;
  return "blog";
}
