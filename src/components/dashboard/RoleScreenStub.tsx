"use client";
import Link from "next/link";
import { MP_ROLES, findSidebarItem, type RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";
import { useToast } from "./ToastProvider";

export function RoleScreenStub({ role, activeKey }: { role: RoleKey; activeKey: string }) {
  const cfg = MP_ROLES[role];
  const item = findSidebarItem(role, activeKey) || { label: activeKey, icon: "sparkles", k: activeKey };
  const toast = useToast();

  return (
    <div
      className="card"
      style={{
        padding: 36,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: cfg.color,
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={item.icon} size={28} color="#fff" />
      </div>
      <div className="label-mp" style={{ color: cfg.color }}>
        {cfg.badge} · sección
      </div>
      <h2
        className="font-heading"
        style={{
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          textTransform: "uppercase",
          margin: 0,
        }}
      >
        {item.label}
        <span style={{ color: "var(--primary)" }}>.</span>
      </h2>
      <p style={{ fontSize: 13, color: "var(--muted-fg)", maxWidth: 420, lineHeight: 1.5, margin: 0 }}>
        Pantalla específica del rol <b style={{ color: "#0a0a0a" }}>{cfg.badge}</b>. Por ahora ves
        solo el Home con fidelidad completa; cada sección del sidebar tendrá su propia vista en la
        próxima iteración.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Link
          href={`/dashboard/${role}`}
          className="btn"
          style={{
            background: "#fff",
            border: "1px solid var(--border)",
            textDecoration: "none",
            color: "#0a0a0a",
          }}
        >
          <Icon name="arrow-left" size={13} />
          Volver al Home
        </Link>
        <button
          className="btn btn-primary"
          onClick={() =>
            toast({
              icon: "sparkles",
              title: "Anotado",
              sub: `Te aviso cuando esté lista la pantalla "${item.label}"`,
            })
          }
        >
          Pedir esta pantalla
          <Icon name="arrow-right" size={13} />
        </button>
      </div>
    </div>
  );
}
