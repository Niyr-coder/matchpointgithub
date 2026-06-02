# Monetización · Execution Pack

> Fuente de verdad para convertir el blueprint comercial de MATCHPOINT en entregables implementables. Esta guía no implementa pantallas ni migraciones; define qué construir primero y qué debe medirse.

## 1. Decisiones vigentes

- **MATCHPOINT+**: USD 6.99 / mes.
- **Club Starter**: USD 49.99 / mes.
- **Club Pro**: USD 149.99 / mes.
- **Sponsors nativos**: paquetes iniciales entre USD 300 y USD 1,500 / mes según inventario, ciudad, torneo y beneficio.
- **Pagos**: en beta se mantienen manuales por transferencia, DeUna o cobro en club. No asumir PSP ni cobro automático.
- **Go-to-market**: vender primero a clubes con implementación asistida; luego CRM mínimo; después sponsor nativo. No empezar por ads programáticos.

## 2. Landing comercial para clubes

### 2.1 Headline y promesa

Headline principal:

```text
Llena tus canchas y ordena tu operación con MATCHPOINT.
```

Subheadline:

```text
Reservas, eventos, comunidad, pagos manuales y reportes en una sola plataforma para clubes que quieren vender más sin vivir en hojas de cálculo y chats dispersos.
```

Promesa comercial:

- Starter digitaliza la operación esencial del club.
- Pro convierte el club en un negocio medible: membresías, campañas, reportes, eventos y sponsor local.
- La beta se vende con onboarding asistido, no como self-service frío.

### 2.2 Estructura de secciones

1. **Hero**
   - Mensaje: "Llena tus canchas y ordena tu operación con MATCHPOINT."
   - CTA principal: "Agenda una demo".
   - CTA secundario: "Quiero ser Club Fundador".

2. **Problema**
   - Reservas por chat.
   - Pagos y comprobantes manuales sin visibilidad.
   - Torneos/eventos dispersos.
   - Poca claridad sobre uso, ingresos y comunidad.

3. **Solución**
   - Perfil público del club.
   - Reservas y agenda.
   - Eventos, torneos y comunidad.
   - Pagos manuales registrados en la plataforma.
   - Reportes simples para tomar decisiones.

4. **Planes**
   - Club Starter: USD 49.99 / mes.
   - Club Pro: USD 149.99 / mes.
   - Explicar en lenguaje de resultado, no solo features.

5. **Oferta Club Fundador**
   - Cupos limitados para cerrar pilotos reales.
   - Pro a precio Starter por 90 días.
   - Setup gratis y acompañamiento quincenal.

6. **FAQs y objeciones**
   - Responder WhatsApp, pagos manuales, tiempo de implementación, permanencia y si aplica a clubes pequeños.

7. **Cierre**
   - CTA principal: "Agendar llamada".
   - CTA secundario: "Enviar datos del club".
   - Formulario debe crear lead en `sales_leads` con `source_url`.

### 2.3 Oferta Club Fundador

La oferta no debe verse como descuento permanente. Debe comprar evidencia:

- **Cupo**: primeros 10 clubes por ciudad/deporte.
- **Precio**: Club Pro a USD 49.99 / mes por 90 días; luego el club elige Starter a USD 49.99 o Pro a USD 149.99.
- **Incluye**: setup gratis, carga inicial de canchas/staff, primera campaña y revisión quincenal.
- **Compromiso del club**: usar reservas/eventos al menos 2 veces por semana, compartir feedback y permitir caso de estudio.
- **Criterio de éxito**: club con uso semanal real, no solo logo en una lista.

### 2.4 FAQs y objeciones

- **"Ya usamos WhatsApp, ¿por qué cambiar?"**
  MATCHPOINT no reemplaza todo de golpe. Ordena reservas, eventos, pagos y reportes para que WhatsApp deje de ser la base operativa.

- **"No queremos pagos automáticos todavía."**
  Correcto. En beta MATCHPOINT soporta transferencia, DeUna y cobro en club. La plataforma registra estados y comprobantes sin asumir PSP.

- **"¿Cuánto toma implementar?"**
  Un club fundador debería quedar listo en 48-72 horas si entrega canchas, horarios, staff y una oferta inicial.

- **"¿Qué pasa si mi club es pequeño?"**
  Starter cubre operación esencial. Pro se vende solo si necesita membresías, campañas, reportes y sponsor local.

- **"¿Hay permanencia?"**
  En beta, mensual. El objetivo es probar uso real antes de pedir compromisos largos.

## 3. CRM mínimo de ventas sobre `sales_leads`

### 3.1 Estado actual

`sales_leads` ya captura:

- `name`
- `email`
- `phone`
- `lead_type`
- `business_name`
- `message`
- `source_url`
- `ip`
- `user_agent`
- `occurred_at`

El endpoint público crea leads; la lectura debe mantenerse admin-only. No crear API pública de lectura.

### 3.2 Pipeline mínimo

Estados recomendados:

1. `new` · Lead nuevo desde landing o carga manual.
2. `qualified` · Contacto válido con ciudad/deporte/negocio identificados.
3. `contacted` · Primer WhatsApp, email o llamada enviada.
4. `demo_scheduled` · Demo con fecha y decisor confirmado.
5. `demo_completed` · Demo realizada con objeciones registradas.
6. `pilot` · Club fundador o sponsor en prueba.
7. `proposal_sent` · Oferta formal enviada.
8. `won` · Aceptó plan, sponsor o piloto pagado.
9. `lost` · No encaja o rechazó.
10. `nurture` · Seguimiento futuro.

### 3.3 Campos mínimos a agregar cuando se implemente

Para operar ventas:

- `status`
- `owner_user_id`
- `priority`
- `next_follow_up_at`
- `last_contacted_at`
- `lost_reason`
- `notes`

Para segmentar clubes:

- `city`
- `sport`
- `club_size`
- `monthly_events`
- `estimated_value_cents`
- `source_campaign`

Para sponsors:

- `category`
- `target_city`
- `desired_inventory`
- `budget_range`
- `campaign_goal`

### 3.4 Eventos a medir

- `lead_submitted`: landing o formulario crea lead.
- `lead_qualified`: ventas marca que el lead encaja.
- `demo_booked`: se agenda llamada.
- `demo_completed`: demo realizada.
- `pilot_started`: club o sponsor entra a prueba.
- `proposal_sent`: oferta formal enviada.
- `deal_won`: oportunidad ganada.
- `deal_lost`: oportunidad perdida.

Propiedades mínimas:

- `lead_type`
- `source_url`
- `source_campaign`
- `city`
- `sport`
- `owner_user_id`
- `plan`
- `amount_cents`
- `lost_reason`

### 3.5 Pantalla admin necesaria

Ruta sugerida: `/dashboard/admin/admin-ventas`.

Vistas mínimas:

- **Inbox**: lista de leads con filtros por tipo, ciudad, deporte, estado y fecha.
- **Detalle**: contacto, mensaje, notas, eventos, owner, próximo seguimiento y acciones rápidas.
- **Pipeline**: tabla o Kanban por estado para demos, pilotos y propuestas.
- **Métricas**: leads por fuente, tiempo a primer contacto, demos, pilotos, win rate y MRR esperado.

Reglas:

- Lectura solo para admin.
- Cambios de estado auditados.
- No enviar emails automáticos complejos en la primera versión.
- Priorizar velocidad de respuesta y trazabilidad.

## 4. Rate card de sponsors nativos

### 4.1 Principio

No vender ads programáticos en beta. Vender presencia contextual dentro de momentos deportivos reales: torneos, rankings, clubes, confirmaciones de pago y beneficios MP+.

### 4.2 Paquetes iniciales

#### Torneo local Presenting

- **Precio sugerido**: USD 500-800 / mes.
- **Inventario**: fixture, detalle de torneo, premios, notificaciones y reporte post-evento.
- **Entrega**: presencia de marca, CTA, mención en comunicaciones del torneo y reporte simple.
- **Límite**: 1 sponsor por torneo o circuito corto.

#### Circuito ciudad

- **Precio sugerido**: USD 1,000-1,500 / mes.
- **Inventario**: listado de torneos, ranking, home jugador y menciones en comunicaciones.
- **Entrega**: presencia mensual por ciudad/deporte.
- **Límite**: cupo limitado por categoría para evitar ruido.

#### Club Partner

- **Precio sugerido**: USD 500-1,000 / mes.
- **Inventario**: club destacado, beneficio para miembros y presencia en eventos del club.
- **Entrega**: sponsor ligado a un club real, ideal junto a Club Pro o Club Fundador.
- **Límite**: no vender si el club no tiene actividad semanal.

#### Beneficio MATCHPOINT+

- **Precio sugerido**: USD 300-700 / mes.
- **Inventario**: oferta exclusiva para usuarios MP+.
- **Entrega**: clic trackeado, código o URL y reporte mensual.
- **Límite**: solo si el beneficio es real y defendible.

### 4.3 Inventario existente para empezar

El backend de sponsors ya contempla slots como:

- Inicio jugador.
- Listado de torneos.
- Listado de clubes.
- Ranking.
- Confirmación de pago.

Los contratos de sponsor se registran operativamente en `sponsor_placements.contract_amount_cents`. Esto no crea `transactions` ni asume cobro automático.

### 4.4 Métricas reportadas

- **Impresiones**: vistas del placement por superficie.
- **Clics y CTR**: interés directo.
- **Activaciones**: código usado, lead o registro atribuible cuando exista beneficio.
- **Contexto deportivo**: torneo, club, categoría, ciudad y fechas donde apareció.
- **Resumen cualitativo**: fotos, aprendizajes y feedback del club/evento.

En beta, no prometer alcance masivo. La venta es contexto local y comunidad deportiva.

## 5. Checklist de implementación por prioridad

### P0 · Fuente de verdad

- Crear este documento y mantenerlo enlazado desde `docs/README.md`.
- Mantener el canvas como vista ejecutiva.
- Criterio de listo: cualquier dev sabe qué construir primero sin leer la conversación original.

### P0 · Landing clubes

- Reemplazar precios demo por:
  - Club Starter USD 49.99.
  - Club Pro USD 149.99.
  - MATCHPOINT+ USD 6.99.
- Publicar copy de Club Fundador.
- Conectar CTAs a formulario que crea `sales_leads`.
- Guardar `source_url` y, si existe, `source_campaign`.
- Criterio de listo: leads reales entrando desde la landing.

### P1 · CRM mínimo

- Implementar `/dashboard/admin/admin-ventas`.
- Listar `sales_leads`.
- Agregar estado comercial, owner, notas y follow-up.
- Registrar eventos de pipeline.
- Criterio de listo: ventas puede ver tiempo a primer contacto y mover leads sin salir del admin.

### P1 · Operación Club Fundador

- Marcar un lead/club como Club Fundador.
- Registrar precio ofrecido, fecha de inicio, fecha de revisión y compromiso del club.
- Crear checklist de onboarding asistido.
- Criterio de listo: 5-10 clubes fundadores con uso semanal medido.

### P2 · Sponsors nativos

- Publicar rate card interno.
- Definir precio base por slot.
- Activar placements con `contract_amount_cents`.
- Crear reporte mensual simple.
- Criterio de listo: sponsor compra inventario concreto y recibe reporte.

### P2 · Limpieza de pricing demo

- Revisar home, `/precios`, `/soy-club`, dashboard de plan y cualquier copy comercial.
- Evitar hardcodes duplicados si el precio debe cambiar sin redeploy; para valores operativos considerar `platform_config`.
- Criterio de listo: no queda precio falso en superficie pública.

## 6. Orden recomendado

1. Landing comercial para clubes con Club Fundador y precios reales.
2. CRM mínimo admin sobre `sales_leads`.
3. Operación Club Fundador y onboarding asistido.
4. Rate card interno de sponsors nativos.
5. Reporte mensual simple para sponsor.
6. Limpieza final de precios demo en superficies públicas y admin.

## 7. Cosas que rompen seguido

- No asumir pagos automáticos ni PSP.
- No vender ads programáticos sin volumen.
- No prometer analytics avanzados antes de tener uso real.
- No esconder precios reales detrás de copy ambiguo.
- No crear lectura pública de `sales_leads`.
- No vender sponsor sin inventario concreto, límite y reporte.
- No llamar "MatchPoint" a la marca en copy visible; usar **MATCHPOINT** y **MATCHPOINT+**.

## 8. Roadmap técnico: manual → PSP piloto → PSP robusto

### 8.1 Beta manual (estado actual)

- Cobros por transferencia, DeUna o caja del club.
- `transactions` registra estado, método, comprobante y revisión.
- MATCHPOINT+ cuesta USD 6.99/mes y se activa tras aprobación admin del
  comprobante.
- Club Starter cuesta USD 49.99/mes y Club Pro USD 149.99/mes; la venta se
  opera desde `sales_leads` y `/dashboard/admin/admin-ventas`.
- Sponsors nativos se registran con `sponsor_placements.contract_amount_cents`;
  no crean `transactions` todavía.

### 8.2 PSP piloto (no implementado)

Objetivo: validar cobro automático con pocos clubes y bajo riesgo operativo.

- Definir proveedor, país, KYC, conciliación y reversos antes de tocar código.
- Mantener `transactions` como fuente de estado financiero.
- Agregar columnas nuevas de provider solo cuando exista contrato y flujo de
  conciliación (`provider`, `provider_payment_id`, `provider_fee_cents`, etc.).
- Piloto por feature flag y cohortes, nunca para toda la base de golpe.
- El copy público debe decir "piloto de pagos" hasta que soporte, refunds y
  payouts estén operativos.

### 8.3 PSP robusto (posterior)

- Webhooks idempotentes con firma verificada.
- Ledger/audit para fees, refunds, disputes y payouts.
- Reintentos, alertas y reconciliación diaria.
- UI de soporte para investigar pagos sin entrar al dashboard del PSP.
- Documentación actualizada en `02-payments.md`, `20-database.md`,
  `30-rls.md`, `50-realtime.md` y `70-screen-to-api.md`.

### 8.4 Métricas mínimas

- `lead_submitted`: formulario comercial crea lead.
- `pricing_page_viewed` y `pricing_tier_cta_clicked`: landings y CTAs de plan.
- Estados de pipeline en `sales_leads.status`: calificado, demo, piloto,
  propuesta, ganado y perdido.
- Sponsors: impresiones, clics, CTR y monto contratado por placement.
