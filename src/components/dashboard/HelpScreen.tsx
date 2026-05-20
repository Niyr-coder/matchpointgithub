// Página de ayuda contextual por rol. Render server-side, contenido
// hardcoded por rol — fácil de iterar editando el ROLE_HELP map.
import { Icon } from "@/components/Icon";
import type { RoleKey } from "@/lib/roles";

type HelpSection = {
  icon: string;
  title: string;
  body: string;
  bullets?: string[];
};

type RoleHelp = {
  intro: string;
  sections: HelpSection[];
};

const ROLE_HELP: Partial<Record<RoleKey, RoleHelp>> = {
  partner: {
    intro:
      "Como partner organizas torneos en MatchPoint. Acá vas a encontrar los flujos clave para que tu evento corra bien y los jugadores tengan la mejor experiencia.",
    sections: [
      {
        icon: "trophy",
        title: "Crear un torneo de cero",
        body: "El wizard de creación tiene 3 pasos: aceptar las reglas del organizador (responsabilidad civil, no fraude, reembolsos), llenar el formulario (modalidad, scoring, fechas, cupos, cuota, método de pago), y revisar el preview antes de publicar. El torneo se crea como BORRADOR — solo se vuelve visible al darle 'Publicar torneo' desde la página de gestión.",
        bullets: [
          "Pickleball es el único deporte por ahora; modalidades: Singles, Dobles, Mixed.",
          "Scoring presets cubren los formatos pro más usados: Side-out a 11 (clásico), Rally a 15/21, Best of 1/3/5, y Popcorn (rotación de parejas para social mixers).",
          "Si tu torneo es de un solo día, marca el checkbox; ahorra el campo de fecha de fin.",
        ],
      },
      {
        icon: "users",
        title: "Categorías y rango MPR",
        body: "Las categorías agrupan a los jugadores por nivel. En MatchPoint usamos el MPR (MatchPoint Rating), escala 2.0–8.0 propia de la plataforma. Definí cada categoría con dos puntas del slider: ej. 'A: 4.5–6.0', 'B: 3.0–4.5', 'Open' para sin restricción, o '5.5+' para sin tope superior.",
        bullets: [
          "Las categorías son opcionales; un torneo sin categorías acepta inscripciones libres.",
          "Una categoría con inscripciones NO se puede borrar; primero cancela esas inscripciones.",
        ],
      },
      {
        icon: "calendar",
        title: "Cronograma del día",
        body: "Desde la página de gestión podés crear bloques tipo 'Sábado 10:00 — Categoría B fase grupos'. Los bloques pueden tener categoría asociada y notas (cancha, referee). Se muestran en el preview público agrupados por día.",
      },
      {
        icon: "dollar-sign",
        title: "Cobro de inscripciones",
        body: "MatchPoint no procesa pagos con tarjeta. Las cuotas se cobran por transferencia bancaria o DeUna (Ecuador). Tenés tres modos:",
        bullets: [
          "Online (prepay): el jugador transfiere y sube comprobante. Auto-aprobado al subir (sin revisión).",
          "En club (onsite): el jugador llega, paga en mostrador, y vos marcas 'Pagado' desde la tabla de inscritos.",
          "Flexible: el jugador elige entre online o en club al inscribirse.",
        ],
      },
      {
        icon: "x-circle",
        title: "Cancelaciones y reembolsos",
        body: "Si cancelás el torneo, todos los inscritos reciben notificación inapp automáticamente. La devolución de cuotas la hacés vos por fuera (transferencia/DeUna), en un máximo de 7 días según las reglas que aceptaste al crear el torneo. MatchPoint NO procesa refunds.",
      },
      {
        icon: "star",
        title: "Torneo 'estelar' (banner grande)",
        body: "El badge 'Estelar' destaca tu torneo en el banner principal del listado público. Cuesta $20 USD por torneo. Solo lo activa un admin de MatchPoint después de confirmar el pago — escribinos para coordinar.",
      },
      {
        icon: "shield",
        title: "Reglas del organizador",
        body: "Aceptás 8 cláusulas al crear cada torneo: responsabilidad civil, info veraz, política de reembolsos, antitrampas, reglas oficiales de pickleball, datos personales, comisión MatchPoint, y derecho de suspensión. Léelas en cada flujo de creación.",
      },
    ],
  },
  owner: {
    intro:
      "Como dueño del club, controlás todo lo que pasa en tu sede: canchas, reservas, staff, clientes, finanzas y la presencia pública de tu club en MatchPoint.",
    sections: [
      {
        icon: "building-2",
        title: "Configurar el club",
        body: "Desde 'Configuración' subís el logo, fotos, ubicación en mapa (MapLibre), horarios y servicios. Esta es la información que ven los jugadores en /clubes/[tu-slug].",
      },
      {
        icon: "calendar",
        title: "Canchas y reservas",
        body: "Cada cancha tiene tipo (pickleball/pádel), tarifa por hora, y horarios disponibles. Las reservas entran como 'pending' y vos confirmás. Los walk-ins también se registran desde el panel de Caja.",
      },
      {
        icon: "users",
        title: "Staff: managers, coaches, empleados",
        body: "Invitás a tu equipo desde 'Staff'. Cada rol tiene permisos distintos: managers ven todo menos finanzas detalladas, coaches gestionan sus clases, empleados solo check-in y caja.",
      },
      {
        icon: "dollar-sign",
        title: "Finanzas y reportes",
        body: "Ingresos por reservas, clases, eventos del club, y comisiones a coaches. Exportable a CSV. Métricas mensuales con comparativa.",
      },
      {
        icon: "trophy",
        title: "Eventos del club (vs. torneos de partner)",
        body: "Si organizás un torneo desde el rol owner, queda asociado a tu club y aparece en el panel del club. Si un partner externo organiza un torneo EN tu club, aparece en su panel partner y NO en el tuyo (aunque usen tus canchas).",
      },
    ],
  },
  manager: {
    intro:
      "Como manager del club gestionás la operación diaria: reservas, walk-ins, eventos del club y coordinación con el staff.",
    sections: [
      {
        icon: "calendar",
        title: "Reservas del día",
        body: "El panel principal muestra las reservas confirmadas y pendientes. Podés confirmar/rechazar pending, mover horarios y registrar walk-ins.",
      },
      {
        icon: "users",
        title: "Clientes recurrentes",
        body: "Lista de jugadores que más reservan en tu club, con su historial. Útil para fidelización y para resolver disputas.",
      },
      {
        icon: "trophy",
        title: "Eventos del club",
        body: "Coordiná torneos internos, clínicas y eventos sociales. Si necesitás cobrar inscripciones por DeUna/transferencia, el flujo es el mismo que el de partner.",
      },
      {
        icon: "shield",
        title: "Lo que NO podés hacer",
        body: "Como manager no tenés acceso a finanzas detalladas, ni a editar configuración del club, ni a invitar staff. Esos son privilegios del owner.",
      },
    ],
  },
  coach: {
    intro:
      "Como coach gestionás tus clases, alumnos, calendario y cobros. MatchPoint es tu agenda profesional + canal de captación.",
    sections: [
      {
        icon: "calendar",
        title: "Programar clases",
        body: "Creá clases individuales o grupales con cupo, precio, nivel mínimo. Aparecen en /academia para que los jugadores se inscriban.",
      },
      {
        icon: "users",
        title: "Alumnos y progreso",
        body: "Cada alumno tiene su ficha con historial de clases, asistencia y notas privadas tuyas. Podés marcar su MPR actualizado.",
      },
      {
        icon: "dollar-sign",
        title: "Pagos y comisiones",
        body: "Los alumnos pagan por clase vía transferencia/DeUna (igual que el resto de pagos en MatchPoint). Vos confirmás recibido. El club puede cobrar comisión sobre tus clases si así lo acordaste con el owner.",
      },
    ],
  },
  employee: {
    intro:
      "Como empleado del club te enfocás en la operación diaria del mostrador: check-in de reservas, walk-ins, caja y tienda.",
    sections: [
      {
        icon: "check-circle-2",
        title: "Check-in",
        body: "Validás que cada reserva confirmada llegó a tiempo. Marcás presente/ausente, lo cual alimenta las métricas de no-show.",
      },
      {
        icon: "user-plus",
        title: "Walk-ins",
        body: "Registrás jugadores que llegan sin reserva. Cobra en caja y asigna cancha disponible.",
      },
      {
        icon: "dollar-sign",
        title: "Caja",
        body: "Apertura/cierre de caja con conteo de efectivo, transferencias y ventas de tienda. Los reportes diarios los ve el owner.",
      },
    ],
  },
  user: {
    intro:
      "Como jugador en MatchPoint reservás canchas, te inscribís a torneos, tomás clases con coaches y trackeás tu ranking.",
    sections: [
      {
        icon: "calendar",
        title: "Reservar cancha",
        body: "Buscá un club en /clubes, elegí cancha y horario. Algunas reservas son automáticas, otras requieren confirmación del club. Tu lista vive en 'Mis reservas'.",
      },
      {
        icon: "trophy",
        title: "Inscribirse a un torneo",
        body: "En /eventos ves los torneos publicados. Click → elegís categoría (si aplica) → elegís método de pago (online o en club) → subís comprobante si es transferencia. Las inscripciones se aprueban automáticamente al subir el comprobante.",
      },
      {
        icon: "x-circle",
        title: "Cancelar tu inscripción",
        body: "Desde el detalle del torneo en tu dashboard. La devolución de cuota la coordina el organizador del torneo, no MatchPoint.",
      },
      {
        icon: "trending-up",
        title: "Ranking ELO y MPR",
        body: "Tu rating se actualiza después de cada partido oficial reportado. Singles y dobles llevan ratings separados. Tu MPR (MatchPoint Rating, escala 2.0–8.0) se usa para inscribirte en categorías por nivel.",
      },
      {
        icon: "crown",
        title: "MATCHPOINT+",
        body: "Suscripción premium con beneficios extra (acceso a torneos privados, descuentos en clases, badge en perfil). Pago mensual por transferencia/DeUna, activación manual de admin.",
      },
    ],
  },
  admin: {
    intro:
      "Como admin global tenés override sobre toda la plataforma. Acá los atajos clave para soporte y gestión.",
    sections: [
      {
        icon: "shield",
        title: "Override de torneos",
        body: "En cada página de gestión de torneo vas a ver un panel morado 'Admin override' con acciones que ignoran las restricciones del partner: volver a borrador, forzar publicación, reactivar torneos cancelados, marcar como finalizado, etc.",
      },
      {
        icon: "users",
        title: "Aprobar comprobantes manuales",
        body: "Los pagos de planes, club featuring y eventos no-torneo pasan por revisión manual tuya. Cola en 'Pagos' del panel admin.",
      },
      {
        icon: "star",
        title: "Torneos estelar ($20)",
        body: "Los partners no pueden auto-marcarse como estelar. Después de confirmar el pago por fuera, marcas el toggle desde la página de gestión del torneo.",
      },
      {
        icon: "crown",
        title: "MATCHPOINT+ a usuarios",
        body: "Desde 'Usuarios' podés activar/extender/revocar el plan premium de cualquier user. Todas las acciones quedan en el audit log.",
      },
      {
        icon: "alert-triangle",
        title: "Audit log",
        body: "Toda mutación crítica (edición de torneos, cancelaciones, override de pagos) queda registrada en audit_log. Consultable desde 'Auditoría'.",
      },
    ],
  },
};

export function HelpScreen({ role }: { role: RoleKey }) {
  const help = ROLE_HELP[role];
  if (!help) {
    return (
      <div className="card" style={{ padding: 28 }}>
        <div className="label-mp">Ayuda</div>
        <h1 className="font-heading" style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>
          Sin guía aún para este rol
          <span style={{ color: "var(--primary)" }}>.</span>
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", marginTop: 8 }}>
          Si necesitas asistencia, escríbenos a soporte.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div className="label-mp">Ayuda · {role}</div>
        <h1
          className="font-heading"
          style={{
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            margin: "6px 0 8px",
            lineHeight: 1,
          }}
        >
          Cómo usar MatchPoint
          <span style={{ color: "var(--primary)" }}>.</span>
        </h1>
        <p
          style={{
            fontSize: 13.5,
            color: "var(--muted-fg)",
            maxWidth: 720,
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          {help.intro}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 14,
        }}
      >
        {help.sections.map((s, i) => (
          <div
            key={i}
            className="card"
            style={{
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={s.icon} size={16} />
              </div>
              <div
                className="font-heading"
                style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.01em" }}
              >
                {s.title}
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.6, margin: 0 }}>
              {s.body}
            </p>
            {s.bullets && (
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                {s.bullets.map((b, j) => (
                  <li key={j} style={{ fontSize: 11.5, color: "var(--muted-fg)", lineHeight: 1.55 }}>
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          padding: 16,
          borderRadius: 12,
          background: "rgba(16,185,129,0.08)",
          border: "1px solid rgba(16,185,129,0.3)",
          fontSize: 12.5,
          color: "#065f46",
          lineHeight: 1.55,
        }}
      >
        <Icon name="info" size={13} color="#065f46" /> ¿Falta algo? Escríbenos al
        soporte y agregamos la guía. Esta sección crece con la plataforma.
      </div>
    </div>
  );
}
