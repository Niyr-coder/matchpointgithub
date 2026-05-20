import { PublicChrome } from "@/components/landing/PublicChrome";
import { LegalDoc, LegalSection } from "@/components/landing/legal/LegalDoc";

export default function TerminosPage() {
  return (
    <PublicChrome>
      <LegalDoc eyebrow="Legal" title="Términos y condiciones" updated="17 de mayo de 2026">
        <p style={{ marginTop: 0 }}>
          Bienvenido a MATCHPOINT. Al crear una cuenta o utilizar nuestros servicios aceptas estos
          términos. Léelos con atención. Estos términos rigen el uso de la plataforma matchpoint.top
          y de la app móvil MATCHPOINT operadas por MATCHPOINT Ecuador.
        </p>

        <LegalSection n={1} title="Objeto">
          MATCHPOINT es una plataforma digital que conecta jugadores con clubes deportivos, coaches y
          organizadores de torneos en Ecuador. La plataforma facilita reservas de cancha, inscripción
          a eventos, gestión de rankings y comunicación entre las partes.
        </LegalSection>

        <LegalSection n={2} title="Cuenta de usuario">
          Para usar la plataforma debes crear una cuenta con datos verídicos. Eres responsable de
          mantener la confidencialidad de tu contraseña y de toda actividad realizada bajo tu cuenta.
          Debes notificarnos inmediatamente cualquier uso no autorizado.
        </LegalSection>

        <LegalSection n={3} title="Reservas y pagos">
          Las reservas se confirman cuando el club admin aprueba el comprobante de pago. Los pagos se
          realizan por transferencia bancaria o DeUna directamente al club organizador; MATCHPOINT no
          actúa como intermediario financiero. Las cancelaciones y reembolsos se rigen por la política
          de cada club, visible en el detalle de la reserva.
        </LegalSection>

        <LegalSection n={4} title="Conducta del usuario">
          No está permitido: (a) usar la plataforma para fines ilegales; (b) suplantar identidad;
          (c) acosar a otros usuarios; (d) hacer no-show reiterado a reservas pagadas (puede resultar
          en suspensión temporal); (e) intentar acceder sin autorización a datos de otros usuarios o
          clubes.
        </LegalSection>

        <LegalSection n={5} title="Contenido del usuario">
          Conservas la propiedad de las fotos, descripciones y datos que cargas. Nos otorgas una
          licencia no exclusiva para mostrar ese contenido dentro de la plataforma en el contexto del
          servicio (perfil, eventos, rankings).
        </LegalSection>

        <LegalSection n={6} title="Propiedad intelectual">
          La marca MATCHPOINT, el logotipo, la plataforma y su código son propiedad de MATCHPOINT
          Ecuador. Está prohibido copiar, modificar o redistribuir cualquier parte del servicio sin
          autorización por escrito.
        </LegalSection>

        <LegalSection n={7} title="Limitación de responsabilidad">
          MATCHPOINT conecta a las partes pero no es responsable por la calidad del servicio prestado
          por clubes, coaches o partners, ni por lesiones, pérdidas o daños ocurridos en las
          instalaciones. La relación contractual del servicio deportivo es directa entre el usuario y
          el club/coach.
        </LegalSection>

        <LegalSection n={8} title="Suspensión y terminación">
          Podemos suspender o cancelar tu cuenta si incumples estos términos, sin perjuicio de las
          acciones legales que correspondan. Puedes cerrar tu cuenta cuando quieras desde tu perfil.
          Los datos se conservan según la política de privacidad.
        </LegalSection>

        <LegalSection n={9} title="Modificaciones">
          Estos términos pueden actualizarse. Te notificaremos por email con al menos 15 días de
          anticipación cuando los cambios afecten derechos sustanciales. El uso continuado tras una
          actualización implica aceptación.
        </LegalSection>

        <LegalSection n={10} title="Jurisdicción y contacto">
          Estos términos se rigen por las leyes de la República del Ecuador. Para dudas o reclamos:
          <br /><strong>hola@matchpoint.top</strong> · MATCHPOINT Ecuador · Quito, Ecuador.
        </LegalSection>

        <p style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 32 }}>
          Documento en versión preliminar pendiente de revisión legal final.
        </p>
      </LegalDoc>
    </PublicChrome>
  );
}
