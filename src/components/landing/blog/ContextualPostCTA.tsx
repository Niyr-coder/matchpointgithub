import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { BlogPost } from "@/lib/blog/posts";

type Variant = "sidebar" | "band";

type Props = {
  post: BlogPost;
  variant: Variant;
  className?: string;
};

const FALLBACK = { label: "Crea tu cuenta gratis", href: "/registro" };

export function ContextualPostCTA({ post, variant, className }: Props) {
  const cta = post.ctaContext ?? FALLBACK;

  if (variant === "sidebar") {
    return (
      <aside
        className={className ?? ""}
        style={{
          padding: 18,
          borderRadius: 16,
          background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
          border:
            "1px solid color-mix(in srgb, var(--primary) 14%, transparent)",
        }}
      >
        <h3
          className="font-heading"
          style={{
            fontSize: 16,
            fontWeight: 800,
            lineHeight: 1.2,
            margin: 0,
            marginBottom: 12,
            letterSpacing: "-0.01em",
          }}
        >
          ¿Listo para dar el siguiente paso?
        </h3>
        <Link
          href={cta.href}
          className="btn btn-primary w-full inline-flex items-center justify-center gap-2"
          style={{ paddingInline: 14 }}
        >
          {cta.label}
          <Icon name="arrow-right" size={14} />
        </Link>
      </aside>
    );
  }

  return (
    <section
      aria-label="Acción recomendada"
      className={className ?? ""}
      style={{
        paddingBlock: 48,
        paddingInline: 24,
        marginTop: 56,
        background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
        borderRadius: 20,
        textAlign: "center",
      }}
    >
      <h2
        className="font-heading mx-auto"
        style={{
          fontSize: "clamp(22px, 3vw, 30px)",
          fontWeight: 800,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          margin: 0,
          marginBottom: 18,
          maxWidth: 600,
        }}
      >
        ¿Listo para tu próximo partido?
      </h2>
      <Link
        href={cta.href}
        className="btn btn-primary inline-flex items-center gap-2"
        style={{ paddingInline: 22 }}
      >
        {cta.label}
        <Icon name="arrow-right" size={14} />
      </Link>
    </section>
  );
}
