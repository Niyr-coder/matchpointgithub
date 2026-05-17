// Client view de AdminUsersScreen — layout 1:1 (RoleScreens.jsx 116-155).
"use client";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type UserStatus = "active" | "warned" | "banned";
export type UserRow = {
  id: string;
  n: string;
  e: string;
  l: number;
  city: string;
  m: number;
  st: UserStatus;
  av: string;
  avBg: string;
  spend: string;
  avatarUrl: string | null;
};
export type UsersData = { rows: UserRow[]; total: number };

const ST_STYLES: Record<UserStatus, { c: string; l: string }> = {
  active: { c: "var(--primary)", l: "● Activo" },
  warned: { c: "#fbbf24", l: "⚠ Advertido" },
  banned: { c: "#dc2626", l: "⊘ Suspendido" },
};

export function AdminUsersScreenView({ data }: { data: UsersData }) {
  useRealtimeRefresh([{ table: "profiles" }, { table: "player_stats" }]);

  const cols: RSColumn<UserRow>[] = [
    {
      k: "n",
      l: "Usuario",
      render: (u) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: u.avatarUrl ? `url(${u.avatarUrl}) center/cover` : u.avBg,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 10.5,
              flexShrink: 0,
            }}
          >
            {u.avatarUrl ? "" : u.av}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>{u.n}</div>
            <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{u.e}</div>
          </div>
        </div>
      ),
    },
    {
      k: "l",
      l: "Nivel",
      align: "center",
      render: (u) => (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 7px",
            background: "#0a0a0a",
            color: "#fff",
            borderRadius: 9999,
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          <Icon name="zap" size={9} color="#fbbf24" />
          {u.l}
        </span>
      ),
    },
    { k: "city", l: "Ciudad" },
    { k: "m", l: "Matches", align: "center", render: (u) => <b className="font-heading">{u.m}</b> },
    {
      k: "spend",
      l: "Gasto · mes",
      align: "right",
      render: (u) => (
        <b style={{ color: u.spend === "$0" ? "var(--muted-fg)" : "var(--primary)" }}>{u.spend}</b>
      ),
    },
    {
      k: "st",
      l: "Estado",
      render: (u) => <RSPill bg={ST_STYLES[u.st].c}>{ST_STYLES[u.st].l}</RSPill>,
    },
    {
      k: "a",
      l: "",
      align: "right",
      render: () => (
        <button
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--muted)",
            border: 0,
            cursor: "pointer",
          }}
        >
          <Icon name="more-horizontal" size={13} />
        </button>
      ),
    },
  ];

  return (
    <>
      <RSHeader
        label="Plataforma · Usuarios"
        title={
          <>
            Usuarios <span className="dot">●</span> {data.total.toLocaleString("en-US")}
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: 10, color: "var(--muted-fg)" }}>
                <Icon name="search" size={13} />
              </span>
              <input
                placeholder="Buscar por nombre o usuario…"
                style={{
                  padding: "8px 14px 8px 32px",
                  border: RS_BORDER,
                  borderRadius: 9999,
                  fontSize: 12,
                  fontFamily: "inherit",
                  minWidth: 280,
                }}
              />
            </div>
            <button className="btn" style={{ background: "#fff", border: RS_BORDER }}>
              <Icon name="filter" size={12} />
              Filtros
            </button>
          </div>
        }
      />
      <RSTable cols={cols} rows={data.rows} rowKey={(u) => u.id} />
    </>
  );
}
