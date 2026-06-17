import { Icon } from "@/components/Icon";

/** Aviso de beta abierta dentro del modal de registro / inicio de sesión. */
export function BetaPhaseAuthNotice() {
  return (
    <div
      role="note"
      style={{
        marginBottom: 14,
        padding: "12px 14px",
        borderRadius: 10,
        background: "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)",
        border: "1px solid rgba(16,185,129,0.35)",
        color: "#065f46",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "#10b981",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="flask-conical" size={14} color="#fff" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 4 }}>
            Estamos en beta abierta · gratis para todos
          </div>
          <p style={{ margin: 0 }}>
            MATCHPOINT es gratis para todos durante la beta. Sigue en desarrollo activo, así que
            puedes encontrar errores y cambios en funciones. Si algo falla, escríbenos a{" "}
            <a
              href="mailto:soporte@matchpoint.top"
              style={{ color: "#047857", fontWeight: 700 }}
            >
              soporte@matchpoint.top
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
