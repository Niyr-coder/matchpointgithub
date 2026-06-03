import type { QuedadaFormat } from "@/lib/schemas/quedadas";

/** Metadatos de display para formatos de quedada. Los `format` en BD no cambian. */
export type QuedadaFormatMeta = {
  /** Nombre visible (pickleball social, español ecuatoriano neutro). */
  label: string;
  /** Marca de agua / badge compacto. */
  shortLabel: string;
  /** Subtítulo para wizard y tooltips. */
  description: string;
};

export const QUEDADA_FORMAT_META: Record<QuedadaFormat, QuedadaFormatMeta> = {
  americano: {
    label: "Rotación de parejas",
    shortLabel: "Rotación",
    description: "Rotás compañero y rival cada ronda; ranking individual por puntos",
  },
  mexicano: {
    label: "Escalera por nivel",
    shortLabel: "Escalera",
    description: "Cada ronda empareja jugadores por posición actual en la tabla",
  },
  round_robin: {
    label: "Todos contra todos",
    shortLabel: "Round Robin",
    description: "Parejas fijas; cada equipo juega contra el resto",
  },
  kotc: {
    label: "Rey de la cancha",
    shortLabel: "KOTC",
    description: "Orden por cancha según rendimiento reciente",
  },
  canguil: {
    label: "Mezcla social",
    shortLabel: "Mezcla",
    description: "Parejas y rivales al azar cada ronda",
  },
  libre: {
    label: "Personalizado",
    shortLabel: "Manual",
    description: "Partidos y resultados manuales",
  },
};

/** @deprecated Usa `quedadaFormatLabel`. Mapa plano para compat con imports viejos. */
export const QUEDADA_FORMAT_LABEL: Record<QuedadaFormat, string> = Object.fromEntries(
  Object.entries(QUEDADA_FORMAT_META).map(([k, v]) => [k, v.label]),
) as Record<QuedadaFormat, string>;

export function quedadaFormatLabel(format: string): string {
  const meta = QUEDADA_FORMAT_META[format as QuedadaFormat];
  return meta?.label ?? format;
}

export function quedadaFormatShortLabel(format: string): string {
  const meta = QUEDADA_FORMAT_META[format as QuedadaFormat];
  return meta?.shortLabel ?? format;
}

export function quedadaFormatDescription(format: string): string {
  const meta = QUEDADA_FORMAT_META[format as QuedadaFormat];
  return meta?.description ?? "";
}

export function quedadaFormatOptions(): Array<{ k: QuedadaFormat; label: string; sub: string }> {
  return (Object.keys(QUEDADA_FORMAT_META) as QuedadaFormat[]).map((k) => ({
    k,
    label: QUEDADA_FORMAT_META[k].label,
    sub: QUEDADA_FORMAT_META[k].description,
  }));
}
