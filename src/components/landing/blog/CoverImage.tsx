import Image from "next/image";
import type { BlogCategory } from "@/lib/blog/posts";

type Aspect = "16/9" | "21/9";

type Props = {
  src?: string;
  alt?: string;
  category: BlogCategory;
  title: string;
  aspect?: Aspect;
  priority?: boolean;
  sizes?: string;
  className?: string;
  rounded?: number;
  showOverlayTitle?: boolean;
};

const GRADIENT_BY_CATEGORY: Record<BlogCategory, string> = {
  Comunidad: "linear-gradient(135deg, #064e3b 0%, #10b981 60%, #f97056 100%)",
  Guías: "linear-gradient(135deg, #064e3b 0%, #10b981 55%, #0ea5e9 100%)",
  Producto: "linear-gradient(135deg, #022c22 0%, #064e3b 50%, #10b981 100%)",
  Clubes: "linear-gradient(135deg, #064e3b 0%, #10b981 55%, #f59e0b 100%)",
  Coaches: "linear-gradient(135deg, #064e3b 0%, #10b981 55%, #8b5cf6 100%)",
  Coaching: "linear-gradient(135deg, #064e3b 0%, #10b981 55%, #8b5cf6 100%)",
};

// Set vacío hasta que existan los JPGs reales en /public/blog/.
// Cuando aterricen, listalos acá para que el componente sirva `<Image>` real
// en lugar del fallback gradient.
const KNOWN_COVERS = new Set<string>();

export function CoverImage({
  src,
  alt,
  category,
  title,
  aspect = "16/9",
  priority = false,
  sizes,
  className,
  rounded,
  showOverlayTitle = true,
}: Props) {
  const aspectClass = aspect === "21/9" ? "aspect-[21/9]" : "aspect-[16/9]";
  const hasReal = Boolean(src) && KNOWN_COVERS.has(src as string);
  const radius = rounded ?? 12;

  return (
    <div
      className={`relative w-full overflow-hidden ${aspectClass} ${className ?? ""}`}
      style={{
        borderRadius: radius,
        background:
          GRADIENT_BY_CATEGORY[category] ?? GRADIENT_BY_CATEGORY.Producto,
      }}
    >
      {hasReal && src ? (
        <Image
          src={src}
          alt={alt ?? ""}
          fill
          priority={priority}
          sizes={sizes ?? "(min-width: 1024px) 720px, 100vw"}
          className="object-cover"
        />
      ) : (
        <CoverPattern />
      )}

      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {!hasReal && showOverlayTitle && (
        <div
          className="absolute inset-0 flex items-end p-4 md:p-5"
          aria-hidden
        >
          <span
            className="font-heading"
            style={{
              color: "#fff",
              fontSize: "clamp(15px, 2.4vw, 22px)",
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
              textShadow: "0 1px 2px rgba(0,0,0,0.35)",
            }}
          >
            {title}
          </span>
        </div>
      )}
    </div>
  );
}

function CoverPattern() {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
    >
      <g opacity="0.18" stroke="#ffffff" strokeWidth="0.45">
        <rect x="20" y="14" width="120" height="62" />
        <line x1="80" y1="14" x2="80" y2="76" />
        <line x1="20" y1="45" x2="50" y2="45" />
        <line x1="110" y1="45" x2="140" y2="45" />
        <line x1="50" y1="14" x2="50" y2="76" />
        <line x1="110" y1="14" x2="110" y2="76" />
      </g>
      <g opacity="0.10" fill="#ffffff">
        <circle cx="135" cy="22" r="2" />
        <circle cx="28" cy="68" r="2" />
      </g>
    </svg>
  );
}
