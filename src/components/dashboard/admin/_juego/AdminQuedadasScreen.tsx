"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRealtimeRefresh } from "../../useRealtimeRefresh";
import { useToast } from "../../ToastProvider";
import { usePromptModal } from "../../widgets/PromptModal";
import {
  cancelQuedadaAdmin,
  listQuedadaReports,
  listQuedadasAdmin,
  resolveQuedadaReport,
} from "@/server/actions/admin/quedadas";
import {
  AJFilterBar,
  AJHero,
  AJIconButton,
  AJKpiStrip,
  AJSearchInput,
  AJStatusChip,
  ajFmtDate,
  ajRel,
} from "./components";
import {
  QUEDADA_FORMAT_LABEL,
  QUEDADA_STATUS_META,
  QUEDADAS_HERO_BG,
  SEVERITY_META,
  type QuedadaFormat,
  type QuedadaStatus,
  type Severity,
} from "./constants";

type QuedadaReport = {
  id: string;
  quedadaId: string;
  quedadaTitle: string;
  reporter: string;
  reason: string;
  severity: Severity;
  createdAt: string;
};

type QuedadaRow = {
  id: string;
  title: string;
  creator: string;
  format: QuedadaFormat;
  status: QuedadaStatus;
  startsAt: string;
  maxPlayers: number;
  participantCount: number;
  feeCents: number;
  visibility: "public" | "private";
  reportsCount: number;
};

const NON_CANCELABLE = new Set<QuedadaStatus>(["cancelled", "finished"]);
const QUEDADAS_TABLE_COLS = "minmax(260px,1.6fr) 1fr 1fr 100px 90px auto";

function severityFor(createdAt: string): Severity {
  const ageHours = (Date.now() - Date.parse(createdAt)) / 36e5;
  if (ageHours <= 1) return "high";
  if (ageHours <= 6) return "medium";
  return "low";
}

function normalizeStatus(status: string, participantCount: number, maxPlayers: number): QuedadaStatus {
  if (status === "registration_open" && maxPlayers > 0 && participantCount >= maxPlayers) return "full";
  if (status in QUEDADA_STATUS_META) return status as QuedadaStatus;
  return "draft";
}

export function AdminQuedadasScreen() {
  const toast = useToast();
  const router = useRouter();
  const { confirm } = usePromptModal();
  const [pending, startTransition] = useTransition();
  const [reports, setReports] = useState<QuedadaReport[]>([]);
  const [list, setList] = useState<QuedadaRow[]>([]);
  const [filter, setFilter] = useState({ format: "all", status: "all", q: "" });
  const rtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    startTransition(async () => {
      const [reportsRes, quedadasRes] = await Promise.all([listQuedadaReports(), listQuedadasAdmin()]);
      if (reportsRes.ok) {
        setReports(
          reportsRes.data.map((r) => ({
            id: r.id,
            quedadaId: r.quedadaId,
            quedadaTitle: r.quedadaTitle,
            reporter: r.reporterName,
            reason: r.reason,
            severity: severityFor(r.createdAt),
            createdAt: r.createdAt,
          })),
        );
      } else {
        toast({ icon: "alert-triangle", title: "No se cargaron reportes", sub: reportsRes.error.message });
      }
      if (quedadasRes.ok) {
        setList(
          quedadasRes.data.map((q) => ({
            id: q.id,
            title: q.title,
            creator: q.creatorName,
            format: (q.format in QUEDADA_FORMAT_LABEL ? q.format : "libre") as QuedadaFormat,
            status: normalizeStatus(q.status, q.participantCount, q.maxPlayers),
            startsAt: q.startsAt,
            maxPlayers: q.maxPlayers,
            participantCount: q.participantCount,
            feeCents: q.feeCents,
            visibility: q.visibility === "private" ? "private" : "public",
            reportsCount: q.reportsCount,
          })),
        );
      } else {
        toast({ icon: "alert-triangle", title: "No se cargaron quedadas", sub: quedadasRes.error.message });
      }
    });
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () => () => {
      if (rtTimer.current) clearTimeout(rtTimer.current);
    },
    [],
  );

  useRealtimeRefresh(
    [
      { table: "quedadas" },
      { table: "quedada_participants" },
      { table: "quedada_guests" },
      { table: "quedada_reports" },
    ],
    {
      onChange: () => {
        if (rtTimer.current) clearTimeout(rtTimer.current);
        rtTimer.current = setTimeout(load, 900);
      },
    },
  );

  const stats = [
    { v: reports.length, l: "Reportes", highlight: reports.length > 0 },
    { v: list.filter((q) => q.status === "registration_open" || q.status === "full").length, l: "Abiertas" },
    { v: list.filter((q) => q.status === "live").length, l: "En curso" },
    { v: list.filter((q) => q.status === "cancelled").length, l: "Canceladas" },
  ];

  const filtered = useMemo(
    () =>
      list.filter((q) => {
        if (filter.format !== "all" && q.format !== filter.format) return false;
        if (filter.status !== "all" && q.status !== filter.status) return false;
        if (filter.q && !(q.title.toLowerCase().includes(filter.q.toLowerCase()) || q.creator.toLowerCase().includes(filter.q.toLowerCase()))) return false;
        return true;
      }),
    [filter, list],
  );

  const resolveReport = (rep: QuedadaReport, kind: "resolved" | "dismissed") => {
    startTransition(async () => {
      const res = await resolveQuedadaReport({ reportId: rep.id, resolution: kind });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo actualizar", sub: res.error.message });
        return;
      }
      setReports((prev) => prev.filter((r) => r.id !== rep.id));
      toast({
        icon: kind === "resolved" ? "check" : "x",
        title: kind === "resolved" ? "Reporte resuelto" : "Reporte descartado",
        sub: rep.quedadaTitle,
      });
      router.refresh();
    });
  };

  const cancelQuedada = async (q: QuedadaRow) => {
    const ok = await confirm({
      title: "Cancelar quedada",
      body: `¿Cancelar "${q.title}"? Esta acción cierra la quedada para todos los participantes.`,
      confirmLabel: "Cancelar quedada",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelQuedadaAdmin({ quedadaId: q.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: res.error.message });
        return;
      }
      setList((prev) => prev.map((x) => (x.id === q.id ? { ...x, status: "cancelled" } : x)));
      toast({ icon: "ban", title: "Quedada cancelada", sub: q.title });
      router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AJHero
        chipText=""
        title="Quedadas"
        sub="Atiende reportes de moderación, inspecciona todas las quedadas y cancela las problemáticas."
        wordmark="QUED"
        bg={QUEDADAS_HERO_BG}
      />
      <AJKpiStrip stats={stats} />

      {reports.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.02em" }}>
              Reportes urgentes<span className="dot">.</span>
            </span>
            <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}>Cola de moderación abierta</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 9.5, fontWeight: 900, padding: "2px 8px", borderRadius: 9999, background: "rgba(220,38,38,0.10)", color: "#dc2626", letterSpacing: "0.08em" }}>{reports.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reports.map((rep) => {
              const severity = SEVERITY_META[rep.severity];
              return (
                <div key={rep.id} className="card" style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <AJStatusChip {...severity} />
                        <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}>{ajRel(rep.createdAt)}</span>
                        <span style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>·</span>
                        <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}>
                          Reportado por <b style={{ color: "var(--fg)" }}>{rep.reporter}</b>
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--fg)", lineHeight: 1.4 }}>{rep.reason}</div>
                      <div style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 600, marginTop: 4 }}>
                        <Icon name="link-2" size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
                        {rep.quedadaTitle}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => resolveReport(rep, "resolved")} className="btn btn-primary" style={{ fontSize: 11, padding: "7px 12px" }}>
                        <Icon name="check" size={12} />
                        Resolver
                      </button>
                      <button onClick={() => resolveReport(rep, "dismissed")} className="btn" style={{ fontSize: 11, padding: "7px 12px", background: "#fff", border: "1px solid var(--border)" }}>
                        Descartar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.02em" }}>
            Todas las quedadas<span className="dot">.</span>
          </span>
          <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}>Inspecciona y modera</span>
          <span style={{ flex: 1 }} />
          <AJSearchInput value={filter.q} onChange={(v) => setFilter({ ...filter, q: v })} placeholder="Buscar por título o organizador…" />
        </div>
        <AJFilterBar
          totalAll={list.length}
          totalShown={filtered.length}
          onClear={() => setFilter({ format: "all", status: "all", q: "" })}
          groups={[
            { label: "Formato", value: filter.format, onChange: (v) => setFilter({ ...filter, format: v }), options: [{ k: "all", l: "Todos" }, ...Object.entries(QUEDADA_FORMAT_LABEL).map(([k, l]) => ({ k, l }))] },
            {
              label: "Estado",
              value: filter.status,
              onChange: (v) => setFilter({ ...filter, status: v }),
              options: [
                { k: "all", l: "Todos" },
                { k: "registration_open", l: "Abierta" },
                { k: "live", l: "En curso" },
                { k: "full", l: "Llena" },
                { k: "finished", l: "Finalizada" },
                { k: "cancelled", l: "Cancelada" },
              ],
            },
          ]}
        />
        {filtered.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted-fg)" }}>
            <Icon name="search-x" size={26} color="var(--muted-fg)" />
            <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, marginTop: 10, color: "var(--fg)" }}>
              Sin resultados<span className="dot">.</span>
            </div>
            <p style={{ fontSize: 12, marginTop: 6 }}>Prueba quitando filtros o cambiando la búsqueda.</p>
          </div>
        ) : (
          <div className="card mp-table-scroll" style={{ padding: 0, overflow: "hidden" }}>
            <div className="mp-admin-matches-inner">
              <div className="mp-table-row" style={{ display: "grid", gridTemplateColumns: QUEDADAS_TABLE_COLS, gap: 12, padding: "10px 16px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)", borderBottom: "1px solid var(--border)", background: "var(--muted)", alignItems: "center" }}>
                <span>Quedada</span>
                <span>Organizador</span>
                <span>Formato · cuándo</span>
                <span>Cupo</span>
                <span>Estado</span>
                <span />
              </div>
              {filtered.map((q, i) => {
                const cancelable = !NON_CANCELABLE.has(q.status);
                const sm = QUEDADA_STATUS_META[q.status];
                return (
                  <div key={q.id} className="mp-table-row" style={{ display: "grid", gridTemplateColumns: QUEDADAS_TABLE_COLS, gap: 12, padding: "12px 16px", alignItems: "center", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : 0, background: cancelable ? "#fff" : "#fafafa" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.title}</span>
                        {q.reportsCount > 0 ? (
                          <span title={`${q.reportsCount} reportes`} style={{ fontSize: 9, fontWeight: 900, padding: "1px 6px", borderRadius: 9999, background: "#fee2e2", color: "#dc2626", flexShrink: 0 }}>
                            <Icon name="alert-triangle" size={8} style={{ verticalAlign: "middle", marginRight: 3 }} />
                            {q.reportsCount}
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>{q.id}</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--fg)" }}>{q.creator}</span>
                    <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
                      <b style={{ color: "var(--fg)" }}>{QUEDADA_FORMAT_LABEL[q.format]}</b>
                      <br />
                      <span style={{ fontSize: 10.5 }}>{ajFmtDate(q.startsAt)}</span>
                    </span>
                    <span className="font-heading tabular" style={{ fontSize: 12.5, fontWeight: 900, color: "var(--fg)" }}>
                      {q.participantCount}/{q.maxPlayers}
                    </span>
                    <AJStatusChip {...sm} />
                    <div style={{ display: "flex", gap: 6 }}>
                      <AJIconButton title="Ver detalles" icon="eye" onClick={() => router.push(`/dashboard/admin/quedada/${q.id}`)} />
                      {cancelable ? (
                        <AJIconButton title="Cancelar quedada" icon="x" onClick={() => void cancelQuedada(q)} border="1px solid #fecaca" color="#dc2626" disabled={pending} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
