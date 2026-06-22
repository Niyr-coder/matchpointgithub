import Link from "next/link";
import { Icon } from "@/components/Icon";
import { AccountPrivacyPanel } from "./AccountPrivacyPanel";

/** Privacidad LOPDP, exportación de datos y cierre de cuenta (fuera del perfil deportivo). */
export function AccountSettingsScreen() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
      <div>
        <div className="label-mp">Mi cuenta</div>
        <h1 className="font-heading display-md" style={{ margin: "4px 0 0" }}>
          Privacidad y cuenta<span className="dot">.</span>
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "var(--muted-fg)", lineHeight: 1.5, maxWidth: 560 }}>
          Exporta tus datos, revisa políticas y gestiona el cierre de cuenta. Las preferencias de notificaciones
          están en su propia sección.
        </p>
      </div>

      <Link
        href="/dashboard/user/notificaciones"
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 18px",
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "var(--muted)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="bell" size={18} color="var(--muted-fg)" />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>Notificaciones</span>
          <span style={{ display: "block", fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>
            Elige qué avisos recibes por email o en la app
          </span>
        </span>
        <Icon name="chevron-right" size={16} color="var(--muted-fg)" />
      </Link>

      <AccountPrivacyPanel />
    </div>
  );
}
