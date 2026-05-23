// Contrato de datos de las métricas de admin + re-export del view.
//
// El server `AdminMetricsScreen` calcula `MetricsData` (métricas REALES por
// periodo) y lo pasa a `AdminMetricsScreenView`, que ES el rediseño v2
// (`AdminMetricasView.tsx`). Este módulo concentra los tipos para que server y
// view compartan un solo contrato, y reexporta el componente para no cambiar el
// import del server. Ver AdminMetricsScreen.tsx.
export type PeriodKey = "24h" | "7d" | "30d" | "90d" | "ytd";

export type KpiStat = { value: number; delta: number | null; up: boolean };

export type PeriodData = {
  kpis: {
    mau: KpiStat; // usuarios activos en la ventana del periodo (24h = DAU)
    dau: KpiStat; // activos en 24 h (fijo)
    gmvCents: KpiStat; // GMV en cents de la ventana
    takeRatePct: number; // comisión efectiva (platform_config)
    totalUsers: number; // usuarios registrados (perfiles)
  };
  gmvSeries: number[]; // GMV en USD por bucket del periodo (actual)
  gmvSeriesPrev: number[]; // GMV en USD del periodo anterior, mismo tamaño
};

export type BreakdownRow = { label: string; value: string; pct: number; delta?: string; color?: string };

export type MetricsData = {
  generatedAt: string; // ISO de cuándo se calculó (para "última sincronización")
  periods: Record<PeriodKey, PeriodData>;
  funnel: { label: string; value: number; pct: number }[];
  heatmap: number[][]; // [7 días Lun..Dom][24 horas] = reservas, 90 días
  heatPeak: { dow: number; hour: number };
  cohorts: { label: string; size: number; data: (number | null)[] }[];
  cohortWeeks: number[]; // semanas medidas (W0, W1, ...)
  topSports: BreakdownRow[];
  topCities: BreakdownRow[];
  topClubs: BreakdownRow[];
};

export { AdminMetricsScreenView } from "./AdminMetricasView";
