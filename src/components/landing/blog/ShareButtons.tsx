"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type Props = {
  url: string;
  title: string;
  className?: string;
};

export function ShareButtons({ url, title, className }: Props) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setToast(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [toast]);

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(title);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setToast("Enlace copiado");
    } catch {
      setToast("No se pudo copiar");
    }
  };

  return (
    <div
      className={`relative inline-flex items-center gap-1 ${className ?? ""}`}
    >
      <a
        href={`https://wa.me/?text=${encodedText}%20${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Compartir en WhatsApp"
        className="mp-share-btn focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        style={btnStyle()}
      >
        <Icon name="message-circle" size={16} />
      </a>
      <a
        href={`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Compartir en X (Twitter)"
        className="mp-share-btn focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        style={btnStyle()}
      >
        <Icon name="twitter" size={16} />
      </a>
      <button
        type="button"
        onClick={onCopy}
        aria-label="Copiar enlace"
        className="mp-share-btn focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
        style={btnStyle()}
      >
        <Icon name="link" size={16} />
      </button>
      <span
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          background: "#0a0a0a",
          color: "#fff",
          fontSize: 12,
          padding: "6px 10px",
          borderRadius: 8,
          pointerEvents: "none",
          opacity: toast ? 1 : 0,
          transition: "opacity 150ms var(--ease-out)",
          whiteSpace: "nowrap",
        }}
      >
        {toast ?? ""}
      </span>
    </div>
  );
}

function btnStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 9999,
    background: "var(--muted)",
    color: "var(--fg)",
    border: "1px solid var(--border-subtle)",
    cursor: "pointer",
    transition:
      "background 150ms var(--ease-out), color 150ms var(--ease-out)",
  };
}
