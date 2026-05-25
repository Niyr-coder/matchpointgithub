"use client";

// Vista del rediseño AdminTeamsScreen del kit (ui_kits/dashboard/AdminTeamsScreen.jsx).
// Layout pixel-faithful al prototipo. Comportamiento:
//   - Listar/buscar/filtrar/ordenar/seleccionar bulk → real (client-side sobre data del server).
//   - Otorgar logro a un team → real (grantTeamAchievement, mig 164).
//   - Resto de acciones (verify, pin, suspend, archive, dissolve, mensaje al
//     capitán, comunicar a capitanes, editor de política, reportes/moderación)
//     → UI presente, action dispara toast "Pronto" porque no hay backend.
//     Ver `docs/guides/04-placeholders.md`.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { grantTeamAchievement } from "@/server/actions/team-achievements";
import {
  adminDissolveTeam,
  bulkAdminDmToCaptains,
  bulkSetTeamStatusAdmin,
  forceTransferCaptainAdmin,
  sendAdminDmToCaptain,
  setTeamPinnedAdmin,
  setTeamStatusAdmin,
  setTeamVerifiedAdmin,
} from "@/server/actions/admin/teams";
import { resolveTeamReport } from "@/server/actions/team-reports";
import { getTeam } from "@/server/actions/teams";

export type AdminTeamRow = {
  id: string;
  tag: string;
  name: string;
  slug: string;
  sport: string;
  city: string | null;
  color: string;
  privacy: "public" | "invite" | "private";
  members: number;
  rosterMax: number;
  achievementsCount: number;
  reportsCount: number;
  captainId: string;
  captainName: string;
  createdAt: string;
  status: "active" | "suspended" | "archived";
  isVerified: boolean;
  isPinned: boolean;
};

export type AdminReportLite = {
  id: string;
  teamId: string;
  teamName: string;
  teamTag: string;
  kind: "name" | "captain" | "ghost" | "logo" | "other";
  kindLabel: string;
  detail: string | null;
  reporterName: string | null;
  createdAt: string;
};

type Tab = "activos" | "reportes" | "suspendidos" | "archivados" | "todos";
type SortKey = "activity" | "members" | "winrate";
type SportFilter = "all" | string;

// Mock del kit: política global (la mayoría aún no tiene backend; algunas
// leen de constantes / platform_config). Mostrar values reales donde se puede.
const POLICY_DISPLAY = {
  maxMembers: 12, // Free roster cap (premium=24) — desde getTeamCaps()
  teamsPerUser: 1, // Hardcoded en createTeam ("solo puedes ser capitán de uno")
  autoArchive: 90, // No implementado
  nameApproval: "Manual", // No implementado (review-by-admin pendiente)
  defaultPrivacy: "Público",
  requireEmailVerified: "Requerido",
  transferOnInactive: "Desactivada",
  publicRanking: "Oculto", // No existe ranking de teams todavía
} as const;

export function AdminUserTeamsScreenView({
  teams: initialTeams,
  totalUsers,
  openReports: initialReports,
}: {
  teams: AdminTeamRow[];
  totalUsers: number;
  openReports: AdminReportLite[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [teams, setTeams] = useState<AdminTeamRow[]>(initialTeams);
  const [openReports, setOpenReports] = useState<AdminReportLite[]>(initialReports);
  const [tab, setTab] = useState<Tab>("todos");
  const [sort, setSort] = useState<SortKey>("activity");
  const [sport, setSport] = useState<SportFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // El menú flotante usa position: fixed con coords del botón disparador
  // (de lo contrario lo recorta el overflow:hidden de la card de la tabla).
  const [rowMenu, setRowMenu] = useState<{ id: string; top: number; right: number } | null>(null);
  const [grantTarget, setGrantTarget] = useState<AdminTeamRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    team: AdminTeamRow;
    next: AdminTeamRow["status"];
  } | null>(null);
  const [dissolveTarget, setDissolveTarget] = useState<AdminTeamRow | null>(null);
  const [transferTarget, setTransferTarget] = useState<AdminTeamRow | null>(null);
  const [dmTarget, setDmTarget] = useState<AdminTeamRow | null>(null);
  const [bulkAction, setBulkAction] = useState<"dm" | "archive" | null>(null);
  const [headerComposer, setHeaderComposer] = useState(false);
  const [reportResolve, setReportResolve] = useState<AdminReportLite | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const updateTeamRow = useCallback(
    (id: string, patch: Partial<AdminTeamRow>) => {
      setTeams((arr) => arr.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    [],
  );

  // Optimistic toggles (verified / pinned) — refleja antes del refresh.
  const onToggleVerify = async (t: AdminTeamRow) => {
    if (busyId) return;
    setBusyId(t.id);
    const next = !t.isVerified;
    updateTeamRow(t.id, { isVerified: next });
    try {
      const res = await setTeamVerifiedAdmin({ teamId: t.id, verified: next });
      if (!res.ok) {
        updateTeamRow(t.id, { isVerified: !next });
        toast({ icon: "x", title: "No se pudo guardar", sub: res.error.message });
      } else {
        toast({
          icon: next ? "badge-check" : "x",
          title: next ? "Team verificado" : "Verificación removida",
          sub: t.name,
        });
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const onTogglePin = async (t: AdminTeamRow) => {
    if (busyId) return;
    setBusyId(t.id);
    const next = !t.isPinned;
    updateTeamRow(t.id, { isPinned: next });
    try {
      const res = await setTeamPinnedAdmin({ teamId: t.id, pinned: next });
      if (!res.ok) {
        updateTeamRow(t.id, { isPinned: !next });
        toast({ icon: "x", title: "No se pudo guardar", sub: res.error.message });
      } else {
        toast({
          icon: "pin",
          title: next ? "Anclado en discovery" : "Desanclado",
          sub: t.name,
        });
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = (rows: AdminTeamRow[]) => {
    const header = ["tag", "name", "sport", "city", "privacy", "members", "rosterMax", "achievements", "openReports", "status", "verified", "pinned", "captain", "createdAt"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const t of rows) {
      lines.push(
        [
          t.tag,
          t.name,
          t.sport,
          t.city ?? "",
          t.privacy,
          t.members,
          t.rosterMax,
          t.achievementsCount,
          t.reportsCount,
          t.status,
          t.isVerified,
          t.isPinned,
          t.captainName,
          t.createdAt,
        ]
          .map(escape)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `teams-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ icon: "download", title: "CSV descargado", sub: `${rows.length} teams` });
  };

  // KPIs derivados — todos sobre `teams` real.
  const totalTeams = teams.length;
  const totalMembers = teams.reduce((s, t) => s + t.members, 0);
  // Partidos jugados y "teams en liga" no tienen backend (Arena/leagues
  // de teams pendientes). Mantenemos las cards del diseño con valor 0 +
  // sub "Pronto" para preservar el layout 5-col del kit.
  const totalPartidos = 0;
  const leagueTeams = 0;
  const reportsOpen = openReports.length;
  const pctUsers = totalUsers > 0 ? ((totalMembers / totalUsers) * 100).toFixed(1) : "0.0";

  // Tabs filtran por status real (mig 165). "reportes" filtra por
  // reportsCount > 0 (al menos un reporte abierto).
  const activeTeams = teams.filter((t) => t.status === "active").length;
  const reportTeams = teams.filter((t) => t.reportsCount > 0).length;
  const suspendedTeams = teams.filter((t) => t.status === "suspended").length;
  const archivedTeams = teams.filter((t) => t.status === "archived").length;

  const filtered = useMemo(() => {
    const byTab = teams.filter((t) => {
      if (tab === "todos") return true;
      if (tab === "activos") return t.status === "active";
      if (tab === "suspendidos") return t.status === "suspended";
      if (tab === "archivados") return t.status === "archived";
      if (tab === "reportes") return t.reportsCount > 0;
      return true;
    });
    return byTab.filter((t) => {
      if (sport !== "all" && t.sport !== sport) return false;
      if (query.trim()) {
        const hay = `${t.name} ${t.tag} ${t.city ?? ""} ${t.captainName}`.toLowerCase();
        if (!hay.includes(query.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [teams, tab, sport, query]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sort === "members") return b.members - a.members;
      // win rate: aún sin backend → noop sort (mantiene orden por createdAt).
      // activity: por fecha de creación más reciente (no hay metric real de actividad).
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return arr;
  }, [filtered, sort]);

  const sportBreak = ["Pádel", "Pickleball", "Tenis", "Multi"].map((s) => {
    const filtered = teams.filter((t) => t.sport === s);
    return {
      s,
      n: filtered.length,
      members: filtered.reduce((sum, t) => sum + t.members, 0),
      color:
        s === "Pádel"
          ? "#10b981"
          : s === "Pickleball"
            ? "#7c3aed"
            : s === "Tenis"
              ? "#dc2626"
              : "#0891b2",
    };
  });

  const privBreak: Array<{
    k: AdminTeamRow["privacy"];
    l: string;
    icon: string;
    color: string;
    n: number;
  }> = [
    { k: "public", l: "Público", icon: "globe", color: "#10b981", n: 0 },
    { k: "invite", l: "Solo invitación", icon: "mail", color: "#0ea5e9", n: 0 },
    { k: "private", l: "Privado", icon: "lock", color: "#0a0a0a", n: 0 },
  ];
  for (const p of privBreak) p.n = teams.filter((t) => t.privacy === p.k).length;

  const allVisibleSelected =
    sorted.length > 0 && sorted.every((t) => selected.has(t.id));

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleSelectAllVisible = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allVisibleSelected) sorted.forEach((t) => n.delete(t.id));
      else sorted.forEach((t) => n.add(t.id));
      return n;
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, position: "relative" }}>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="label-mp" style={{ color: "var(--primary)" }}>
            ● Admin · Plataforma
          </div>
          <h1
            className="font-heading"
            style={{
              margin: "6px 0 0",
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
              lineHeight: 0.95,
            }}
          >
            Teams<span style={{ color: "var(--primary)" }}>.</span>
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>
            {totalTeams} equipos creados por usuarios · {totalMembers} miembros agregados ·{" "}
            {totalPartidos} partidos jugados en la red
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setHeaderComposer(true)}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            <Icon name="megaphone" size={13} /> Comunicar a capitanes
          </button>
          <button
            onClick={() => setPolicyOpen(true)}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            <Icon name="settings-2" size={13} /> Política de teams
          </button>
          <button
            onClick={() => exportCsv(teams)}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            <Icon name="download" size={13} /> Exportar
          </button>
        </div>
      </div>

      {/* ── Hero KPIs: 5-col fijo siguiendo el kit (1.5fr + 4×1fr) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr",
          gap: 14,
        }}
      >
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 14.4,
            background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)",
            color: "#fff",
            padding: 18,
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at 90% 20%, rgba(16,185,129,0.25), transparent 55%)",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: -10,
              right: -20,
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: 130,
              color: "rgba(255,255,255,0.06)",
              letterSpacing: "-0.06em",
              lineHeight: 0.8,
              transform: "rotate(-8deg)",
              pointerEvents: "none",
            }}
          >
            TEAM
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="label-mp" style={{ color: "#34d399" }}>
                ● Penetración social
              </span>
            </div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 42,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                lineHeight: 1,
                marginTop: 6,
              }}
            >
              {pctUsers}%
              <span
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.55)",
                  fontWeight: 700,
                  marginLeft: 6,
                }}
              >
                de usuarios
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.72)", marginTop: 6 }}>
              {totalMembers} miembros sobre {totalUsers.toLocaleString("es-EC")} usuarios totales en la plataforma
            </div>
          </div>
        </div>
        <Kpi
          icon="users-round"
          label="Teams totales"
          value={String(totalTeams)}
          sub={`${activeTeams} activos · ${reportsOpen} reportes`}
        />
        <Kpi
          icon="swords"
          label="Partidos jugados"
          value={String(totalPartidos)}
          sub="Arena · Pronto"
          emerald
        />
        <Kpi
          icon="trophy"
          label="Teams en liga"
          value={String(leagueTeams)}
          sub="circuitos · Pronto"
        />
        <Kpi
          icon="alert-triangle"
          label="Reportes abiertos"
          value={String(reportsOpen)}
          sub="moderación · Pronto"
          warn={reportsOpen > 0}
        />
      </div>

      {/* ── Cola de moderación (real, mig 166) ── */}
      {openReports.length > 0 && (
        <div className="card" style={{ padding: 18, background: "#fffbeb", border: "1px solid #fde68a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Icon name="shield-alert" size={16} color="#b45309" />
            <h3
              className="font-heading"
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 900,
                letterSpacing: "-0.01em",
                textTransform: "uppercase",
                color: "#78350f",
              }}
            >
              Moderación · {openReports.length} teams para revisar
              <span style={{ color: "#b45309" }}>.</span>
            </h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {openReports.map((r) => {
              const meta: Record<string, { icon: string; bg: string; fg: string; tag: string }> = {
                name: { icon: "message-circle-warning", bg: "#fee2e2", fg: "#dc2626", tag: "Nombre" },
                captain: { icon: "user-x", bg: "#dbeafe", fg: "#0369a1", tag: "Capitán" },
                ghost: { icon: "ghost", bg: "#f3f4f6", fg: "#525252", tag: "Fantasma" },
                logo: { icon: "image-off", bg: "#fef3c7", fg: "#92400e", tag: "Logo" },
                other: { icon: "flag", bg: "#fef3c7", fg: "#92400e", tag: "Otro" },
              };
              const m = meta[r.kind] ?? meta.other;
              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 9,
                    background: "#fff",
                    border: "1px solid #fde68a",
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 7,
                      background: m.bg,
                      color: m.fg,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name={m.icon} size={12} color={m.fg} />
                  </span>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 900,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      color: m.fg,
                      minWidth: 72,
                    }}
                  >
                    {m.tag}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, minWidth: 160 }}>
                    {r.teamName}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, color: "#0a0a0a" }}>
                    {r.detail
                      ? r.detail
                      : r.reporterName
                        ? `Reportado por ${r.reporterName}`
                        : "Sin detalle"}
                  </span>
                  <button
                    onClick={() => setReportResolve(r)}
                    className="btn"
                    style={{
                      padding: "5px 11px",
                      fontSize: 10.5,
                      background: "#fff",
                      border: "1px solid #fed7aa",
                      color: "#92400e",
                    }}
                  >
                    Revisar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
        {(
          [
            { k: "todos", l: "Todos", n: totalTeams, c: "#0a0a0a" },
            { k: "activos", l: "Activos", n: activeTeams, c: "#047857" },
            { k: "reportes", l: "Reportes", n: reportTeams, c: "#b45309" },
            { k: "suspendidos", l: "Suspendidos", n: suspendedTeams, c: "#dc2626" },
            { k: "archivados", l: "Archivados", n: archivedTeams, c: "#525252" },
          ] as Array<{ k: Tab; l: string; n: number; c: string }>
        ).map((t) => {
          const on = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => {
                setTab(t.k);
                setSelected(new Set());
              }}
              style={{
                padding: "10px 14px",
                background: "transparent",
                border: 0,
                borderBottom: on ? `2px solid ${t.c}` : "2px solid transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 800,
                color: on ? t.c : "var(--muted-fg)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: -1,
              }}
            >
              {t.l}
              <span
                style={{
                  padding: "1px 7px",
                  borderRadius: 9999,
                  background: on ? t.c : "var(--muted)",
                  color: on ? "#fff" : "var(--muted-fg)",
                  fontSize: 10,
                  fontWeight: 900,
                }}
              >
                {t.n}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Tabla ── */}
      <div className="card" style={{ overflow: "hidden", padding: 0 }}>
        <div
          style={{
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderBottom: "1px solid var(--border)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: 12,
                  top: 9,
                  color: "var(--muted-fg)",
                  display: "inline-flex",
                }}
              >
                <Icon name="search" size={13} />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, tag, ciudad o capitán..."
                style={{
                  padding: "7px 12px 7px 32px",
                  border: "1px solid var(--border)",
                  borderRadius: 9999,
                  fontSize: 11.5,
                  background: "#fff",
                  outline: "none",
                  width: 280,
                  fontFamily: "inherit",
                }}
              />
            </div>
            <select
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              style={{
                padding: "7px 11px",
                border: "1px solid var(--border)",
                borderRadius: 9999,
                fontSize: 11.5,
                background: "#fff",
                outline: "none",
                fontFamily: "inherit",
              }}
            >
              <option value="all">Todos los deportes</option>
              <option>Pádel</option>
              <option>Tenis</option>
              <option>Pickleball</option>
              <option>Multi</option>
            </select>
          </div>
          <div
            style={{
              display: "inline-flex",
              padding: 3,
              background: "var(--muted)",
              borderRadius: 9999,
              border: "1px solid var(--border)",
            }}
          >
            {(
              [
                { k: "activity", l: "Reciente" },
                { k: "members", l: "Miembros" },
                { k: "winrate", l: "Win rate" },
              ] as Array<{ k: SortKey; l: string }>
            ).map((s) => {
              const on = sort === s.k;
              return (
                <button
                  key={s.k}
                  onClick={() => setSort(s.k)}
                  style={{
                    padding: "5px 11px",
                    borderRadius: 9999,
                    border: 0,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    background: on ? "#0a0a0a" : "transparent",
                    color: on ? "#fff" : "var(--muted-fg)",
                  }}
                >
                  {s.l}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bulk action bar (acciones aún no implementadas) */}
        {selected.size > 0 && (
          <div
            style={{
              padding: "10px 18px",
              background: "#0a0a0a",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800 }}>
                {selected.size} teams seleccionados
              </span>
              <button
                onClick={() => setSelected(new Set())}
                style={{
                  fontSize: 10.5,
                  color: "rgba(255,255,255,0.6)",
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textDecoration: "underline",
                }}
              >
                Limpiar
              </button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {(
                [
                  { k: "dm" as const, l: "Mensaje", i: "send" },
                  { k: "archive" as const, l: "Archivar", i: "archive" },
                  { k: "export" as const, l: "Exportar", i: "download" },
                ] as const
              ).map((a) => (
                <button
                  key={a.k}
                  onClick={() => {
                    if (a.k === "export") {
                      const subset = teams.filter((t) => selected.has(t.id));
                      exportCsv(subset);
                      return;
                    }
                    setBulkAction(a.k);
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 9999,
                    background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    color: "#fff",
                    fontSize: 10.5,
                    fontWeight: 800,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Icon name={a.i} size={11} color="#fff" /> {a.l}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "34px 32px 1.8fr 110px 110px 90px 90px 100px 90px 40px",
            gap: 12,
            padding: "10px 18px",
            background: "var(--muted)",
            borderBottom: "1px solid var(--border)",
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
            alignItems: "center",
          }}
        >
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleSelectAllVisible}
            style={{ accentColor: "#10b981", cursor: "pointer" }}
          />
          <span>#</span>
          <span>Team</span>
          <span>Deporte</span>
          <span>Privacidad</span>
          <span>Miembros</span>
          <span>Partidos</span>
          <span>Win rate</span>
          <span style={{ textAlign: "right" }}>Estado</span>
          <span></span>
        </div>

        {sorted.length === 0 && (
          <div
            style={{
              padding: "40px 18px",
              textAlign: "center",
              color: "var(--muted-fg)",
              fontSize: 12.5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Icon name="search-x" size={28} color="var(--muted-fg)" />
            <div>No hay teams que coincidan con los filtros actuales.</div>
          </div>
        )}

        {sorted.map((t, i) => {
          const priv = privBreak.find((p) => p.k === t.privacy)!;
          const isSelected = selected.has(t.id);
          return (
            <div
              key={t.id}
              style={{
                display: "grid",
                gridTemplateColumns: "34px 32px 1.8fr 110px 110px 90px 90px 100px 90px 40px",
                gap: 12,
                padding: "14px 18px",
                alignItems: "center",
                borderBottom: i < sorted.length - 1 ? "1px solid var(--border)" : 0,
                background: isSelected ? "rgba(16,185,129,0.04)" : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(t.id)}
                style={{ accentColor: "#10b981", cursor: "pointer" }}
              />
              <span
                className="font-heading tabular"
                style={{
                  fontSize: 14,
                  fontWeight: 900,
                  color: i < 3 ? t.color : "var(--muted-fg)",
                }}
              >
                {i + 1}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: t.color,
                    color: ["#fbbf24"].includes(t.color) ? "#0a0a0a" : "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-heading)",
                    fontWeight: 900,
                    fontSize: 10.5,
                    letterSpacing: "0.04em",
                    flexShrink: 0,
                  }}
                >
                  {t.tag}
                </span>
                <div style={{ minWidth: 0, overflow: "hidden" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 800,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                    {t.isVerified && (
                      <Icon name="badge-check" size={13} color="#0ea5e9" />
                    )}
                    {t.isPinned && <Icon name="pin" size={12} color="#b45309" />}
                    {t.reportsCount > 0 && (
                      <span
                        title={`${t.reportsCount} reportes abiertos`}
                        style={{
                          fontSize: 9.5,
                          fontWeight: 900,
                          padding: "2px 7px",
                          borderRadius: 9999,
                          background: "#fef3c7",
                          color: "#92400e",
                          letterSpacing: "0.12em",
                        }}
                      >
                        {t.reportsCount} REPORTES
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--muted-fg)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {[t.city, t.captainName].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>{t.sport}</span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 11,
                  fontWeight: 700,
                  color: priv.color,
                }}
              >
                <Icon name={priv.icon} size={11} color={priv.color} />
                {priv.l}
              </span>
              <span className="tabular" style={{ fontSize: 13, fontWeight: 700 }}>
                {t.members}
                <span style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 500 }}>
                  /{t.rosterMax}
                </span>
              </span>
              {/* Partidos y Win rate: aún sin backend (Arena pendiente).
                  Renderizamos 0 / — para preservar el layout del kit. */}
              <span
                className="tabular"
                style={{ fontSize: 13, fontWeight: 700, color: "var(--muted-fg)" }}
              >
                0
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--muted-fg)",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 4,
                    background: "var(--muted)",
                    borderRadius: 9999,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ width: "0%", height: "100%", background: "#10b981" }} />
                </div>
                <span
                  className="tabular"
                  style={{ fontSize: 11.5, fontWeight: 800, minWidth: 32 }}
                >
                  —
                </span>
              </span>
              {(() => {
                const stColor =
                  t.status === "active"
                    ? "#047857"
                    : t.status === "suspended"
                      ? "#dc2626"
                      : "#525252";
                const stBg =
                  t.status === "active"
                    ? "rgba(16,185,129,0.12)"
                    : t.status === "suspended"
                      ? "#fee2e2"
                      : "#f3f4f6";
                const stLabel =
                  t.status === "active"
                    ? "activo"
                    : t.status === "suspended"
                      ? "suspendido"
                      : "archivado";
                return (
                  <span
                    style={{
                      justifySelf: "end",
                      padding: "3px 9px",
                      borderRadius: 9999,
                      background: stBg,
                      color: stColor,
                      fontSize: 9.5,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                    }}
                  >
                    {stLabel}
                  </span>
                );
              })()}

              {/* Row menu trigger — el dropdown se renderiza fuera (fixed) */}
              <div style={{ justifySelf: "end" }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => {
                    if (rowMenu?.id === t.id) {
                      setRowMenu(null);
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    setRowMenu({
                      id: t.id,
                      top: rect.bottom + 4,
                      right: window.innerWidth - rect.right,
                    });
                  }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "#fff",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="more-horizontal" size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Breakdowns: sport + privacy ── */}
      <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-4">
        <div className="card" style={{ padding: 22 }}>
          <div className="label-mp" style={{ color: "var(--primary)" }}>
            ● Distribución
          </div>
          <h3
            className="font-heading"
            style={{
              margin: "4px 0 14px",
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            Teams por deporte<span className="dot">.</span>
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sportBreak.map((s) => {
              const pct = totalTeams > 0 ? (s.n / totalTeams) * 100 : 0;
              return (
                <div key={s.s}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 5,
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: s.color,
                        }}
                      />
                      <span style={{ fontSize: 12.5, fontWeight: 800 }}>{s.s}</span>
                    </span>
                    <span
                      className="tabular"
                      style={{ fontSize: 11.5, color: "var(--muted-fg)" }}
                    >
                      {s.n} teams · {s.members} miembros · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      background: "var(--muted)",
                      borderRadius: 9999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: s.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div className="label-mp" style={{ color: "var(--primary)" }}>
            ● Privacidad
          </div>
          <h3
            className="font-heading"
            style={{
              margin: "4px 0 14px",
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            Configuración<span className="dot">.</span>
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {privBreak.map((p) => (
              <div
                key={p.k}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: p.color,
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={p.icon} size={13} color="#fff" />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{p.l}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                    {totalTeams > 0
                      ? `${((p.n / totalTeams) * 100).toFixed(0)}% del total`
                      : "0%"}
                  </div>
                </div>
                <span className="font-heading tabular" style={{ fontSize: 20, fontWeight: 900 }}>
                  {p.n}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: "var(--muted)",
              borderRadius: 10,
              fontSize: 11,
              color: "var(--muted-fg)",
              lineHeight: 1.5,
            }}
          >
            Los teams <b>privados</b> no aparecen en discovery ni en rankings públicos. Solo se
            accede con código directo del capitán.
          </div>
        </div>
      </div>

      {/* ── Política global (read-only en este Stage) ── */}
      <div className="card" style={{ padding: 22 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 14,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● Política
            </div>
            <h3
              className="font-heading"
              style={{
                margin: "4px 0 0",
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              Reglas globales de teams<span className="dot">.</span>
            </h3>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>
              Aplica a todos los teams creados en MATCHPOINT. Cambiar acá afectaría a {totalTeams} teams
              existentes.
            </p>
          </div>
          <button onClick={() => setPolicyOpen(true)} className="btn btn-outline">
            <Icon name="edit-3" size={12} /> Editar política
          </button>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          {[
            {
              l: "Cupo máximo",
              v: `${POLICY_DISPLAY.maxMembers} miembros`,
              sub: "MP+ Pro Team: 24",
              icon: "users",
            },
            {
              l: "Teams por usuario",
              v: String(POLICY_DISPLAY.teamsPerUser),
              sub: "Como capitán",
              icon: "user-cog",
            },
            {
              l: "Auto-archivo",
              v: `${POLICY_DISPLAY.autoArchive} días`,
              sub: "Sin partidos · Pronto",
              icon: "archive",
            },
            {
              l: "Aprobación de nombre",
              v: POLICY_DISPLAY.nameApproval,
              sub: "Si contiene marca · Pronto",
              icon: "shield-check",
            },
            {
              l: "Privacidad default",
              v: POLICY_DISPLAY.defaultPrivacy,
              sub: "Al crear team",
              icon: "globe",
            },
            {
              l: "Email verificado",
              v: POLICY_DISPLAY.requireEmailVerified,
              sub: "Para crear team",
              icon: "mail-check",
            },
            {
              l: "Auto-transferencia",
              v: POLICY_DISPLAY.transferOnInactive,
              sub: "Capitán inactivo · Pronto",
              icon: "user-cog",
            },
            {
              l: "Ranking público",
              v: POLICY_DISPLAY.publicRanking,
              sub: "No existe · Pronto",
              icon: "bar-chart-3",
            },
          ].map((p) => (
            <div
              key={p.l}
              style={{
                padding: 14,
                borderRadius: 11,
                border: "1px solid var(--border)",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: "var(--muted)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={p.icon} size={12} />
                </span>
                <span
                  className="font-heading"
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {p.l}
                  <span className="dot">.</span>
                </span>
              </div>
              <div
                className="font-heading tabular"
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  marginTop: 8,
                }}
              >
                {p.v}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{p.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Dropdown del row menu (renderizado fixed para escapar overflow:hidden) ── */}
      {rowMenu &&
        (() => {
          const t = teams.find((x) => x.id === rowMenu.id);
          if (!t) return null;
          return (
            <RowMenu
              top={rowMenu.top}
              right={rowMenu.right}
              onClose={() => setRowMenu(null)}
              items={(() => {
                const items: MenuItem[] = [
                  { label: "Otorgar logro", icon: "trophy", onClick: () => setGrantTarget(t) },
                  { label: "Mensaje al capitán", icon: "send", onClick: () => setDmTarget(t) },
                  { sep: true },
                  {
                    label: t.isVerified ? "Quitar verificación" : "Verificar team",
                    icon: "badge-check",
                    onClick: () => onToggleVerify(t),
                  },
                  {
                    label: t.isPinned ? "Desanclar de discovery" : "Anclar en discovery",
                    icon: "pin",
                    onClick: () => onTogglePin(t),
                  },
                  { sep: true },
                  {
                    label: "Forzar transferencia de capitanía",
                    icon: "user-cog",
                    onClick: () => setTransferTarget(t),
                  },
                ];
                if (t.status === "active") {
                  items.push({
                    label: "Suspender team",
                    icon: "pause-circle",
                    danger: "warn",
                    onClick: () => setStatusTarget({ team: t, next: "suspended" }),
                  });
                }
                if (t.status !== "archived") {
                  items.push({
                    label: "Archivar team",
                    icon: "archive",
                    onClick: () => setStatusTarget({ team: t, next: "archived" }),
                  });
                }
                if (t.status !== "active") {
                  items.push({
                    label: "Reactivar team",
                    icon: "play-circle",
                    onClick: () => setStatusTarget({ team: t, next: "active" }),
                  });
                }
                items.push({
                  label: "Disolver permanentemente",
                  icon: "trash-2",
                  danger: "critical",
                  onClick: () => setDissolveTarget(t),
                });
                return items;
              })()}
            />
          );
        })()}

      {/* ── Modal real: Otorgar logro ── */}
      {grantTarget && (
        <GrantAchievementModal
          team={grantTarget}
          onClose={() => setGrantTarget(null)}
          onGranted={() => {
            setTeams((arr) =>
              arr.map((x) =>
                x.id === grantTarget.id
                  ? { ...x, achievementsCount: x.achievementsCount + 1 }
                  : x,
              ),
            );
            setGrantTarget(null);
            router.refresh();
          }}
        />
      )}
      {/* ── Modal real: Cambio de status (suspend/archive/reactivate) ── */}
      {statusTarget && (
        <StatusConfirmModal
          team={statusTarget.team}
          next={statusTarget.next}
          onClose={() => setStatusTarget(null)}
          onDone={(next) => {
            updateTeamRow(statusTarget.team.id, { status: next });
            setStatusTarget(null);
            router.refresh();
          }}
        />
      )}
      {/* ── Modal real: Disolver permanentemente ── */}
      {dissolveTarget && (
        <DissolveConfirmModal
          team={dissolveTarget}
          onClose={() => setDissolveTarget(null)}
          onDone={() => {
            setTeams((arr) => arr.filter((x) => x.id !== dissolveTarget.id));
            setDissolveTarget(null);
            router.refresh();
          }}
        />
      )}
      {/* ── Modal real: Transferir capitanía (picker de miembros) ── */}
      {transferTarget && (
        <TransferPickerModal
          team={transferTarget}
          onClose={() => setTransferTarget(null)}
          onDone={() => {
            setTransferTarget(null);
            router.refresh();
          }}
        />
      )}
      {/* ── Modal real: DM al capitán ── */}
      {dmTarget && (
        <DmComposerModal
          target={{ kind: "single", team: dmTarget }}
          onClose={() => setDmTarget(null)}
          onDone={() => setDmTarget(null)}
        />
      )}
      {/* ── Bulk DM / archive ── */}
      {bulkAction === "dm" && selected.size > 0 && (
        <DmComposerModal
          target={{ kind: "bulk", teamIds: [...selected], count: selected.size }}
          onClose={() => setBulkAction(null)}
          onDone={() => {
            setBulkAction(null);
            setSelected(new Set());
          }}
        />
      )}
      {bulkAction === "archive" && selected.size > 0 && (
        <BulkArchiveConfirmModal
          count={selected.size}
          teamIds={[...selected]}
          onClose={() => setBulkAction(null)}
          onDone={(ids) => {
            setTeams((arr) =>
              arr.map((x) => (ids.includes(x.id) ? { ...x, status: "archived" } : x)),
            );
            setBulkAction(null);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
      {/* ── Header: composer a TODOS los capitanes (filtros opcionales) ── */}
      {headerComposer && (
        <DmComposerModal
          target={{
            kind: "bulk",
            teamIds: teams.filter((t) => t.status === "active").map((t) => t.id),
            count: teams.filter((t) => t.status === "active").length,
            label: "todos los capitanes de teams activos",
          }}
          onClose={() => setHeaderComposer(false)}
          onDone={() => setHeaderComposer(false)}
        />
      )}
      {/* ── Resolver reporte ── */}
      {reportResolve && (
        <ResolveReportModal
          report={reportResolve}
          onClose={() => setReportResolve(null)}
          onDone={(id) => {
            setOpenReports((arr) => arr.filter((r) => r.id !== id));
            const teamId = reportResolve.teamId;
            updateTeamRow(teamId, {
              reportsCount: Math.max(
                0,
                (teams.find((t) => t.id === teamId)?.reportsCount ?? 1) - 1,
              ),
            });
            setReportResolve(null);
            router.refresh();
          }}
        />
      )}
      {/* ── Policy editor (parcial: solo team_caps real, resto read-only) ── */}
      {policyOpen && (
        <PolicyEditorModal
          onClose={() => setPolicyOpen(false)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Subcomponentes
// ════════════════════════════════════════════════════════════════════════

function Kpi({
  icon,
  label,
  value,
  sub,
  emerald,
  warn,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  emerald?: boolean;
  warn?: boolean;
}) {
  const c = emerald ? "#047857" : warn ? "#b45309" : "#0a0a0a";
  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
          }}
        >
          {label}
        </span>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: emerald
              ? "rgba(16,185,129,0.12)"
              : warn
                ? "#fef3c7"
                : "var(--muted)",
            color: c,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={13} color={c} />
        </span>
      </div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 26,
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: c,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

type MenuItem =
  | { sep: true }
  | {
      sep?: false;
      label: string;
      icon: string;
      onClick: () => void;
      danger?: "warn" | "critical";
    };

function RowMenu({
  items,
  onClose,
  top,
  right,
}: {
  items: MenuItem[];
  onClose: () => void;
  top: number;
  right: number;
}) {
  // Portaleamos el dropdown a document.body. Si lo dejamos en el árbol del
  // dashboard, position:fixed se rompe ante cualquier ancestor con `transform`
  // o `filter` (la sidebar animada en MP genera un containing block) — el
  // menú termina anclado al ancestor en vez del viewport y se "mueve con la
  // pantalla". Portalear a body lo desconecta de esos ancestros.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // En scroll o resize, cerramos: la posición fue capturada al hacer click,
  // si el row se mueve, dejar el menú flotando ahí queda raro. Cerrar es la
  // UX estándar y evita tener que retro-calcular vs el trigger original.
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Click-outside catcher */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 199, background: "transparent" }}
      />
      <div
        style={{
          position: "fixed",
          top,
          right,
          width: 240,
          background: "#fff",
          borderRadius: 12,
          border: "1px solid var(--border)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
          zIndex: 200,
          overflow: "hidden",
          fontSize: 12,
        }}
      >
        {items.map((it, idx) => {
          if ("sep" in it && it.sep) {
            return (
              <div
                key={`sep-${idx}`}
                style={{ height: 1, background: "var(--border)", margin: "4px 0" }}
              />
            );
          }
          const item = it as Exclude<MenuItem, { sep: true }>;
          const color =
            item.danger === "critical"
              ? "#dc2626"
              : item.danger === "warn"
                ? "#b45309"
                : "#0a0a0a";
          return (
            <button
              key={item.label}
              onClick={() => {
                onClose();
                item.onClick();
              }}
              style={{
                width: "100%",
                padding: "9px 14px",
                background: "transparent",
                border: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontFamily: "inherit",
                fontSize: 12,
                color,
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--muted)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <Icon name={item.icon} size={13} color={color} />
              {item.label}
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}

// ── Modal real: Otorgar logro ──
function GrantAchievementModal({
  team,
  onClose,
  onGranted,
}: {
  team: AdminTeamRow;
  onClose: () => void;
  onGranted: () => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState("milestone");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (busy) return;
    if (title.trim().length < 2) {
      toast({ icon: "x", title: "Título demasiado corto" });
      return;
    }
    setBusy(true);
    try {
      const res = await grantTeamAchievement({
        teamId: team.id,
        kind: kind.trim() || "milestone",
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
      });
      if (res.ok) {
        toast({ icon: "trophy", title: "Logro otorgado", sub: `${team.name} · ${title.trim()}` });
        onGranted();
      } else {
        toast({ icon: "x", title: "No se pudo otorgar", sub: res.error.message });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 920,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            padding: "20px 24px 14px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "#fbbf24",
              color: "#0a0a0a",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="trophy" size={16} color="#0a0a0a" />
          </span>
          <div>
            <div className="label-mp" style={{ color: "#92400e" }}>
              ● Logro · {team.tag}
            </div>
            <h3
              className="font-heading"
              style={{
                margin: "2px 0 0",
                fontSize: 19,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              Otorgar a {team.name}
              <span className="dot">.</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              marginLeft: "auto",
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <ModalField label="Tipo (kind)" hint="Categoría libre. Ej: tournament_top3, league_winner, milestone.">
            <input
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              maxLength={64}
              style={modalInput}
            />
          </ModalField>
          <ModalField label="Título" hint="Lo que se muestra en la card del TeamHome.">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="Top 3 — Liga Cumbayá Primavera 2026"
              style={modalInput}
            />
          </ModalField>
          <ModalField label="Subtítulo (opcional)" hint="Detalle pequeño debajo del título.">
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              maxLength={280}
              placeholder="14W · 4L en la temporada regular"
              style={modalInput}
            />
          </ModalField>
        </div>
        <div
          style={{
            padding: "14px 24px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="btn btn-primary"
            style={{ opacity: busy ? 0.6 : 1 }}
          >
            <Icon name="check" size={13} color="#fff" />
            {busy ? "Otorgando…" : "Otorgar logro"}
          </button>
        </div>
      </div>
    </div>
  );
}

const modalInput = {
  padding: "11px 14px",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontFamily: "inherit",
  fontSize: 13.5,
  outline: "none",
  background: "#fff",
  width: "100%",
} as const;

function ModalField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          fontSize: 10.5,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "#0a0a0a",
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", lineHeight: 1.5 }}>{hint}</div>
      )}
    </div>
  );
}

// ── ModalShell: backdrop + sheet + header (reusable por los modales de admin) ──
function ModalShell({
  title,
  tag,
  icon,
  color,
  onClose,
  children,
  footer,
  maxWidth = 560,
}: {
  title: string;
  tag: string;
  icon: string;
  color?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 920,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            padding: "20px 24px 14px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: color || "#0a0a0a",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={icon} size={16} color="#fff" />
          </span>
          <div>
            <div className="label-mp" style={{ color: color || "var(--primary)" }}>
              ● {tag}
            </div>
            <h3
              className="font-heading"
              style={{
                margin: "2px 0 0",
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                lineHeight: 1,
              }}
            >
              {title}
              <span className="dot">.</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              marginLeft: "auto",
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {children}
        </div>
        {footer && (
          <div
            style={{
              padding: "14px 24px 20px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── StatusConfirmModal — suspender/archivar/reactivar con razón opcional ──
function StatusConfirmModal({
  team,
  next,
  onClose,
  onDone,
}: {
  team: AdminTeamRow;
  next: AdminTeamRow["status"];
  onClose: () => void;
  onDone: (next: AdminTeamRow["status"]) => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const meta =
    next === "suspended"
      ? { tag: "Suspender team", icon: "pause-circle", color: "#b45309", verb: "Suspender" }
      : next === "archived"
        ? { tag: "Archivar team", icon: "archive", color: "#525252", verb: "Archivar" }
        : { tag: "Reactivar team", icon: "play-circle", color: "#047857", verb: "Reactivar" };
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await setTeamStatusAdmin({
        teamId: team.id,
        status: next,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      if (res.ok) {
        toast({ icon: "check", title: `${meta.verb}: ${team.name}` });
        onDone(next);
      } else {
        toast({ icon: "x", title: "No se pudo", sub: res.error.message });
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell
      title={team.name}
      tag={meta.tag}
      icon={meta.icon}
      color={meta.color}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={busy} className="btn btn-primary" style={{ opacity: busy ? 0.6 : 1 }}>
            <Icon name="check" size={13} color="#fff" />
            {busy ? "Aplicando…" : meta.verb}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        {next === "suspended" &&
          "El team queda oculto en discovery y aparece con badge 'Suspendido' a sus miembros. Los miembros reciben notificación. Esta acción es reversible (puedes reactivarlo)."}
        {next === "archived" &&
          "El team queda oculto en discovery. Los miembros reciben notificación. Esta acción es reversible (puedes reactivarlo)."}
        {next === "active" &&
          "El team vuelve a aparecer en discovery y los miembros reciben notificación."}
      </p>
      <ModalField label="Motivo (opcional)">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={280}
          placeholder="Va al payload de la notif al captain…"
          style={{ ...modalInput, minHeight: 70, resize: "vertical" }}
        />
      </ModalField>
    </ModalShell>
  );
}

// ── DissolveConfirmModal — confirma escribiendo el tag ──
function DissolveConfirmModal({
  team,
  onClose,
  onDone,
}: {
  team: AdminTeamRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = typed.trim() === team.tag;
  const submit = async () => {
    if (busy || !matches) return;
    setBusy(true);
    try {
      const res = await adminDissolveTeam({ teamId: team.id });
      if (res.ok) {
        toast({ icon: "trash-2", title: "Team disuelto", sub: team.name });
        onDone();
      } else {
        toast({ icon: "x", title: "No se pudo", sub: res.error.message });
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell
      title={`Disolver ${team.name}`}
      tag="Acción irreversible"
      icon="trash-2"
      color="#dc2626"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy || !matches}
            className="btn"
            style={{
              background: "#dc2626",
              color: "#fff",
              opacity: busy || !matches ? 0.6 : 1,
            }}
          >
            <Icon name="trash-2" size={13} color="#fff" />
            {busy ? "Disolviendo…" : "Disolver permanentemente"}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: "#7f1d1d", lineHeight: 1.5 }}>
        Borra el team, su roster, invitaciones, logros y chat asociado. Los miembros reciben
        notificación. <b>No se puede deshacer.</b> Para confirmar escribe el tag{" "}
        <code>{team.tag}</code>.
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value.toUpperCase())}
        placeholder={team.tag}
        style={{
          ...modalInput,
          fontFamily: "monospace",
          fontSize: 15,
          letterSpacing: "0.12em",
        }}
      />
    </ModalShell>
  );
}

// ── TransferPickerModal — lazy-load del roster + picker ──
function TransferPickerModal({
  team,
  onClose,
  onDone,
}: {
  team: AdminTeamRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [members, setMembers] = useState<
    Array<{ userId: string; displayName: string }> | null
  >(null);
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  if (members === null && !loading) {
    setLoading(true);
    void getTeam({ id: team.id }).then((res) => {
      setLoading(false);
      if (!res.ok) {
        toast({ icon: "x", title: "No se pudo cargar el roster", sub: res.error.message });
        setMembers([]);
        return;
      }
      const list = res.data.members
        .filter((m) => m.userId !== team.captainId)
        .map((m) => ({ userId: m.userId, displayName: m.displayName }));
      setMembers(list);
    });
  }
  const submit = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      const res = await forceTransferCaptainAdmin({
        teamId: team.id,
        newCaptainUserId: target,
      });
      if (res.ok) {
        toast({ icon: "crown", title: "Capitanía transferida", sub: team.name });
        onDone();
      } else {
        const msg =
          res.error.code === "TEAMS.NEW_CAPTAIN_NOT_MEMBER"
            ? "El destino debe ser miembro del team"
            : res.error.code === "TEAMS.ALREADY_CAPTAIN"
              ? "El destino ya es capitán de otro team"
              : res.error.message;
        toast({ icon: "x", title: "No se pudo transferir", sub: msg });
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell
      title={`Transferir ${team.name}`}
      tag="Forzar transferencia"
      icon="crown"
      color="#92400e"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!target || busy}
            className="btn btn-primary"
            style={{ opacity: !target || busy ? 0.6 : 1 }}
          >
            <Icon name="crown" size={13} color="#fff" />
            {busy ? "Transfiriendo…" : "Transferir"}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        Bypassea la regla de &quot;solo capitán transfiere&quot;. Capitán actual:{" "}
        <b>{team.captainName}</b>. Elige el nuevo capitán entre los miembros del team.
      </p>
      {members === null || loading ? (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Cargando roster…</div>
      ) : members.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          El team no tiene miembros además del capitán.
        </div>
      ) : (
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          style={modalInput}
        >
          <option value="">— Seleccionar miembro —</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
      )}
    </ModalShell>
  );
}

// ── DmComposerModal — single (DM al captain) o bulk (N captains) ──
type DmTarget =
  | { kind: "single"; team: AdminTeamRow }
  | { kind: "bulk"; teamIds: string[]; count: number; label?: string };

function DmComposerModal({
  target,
  onClose,
  onDone,
}: {
  target: DmTarget;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const isSingle = target.kind === "single";
  const title = isSingle ? target.team.name : `${target.count} capitanes`;
  const sub = isSingle
    ? `Captain: ${target.team.captainName}`
    : target.label ?? `${target.count} teams seleccionados`;
  const submit = async () => {
    if (busy) return;
    if (body.trim().length < 2) {
      toast({ icon: "x", title: "Mensaje demasiado corto" });
      return;
    }
    setBusy(true);
    try {
      if (isSingle) {
        const res = await sendAdminDmToCaptain({
          teamId: target.team.id,
          body: body.trim(),
        });
        if (res.ok) {
          toast({ icon: "send", title: "Mensaje enviado", sub: target.team.captainName });
          onDone();
        } else {
          toast({ icon: "x", title: "No se pudo enviar", sub: res.error.message });
        }
      } else {
        const res = await bulkAdminDmToCaptains({
          teamIds: target.teamIds,
          body: body.trim(),
        });
        if (res.ok) {
          toast({ icon: "send", title: `Enviado a ${res.data.sent} capitanes` });
          onDone();
        } else {
          toast({ icon: "x", title: "No se pudo enviar", sub: res.error.message });
        }
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell
      title={title}
      tag={isSingle ? "Mensaje al capitán" : "Mensaje masivo"}
      icon="send"
      color="#0a0a0a"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={busy} className="btn btn-primary" style={{ opacity: busy ? 0.6 : 1 }}>
            <Icon name="send" size={13} color="#fff" />
            {busy ? "Enviando…" : "Enviar"}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        {sub}. Se entrega como notif inapp (kind <code>team_admin_message</code>) en la campana
        del usuario.
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={1000}
        placeholder="Escribe el mensaje (máx 1000 caracteres)…"
        style={{ ...modalInput, minHeight: 140, resize: "vertical" }}
      />
      <div style={{ fontSize: 10.5, color: "var(--muted-fg)", textAlign: "right" }}>
        {body.length}/1000
      </div>
    </ModalShell>
  );
}

// ── BulkArchiveConfirmModal ──
function BulkArchiveConfirmModal({
  count,
  teamIds,
  onClose,
  onDone,
}: {
  count: number;
  teamIds: string[];
  onClose: () => void;
  onDone: (ids: string[]) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await bulkSetTeamStatusAdmin({ teamIds, status: "archived" });
      if (res.ok) {
        toast({ icon: "archive", title: `Archivados ${res.data.updated} teams` });
        onDone(teamIds);
      } else {
        toast({ icon: "x", title: "No se pudo", sub: res.error.message });
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell
      title={`Archivar ${count} teams`}
      tag="Acción masiva"
      icon="archive"
      color="#525252"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={busy} className="btn btn-primary" style={{ opacity: busy ? 0.6 : 1 }}>
            <Icon name="archive" size={13} color="#fff" />
            {busy ? "Archivando…" : "Archivar"}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        Marca los {count} teams seleccionados como <b>archivados</b>. Cada captain recibe
        notificación. Reversible (puedes reactivar uno por uno).
      </p>
    </ModalShell>
  );
}

// ── ResolveReportModal ──
function ResolveReportModal({
  report,
  onClose,
  onDone,
}: {
  report: AdminReportLite;
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const toast = useToast();
  const [action, setAction] = useState<"dismissed" | "actioned">("dismissed");
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await resolveTeamReport({
        reportId: report.id,
        action,
        ...(resolution.trim() ? { resolution: resolution.trim() } : {}),
      });
      if (res.ok) {
        toast({
          icon: action === "actioned" ? "check" : "x",
          title: action === "actioned" ? "Se tomó acción" : "Reporte desestimado",
          sub: report.teamName,
        });
        onDone(report.id);
      } else {
        toast({ icon: "x", title: "No se pudo resolver", sub: res.error.message });
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell
      title={report.teamName}
      tag={`Reporte · ${report.kindLabel}`}
      icon="shield-alert"
      color="#b45309"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>
            Cancelar
          </button>
          <button onClick={submit} disabled={busy} className="btn btn-primary" style={{ opacity: busy ? 0.6 : 1 }}>
            <Icon name="check" size={13} color="#fff" />
            {busy ? "Resolviendo…" : "Resolver"}
          </button>
        </>
      }
    >
      {report.detail && (
        <div
          style={{
            padding: 12,
            background: "var(--muted)",
            borderRadius: 10,
            fontSize: 12.5,
            color: "#0a0a0a",
            lineHeight: 1.5,
          }}
        >
          {report.detail}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
        Reportado por {report.reporterName ?? "anónimo"} ·{" "}
        {new Date(report.createdAt).toLocaleString("es-EC")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(
          [
            { k: "dismissed" as const, l: "Desestimar", d: "El reporte no procede." },
            {
              k: "actioned" as const,
              l: "Tomar acción",
              d: "Marcar como resuelto. Toma la acción aparte (suspender/archivar/dissolve).",
            },
          ] as const
        ).map((o) => {
          const on = action === o.k;
          return (
            <label
              key={o.k}
              style={{
                display: "flex",
                gap: 10,
                padding: 12,
                borderRadius: 10,
                border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                cursor: "pointer",
                background: on ? "#ecfdf5" : "#fff",
              }}
            >
              <input
                type="radio"
                checked={on}
                onChange={() => setAction(o.k)}
                style={{ marginTop: 2, accentColor: "#10b981" }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{o.l}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>
                  {o.d}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <input
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        maxLength={280}
        placeholder="Nota de resolución (opcional, se incluye en la notif al reporter)…"
        style={modalInput}
      />
    </ModalShell>
  );
}

// ── PolicyEditorModal — solo team_caps real, resto read-only ──
function PolicyEditorModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell
      title="Política de teams"
      tag="Read-only"
      icon="settings-2"
      color="#0a0a0a"
      onClose={onClose}
      footer={
        <button onClick={onClose} className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }}>
          Cerrar
        </button>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        El único campo editable hoy es <b>roster cap</b> por plan (free / MP+), que vive en{" "}
        <code>platform_config.team_caps</code>. Para cambiarlo, edita desde{" "}
        <b>Admin · Configuración → team_caps</b>. El resto de los campos del kit (auto-archivo,
        aprobación de nombre, transfer-on-inactive) son aspiracionales — requieren backend
        nuevo (cron / política de moderación).
      </p>
      <Link
        href="/dashboard/admin/admin-config"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
          padding: "8px 12px",
          background: "var(--primary)",
          color: "#fff",
          borderRadius: 9999,
          fontSize: 12,
          fontWeight: 800,
          textDecoration: "none",
        }}
      >
        <Icon name="external-link" size={12} color="#fff" />
        Abrir Admin · Configuración
      </Link>
    </ModalShell>
  );
}
