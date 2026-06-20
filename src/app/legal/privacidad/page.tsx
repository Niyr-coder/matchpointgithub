import { PublicChrome } from "@/components/landing/PublicChrome";
import { LegalDoc, LegalSection } from "@/components/landing/legal/LegalDoc";
import {
  ARCO_RESPONSE_BUSINESS_DAYS,
  ACCOUNT_DELETION_GRACE_DAYS,
  formatLegalRucPublic,
  getLegalEntity,
} from "@/lib/legal/entity";

export default function PrivacidadPage() {
  const entity = getLegalEntity();

  return (
    <PublicChrome>
      <LegalDoc eyebrow="Legal" title="Política de privacidad" updated="31 de mayo de 2026">
        <p style={{ marginTop: 0 }}>
          En {entity.tradeName} respetamos tu privacidad. Esta política describe qué datos personales
          recopilamos, con qué base legal los tratamos, con quién los compartimos y qué derechos tienes
          bajo la Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP) y su reglamento.
        </p>

        <LegalSection n={1} title="Responsable del tratamiento">
          <ul style={{ margin: 0, paddingLeft: 22, listStyle: "disc", display: "grid", gap: 6 }}>
            <li><strong>Razón social:</strong> {entity.legalName}</li>
            <li><strong>RUC:</strong> {formatLegalRucPublic()}</li>
            <li><strong>Domicilio:</strong> {entity.address}</li>
            {entity.representative ? (
              <li><strong>Representante legal:</strong> {entity.representative}</li>
            ) : null}
            <li>
              <strong>Correo de privacidad:</strong>{" "}
              <a href={`mailto:${entity.privacyEmail}`}>{entity.privacyEmail}</a>
            </li>
          </ul>
        </LegalSection>

        <LegalSection n={2} title="Datos que recopilamos">
          <ul style={{ margin: 0, paddingLeft: 22, listStyle: "disc", display: "grid", gap: 6 }}>
            <li><strong>Identidad y contacto:</strong> nombre, email, teléfono, foto de perfil, fecha de nacimiento, ciudad.</li>
            <li><strong>Deportivos:</strong> deportes, nivel, ranking, partidos, reservas, inscripciones a torneos.</li>
            <li><strong>Pago:</strong> comprobantes que tú subes (transferencia/DeUna). No almacenamos tarjetas ni actuamos como intermediario financiero.</li>
            <li><strong>Comunicaciones:</strong> mensajes in-app entre usuarios (sin cifrado de extremo a extremo).</li>
            <li><strong>Técnicos:</strong> IP, navegador, dispositivo y logs de uso para seguridad, diagnóstico y mejora del servicio.</li>
          </ul>
        </LegalSection>

        <LegalSection n={3} title="Base legal y finalidades">
          <ul style={{ margin: 0, paddingLeft: 22, listStyle: "disc", display: "grid", gap: 6 }}>
            <li><strong>Ejecución del contrato:</strong> crear tu cuenta, autenticarte, gestionar reservas, torneos y pagos declarados.</li>
            <li><strong>Consentimiento:</strong> registro, cookies esenciales y comunicaciones opcionales cuando las actives.</li>
            <li><strong>Interés legítimo:</strong> seguridad, prevención de fraude, mejora agregada del servicio y soporte.</li>
            <li><strong>Obligación legal:</strong> conservación de registros financieros, auditoría y respuesta a autoridades competentes.</li>
          </ul>
        </LegalSection>

        <LegalSection n={4} title="Con quién compartimos">
          Compartimos lo mínimo necesario para operar el servicio:
          <ul style={{ margin: "8px 0 0", paddingLeft: 22, listStyle: "disc", display: "grid", gap: 6 }}>
            <li>
              <strong>Clubes:</strong> cuando reservas o te inscribes, el staff ve tu nombre y foto. El email y teléfono no se
              muestran en el panel del club; la comunicación operativa ocurre vía notificaciones in-app salvo que tú compartas
              tu contacto por otro medio.
            </li>
            <li><strong>Partners de torneos:</strong> datos necesarios para inscribirte y gestionar el evento.</li>
            <li><strong>Encargados del tratamiento:</strong> Supabase (base de datos y autenticación), Vercel (hosting) y Resend (correo transaccional).</li>
          </ul>
          <p style={{ margin: "12px 0 0" }}>
            <strong>No vendemos tus datos.</strong> No usamos tus datos para publicidad dirigida fuera de la plataforma.
          </p>
        </LegalSection>

        <LegalSection n={5} title="Transferencias internacionales">
          Algunos encargados pueden procesar datos fuera del Ecuador (por ejemplo, infraestructura en la nube de Supabase o
          Vercel). Adoptamos medidas contractuales y técnicas razonables (cifrado en tránsito y en reposo, controles de acceso)
          para proteger tus datos en esas transferencias.
        </LegalSection>

        <LegalSection n={6} title="Almacenamiento y retención">
          Los datos se almacenan en infraestructura de Supabase con cifrado en reposo y en tránsito. Conservamos tu cuenta
          mientras esté activa. Si solicitas el cierre, programamos la eliminación en un plazo de{" "}
          {ACCOUNT_DELETION_GRACE_DAYS} días (período de gracia para cancelar). Tras ese plazo eliminamos datos personales
          salvo lo exigido por ley (registros financieros anonimizados, auditoría). Los logs de auditoría administrativa se
          conservan de forma indefinida por compliance.
        </LegalSection>

        <LegalSection n={7} title="Tus derechos (ARCO+)">
          Tienes derecho a acceder, rectificar, suprimir, oponerte al tratamiento y portar tus datos. Puedes:
          <ul style={{ margin: "8px 0 0", paddingLeft: 22, listStyle: "disc", display: "grid", gap: 6 }}>
            <li>Descargar tus datos desde <strong>Mi perfil → Privacidad</strong> o vía <code>/api/v1/me/export</code>.</li>
            <li>Rectificar tu perfil en la sección de preferencias.</li>
            <li>Solicitar cierre de cuenta desde <strong>Mi perfil → Privacidad</strong>.</li>
            <li>Escribir a <strong>{entity.privacyEmail}</strong> para cualquier solicitud adicional.</li>
          </ul>
          Te respondemos en máximo {ARCO_RESPONSE_BUSINESS_DAYS} días hábiles.
        </LegalSection>

        <LegalSection n={8} title="Cookies">
          Usamos cookies estrictamente necesarias para mantener tu sesión. No usamos cookies de terceros para tracking
          publicitario. Puedes configurar tu navegador para rechazar cookies, pero la plataforma puede dejar de funcionar
          correctamente.
        </LegalSection>

        <LegalSection n={9} title="Seguridad">
          Aplicamos buenas prácticas: cifrado TLS en tránsito, contraseñas hasheadas por nuestro proveedor de autenticación,
          controles de acceso por rol (RLS en base de datos), auditoría de accesos administrativos y revisión periódica de
          permisos del staff. Los mensajes in-app <strong>no</strong> tienen cifrado de extremo a extremo; el equipo autorizado
          puede acceder a ellos con fines de soporte, seguridad y cumplimiento legal. Ningún sistema es 100% seguro; si detectas
          algo, escríbenos a {entity.supportEmail}.
        </LegalSection>

        <LegalSection n={10} title="Violaciones de datos">
          Si ocurre un incidente de seguridad que afecte tus datos personales de forma significativa, notificaremos a la
          Superintendencia de Protección de Datos Personales y, cuando corresponda, a los titulares afectados, en los plazos
          que exija la normativa vigente.
        </LegalSection>

        <LegalSection n={11} title="Menores de edad">
          La plataforma está dirigida a personas de <strong>15 años o más</strong>. Menores de 15 años no deben crear cuenta
          sin consentimiento verificable de su representante legal. Si detectamos datos de menores recopilados sin base legal,
          los eliminaremos.
        </LegalSection>

        <LegalSection n={12} title="Cambios a esta política">
          Si actualizamos esta política te notificaremos por email con al menos 15 días de anticipación cuando los cambios
          afecten derechos sustanciales. El uso continuado tras la actualización implica aceptación.
        </LegalSection>

        <LegalSection n={13} title="Autoridad de control">
          Si no estás satisfecho con nuestra respuesta puedes presentar un reclamo ante la{" "}
          <strong>Superintendencia de Protección de Datos Personales del Ecuador</strong>.
        </LegalSection>
      </LegalDoc>
    </PublicChrome>
  );
}
