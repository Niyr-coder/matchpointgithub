import { PublicChrome } from "@/components/landing/PublicChrome";
import { LegalDoc, LegalSection } from "@/components/landing/legal/LegalDoc";
import { ACCOUNT_DELETION_GRACE_DAYS, getLegalEntity } from "@/lib/legal/entity";

export default function TerminosPage() {
  const entity = getLegalEntity();

  return (
    <PublicChrome>
      <LegalDoc eyebrow="Legal" title="Términos y condiciones" updated="31 de mayo de 2026">
        <p style={{ marginTop: 0 }}>
          Bienvenido a {entity.tradeName}. Al crear una cuenta o utilizar nuestros servicios aceptas estos términos y nuestra{" "}
          <a href="/legal/privacidad">Política de privacidad</a>, que forma parte integrante de este contrato. Léelos con
          atención. Rigen el uso de matchpoint.top y de la aplicación operada por {entity.legalName}.
        </p>

        <LegalSection n={1} title="Objeto y beta">
          {entity.tradeName} es una plataforma digital que conecta jugadores con clubes deportivos, coaches y organizadores
          de torneos en Ecuador. Facilita reservas, inscripciones, rankings y comunicación. Durante fases beta el servicio puede
          cambiar, presentar errores o interrupciones; lo ofrecemos en evolución continua sin garantía de disponibilidad
          ininterrumpida, sin perjuicio de tus derechos como consumidor y titular de datos personales.
        </LegalSection>

        <LegalSection n={2} title="Cuenta de usuario">
          Debes registrarte con datos verídicos y mayor de 15 años (o con consentimiento parental verificable si la ley lo
          exige). Eres responsable de tu contraseña y de la actividad bajo tu cuenta. Notifica usos no autorizados a{" "}
          {entity.supportEmail}.
        </LegalSection>

        <LegalSection n={3} title="Reservas y pagos">
          Las reservas se confirman cuando el club aprueba el comprobante de pago. Los pagos se realizan por transferencia o
          DeUna directamente al club u organizador; {entity.tradeName} no actúa como intermediario financiero ni custodio de
          fondos. Cancelaciones y reembolsos se rigen por la política de cada club, visible en el detalle de la reserva.
        </LegalSection>

        <LegalSection n={4} title="Conducta del usuario">
          <p style={{ margin: "0 0 8px" }}>No está permitido:</p>
          <ol type="a" style={{ margin: 0, paddingLeft: 22, listStyle: "lower-alpha", display: "grid", gap: 6 }}>
            <li>usar la plataforma para fines ilegales;</li>
            <li>suplantar identidad;</li>
            <li>acosar a otros usuarios;</li>
            <li>hacer no-show reiterado a reservas pagadas (puede resultar en suspensión);</li>
            <li>intentar acceder sin autorización a datos de otros usuarios o clubes.</li>
          </ol>
        </LegalSection>

        <LegalSection n={5} title="Contenido del usuario">
          Conservas la propiedad de las fotos, descripciones y datos que cargas. Nos otorgas una licencia no exclusiva para
          mostrar ese contenido dentro de la plataforma en el contexto del servicio (perfil, eventos, rankings).
        </LegalSection>

        <LegalSection n={6} title="Propiedad intelectual">
          La marca {entity.tradeName}, el logotipo, la plataforma y su código son propiedad de {entity.legalName}. Está
          prohibido copiar, modificar o redistribuir cualquier parte del servicio sin autorización por escrito.
        </LegalSection>

        <LegalSection n={7} title="Limitación de responsabilidad">
          {entity.tradeName} conecta a las partes pero no presta directamente el servicio deportivo. No somos responsables por
          la calidad de clubes, coaches o partners, ni por lesiones, pérdidas o daños en instalaciones. La relación contractual
          del servicio deportivo es entre el usuario y el club/coach. En la medida permitida por la ley ecuatoriana, nuestra
          responsabilidad total por reclamos relacionados con la plataforma se limita al monto que hayas pagado a{" "}
          {entity.tradeName} por servicios digitales directos en los 12 meses previos al hecho generador (excluyendo pagos a
          clubes u organizadores).
        </LegalSection>

        <LegalSection n={8} title="Indemnización">
          Te comprometes a indemnizar a {entity.legalName} por reclamos de terceros derivados de tu uso indebido de la
          plataforma, contenido que publiques o incumplimiento de estos términos, en la medida permitida por la ley.
        </LegalSection>

        <LegalSection n={9} title="Suspensión, terminación y cierre de cuenta">
          Podemos suspender o cancelar tu cuenta si incumples estos términos. Puedes cerrar tu cuenta en{" "}
          <strong>Mi perfil → Privacidad</strong>. Al solicitarlo, programamos la eliminación en {ACCOUNT_DELETION_GRACE_DAYS}{" "}
          días; puedes cancelar antes. Los datos se tratan según la política de privacidad. Si eres propietario/a de un club
          activo, debes transferir la propiedad antes del cierre.
        </LegalSection>

        <LegalSection n={10} title="Modificaciones">
          Podemos actualizar estos términos. Te notificaremos por email con al menos 15 días de anticipación cuando los
          cambios afecten derechos sustanciales. El uso continuado implica aceptación.
        </LegalSection>

        <LegalSection n={11} title="Resolución de conflictos">
          Antes de iniciar un proceso judicial, te pedimos contactarnos en {entity.legalEmail} para buscar una solución
          directa. Las partes podrán acordar mediación de buena fe. Si no hay acuerdo, cualquier controversia se someterá a los
          tribunales competentes de {entity.jurisdictionCity}, Ecuador, sin perjuicio de los derechos irrenunciables del
          consumidor bajo la Ley Orgánica de Defensa del Consumidor.
        </LegalSection>

        <LegalSection n={12} title="Disposiciones generales">
          Si alguna cláusula fuera inválida, el resto permanece vigente (divisibilidad). Estos términos constituyen el acuerdo
          completo entre tú y {entity.legalName} respecto del uso de la plataforma como usuario final.
        </LegalSection>

        <LegalSection n={13} title="Contacto">
          <ul style={{ margin: 0, paddingLeft: 22, listStyle: "disc", display: "grid", gap: 6 }}>
            <li><strong>Correo:</strong> <a href={`mailto:${entity.legalEmail}`}>{entity.legalEmail}</a></li>
            <li><strong>Empresa:</strong> {entity.legalName}</li>
            <li><strong>Ubicación:</strong> {entity.address}</li>
          </ul>
        </LegalSection>
      </LegalDoc>
    </PublicChrome>
  );
}
