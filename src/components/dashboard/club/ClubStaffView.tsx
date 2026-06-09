"use client";

const STAFF_SCHEDULE_COLS = "170px 1fr 100px";
// Club Owner · Personal v2 — HR command center. Migrado del prototipo
// (ui_kits/dashboard/ClubOwnerStaffScreen.jsx): PolHero + KPIs + timeline de
// turnos en vivo + filtro por departamento + cards de staff + distribución +
// desglose de nómina. data-lucide → <Icon>, botones → toast.
//
// ⚠️ DEMO: datos mock. Reemplaza la real ClubStaffScreen + ClubStaffScreenView
// (staff real del club vía role_assignments), preservada y des-importada.
// Sueldos/comisiones/nómina y el descuento del payout son ilustrativos (no hay
// modelo de nómina ni payouts aún). Ver 04-placeholders.md.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "@/components/dashboard/widgets/PolHero";
import { useToast } from "@/components/dashboard/ToastProvider";
import { AssignStaffModal } from "./AssignStaffModal";

type Status = "in-shift" | "incoming" | "just-out" | "off";
type Staff = {
  id: number; n: string; role: string; dept: string; av: string; avBg: string; email: string; tel: string;
  schedule: string; wkSched: number[]; salary: number | string; salaryNum?: number;
  perfLabel: string; perfValue: number; perfMax: number; perfColor: string;
  status: Status; shiftIn: string; tenure: string; online: boolean; star?: boolean; isNew?: boolean;
};

const STAFF: Staff[] = [
  { id: 1, n: "Valeria Suárez", role: "Manager", dept: "admin", av: "VS", avBg: "linear-gradient(135deg,#0ea5e9,#0369a1)", email: "valeria@clubnorte.ec", tel: "+593 99 145 8821", schedule: "Lun–Vie · 09:00–18:00", wkSched: [1, 1, 1, 1, 1, 0, 0], salary: 1200, perfLabel: "NPS gestión", perfValue: 88, perfMax: 100, perfColor: "#10b981", status: "in-shift", shiftIn: "08:55", tenure: "3.2 años", online: true },
  { id: 2, n: "Joaquín Silva", role: "Coach jefe", dept: "coach", av: "JS", avBg: "linear-gradient(135deg,#f59e0b,#ef4444)", email: "joaquin@clubnorte.ec", tel: "+593 99 712 4408", schedule: "Variable · 36h/sem", wkSched: [1, 1, 1, 1, 1, 1, 0], salary: "Comisión", salaryNum: 1840, perfLabel: "Rating clases", perfValue: 4.92, perfMax: 5, perfColor: "#fbbf24", status: "in-shift", shiftIn: "14:00", tenure: "4.8 años", online: true, star: true },
  { id: 3, n: "Sofía Andrade", role: "Recepcionista", dept: "recep", av: "SA", avBg: "linear-gradient(135deg,#10b981,#34d399)", email: "sofia@clubnorte.ec", tel: "+593 99 558 1102", schedule: "Lun–Vie · 07:00–15:00", wkSched: [1, 1, 1, 1, 1, 0, 0], salary: 680, perfLabel: "Check-ins · sem", perfValue: 184, perfMax: 200, perfColor: "#10b981", status: "in-shift", shiftIn: "06:58", tenure: "1.6 años", online: true },
  { id: 4, n: "Andrés Padilla", role: "Recepcionista", dept: "recep", av: "AP", avBg: "linear-gradient(135deg,#7c3aed,#db2777)", email: "andres@clubnorte.ec", tel: "+593 99 822 6710", schedule: "Lun–Vie · 15:00–23:00", wkSched: [1, 1, 1, 1, 1, 0, 0], salary: 680, perfLabel: "Check-ins · sem", perfValue: 142, perfMax: 200, perfColor: "#fbbf24", status: "incoming", shiftIn: "15:00 hoy", tenure: "0.8 años", online: false },
  { id: 5, n: "Pedro Salas", role: "Coach", dept: "coach", av: "PS", avBg: "linear-gradient(135deg,#0c4a6e,#0ea5e9)", email: "pedro@clubnorte.ec", tel: "+593 99 401 5582", schedule: "Mar–Sáb · variable", wkSched: [0, 1, 1, 1, 1, 1, 0], salary: "Comisión", salaryNum: 1240, perfLabel: "Rating clases", perfValue: 4.78, perfMax: 5, perfColor: "#fbbf24", status: "off", shiftIn: "mañana 09:00", tenure: "2.1 años", online: false },
  { id: 6, n: "Tomás Bravo", role: "Mantenimiento", dept: "mant", av: "TB", avBg: "linear-gradient(135deg,#0a0a0a,#374151)", email: "tomas@clubnorte.ec", tel: "+593 99 314 7891", schedule: "Lun–Sáb · 05:00–12:00", wkSched: [1, 1, 1, 1, 1, 1, 0], salary: 540, perfLabel: "Tickets resueltos", perfValue: 23, perfMax: 25, perfColor: "#10b981", status: "just-out", shiftIn: "salió 12:00", tenure: "5.4 años", online: false },
  { id: 7, n: "Renata Mora", role: "Pro shop · Bar", dept: "shop", av: "RM", avBg: "linear-gradient(135deg,#dc2626,#fb923c)", email: "renata@clubnorte.ec", tel: "+593 99 678 2240", schedule: "Mar–Dom · 14:00–22:00", wkSched: [0, 1, 1, 1, 1, 1, 1], salary: 620, perfLabel: "Ventas · mes", perfValue: 780, perfMax: 1200, perfColor: "#fbbf24", status: "incoming", shiftIn: "14:00 hoy", tenure: "1.2 años", online: false },
  { id: 8, n: "Camilo Reyes", role: "Coach junior", dept: "coach", av: "CR", avBg: "linear-gradient(135deg,#16a34a,#65a30d)", email: "camilo@clubnorte.ec", tel: "+593 99 902 1145", schedule: "Lun, Mié, Vie · 16:00–20:00", wkSched: [1, 0, 1, 0, 1, 0, 0], salary: "Comisión", salaryNum: 480, perfLabel: "Rating clases", perfValue: 4.55, perfMax: 5, perfColor: "#fbbf24", status: "off", shiftIn: "mañana 16:00", tenure: "0.4 años", online: false, isNew: true },
];

const DEPARTMENTS = [
  { k: "all", l: "Todos", icon: "users", color: "#0a0a0a" },
  { k: "coach", l: "Coaches", icon: "graduation-cap", color: "#fbbf24" },
  { k: "recep", l: "Recepción", icon: "concierge-bell", color: "#10b981" },
  { k: "admin", l: "Administración", icon: "briefcase", color: "#0ea5e9" },
  { k: "mant", l: "Mantenimiento", icon: "wrench", color: "#7c3aed" },
  { k: "shop", l: "Pro shop & Bar", icon: "shopping-bag", color: "#dc2626" },
];

const STATUS_CFG: Record<Status, { l: string; bg: string; fg: string }> = {
  "in-shift": { l: "● EN TURNO", bg: "rgba(16,185,129,0.12)", fg: "#10b981" },
  incoming: { l: "↗ ENTRA", bg: "rgba(251,191,36,0.12)", fg: "#92400e" },
  "just-out": { l: "↙ SALIÓ", bg: "var(--muted)", fg: "var(--muted-fg)" },
  off: { l: "○ DESCANSO", bg: "var(--muted)", fg: "var(--muted-fg)" },
};
const TODAY_HOURS: Record<number, [number, number]> = { 1: [9, 18], 2: [14, 22], 3: [7, 15], 4: [15, 23], 6: [5, 12], 7: [14, 22] };
const CURRENT_HOUR = 14.6;

function StatusPill({ status, shiftIn }: { status: Status; shiftIn: string }) {
  const cfg = STATUS_CFG[status];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 9999, background: cfg.bg, fontSize: 9, fontWeight: 900, letterSpacing: "0.1em", color: cfg.fg, whiteSpace: "nowrap" }}>
      {cfg.l} <span style={{ opacity: 0.7, fontSize: 8.5 }}>· {shiftIn}</span>
    </div>
  );
}

export function ClubStaffView({ clubId, canAssign }: { clubId?: string | null; canAssign?: boolean } = {}) {
  const toast = useToast();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const soon = (title: string) => toast({ icon: "sparkles", title });

  const filtered = STAFF.filter((s) => (filter === "all" || s.dept === filter) && (search === "" || s.n.toLowerCase().includes(search.toLowerCase()) || s.role.toLowerCase().includes(search.toLowerCase())));
  const countByDept = (k: string) => (k === "all" ? STAFF.length : STAFF.filter((s) => s.dept === k).length);
  const today = STAFF.filter((s) => s.status === "in-shift" || s.status === "incoming" || s.status === "just-out").map((s) => {
    const hours = TODAY_HOURS[s.id] || [9, 17];
    return { ...s, from: hours[0], to: hours[1] };
  });
  const days = ["L", "M", "X", "J", "V", "S", "D"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PolHero
        tone="dark"
        wm="TEAM"
        accent="#10b981"
        label={"Club · Personal · " + STAFF.length + " personas"}
        title="Tu equipo"
        sub="Quién está en turno, quién entra, cómo van. La gente que hace que el club funcione."
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }} onClick={() => soon("Calendario de turnos · próximamente")}><Icon name="calendar-clock" size={13} color="#fff" />Calendario de turnos</button>
            <button className="btn" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }} onClick={() => soon("Nómina del mes · próximamente")}><Icon name="file-text" size={13} color="#fff" />Nómina del mes</button>
            <button className="btn btn-primary" onClick={() => (canAssign && clubId ? setAssignOpen(true) : soon("Solo el dueño del club puede asignar staff"))}><Icon name="user-plus" size={13} color="#fff" />Asignar staff</button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="mp-stf-kpis">
        {[
          { l: "Empleados activos", v: String(STAFF.length), sub: "4 en turno ahora", icon: "users", color: "var(--primary)" },
          { l: "Nómina del mes", v: "$5,540", sub: "4 fijos + 4 comisión", icon: "banknote", color: "#0a0a0a" },
          { l: "Horas trabajadas", v: "218h", sub: "esta semana · meta 240", icon: "clock", color: "#0a0a0a" },
          { l: "Coaches activos", v: "3", sub: "rating prom · 4.75", icon: "graduation-cap", color: "#fbbf24" },
        ].map((k) => (
          <div key={k.l} className="card" style={{ padding: 18, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: 9, background: k.color === "var(--primary)" ? "rgba(16,185,129,0.1)" : k.color === "#fbbf24" ? "rgba(251,191,36,0.12)" : "var(--muted)", color: k.color, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={k.icon} size={16} color={k.color} />
            </div>
            <div className="label-mp" style={{ paddingRight: 40 }}>{k.l}</div>
            <div className="font-heading tabular" style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.04em", marginTop: 10, color: k.color }}>{k.v}</div>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Today's live shift timeline */}
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp">● Hoy · jue 22 may · 14:36</div>
            <h2 className="font-heading" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.025em", textTransform: "uppercase", margin: "4px 0 0" }}>Quién está en el club ahora<span className="dot">.</span></h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 11, color: "var(--muted-fg)", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "var(--primary)" }} />En turno</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "#a1a1aa" }} />Hecho</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: "rgba(251,191,36,0.3)", border: "1px dashed #fbbf24" }} />Próximo</div>
          </div>
        </div>

        <div className="mp-stf-schedule-scroll">
          <div className="mp-stf-schedule-inner">
            <div className="mp-table-row" style={{ display: "grid", gridTemplateColumns: STAFF_SCHEDULE_COLS, gap: 12, alignItems: "center", marginBottom: 4 }}>
              <div />
              <div className="mp-grid-hours-17" style={{ gap: 1, fontSize: 8.5, color: "var(--muted-fg)", textAlign: "center", fontWeight: 700, letterSpacing: "0.05em" }}>
                {Array.from({ length: 17 }, (_, i) => 5 + i).map((h) => (
                  <div key={h}>{h % 2 === 0 ? h : ""}</div>
                ))}
              </div>
              <div />
            </div>
            {today.map((s) => {
              const startPct = ((s.from - 5) / 17) * 100;
              const widthPct = ((s.to - s.from) / 17) * 100;
              const currentPct = ((CURRENT_HOUR - 5) / 17) * 100;
              const done = CURRENT_HOUR >= s.to;
              const upcoming = CURRENT_HOUR < s.from;
              return (
                <div key={s.id} className="mp-table-row" style={{ display: "grid", gridTemplateColumns: STAFF_SCHEDULE_COLS, gap: 12, alignItems: "center", padding: "6px 0", borderTop: "1px dashed var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: s.avBg, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, flexShrink: 0 }}>{s.av}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.n}</div>
                      <div style={{ fontSize: 9, color: "var(--muted-fg)", fontWeight: 700, letterSpacing: "0.05em" }}>{s.role.toUpperCase()}</div>
                    </div>
                  </div>
                  <div style={{ position: "relative", height: 24, background: "#fafafa", borderRadius: 6, border: "1px solid var(--border)" }}>
                    <div style={{ position: "absolute", top: 2, bottom: 2, left: startPct + "%", width: widthPct + "%", background: done ? "linear-gradient(90deg, #d4d4d4, #a1a1aa)" : upcoming ? "repeating-linear-gradient(45deg, rgba(251,191,36,0.2) 0 4px, rgba(251,191,36,0.4) 4px 8px)" : "linear-gradient(90deg, var(--primary), #34d399)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", fontSize: 9.5, fontWeight: 900, color: done || upcoming ? "#0a0a0a" : "#fff", border: upcoming ? "1px dashed #fbbf24" : 0 }}>
                      <span>{String(s.from).padStart(2, "0")}:00</span>
                      <span>{String(s.to).padStart(2, "0")}:00</span>
                    </div>
                    <div style={{ position: "absolute", top: -3, bottom: -3, left: currentPct + "%", width: 2, background: "#dc2626", borderRadius: 1, zIndex: 2 }} />
                    <div style={{ position: "absolute", top: -8, left: currentPct + "%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "6px solid #dc2626", zIndex: 2 }} />
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {!done && !upcoming && <div className="font-heading" style={{ fontSize: 10, fontWeight: 900, color: "var(--primary)" }}>● {Math.max(0, Math.round((s.to - CURRENT_HOUR) * 10) / 10)}h restantes</div>}
                    {upcoming && <div style={{ fontSize: 10, color: "#92400e", fontWeight: 800 }}>en {Math.round((s.from - CURRENT_HOUR) * 60)} min</div>}
                    {done && <div style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700 }}>{Math.round(s.to - s.from)}h hechas</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter chips + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
          {DEPARTMENTS.map((d) => {
            const on = filter === d.k;
            return (
              <button key={d.k} onClick={() => setFilter(d.k)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9999, background: on ? "#0a0a0a" : "#fff", color: on ? "#fff" : "#0a0a0a", border: on ? "1px solid #0a0a0a" : "1px solid var(--border)", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name={d.icon} size={12} color={on ? "#fff" : d.color} />
                {d.l}
                <span style={{ padding: "1px 6px", borderRadius: 9999, background: on ? "rgba(255,255,255,0.18)" : "var(--muted)", fontSize: 9.5, fontWeight: 900 }}>{countByDept(d.k)}</span>
              </button>
            );
          })}
        </div>
        <div style={{ position: "relative", minWidth: 220 }}>
          <Icon name="search" size={13} color="var(--muted-fg)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o rol…" style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: 9999, border: "1px solid var(--border)", fontSize: 11.5, fontFamily: "inherit", background: "#fff" }} />
        </div>
      </div>

      {/* Staff cards */}
      <div className="mp-stf-cards">
        {filtered.map((s) => {
          const perfPct = (s.perfValue / s.perfMax) * 100;
          return (
            <div key={s.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: 18, paddingBottom: 14, position: "relative", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div className="font-heading" style={{ width: 54, height: 54, borderRadius: 12, background: s.avBg, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 17 }}>{s.av}</div>
                    {s.online && <span style={{ position: "absolute", bottom: -2, right: -2, width: 14, height: 14, borderRadius: "50%", background: "var(--primary)", border: "3px solid #fff" }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em" }}>{s.n}</div>
                      {s.star && <span style={{ padding: "1px 6px", borderRadius: 9999, background: "rgba(251,191,36,0.15)", color: "#92400e", fontSize: 9, fontWeight: 900, letterSpacing: "0.1em" }}>★ TOP COACH</span>}
                      {s.isNew && <span style={{ padding: "1px 6px", borderRadius: 9999, background: "rgba(16,185,129,0.12)", color: "var(--primary)", fontSize: 9, fontWeight: 900, letterSpacing: "0.1em" }}>NUEVO</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--primary)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{s.role}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, fontSize: 10, color: "var(--muted-fg)", flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }}><Icon name="mail" size={10} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.email}</span></span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="award" size={10} />{s.tenure}</span>
                    </div>
                  </div>
                  <StatusPill status={s.status} shiftIn={s.shiftIn} />
                </div>
              </div>

              <div className="mp-stf-card-body" style={{ padding: 16 }}>
                <div>
                  <div className="label-mp" style={{ marginBottom: 6 }}>Semana</div>
                  <div style={{ display: "flex", gap: 3 }}>
                    {days.map((d, i) => (
                      <div key={i} style={{ flex: 1, padding: "6px 0", borderRadius: 6, background: s.wkSched[i] ? "#0a0a0a" : "var(--muted)", color: s.wkSched[i] ? "#fff" : "var(--muted-fg)", textAlign: "center", fontSize: 10, fontWeight: 900 }}>{d}</div>
                    ))}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 6, lineHeight: 1.35 }}>{s.schedule}</div>
                </div>
                <div>
                  <div className="label-mp">Sueldo · mes</div>
                  <div className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", marginTop: 4 }}>
                    {typeof s.salary === "number" ? "$" + s.salary : <>${s.salaryNum}<span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700, marginLeft: 4 }}>estim.</span></>}
                  </div>
                  {typeof s.salary !== "number" && <div style={{ fontSize: 9, color: "var(--primary)", fontWeight: 900, letterSpacing: "0.1em", marginTop: 1 }}>● COMISIÓN</div>}
                </div>
                <div>
                  <div className="label-mp">{s.perfLabel}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
                    <span className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", color: s.perfColor }}>{s.perfValue}</span>
                    <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700 }}>/ {s.perfMax}</span>
                  </div>
                  <div style={{ height: 4, background: "var(--muted)", borderRadius: 9999, marginTop: 4, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: Math.min(100, perfPct) + "%", background: s.perfColor }} />
                  </div>
                </div>
              </div>

              <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", background: "var(--muted)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => soon("Turno de " + s.n + " · próximamente")}><Icon name="calendar" size={11} />Turno</button>
                  <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => soon("Chatear con " + s.n + " · próximamente")}><Icon name="message-circle" size={11} />Chatear</button>
                  <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => soon("Pagar a " + s.n + " · próximamente")}><Icon name="dollar-sign" size={11} />Pagar</button>
                </div>
                <button onClick={() => soon("Más opciones · próximamente")} style={{ width: 28, height: 28, borderRadius: 6, background: "#fff", border: "1px solid var(--border)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="more-horizontal" size={12} /></button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted-fg)", gridColumn: "1 / -1" }}>
            <Icon name="users-round" size={28} style={{ opacity: 0.4 }} />
            <div style={{ marginTop: 10, fontSize: 12 }}>No hay empleados que coincidan con tu filtro.</div>
          </div>
        )}
      </div>

      {/* Bottom: distribution + payroll */}
      <div className="mp-stf-bottom">
        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp">Distribución del equipo</div>
          <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>Por departamento<span className="dot">.</span></h3>
          {DEPARTMENTS.filter((d) => d.k !== "all").map((d) => {
            const c = countByDept(d.k);
            const pct = (c / STAFF.length) * 100;
            return (
              <div key={d.k} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 800 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: d.color }} />{d.l}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                    <b className="font-heading" style={{ color: "#0a0a0a", fontSize: 13 }}>{c}</b> · {Math.round(pct)}%
                  </div>
                </div>
                <div style={{ height: 6, background: "var(--muted)", borderRadius: 9999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: pct + "%", background: d.color }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
            <div>
              <div className="label-mp">Nómina · mayo 2026</div>
              <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Desglose de pagos<span className="dot">.</span></h3>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="font-heading tabular" style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.035em", color: "var(--primary)" }}>$5,540</div>
              <div style={{ fontSize: 9.5, color: "var(--muted-fg)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>Total a pagar · 1 jun</div>
            </div>
          </div>
          {[
            { l: "Fijos · 4 personas", v: "$3,100", sub: "Manager, recepción ×2, mantenim.", pct: 56, color: "#0a0a0a" },
            { l: "Comisión · 3 coaches", v: "$1,820", sub: "Joaquín, Pedro, Camilo · 18%", pct: 33, color: "#fbbf24" },
            { l: "Pro shop & bar", v: "$620", sub: "Renata · fijo + bono ventas", pct: 11, color: "#dc2626" },
          ].map((r, i) => (
            <div key={r.l} style={{ padding: "10px 0", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{r.l}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>{r.sub}</div>
                </div>
                <span className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.025em" }}>{r.v}</span>
              </div>
              <div style={{ height: 5, background: "var(--muted)", borderRadius: 9999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: r.pct + "%", background: r.color }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 14, padding: 12, background: "var(--muted)", borderRadius: 8, fontSize: 10.5, color: "var(--muted-fg)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="info" size={13} />
            La nómina se descontaría del payout del <b style={{ color: "#0a0a0a" }}>1 de junio</b>. Cambios en sueldos toman efecto el próximo ciclo.
          </div>
        </div>
      </div>

      {assignOpen && clubId && <AssignStaffModal clubId={clubId} onClose={() => setAssignOpen(false)} />}
    </div>
  );
}
