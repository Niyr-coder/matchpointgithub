// Reveal on scroll. Fade + up de 16px cuando el wrapper entra al viewport.
// Solo dispara una vez. Si prefers-reduced-motion está activo, salta directo
// al estado visible.
"use client";
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

type Props = {
  children: ReactNode;
  delay?: number;
  style?: CSSProperties;
  className?: string;
};

export function Reveal({ children, delay = 0, style, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    if (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "-40px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: `opacity 650ms var(--ease-out) ${delay}ms, transform 650ms var(--ease-out) ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
