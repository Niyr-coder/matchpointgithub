import { PublicChrome } from "@/components/landing/PublicChrome";
import { LegalDoc, LegalSection } from "@/components/landing/legal/LegalDoc";

export default function PrivacidadPage() {
  return (
    <PublicChrome>
      <LegalDoc eyebrow="Legal" title="Política de privacidad" updated="17 de mayo de 2026">
        <p style={{ marginTop: 0 }}>
          En MATCHPOINT respetamos tu privacidad. Esta política describe qué datos recopilamos, cómo
          los usamos y qué derechos tienes sobre ellos. Cumple con la Ley Orgánica de Protección de
          Datos Personales del Ecuador (LOPDP).
        </p>

        <LegalSection n={1} title="Datos que recopilamos">
          <ul style={{ margin: 0, paddingLeft: 22, listStyle: "disc", display: "grid", gap: 6 }}>
            <li><strong>Identidad:</strong> nombre, email, teléfono, foto de perfil, fecha de nacimiento.</li>
            <li><strong>Deportivos:</strong> deportes, nivel, ranking, partidos, reservas, eventos.</li>
            <li><strong>Pago:</strong> comprobantes de transferencia/DeUna que tú subes (no almacenamos tarjetas; no usamos PSP).</li>
            <li><strong>Técnicos:</strong> IP, navegador, dispositivo, logs de uso para seguridad y mejora del servicio.</li>
          </ul>
        </LegalSection>

        <LegalSection n={2} title="Cómo usamos tus datos">
          Operar la plataforma (autenticación, reservas, comunicación con clubes/coaches), mejorar
          el servicio (analítica agregada), cumplir obligaciones legales (facturación, auditoría) y
          enviarte notificaciones operativas (cambios en reservas, comprobantes aprobados, etc.).
        </LegalSection>

        <LegalSection n={3} title="Con quién compartimos">
          Compartimos lo mínimo necesario: el club al que reservas recibe tu nombre, foto y datos de
          contacto. Los partners de torneos reciben los datos requeridos para inscribirte.
          <br /><br />
          <strong>No vendemos tus datos a terceros.</strong> No usamos tus datos para publicidad
          dirigida fuera de la plataforma.
        </LegalSection>

        <LegalSection n={4} title="Almacenamiento y retención">
          Los datos se almacenan en infraestructura de Supabase (proveedor internacional con cifrado
          en reposo y en tránsito). Conservamos tu cuenta activa mientras la uses. Si la cierras,
          eliminamos los datos personales en un plazo máximo de 90 días, salvo lo que estamos
          obligados a conservar por ley (facturación, auditoría).
        </LegalSection>

        <LegalSection n={5} title="Tus derechos">
          Tienes derecho a (a) acceder a tus datos, (b) rectificarlos, (c) suprimirlos, (d) oponerte
          al tratamiento, (e) portar tus datos a otra plataforma. Para ejercerlos escribe a
          <strong> privacidad@matchpoint.top</strong>. Te respondemos en máximo 15 días hábiles.
        </LegalSection>

        <LegalSection n={6} title="Cookies y tecnologías similares">
          Usamos cookies esenciales para mantener tu sesión iniciada. No usamos cookies de terceros
          para tracking publicitario. Puedes configurar tu navegador para rechazar cookies, pero la
          plataforma puede dejar de funcionar correctamente.
        </LegalSection>

        <LegalSection n={7} title="Seguridad">
          Implementamos buenas prácticas: cifrado HTTPS extremo a extremo, almacenamiento cifrado de
          contraseñas, controles de acceso por rol (RLS a nivel de base de datos), auditoría de
          accesos administrativos. Ningún sistema es 100% seguro; si detectas algo, escríbenos.
        </LegalSection>

        <LegalSection n={8} title="Menores de edad">
          La plataforma está pensada para mayores de 13 años. Menores entre 13 y 18 deben tener
          consentimiento de un representante legal para crear cuenta. No recopilamos conscientemente
          datos de menores de 13 años.
        </LegalSection>

        <LegalSection n={9} title="Cambios a esta política">
          Si actualizamos esta política te notificaremos por email con al menos 15 días de
          anticipación. El uso continuado tras la actualización implica aceptación.
        </LegalSection>

        <LegalSection n={10} title="Contacto">
          <ul style={{ margin: 0, paddingLeft: 22, listStyle: "disc", display: "grid", gap: 6 }}>
            <li><strong>Responsable del tratamiento:</strong> MATCHPOINT Ecuador, Quito.</li>
            <li><strong>Correo de privacidad:</strong> <a href="mailto:privacidad@matchpoint.top">privacidad@matchpoint.top</a>.</li>
            <li><strong>Regulador:</strong> si no estás satisfecho con nuestra respuesta puedes presentar reclamo ante la Superintendencia de Protección de Datos Personales del Ecuador.</li>
          </ul>
        </LegalSection>

        <p style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 32 }}>
          Documento en versión preliminar pendiente de revisión legal final.
        </p>
      </LegalDoc>
    </PublicChrome>
  );
}
