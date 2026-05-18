// Count-up animado para stats del hero.
// Cuando el componente entra al viewport por primera vez, anima de 0 al valor
// real. Si el string no es numérico (ej. "—" o "$1.2M") se renderiza tal cual.
"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  durationMs?: number;
};

export function Counter({ value, durationMs = 1400 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(0);
  const startedRef = useRef(false);

  const match = value.match(/^(\D*)([\d.,]+)(.*)$/);
  const prefix = match?.[1] ?? "";
  const numStr = match?.[2] ?? "";
  const suffix = match?.[3] ?? "";
  const target = parseFloat(numStr.replace(/,/g, ""));
  const hasThousands = numStr.includes(",");
  const decimals = numStr.includes(".") ? numStr.split(".")[1].length : 0;
  const animatable = match != null && isFinite(target) && target > 0;

  useEffect(() => {
    if (!animatable || !ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !startedRef.current) {
          startedRef.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / durationMs);
            const eased = 1 - Math.pow(1 - t, 3);
            setShown(target * eased);
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          obs.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [animatable, target, durationMs]);

  if (!animatable) return <>{value}</>;

  const display = hasThousands
    ? Math.round(shown).toLocaleString("en-US")
    : decimals > 0
      ? shown.toFixed(decimals)
      : Math.round(shown).toString();

  return (
    <span ref={ref}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
