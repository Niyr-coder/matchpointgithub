// Notificaciones por rol — migrado 1:1 desde ui_kits/dashboard/roles.jsx
import type { RoleKey } from "./roles";

export type Notification = {
  id: string;
  g: string;
  title: string;
  sub: string;
  when: string;
  who?: string;
  avatar?: string;
  avBg?: string;
  icon?: string;
  read?: boolean;
  actions?: string[];
  highlight?: "win";
};

const NOTIFICATIONS: Record<RoleKey, Notification[]> = {
  user: [
    { id: "u1", g: "Hoy", who: "Andrés Vega", avatar: "AV", avBg: "linear-gradient(135deg,#ca8a04,#facc15)", title: "Te invitó a un match · dobles", sub: "Mar 12 may · 19:00 · Club Norte · Cancha 3", when: "hace 4 min", actions: ["Aceptar", "Rechazar"] },
    { id: "u2", g: "Hoy", who: "Diego Carrasco", avatar: "DC", avBg: "linear-gradient(135deg,#0a0a0a,#374151)", title: "Registró el resultado del match", sub: "Verde Lima 11-9, 11-7 · ganaste 🏆", when: "hace 22 min", highlight: "win" },
    { id: "u3", g: "Hoy", icon: "calendar-clock", avBg: "var(--primary)", title: "Tu reserva en Club Norte en 1 hora", sub: "Mar 12 may · 19:30 · Cancha 3 · 90 min", when: "hace 45 min", actions: ["Cómo llegar"] },
    { id: "u4", g: "Ayer", icon: "trophy", avBg: "#fbbf24", title: '"Open MATCHPOINT Verano" abre inscripciones', sub: "15-17 Ene · $1.200 premio · 24 parejas", when: "ayer 18:14", actions: ["Inscribirme"] },
    { id: "u5", g: "Ayer", who: "Camila Reyes", avatar: "CR", avBg: "linear-gradient(135deg,#7c3aed,#db2777)", read: true, title: "Te envió una solicitud de amistad", sub: "Nivel 3.5 · Cumbayá", when: "ayer 14:08", actions: ["Aceptar", "Ignorar"] },
    { id: "u6", g: "Ayer", icon: "package-check", avBg: "#10b981", read: true, title: "Tu pedido #SH-4821 fue enviado", sub: "Llega mié 14 – vie 16 ene", when: "ayer 11:32" },
    { id: "u7", g: "Anteriores", icon: "trending-up", avBg: "#0a0a0a", read: true, title: "Subiste a nivel 4.0", sub: "Tu rating Pickleball ahora es 4.05", when: "dom 10 may" },
    { id: "u8", g: "Anteriores", icon: "building-2", avBg: "#0ea5e9", read: true, title: "Club Norte publicó horarios del fin de semana", sub: "8 nuevos slots disponibles", when: "sáb 9 may" },
  ],
  admin: [
    { id: "a1", g: "Hoy", icon: "alert-triangle", avBg: "#dc2626", title: "Nuevo reporte de abuso · severidad alta", sub: "Mensaje ofensivo · Andrés Vega → Camila Reyes", when: "hace 8 min", actions: ["Revisar", "Descartar"] },
    { id: "a2", g: "Hoy", icon: "building-2", avBg: "#0ea5e9", title: "Solicitud de club pendiente", sub: "Smash Sport Cumbayá · documentos completos", when: "hace 22 min", actions: ["Verificar", "Rechazar"] },
    { id: "a3", g: "Hoy", icon: "wallet", avBg: "#10b981", title: "Payout semanal listo · $32,840", sub: "142 clubes · Stripe transfer pendiente aprobación", when: "hace 1 h", actions: ["Aprobar"] },
    { id: "a4", g: "Hoy", icon: "server", avBg: "#fbbf24", title: "API p99 sobre umbral · 320ms", sub: "Pico en /matches/result · auto-escalado activo", when: "hace 2 h" },
    { id: "a5", g: "Ayer", icon: "users", avBg: "#7c3aed", read: true, title: "42 nuevos usuarios registrados", sub: "Quito 18 · Guayaquil 14 · Cuenca 6 · Otros 4", when: "ayer" },
    { id: "a6", g: "Ayer", icon: "shield-alert", avBg: "#dc2626", read: true, title: "Suspensión automática · 1 cuenta", sub: 'Usuario "fake_player_99" · 5 reportes confirmados', when: "ayer 14:00" },
    { id: "a7", g: "Anteriores", icon: "bar-chart-3", avBg: "#0a0a0a", read: true, title: "Reporte mensual disponible", sub: "Abril 2026 · MAU + GMV + retención", when: "lun 5 may" },
  ],
  owner: [
    { id: "o1", g: "Hoy", icon: "wallet", avBg: "#10b981", title: "Payout semanal acreditado · $1,847", sub: "Banco Pichincha ····5421 · ref. PO-2614", when: "hace 12 min", highlight: "win" },
    { id: "o2", g: "Hoy", icon: "calendar-x", avBg: "#dc2626", title: "Cancha 2 reportada como dañada", sub: "Por Joaquín Silva (coach) · grieta en línea de fondo", when: "hace 32 min", actions: ["Asignar mant.", "Ver"] },
    { id: "o3", g: "Hoy", who: "Valeria Suárez", avatar: "VS", avBg: "linear-gradient(135deg,#0ea5e9,#0369a1)", title: "Solicita aprobar nueva tarifa weekend", sub: "$18/h sáb-dom · vigente desde el lunes", when: "hace 1 h", actions: ["Aprobar", "Modificar"] },
    { id: "o4", g: "Hoy", icon: "user-plus", avBg: "#7c3aed", title: "12 nuevos socios este mes", sub: "Llegamos a 486 socios · meta 500", when: "hoy" },
    { id: "o5", g: "Ayer", icon: "trophy", avBg: "#fbbf24", read: true, title: "Open MATCHPOINT Verano · 18/24 inscritos", sub: "Quedan 4 días para cerrar inscripciones", when: "ayer" },
    { id: "o6", g: "Ayer", icon: "star", avBg: "#fbbf24", read: true, title: 'Nueva reseña 5★ · "Mejor club de Cumbayá"', sub: 'Camila A. · "Canchas impecables y staff genial"', when: "ayer 16:22" },
    { id: "o7", g: "Anteriores", icon: "bar-chart-3", avBg: "#0a0a0a", read: true, title: "Reporte de abril listo", sub: "Revenue $14,840 · ocupación 78% · NPS 72", when: "lun 5 may" },
  ],
  manager: [
    { id: "m1", g: "Hoy", icon: "user-plus", avBg: "#dc2626", title: "3 walk-ins en cola", sub: "Sofía (20min) · Mateo +3 (12min) · Renata (4min)", when: "ahora", actions: ["Atender"] },
    { id: "m2", g: "Hoy", icon: "calendar-x", avBg: "#fbbf24", title: "Reserva cancelada de último momento", sub: "Felipe D. · C4 · 18:30 · multa de no-show $5", when: "hace 14 min", actions: ["Liberar slot"] },
    { id: "m3", g: "Hoy", who: "Sofía Andrade", avatar: "SA", avBg: "linear-gradient(135deg,#10b981,#047857)", title: "Pidió cubrir el turno mañana 07-15", sub: "Cita médica · busca reemplazo", when: "hace 45 min", actions: ["Aprobar", "Reasignar"] },
    { id: "m4", g: "Hoy", icon: "package", avBg: "#0ea5e9", title: "Stock bajo · pelotas Wilson", sub: "Quedan 6 tubos · pedir 2 docenas", when: "hace 2 h", actions: ["Hacer pedido"] },
    { id: "m5", g: "Ayer", icon: "banknote", avBg: "#10b981", read: true, title: "Cierre de caja correcto", sub: "$1,124 efectivo + tarjeta · sin diferencias", when: "ayer 23:02" },
  ],
  partner: [
    { id: "p1", g: "Hoy", icon: "trophy", avBg: "#fbbf24", title: "Final de Open Verano en 2h 14m", sub: "Carrasco · Silva vs Vega · Reyes · Club Norte C1", when: "live", highlight: "win" },
    { id: "p2", g: "Hoy", who: "Tomás Bravo", avatar: "TB", avBg: "linear-gradient(135deg,#0a0a0a,#374151)", title: "Solicita cambio de pareja", sub: "Su partner se lesionó · pide ingresar a Felipe D.", when: "hace 22 min", actions: ["Aprobar", "Rechazar"] },
    { id: "p3", g: "Hoy", icon: "users", avBg: "#7c3aed", title: "6 nuevas inscripciones · Liga IC J4", sub: "Total 54/64 · 10 cupos restantes", when: "hace 45 min" },
    { id: "p4", g: "Hoy", icon: "wallet", avBg: "#10b981", title: "Pago de inscripción confirmado", sub: "Andrés Vega + 1 · Open Verano · $56", when: "hace 1 h" },
    { id: "p5", g: "Ayer", icon: "building-2", avBg: "#0ea5e9", read: true, title: "Pickle Garden firmó alianza", sub: "Disponibles 5 canchas para tus circuitos", when: "ayer" },
  ],
  coach: [
    { id: "c1", g: "Hoy", icon: "graduation-cap", avBg: "#f59e0b", title: "Tu clase 19:00 empieza en 32 min", sub: "Fundamentos · 4/6 alumnos confirmados · C2", when: "hace 5 min", actions: ["Hacer check-in"] },
    { id: "c2", g: "Hoy", who: "Diego Carrasco", avatar: "DC", avBg: "linear-gradient(135deg,#0a0a0a,#374151)", title: "Subió de nivel · ahora 4.0", sub: "Tu alumno hace 18 sesiones · +0.3 este mes", when: "hace 1 h", highlight: "win" },
    { id: "c3", g: "Hoy", who: "Renata Salas", avatar: "RS", avBg: "linear-gradient(135deg,#f59e0b,#ef4444)", title: "Pidió clase 1 a 1 el sábado", sub: "Sáb 17 may · 10:00 · 60 min · revés", when: "hace 2 h", actions: ["Aceptar", "Proponer otra"] },
    { id: "c4", g: "Ayer", icon: "wallet", avBg: "#10b981", read: true, title: "Pago mensual recibido · $2,840", sub: "Comisión club deducida · transferencia mañana", when: "ayer" },
    { id: "c5", g: "Ayer", icon: "star", avBg: "#fbbf24", read: true, title: "Nueva reseña 5★ de Camila Reyes", sub: '"Las mejores clases técnicas de Cumbayá"', when: "ayer 17:10" },
  ],
  employee: [
    { id: "e1", g: "Hoy", icon: "user-check", avBg: "#10b981", title: "Próximo check-in en 8 min", sub: "Valentina Soto · C3 · 18:30 · 60 min", when: "ahora", actions: ["Preparar"] },
    { id: "e2", g: "Hoy", icon: "user-plus", avBg: "#dc2626", title: "Walk-in solicitando cancha · Sofía A.", sub: "Quiere Pickleball ahora · 2 personas · 60 min", when: "hace 4 min", actions: ["Asignar", "En cola"] },
    { id: "e3", g: "Hoy", who: "Valeria Suárez", avatar: "VS", avBg: "linear-gradient(135deg,#0ea5e9,#0369a1)", title: "Aprobó tu cambio de turno", sub: "Mañana descansas · Sofía cubre 07-15", when: "hace 32 min" },
    { id: "e4", g: "Hoy", icon: "shopping-bag", avBg: "#7c3aed", title: "Pro shop · venta confirmada", sub: "Camila A. · Paleta Bullpadel + grip · $198", when: "hace 1 h" },
    { id: "e5", g: "Ayer", icon: "banknote", avBg: "#10b981", read: true, title: "Cierre de caja OK · $1,124", sub: "Sin diferencias · tu turno cerró 23:02", when: "ayer" },
  ],
};

export function mpNotificationsByRole(role: RoleKey): Notification[] {
  return NOTIFICATIONS[role] || NOTIFICATIONS.user;
}
