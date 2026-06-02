// Admin · paywall funnel telemetría básica.
// V1: tabla de eventos por nombre últimos 30 días con count + unique users.
// Sin gráficos, sin filtros — es el punto de partida para leer impacto cuando
// los flags `paywall_enforce_*` (mig 172) empiecen a flipearse a ON.
//
// Cuando ya tengamos volumen suficiente, esto se enriquece con: serie temporal
// por día, conversion rate (impression → click → upgrade), funnels nombrados
// (Coach AI: viewed → blocked → clicked_upgrade → checkout_started → activated).
import { listPaywallFunnelAdmin } from "@/server/actions/admin/paywall-funnel";
import { Icon } from "@/components/Icon";

const EVENT_LABELS: Record<string, string> = {
  pricing_page_viewed: "Página de precios vista",
  pricing_tab_viewed: "Pestaña de precios vista",
  pricing_toggle_changed: "Cambio de período de cobro",
  pricing_tier_cta_clicked: "Clic en CTA de plan",
  pricing_faq_expanded: "Pregunta frecuente abierta",
  lead_submitted: "Lead comercial enviado",
};

function eventLabel(eventName: string): string {
  return EVENT_LABELS[eventName] ?? eventName
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function AdminPaywallFunnelScreen() {
  const res = await listPaywallFunnelAdmin({ days: 30 });

  if (!res.ok) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <h2
          className="font-heading"
          style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", margin: 0 }}
        >
          Paywall · Funnel<span className="dot">.</span>
        </h2>
        <p style={{ marginTop: 12, color: "#b91c1c", fontSize: 13 }}>
          Error cargando datos: {res.error.message}
        </p>
      </div>
    );
  }

  const { totalEvents, uniqueUsers, uniqueSessions, uniqueActors, buckets, windowDays } = res.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div className="label-mp" style={{ color: "#7c3aed" }}>● Monetización · Funnel</div>
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
          Paywall funnel<span className="dot">.</span>
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0" }}>
          Eventos de pricing/paywall registrados en los últimos {windowDays} días.
          Solo aparece data cuando el código emite `trackPricingEvent(...)` o
          cuando los flags <code>paywall_enforce_*</code> empiezan a generar
          fricciones medibles.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        <KPI label="Eventos totales" value={totalEvents.toLocaleString("en-US")} icon="activity" />
        <KPI label="Usuarios logueados" value={uniqueUsers.toLocaleString("en-US")} icon="users" />
        <KPI label="Sesiones únicas" value={uniqueSessions.toLocaleString("en-US")} icon="mouse-pointer-click" />
        <KPI label="Actores únicos" value={uniqueActors.toLocaleString("en-US")} icon="scan-face" />
        <KPI label="Tipos de evento" value={buckets.length.toLocaleString("en-US")} icon="layers" />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Eventos del funnel<span className="dot">.</span>
          </h2>
          <span style={{ fontSize: 11, color: "var(--muted-fg)", fontFamily: "ui-monospace, monospace" }}>
            ventana · {windowDays}d
          </span>
        </div>

        {buckets.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted-fg)", fontSize: 13 }}>
            Sin eventos registrados en este período. Apenas los flags{" "}
            <code>paywall_enforce_*</code> activen, o el cliente empiece a
            llamar <code>trackPricingEvent</code>, las filas aparecerán acá.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--muted)" }}>
                <Th>Evento</Th>
                <Th align="right">Total</Th>
                <Th align="right">Usuarios</Th>
                <Th align="right">Sesiones</Th>
                <Th align="right">% del total</Th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.eventName} style={{ borderTop: "1px solid var(--border)" }}>
                  <Td>
                    <span title={b.eventName} style={{ fontWeight: 800 }}>
                      {eventLabel(b.eventName)}
                    </span>
                  </Td>
                  <Td align="right" mono>
                    {b.count.toLocaleString("en-US")}
                  </Td>
                  <Td align="right" mono>
                    {b.uniqueUsers.toLocaleString("en-US")}
                  </Td>
                  <Td align="right" mono>
                    {b.uniqueSessions.toLocaleString("en-US")}
                  </Td>
                  <Td align="right" mono>
                    {totalEvents > 0
                      ? ((b.count / totalEvents) * 100).toFixed(1) + "%"
                      : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function KPI({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div
      className="card"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "var(--muted)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={13} />
        </span>
        <span className="label-mp">{label}</span>
      </div>
      <div
        className="font-heading"
        style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align ?? "left",
        padding: "10px 16px",
        fontSize: 10.5,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--muted-fg)",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
}) {
  return (
    <td
      style={{
        padding: "12px 16px",
        textAlign: align ?? "left",
        fontSize: 12.5,
        fontWeight: mono ? 700 : 500,
        fontFamily: mono ? "ui-monospace, monospace" : "inherit",
      }}
    >
      {children}
    </td>
  );
}
