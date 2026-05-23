"use client";
// Admin · Flair de usuarios — rediseño 1:1 del kit
// (ui_kits/dashboard/AdminFlairUsuariosScreen.jsx).
//
// Stage 1: shell visual con data demo inline. No hay backend de "flair attributes"
// (template/banner/accent/watermark per user) ni de moderación (reports, blacklist).
// Todos los actions disparan toast "Próximamente".
//
// La versión previa de esta pantalla cableaba grant/revoke real de cosmetic_bundles
// + edición de precio. Esa wiring vive en `src/server/actions/admin/cosmetics.ts`
// y la pantalla `AdminCosmeticsScreen.tsx` (sin route asignada). Ver
// `docs/guides/04-placeholders.md` para el plan de re-wire.

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";

// AdminCosmeticsFlairScreen pasa un `data` (legacy) que ya no consumimos.
// Mantenemos el prop opcional para no romper el caller.
export type FlairData = unknown;

type UserRow = {
  id: string;
  who: string;
  email: string;
  bg: string;
  av: string;
  template: "Tournament" | "Editorial" | "Neon" | "Old school" | "Minimal" | "Custom";
  accent: string;
  watermark: string | null;
  bannerK: "court-emerald" | "noir" | "midnight" | "sunset" | "plain-dark";
  edited: string;
  flagged: false | "watermark";
};

const USERS: UserRow[] = [
  { id: "u01", who: "Camila Aguilar", email: "camila.aguilar@gmail.com", bg: "linear-gradient(135deg,#10b981,#047857)", av: "CA", template: "Custom", accent: "#10b981", watermark: "JUEGA", bannerK: "court-emerald", edited: "hace 2 días", flagged: false },
  { id: "u02", who: "Andrés Vega", email: "andres.vega@matchpoint.ec", bg: "linear-gradient(135deg,#ca8a04,#facc15)", av: "AV", template: "Tournament", accent: "#dc2626", watermark: "KILL", bannerK: "noir", edited: "hace 4 h", flagged: false },
  { id: "u03", who: "Diego Carrasco", email: "diego@cumbaya-pb.ec", bg: "linear-gradient(135deg,#0a0a0a,#374151)", av: "DC", template: "Editorial", accent: "#0a0a0a", watermark: null, bannerK: "plain-dark", edited: "hace 12 días", flagged: false },
  { id: "u04", who: "Sofía Andrade", email: "sofia.a@rancho-sf.ec", bg: "linear-gradient(135deg,#7c3aed,#db2777)", av: "SA", template: "Neon", accent: "#7c3aed", watermark: "NEON", bannerK: "midnight", edited: "hace 8 días", flagged: false },
  { id: "u05", who: "Renata Salas", email: "renata.s@gmail.com", bg: "linear-gradient(135deg,#f59e0b,#ef4444)", av: "RS", template: "Custom", accent: "#ec4899", watermark: "PUTA", bannerK: "sunset", edited: "hace 1 día", flagged: "watermark" },
  { id: "u06", who: "Joaquín Silva", email: "joaco.s@gmail.com", bg: "linear-gradient(135deg,#0891b2,#06b6d4)", av: "JS", template: "Old school", accent: "#10b981", watermark: "JUEGA", bannerK: "court-emerald", edited: "hace 30 días", flagged: false },
  { id: "u07", who: "Valentina Mora", email: "vmora@gmail.com", bg: "linear-gradient(135deg,#10b981,#047857)", av: "VM", template: "Minimal", accent: "#10b981", watermark: null, bannerK: "plain-dark", edited: "hace 3 días", flagged: false },
  { id: "u08", who: "Sebastián León", email: "sebas.leon@gmail.com", bg: "linear-gradient(135deg,#0a0a0a,#374151)", av: "SL", template: "Tournament", accent: "#dc2626", watermark: "WAR", bannerK: "noir", edited: "hace 1 día", flagged: false },
  { id: "u09", who: "Felipe Donoso", email: "fdonoso@gmail.com", bg: "linear-gradient(135deg,#10b981,#047857)", av: "FD", template: "Editorial", accent: "#0a0a0a", watermark: null, bannerK: "plain-dark", edited: "hace 6 días", flagged: false },
  { id: "u10", who: "Bárbara Núñez", email: "bnunez@gmail.com", bg: "linear-gradient(135deg,#dc2626,#fb923c)", av: "BN", template: "Custom", accent: "#dc2626", watermark: "CHAMPI", bannerK: "sunset", edited: "hace 12 h", flagged: false },
  { id: "u11", who: "Constanza R.", email: "constanza.r@gmail.com", bg: "linear-gradient(135deg,#7c3aed,#db2777)", av: "CR", template: "Neon", accent: "#ec4899", watermark: "AYY", bannerK: "midnight", edited: "hace 2 días", flagged: false },
  { id: "u12", who: "Mateo Bravo", email: "mbravo@protonmail.com", bg: "linear-gradient(135deg,#dc2626,#b91c1c)", av: "MB", template: "Custom", accent: "#0a0a0a", watermark: "FUCK", bannerK: "noir", edited: "hace 5 h", flagged: "watermark" },
];

const TOTAL_USERS = 8412;
const WITH_CUSTOM_FLAIR = 4280;
const ADOPTION_PCT = Math.round((WITH_CUSTOM_FLAIR / TOTAL_USERS) * 100);

const TEMPLATE_STATS = [
  { k: "tournament", l: "Tournament", count: 1240, pct: 29, color: "#dc2626", enabled: true },
  { k: "editorial", l: "Editorial", count: 920, pct: 21, color: "#0a0a0a", enabled: true },
  { k: "neon", l: "Neon", count: 640, pct: 15, color: "#7c3aed", enabled: true },
  { k: "oldschool", l: "Old school", count: 480, pct: 11, color: "#10b981", enabled: true },
  { k: "minimal", l: "Minimal", count: 340, pct: 8, color: "#737373", enabled: true },
  { k: "custom", l: "Custom (sin template)", count: 660, pct: 16, color: "#fbbf24", enabled: true },
];

const BANNER_STATS = [
  { k: "court-emerald", l: "Court Emerald", count: 1240, color: "linear-gradient(135deg, #064e3b, #10b981)" },
  { k: "noir", l: "Noir", count: 840, color: "linear-gradient(135deg, #0a0a0a, #262626)" },
  { k: "midnight", l: "Midnight", count: 720, color: "linear-gradient(135deg, #0f172a, #1e1b4b)" },
  { k: "sunset", l: "Sunset", count: 410, color: "linear-gradient(135deg, #ea580c, #4c0519)" },
  { k: "pickle", l: "Pickle", count: 380, color: "linear-gradient(135deg, #15803d, #fde047)" },
  { k: "plain-dark", l: "Plano negro", count: 290, color: "#0a0a0a" },
];

const ACCENT_STATS = [
  { c: "#10b981", l: "Emerald oficial", count: 2640 },
  { c: "#dc2626", l: "Rojo", count: 680 },
  { c: "#7c3aed", l: "Violeta", count: 520 },
  { c: "#0a0a0a", l: "Negro", count: 280 },
  { c: "#fbbf24", l: "Ámbar", count: 100 },
  { c: "#ec4899", l: "Fucsia", count: 60 },
];

const POPULAR_WATERMARKS = [
  { w: "JUEGA", count: 412 },
  { w: "SMASH", count: 218 },
  { w: "KILL", count: 184 },
  { w: "WAR", count: 142 },
  { w: "NEON", count: 108 },
  { w: "CHAMP", count: 92 },
  { w: "CHAMPI", count: 74 },
  { w: "AYY", count: 46 },
];

const BLOCKED_WORDS_SEED = ["FUCK", "PUTA", "COCK", "NAZI", "MIERDA"];

const REPORTS = [
  { id: "r1", userId: "u05", reason: "Watermark ofensivo", reportedBy: 3, when: "hace 4 h", field: "watermark", value: "PUTA" },
  { id: "r2", userId: "u12", reason: "Watermark abusivo", reportedBy: 8, when: "hace 2 h", field: "watermark", value: "FUCK" },
];

const TEMPLATE_COLORS: Record<UserRow["template"], string> = {
  Tournament: "#dc2626",
  Editorial: "#0a0a0a",
  Neon: "#7c3aed",
  "Old school": "#10b981",
  Minimal: "#737373",
  Custom: "#fbbf24",
};

const BANNER_BGS: Record<UserRow["bannerK"], string> = {
  "court-emerald": "linear-gradient(135deg, #064e3b 0%, #0a0a0a 60%, #000 100%)",
  noir: "linear-gradient(135deg, #0a0a0a, #262626)",
  midnight: "linear-gradient(135deg, #0f172a, #1e1b4b)",
  sunset: "linear-gradient(135deg, #ea580c, #4c0519)",
  "plain-dark": "#0a0a0a",
};

type Tab = "users" | "reports" | "analytics" | "templates" | "words";

export function AdminFlairUsuariosView(_props: { data?: FlairData }) {
  void _props;
  const toast = useToast();
  const soon = (label: string) => toast({ icon: "clock", title: "Próximamente", sub: label });

  const [tab, setTab] = useState<Tab>("users");
  const [search, setSearch] = useState("");
  const [templateF, setTemplateF] = useState("all");
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [blockedWords, setBlockedWords] = useState<string[]>(BLOCKED_WORDS_SEED);
  const [newWord, setNewWord] = useState("");

  const filtered = useMemo(
    () =>
      USERS.filter((u) => {
        if (templateF !== "all" && u.template.toLowerCase() !== templateF) return false;
        if (search) {
          const hay = `${u.who} ${u.email} ${u.watermark ?? ""}`.toLowerCase();
          if (!hay.includes(search.toLowerCase())) return false;
        }
        return true;
      }),
    [search, templateF],
  );

  const handleAddWord = () => {
    const w = newWord.trim().toUpperCase();
    if (!w) return;
    if (blockedWords.includes(w)) {
      toast({ icon: "x", title: "Ya está en la lista" });
      return;
    }
    setBlockedWords((arr) => [...arr, w]);
    setNewWord("");
    soon(`Bloquear "${w}" (sin backend)`);
  };

  const handleRemoveWord = (w: string) => {
    setBlockedWords((arr) => arr.filter((x) => x !== w));
    soon(`Quitar "${w}" (sin backend)`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── HEADER ── */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "var(--muted-fg)",
            marginBottom: 6,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="shield" size={11} color="#dc2626" />
            ADMIN
          </span>
          <Icon name="chevron-right" size={10} />
          <span>Plataforma</span>
          <Icon name="chevron-right" size={10} />
          <b style={{ color: "#0a0a0a" }}>Flair de usuarios</b>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "#ec4899" }}>
              ● Cómo se personalizan los {TOTAL_USERS.toLocaleString("es-EC")} usuarios
            </div>
            <h1
              className="font-heading"
              style={{
                fontSize: 40,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                lineHeight: 1,
                margin: "8px 0 0",
              }}
            >
              Flair de usuarios<span className="dot">.</span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0" }}>
              Templates aplicados · banners · accents · watermarks · gestiona reportes y modera
              contenido
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => soon("Exportar CSV")}
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)" }}
            >
              <Icon name="download" size={13} />
              Exportar
            </button>
            <button className="btn btn-primary" onClick={() => setNewModalOpen(true)}>
              <Icon name="plus" size={13} color="#fff" />
              Crear template oficial
            </button>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <FlairHero adoption={ADOPTION_PCT} total={WITH_CUSTOM_FLAIR} />
        <FlairKpi i="palette" l="Template más usado" v="Tournament" sub="1,240 usuarios · 29%" />
        <FlairKpi
          i="flag"
          l="Reportes pendientes"
          v={String(REPORTS.length)}
          sub={REPORTS.length ? "requieren acción" : "todo limpio"}
          warn={REPORTS.length > 0}
        />
        <FlairKpi
          i="filter"
          l="Watermarks bloqueados"
          v={String(blockedWords.length)}
          sub="palabras prohibidas"
        />
      </div>

      {/* ── TABS ── */}
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          paddingBottom: 0,
        }}
      >
        {(
          [
            { k: "users", l: "Usuarios", n: USERS.length, i: "users" },
            { k: "reports", l: "Reportes", n: REPORTS.length, i: "flag" },
            { k: "analytics", l: "Analytics", n: null, i: "bar-chart-3" },
            {
              k: "templates",
              l: "Templates oficiales",
              n: TEMPLATE_STATS.filter((s) => s.enabled).length,
              i: "sparkles",
            },
            {
              k: "words",
              l: "Moderación de watermarks",
              n: blockedWords.length,
              i: "shield-alert",
            },
          ] as Array<{ k: Tab; l: string; n: number | null; i: string }>
        ).map((t) => {
          const on = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "11px 14px",
                background: "transparent",
                border: 0,
                borderBottom: "2px solid " + (on ? "#0a0a0a" : "transparent"),
                color: on ? "#0a0a0a" : "var(--muted-fg)",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: on ? 900 : 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: -1,
              }}
            >
              <Icon name={t.i} size={12} />
              {t.l}
              {t.n !== null && (
                <span
                  style={{
                    padding: "1px 6px",
                    borderRadius: 9999,
                    background: on ? "#0a0a0a" : "var(--muted)",
                    color: on ? "#fff" : "var(--muted-fg)",
                    fontSize: 10,
                    fontWeight: 900,
                  }}
                >
                  {t.n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "users" && (
        <UsersTab
          users={filtered}
          totalUsers={USERS.length}
          search={search}
          setSearch={setSearch}
          templateF={templateF}
          setTemplateF={setTemplateF}
          onOpen={setOpenUser}
        />
      )}
      {tab === "reports" && <ReportsTab onAction={soon} />}
      {tab === "analytics" && <AnalyticsTab />}
      {tab === "templates" && <TemplatesTab onAction={soon} />}
      {tab === "words" && (
        <WordsTab
          blockedWords={blockedWords}
          onRemove={handleRemoveWord}
          newWord={newWord}
          setNewWord={setNewWord}
          onAdd={handleAddWord}
          onAction={soon}
        />
      )}

      {openUser && (
        <UserDrawer
          u={USERS.find((x) => x.id === openUser)!}
          close={() => setOpenUser(null)}
          onAction={soon}
        />
      )}
      {newModalOpen && (
        <NewTemplateModal close={() => setNewModalOpen(false)} onCreate={soon} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function FlairHero({ adoption, total }: { adoption: number; total: number }) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 14.4,
        background: "linear-gradient(135deg, #0a0a0a 0%, #581c87 100%)",
        color: "#fff",
        padding: 18,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 90% 20%, rgba(236,72,153,0.28), transparent 55%)",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="label-mp" style={{ color: "#f9a8d4" }}>
            ● Adopción de flair
          </span>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#f9a8d4" }}>+8 pp vs mes</span>
        </div>
        <div
          className="font-heading tabular"
          style={{
            fontSize: 38,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            marginTop: 8,
          }}
        >
          {adoption}
          <span
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.55)",
              fontWeight: 700,
              marginLeft: 4,
            }}
          >
            %
          </span>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 6 }}>
          {total.toLocaleString("es-EC")} usuarios personalizan más allá del default
        </div>
        <div
          style={{
            marginTop: 14,
            height: 8,
            borderRadius: 9999,
            background: "rgba(255,255,255,0.1)",
            overflow: "hidden",
          }}
        >
          <div style={{ height: "100%", width: `${adoption}%`, background: "#ec4899" }} />
        </div>
      </div>
    </div>
  );
}

function FlairKpi({
  i,
  l,
  v,
  sub,
  warn,
}: {
  i: string;
  l: string;
  v: string;
  sub: string;
  warn?: boolean;
}) {
  const c = warn ? "#dc2626" : "#0a0a0a";
  const bg = warn ? "#fee2e2" : "var(--muted)";
  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span className="label-mp">{l}</span>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: bg,
            color: c,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={i} size={13} color={c} />
        </span>
      </div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 24,
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: "-0.025em",
          color: c,
        }}
      >
        {v}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function UsersTab({
  users,
  totalUsers,
  search,
  setSearch,
  templateF,
  setTemplateF,
  onOpen,
}: {
  users: UserRow[];
  totalUsers: number;
  search: string;
  setSearch: (v: string) => void;
  templateF: string;
  setTemplateF: (v: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 260, maxWidth: 380 }}>
          <span
            style={{
              position: "absolute",
              left: 12,
              top: 11,
              color: "var(--muted-fg)",
              display: "inline-flex",
            }}
          >
            <Icon name="search" size={13} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, email o watermark…"
            style={{
              width: "100%",
              padding: "11px 14px 11px 34px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontSize: 12.5,
              fontFamily: "inherit",
              outline: "none",
              background: "#fff",
            }}
          />
        </div>
        <FilterPill
          label="Template"
          value={templateF}
          onChange={setTemplateF}
          options={[
            { k: "all", l: "Todos" },
            { k: "tournament", l: "Tournament" },
            { k: "editorial", l: "Editorial" },
            { k: "neon", l: "Neon" },
            { k: "old school", l: "Old school" },
            { k: "minimal", l: "Minimal" },
            { k: "custom", l: "Custom" },
          ]}
        />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          <b style={{ color: "#0a0a0a" }}>{users.length}</b> de {totalUsers}
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "36px 1.6fr 130px 100px 130px 110px 36px",
            gap: 12,
            padding: "12px 18px",
            background: "#fafafa",
            borderBottom: "1px solid var(--border)",
            alignItems: "center",
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
          }}
        >
          <div />
          <div>Usuario</div>
          <div>Template</div>
          <div>Watermark</div>
          <div>Banner / Accent</div>
          <div>Editado</div>
          <div />
        </div>
        {users.map((u, i) => (
          <UserRowEl key={u.id} u={u} last={i === users.length - 1} onOpen={() => onOpen(u.id)} />
        ))}
        {users.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--muted-fg)" }}>
            <Icon name="filter-x" size={20} />
            <div
              style={{ fontSize: 13, fontWeight: 800, color: "#0a0a0a", marginTop: 8 }}
            >
              Sin usuarios con esos filtros
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UserRowEl({ u, last, onOpen }: { u: UserRow; last: boolean; onOpen: () => void }) {
  const c = TEMPLATE_COLORS[u.template] ?? "#737373";
  return (
    <div
      onClick={onOpen}
      style={{
        display: "grid",
        gridTemplateColumns: "36px 1.6fr 130px 100px 130px 110px 36px",
        gap: 12,
        padding: "13px 18px",
        alignItems: "center",
        cursor: "pointer",
        transition: "background 120ms",
        borderBottom: last ? 0 : "1px solid var(--border)",
        background: u.flagged ? "rgba(220,38,38,0.025)" : "#fff",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#fafafa";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = u.flagged ? "rgba(220,38,38,0.025)" : "#fff";
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: u.bg,
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <span className="font-heading" style={{ fontSize: 10, fontWeight: 900 }}>
          {u.av}
        </span>
        {u.flagged && (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#dc2626",
              border: "2px solid #fff",
            }}
          />
        )}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {u.who}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted-fg)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {u.email}
        </div>
      </div>
      <div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 9px",
            borderRadius: 9999,
            background: c + "15",
            color: c,
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: c }} />
          {u.template}
        </span>
      </div>
      <div>
        {u.watermark ? (
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: 13,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: u.flagged ? "#dc2626" : "#0a0a0a",
            }}
          >
            {u.watermark}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>—</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 30,
            height: 16,
            borderRadius: 4,
            background: u.bg,
            border: "1px solid var(--border)",
          }}
        />
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            background: u.accent,
            border: "1px solid var(--border)",
          }}
        />
      </div>
      <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>{u.edited}</span>
      <Icon name="chevron-right" size={14} color="var(--muted-fg)" />
    </div>
  );
}

function FilterPill({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ k: string; l: string }>;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 12px",
        borderRadius: 9999,
        border: "1px solid var(--border)",
        background: "#fff",
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--muted-fg)",
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          border: 0,
          background: "transparent",
          fontFamily: "inherit",
          fontSize: 11.5,
          fontWeight: 800,
          cursor: "pointer",
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o.k} value={o.k}>
            {o.l}
          </option>
        ))}
      </select>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function ReportsTab({ onAction }: { onAction: (label: string) => void }) {
  if (REPORTS.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center" }}>
        <span
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: "rgba(16,185,129,0.12)",
            color: "#047857",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
          }}
        >
          <Icon name="check-circle-2" size={26} color="#047857" />
        </span>
        <div
          className="font-heading"
          style={{
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
          }}
        >
          Sin reportes pendientes<span className="dot">.</span>
        </div>
        <p
          style={{
            fontSize: 12,
            color: "var(--muted-fg)",
            maxWidth: 380,
            margin: "6px auto 0",
            lineHeight: 1.5,
          }}
        >
          La comunidad ha estado tranquila. Los reportes nuevos aparecerán acá.
        </p>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "16px 22px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2
          className="font-heading"
          style={{
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          {REPORTS.length} reportes esperando acción<span className="dot">.</span>
        </h2>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>SLA · 24 h</span>
      </div>
      {REPORTS.map((r, i) => {
        const u = USERS.find((x) => x.id === r.userId)!;
        return (
          <div
            key={r.id}
            style={{
              padding: "18px 22px",
              borderBottom: i === REPORTS.length - 1 ? 0 : "1px solid var(--border)",
              display: "grid",
              gridTemplateColumns: "52px 1.4fr 1fr 200px",
              gap: 16,
              alignItems: "center",
            }}
          >
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: u.bg,
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <span className="font-heading" style={{ fontSize: 14, fontWeight: 900 }}>
                {u.av}
              </span>
              <span
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#dc2626",
                  border: "2px solid #fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="flag" size={8} color="#fff" />
              </span>
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{u.who}</div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>{u.email}</div>
              <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4 }}>
                Reportado por {r.reportedBy} usuarios · {r.when}
              </div>
            </div>
            <div>
              <div className="label-mp" style={{ marginBottom: 4 }}>
                {r.reason}
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 11px",
                  borderRadius: 8,
                  background: "#fee2e2",
                  color: "#7f1d1d",
                  border: "1px solid #fca5a5",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 900,
                    fontSize: 15,
                    letterSpacing: "0.06em",
                  }}
                >
                  &quot;{r.value}&quot;
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    color: "#7f1d1d",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {r.field}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <button
                onClick={() => onAction(`Resetear flair de ${u.who}`)}
                className="btn btn-primary"
                style={{ fontSize: 10.5, padding: "7px 12px" }}
              >
                <Icon name="undo-2" size={11} color="#fff" />
                Resetear flair
              </button>
              <button
                onClick={() => onAction(`Bloquear "${r.value}"`)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 9999,
                  background: "#fff",
                  border: "1px solid var(--border)",
                  fontFamily: "inherit",
                  fontSize: 10.5,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                <Icon name="shield-x" size={11} />
                Bloquear &quot;{r.value}&quot;
              </button>
              <button
                onClick={() => onAction("Descartar reporte")}
                style={{
                  padding: "5px 12px",
                  background: "transparent",
                  border: 0,
                  color: "var(--muted-fg)",
                  fontSize: 10.5,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textDecoration: "underline",
                }}
              >
                Descartar reporte
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function AnalyticsTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp">Distribución</div>
          <h3
            className="font-heading"
            style={{
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: "4px 0 16px",
            }}
          >
            Templates aplicados<span className="dot">.</span>
          </h3>
          <div
            style={{
              height: 16,
              borderRadius: 9999,
              background: "var(--muted)",
              overflow: "hidden",
              display: "flex",
              marginBottom: 16,
            }}
          >
            {TEMPLATE_STATS.map((t) => (
              <div
                key={t.k}
                style={{ width: `${t.pct}%`, background: t.color }}
                title={`${t.l} · ${t.count}`}
              />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {TEMPLATE_STATS.map((t) => (
              <div key={t.k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: t.color }} />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{t.l}</span>
                <span className="tabular" style={{ fontSize: 12, fontWeight: 800 }}>
                  {t.count.toLocaleString("es-EC")}{" "}
                  <span style={{ color: "var(--muted-fg)", marginLeft: 4 }}>· {t.pct}%</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp">Banners</div>
          <h3
            className="font-heading"
            style={{
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: "4px 0 14px",
            }}
          >
            Top usados<span className="dot">.</span>
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {BANNER_STATS.map((b) => {
              const maxC = BANNER_STATS[0].count;
              const pct = (b.count / maxC) * 100;
              return (
                <div key={b.k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 28,
                      height: 18,
                      borderRadius: 4,
                      background: b.color,
                      flexShrink: 0,
                      border: "1px solid var(--border)",
                    }}
                  />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700 }}>{b.l}</span>
                  <div
                    style={{
                      width: 100,
                      height: 4,
                      borderRadius: 9999,
                      background: "var(--muted)",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ height: "100%", width: `${pct}%`, background: "#0a0a0a" }} />
                  </div>
                  <span
                    className="tabular"
                    style={{ fontSize: 11.5, fontWeight: 800, width: 50, textAlign: "right" }}
                  >
                    {b.count.toLocaleString("es-EC")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp">Accents</div>
          <h3
            className="font-heading"
            style={{
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: "4px 0 14px",
            }}
          >
            Colores favoritos<span className="dot">.</span>
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ACCENT_STATS.map((a) => {
              const maxC = ACCENT_STATS[0].count;
              const pct = (a.count / maxC) * 100;
              return (
                <div key={a.c} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: a.c,
                      flexShrink: 0,
                      border: "1px solid var(--border)",
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11.5,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{a.l}</span>
                      <span className="tabular" style={{ fontWeight: 800 }}>
                        {a.count.toLocaleString("es-EC")}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 4,
                        borderRadius: 9999,
                        background: "var(--muted)",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ height: "100%", width: `${pct}%`, background: a.c }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp">Watermarks</div>
          <h3
            className="font-heading"
            style={{
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: "4px 0 14px",
            }}
          >
            Las más usadas<span className="dot">.</span>
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {POPULAR_WATERMARKS.map((w) => (
              <div
                key={w.w}
                style={{
                  padding: "10px 14px",
                  borderRadius: 9,
                  background: "var(--muted)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 900,
                    fontSize: 16,
                    letterSpacing: "0.04em",
                  }}
                >
                  {w.w}
                </span>
                <span
                  className="tabular"
                  style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}
                >
                  {w.count.toLocaleString("es-EC")} usuarios
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 12,
              padding: 11,
              borderRadius: 9,
              background: "rgba(16,185,129,0.05)",
              border: "1px solid rgba(16,185,129,0.18)",
              fontSize: 11.5,
              color: "#065f46",
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <Icon name="lightbulb" size={12} color="#065f46" />
            <span>
              <b>&quot;JUEGA&quot;</b> es la watermark más popular (412 usuarios). Considera
              promoverla como sugerencia default en el onboarding.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function TemplatesTab({ onAction }: { onAction: (label: string) => void }) {
  const official = TEMPLATE_STATS.filter((t) => t.k !== "custom");
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "16px 22px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h2
            className="font-heading"
            style={{
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Templates oficiales<span className="dot">.</span>
          </h2>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
            Los 5 estilos curados que ven los usuarios en la pantalla de Personalización
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => onAction("Nuevo template")}>
          <Icon name="plus" size={13} color="#fff" />
          Nuevo template
        </button>
      </div>
      {official.map((t, i) => (
        <div
          key={t.k}
          style={{
            padding: "18px 22px",
            borderBottom: i === official.length - 1 ? 0 : "1px solid var(--border)",
            display: "grid",
            gridTemplateColumns: "80px 1fr 160px 110px 160px",
            gap: 18,
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 80,
              height: 50,
              borderRadius: 8,
              background: t.color,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(ellipse at 70% 30%, rgba(255,255,255,0.2), transparent 60%)",
              }}
            />
          </div>
          <div>
            <div
              className="font-heading"
              style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.01em" }}
            >
              {t.l}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted-fg)",
                marginTop: 2,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              tpl.{t.k}
            </div>
          </div>
          <div>
            <div
              className="font-heading tabular"
              style={{ fontSize: 16, fontWeight: 900 }}
            >
              {t.count.toLocaleString("es-EC")}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
              {t.pct}% de adopción
            </div>
          </div>
          <div>
            <div
              style={{
                height: 4,
                borderRadius: 9999,
                background: "var(--muted)",
                overflow: "hidden",
              }}
            >
              <div style={{ height: "100%", width: `${t.pct}%`, background: t.color }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button
              onClick={() => onAction(`Editar ${t.l}`)}
              className="btn"
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                fontSize: 10.5,
                padding: "6px 12px",
              }}
            >
              <Icon name="edit" size={11} />
              Editar
            </button>
            <button
              onClick={() => onAction(t.enabled ? `Ocultar ${t.l}` : `Mostrar ${t.l}`)}
              className="btn"
              style={{
                background: "#fff",
                border: "1px solid var(--border)",
                fontSize: 10.5,
                padding: "6px 12px",
              }}
            >
              <Icon name={t.enabled ? "eye" : "eye-off"} size={11} />
              {t.enabled ? "Visible" : "Oculto"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function WordsTab({
  blockedWords,
  onRemove,
  newWord,
  setNewWord,
  onAdd,
  onAction,
}: {
  blockedWords: string[];
  onRemove: (w: string) => void;
  newWord: string;
  setNewWord: (v: string) => void;
  onAdd: () => void;
  onAction: (label: string) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card" style={{ padding: 22 }}>
        <div className="label-mp" style={{ color: "#dc2626" }}>
          ● Lista negra
        </div>
        <h2
          className="font-heading"
          style={{
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            margin: "4px 0 4px",
          }}
        >
          Watermarks bloqueadas<span className="dot">.</span>
        </h2>
        <p style={{ fontSize: 11.5, color: "var(--muted-fg)", margin: "0 0 14px" }}>
          Si un usuario intenta usar estas palabras, el cambio se bloquea automáticamente.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {blockedWords.map((w) => (
            <span
              key={w}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 11px",
                borderRadius: 9999,
                background: "#fee2e2",
                color: "#7f1d1d",
                fontFamily: "var(--font-heading)",
                fontWeight: 900,
                fontSize: 12,
                letterSpacing: "0.06em",
                border: "1px solid #fca5a5",
              }}
            >
              {w}
              <button
                onClick={() => onRemove(w)}
                aria-label={`Quitar ${w}`}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "#7f1d1d",
                  cursor: "pointer",
                  padding: 0,
                  display: "inline-flex",
                }}
              >
                <Icon name="x" size={11} color="#7f1d1d" />
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd();
            }}
            placeholder="Añadir palabra · ej. SLUR"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 9,
              border: "1px solid var(--border)",
              fontSize: 13,
              fontFamily: "inherit",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontWeight: 800,
              outline: "none",
            }}
          />
          <button onClick={onAdd} className="btn btn-primary" style={{ padding: "8px 16px" }}>
            Añadir
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div className="label-mp">Sugeridas para review</div>
        <h2
          className="font-heading"
          style={{
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            margin: "4px 0 4px",
          }}
        >
          Watermarks frecuentes<span className="dot">.</span>
        </h2>
        <p style={{ fontSize: 11.5, color: "var(--muted-fg)", margin: "0 0 14px" }}>
          Las palabras que más se repiten · revisalas para detectar nuevas amenazas.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {POPULAR_WATERMARKS.map((w) => (
            <div
              key={w.w}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  flex: 1,
                  fontFamily: "var(--font-heading)",
                  fontWeight: 900,
                  fontSize: 13,
                  letterSpacing: "0.04em",
                }}
              >
                {w.w}
              </span>
              <span
                className="tabular"
                style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}
              >
                {w.count.toLocaleString("es-EC")} usuarios
              </span>
              <button
                onClick={() => onAction(`Bloquear "${w.w}"`)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 9999,
                  background: "#fff",
                  border: "1px solid var(--border)",
                  fontFamily: "inherit",
                  fontSize: 9.5,
                  fontWeight: 800,
                  color: "#dc2626",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Icon name="ban" size={10} color="#dc2626" />
                Bloquear
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function UserDrawer({
  u,
  close,
  onAction,
}: {
  u: UserRow;
  close: () => void;
  onAction: (label: string) => void;
}) {
  const templateColor = TEMPLATE_COLORS[u.template];
  const bannerBg = BANNER_BGS[u.bannerK];
  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10,10,10,0.55)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 500,
          background: "#fff",
          height: "100%",
          overflow: "auto",
          boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            background: "#0a0a0a",
            color: "#fff",
            padding: 22,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(ellipse at 85% 20%, ${templateColor}33, transparent 60%)`,
            }}
          />
          <button
            onClick={close}
            aria-label="Cerrar"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={13} color="#fff" />
          </button>
          <div style={{ position: "relative" }}>
            <div className="label-mp" style={{ color: "#f9a8d4" }}>
              ● Flair del usuario
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
              <span
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: u.bg,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "3px solid #fff",
                }}
              >
                <span className="font-heading" style={{ fontSize: 17, fontWeight: 900 }}>
                  {u.av}
                </span>
              </span>
              <div>
                <div
                  className="font-heading"
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    letterSpacing: "-0.02em",
                    textTransform: "uppercase",
                  }}
                >
                  {u.who}
                  <span style={{ color: "var(--primary)" }}>.</span>
                </div>
                <div
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}
                >
                  {u.email}
                </div>
              </div>
            </div>
            {u.flagged && (
              <div
                style={{
                  marginTop: 14,
                  padding: 10,
                  borderRadius: 8,
                  background: "rgba(220,38,38,0.15)",
                  border: "1px solid rgba(220,38,38,0.35)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon name="flag" size={14} color="#fca5a5" />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#fca5a5" }}>
                  Flair reportado · {u.flagged}
                </span>
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: 22, borderBottom: "1px solid var(--border)" }}>
          <div className="label-mp" style={{ marginBottom: 10 }}>
            Preview del perfil actual
          </div>
          <div
            style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}
          >
            <div
              style={{
                height: 80,
                background: bannerBg,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {u.watermark && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%,-50%) rotate(-6deg)",
                    fontFamily: "var(--font-heading)",
                    fontWeight: 900,
                    fontSize: 50,
                    letterSpacing: "-0.06em",
                    color: u.flagged ? "rgba(220,38,38,0.4)" : "rgba(255,255,255,0.12)",
                    textTransform: "uppercase",
                    pointerEvents: "none",
                  }}
                >
                  {u.watermark}
                </div>
              )}
            </div>
            <div style={{ padding: "0 16px 14px" }}>
              <div
                style={{ marginTop: -22, display: "flex", alignItems: "flex-end", gap: 10 }}
              >
                <span
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: "50%",
                    background: u.bg,
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "3px solid #fff",
                  }}
                >
                  <span className="font-heading" style={{ fontSize: 13, fontWeight: 900 }}>
                    {u.av}
                  </span>
                </span>
              </div>
              <div
                className="font-heading"
                style={{
                  fontSize: 17,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  textTransform: "uppercase",
                  marginTop: 8,
                }}
              >
                {u.who}
                <span style={{ color: u.accent }}>.</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                Backhand cruzado y muchas ganas.
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: 22, borderBottom: "1px solid var(--border)" }}>
          <div className="label-mp" style={{ marginBottom: 12 }}>
            Atributos del flair
          </div>
          <KV
            k="Template"
            v={
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 9px",
                  borderRadius: 9999,
                  background: templateColor + "15",
                  color: templateColor,
                  fontSize: 10.5,
                  fontWeight: 900,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: templateColor,
                  }}
                />
                {u.template}
              </span>
            }
          />
          <KV k="Banner" v={u.bannerK} mono />
          <KV
            k="Accent"
            v={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background: u.accent,
                    border: "1px solid var(--border)",
                  }}
                />
                <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5 }}>
                  {u.accent}
                </code>
              </span>
            }
          />
          <KV
            k="Watermark"
            v={
              u.watermark ? (
                <span
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 900,
                    fontSize: 14,
                    letterSpacing: "0.04em",
                    color: u.flagged ? "#dc2626" : "#0a0a0a",
                  }}
                >
                  {u.watermark}
                </span>
              ) : (
                <>—</>
              )
            }
          />
          <KV k="Última edición" v={u.edited} />
        </div>

        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="label-mp" style={{ marginBottom: 4 }}>
            Acciones admin
          </div>
          <button
            onClick={() => onAction("Ver perfil completo")}
            className="btn"
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              justifyContent: "flex-start",
            }}
          >
            <Icon name="external-link" size={12} />
            Ver perfil completo
          </button>
          <button
            onClick={() => onAction("Historial de personalizaciones")}
            className="btn"
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              justifyContent: "flex-start",
            }}
          >
            <Icon name="history" size={12} />
            Historial de personalizaciones
          </button>
          <button
            onClick={() => onAction("Resetear flair al default")}
            className="btn"
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              justifyContent: "flex-start",
              color: "#92400e",
            }}
          >
            <Icon name="undo-2" size={12} color="#92400e" />
            Resetear flair al default
          </button>
          <button
            onClick={() => onAction("Suspender personalización")}
            className="btn"
            style={{
              background: "#fff",
              border: "1px solid #dc2626",
              color: "#dc2626",
              justifyContent: "flex-start",
            }}
          >
            <Icon name="shield-x" size={12} color="#dc2626" />
            Suspender personalización del usuario
          </button>
        </div>
      </div>
    </div>
  );
}

function KV({
  k,
  v,
  mono,
}: {
  k: string;
  v: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 0",
        borderTop: "1px dashed var(--border)",
      }}
    >
      <span style={{ fontSize: 11.5, color: "var(--muted-fg)", fontWeight: 700 }}>{k}</span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          fontFamily: mono ? "ui-monospace, monospace" : "inherit",
        }}
      >
        {v}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
function NewTemplateModal({
  close,
  onCreate,
}: {
  close: () => void;
  onCreate: (label: string) => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [desc, setDesc] = useState("");
  const [base, setBase] = useState("blank");
  const [icon, setIcon] = useState("sparkles");
  const [touchedKey, setTouchedKey] = useState(false);

  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 24);

  const handleName = (v: string) => {
    setName(v);
    if (!touchedKey) setKey(slug(v));
  };

  const bases = [
    { k: "blank", l: "En blanco", sub: "Minimal por defecto", color: "#737373", icon: "sparkle" },
    { k: "tournament", l: "Tournament", sub: "Negro · Rojo", color: "#dc2626", icon: "swords" },
    { k: "editorial", l: "Editorial", sub: "Mono · Tipo gigante", color: "#0a0a0a", icon: "type" },
    { k: "neon", l: "Neon", sub: "Violeta · Glass", color: "#7c3aed", icon: "zap" },
    { k: "oldschool", l: "Old school", sub: "Court · Halo", color: "#10b981", icon: "star" },
    { k: "minimal", l: "Minimal", sub: "Limpio · Sin watermark", color: "#737373", icon: "minus" },
  ];

  const iconOptions = [
    "sparkles",
    "crown",
    "flame",
    "zap",
    "trophy",
    "star",
    "gem",
    "cloud",
    "wand-2",
    "palette",
    "sunrise",
    "moon",
  ];

  const valid = name.trim().length > 0 && key.trim().length > 0;

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10,10,10,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
          background: "#fff",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 32px 64px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            background: "#0a0a0a",
            color: "#fff",
            padding: 22,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at 85% 20%, rgba(124,58,237,0.25), transparent 60%)",
            }}
          />
          <button
            onClick={close}
            aria-label="Cerrar"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={13} color="#fff" />
          </button>
          <div style={{ position: "relative" }}>
            <div className="label-mp" style={{ color: "#c4b5fd" }}>
              ● Template oficial
            </div>
            <h2
              className="font-heading"
              style={{
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                textTransform: "uppercase",
                margin: "8px 0 0",
                lineHeight: 1.1,
              }}
            >
              Crear template<span style={{ color: "var(--primary)" }}>.</span>
            </h2>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", margin: "6px 0 0" }}>
              Dale nombre, key y base · el editor se abre con todos los controles
            </p>
          </div>
        </div>

        <div
          style={{
            padding: 22,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxHeight: "60vh",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
            <div>
              <div className="label-mp" style={{ marginBottom: 6 }}>
                Nombre <span style={{ color: "#dc2626" }}>∗</span>
              </div>
              <input
                value={name}
                onChange={(e) => handleName(e.target.value.slice(0, 24))}
                autoFocus
                placeholder="ej. Champion"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  fontFamily: "var(--font-heading)",
                  fontWeight: 900,
                  fontSize: 17,
                  letterSpacing: "-0.015em",
                  outline: "none",
                }}
              />
              <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 4 }}>
                {name.length}/24 caracteres
              </div>
            </div>
            <div>
              <div className="label-mp" style={{ marginBottom: 6 }}>
                Key
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 12,
                    color: "var(--muted-fg)",
                  }}
                >
                  tpl.
                </span>
                <input
                  value={key}
                  onChange={(e) => {
                    setTouchedKey(true);
                    setKey(slug(e.target.value));
                  }}
                  placeholder="auto"
                  style={{
                    flex: 1,
                    border: 0,
                    outline: "none",
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 12,
                    fontWeight: 800,
                    background: "transparent",
                  }}
                />
              </div>
              <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 4 }}>
                Auto-deriva del nombre
              </div>
            </div>
          </div>

          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>
              Descripción corta
            </div>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value.slice(0, 100))}
              placeholder="Una línea que describa el estilo. Aparece bajo la card en la galería del usuario."
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontFamily: "inherit",
                fontSize: 12.5,
                minHeight: 50,
                resize: "none",
                outline: "none",
              }}
            />
            <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 4 }}>
              {desc.length}/100
            </div>
          </div>

          <div>
            <div className="label-mp" style={{ marginBottom: 8 }}>
              Empezar desde
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {bases.map((b) => {
                const on = base === b.k;
                return (
                  <button
                    key={b.k}
                    onClick={() => setBase(b.k)}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: on ? "#ecfdf5" : "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 5,
                      }}
                    >
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: b.color + "20",
                          color: b.color,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name={b.icon} size={12} color={b.color} />
                      </span>
                      {on && (
                        <Icon name="check-circle-2" size={14} color="var(--primary)" />
                      )}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 900 }}>{b.l}</div>
                    <div
                      style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}
                    >
                      {b.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="label-mp" style={{ marginBottom: 8 }}>
              Ícono del template
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {iconOptions.map((i) => {
                const on = icon === i;
                return (
                  <button
                    key={i}
                    onClick={() => setIcon(i)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"),
                      background: on ? "#0a0a0a" : "#fff",
                      color: on ? "#fff" : "#0a0a0a",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name={i} size={14} color={on ? "#fff" : "#0a0a0a"} />
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              padding: 11,
              borderRadius: 8,
              background: "rgba(251,191,36,0.08)",
              border: "1px solid rgba(251,191,36,0.3)",
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <Icon name="info" size={13} color="#92400e" />
            <span style={{ fontSize: 11, color: "#78350f", lineHeight: 1.5 }}>
              El template se crea como <b>borrador</b>. No es visible para los usuarios hasta
              que lo publiques en el designer.
            </span>
          </div>
        </div>

        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#fafafa",
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              color: "var(--muted-fg)",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            {valid ? `tpl.${key} → borrador` : "falta el nombre"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={close}
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)" }}
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                close();
                onCreate(`Crear template tpl.${key}`);
              }}
              disabled={!valid}
              className="btn btn-primary"
              style={{ opacity: valid ? 1 : 0.4, cursor: valid ? "pointer" : "not-allowed" }}
            >
              <Icon name="arrow-right" size={13} color="#fff" />
              Crear y abrir en designer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
