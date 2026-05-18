# Datos que recolectamos

> Inventario honesto de qué guarda MatchPoint, dónde, y para qué. Si vas
> a agregar un campo nuevo, revisar aquí si el propósito justifica
> guardarlo (data minimization). Si no es necesario → no guardarlo.

## 1. Identidad básica (al signup)

Tabla `auth.users` (manejada por Supabase Auth) + `profiles` (propia):

| Campo | Tabla | Propósito | Visible para |
|---|---|---|---|
| `email` | `auth.users` | Login, comunicaciones críticas | El propio user + admin |
| `password` (hash) | `auth.users` | Auth | Nadie (bcrypt) |
| `id` (uuid) | `auth.users` + `profiles` | Identificador interno | Cualquier autenticado (no es PII) |
| `display_name` | `profiles` | Nombre que muestra a otros | Todos los autenticados (⚠️ ver privacy/01) |
| `username` | `profiles` | Handle único | Todos los autenticados |
| `avatar_url` | `profiles` | Foto de perfil | Todos los autenticados |
| `phone` | `profiles` | Contacto, eventualmente SMS | El propio user + admin |
| `city`, `country` | `profiles` | Búsqueda de torneos cercanos | Todos los autenticados |
| `bio` | `profiles` | Free text que el user escribe sobre sí | Todos los autenticados |
| `created_at` | varios | Cuándo se creó la cuenta | Admin |
| `onboarded_at` | `profiles` | Si completó wizard | Admin + el propio user |

## 2. Identidad deportiva

| Campo | Tabla | Propósito | Visible para |
|---|---|---|---|
| `skill_level` | `profiles` | Recomendaciones de torneos/clases | Otros users |
| `plan_tier`, `plan_expires_at` | `profiles` | Gating de features premium | Admin + el propio user |
| `player_stats.*` (ELO, mode, wins/losses) | `player_stats` | Ranking | Otros users (en ranking público) |
| `ranking_snapshots.rating` | `ranking_snapshots` | Histórico ELO para gráfico | El propio user (+ otros si la sparkline es pública) |

## 3. Actividad

| Tabla | Qué guarda | Propósito |
|---|---|---|
| `reservations` | Cancha, hora, club, organizador | Operación del club |
| `registrations` | Torneo, player_ids, status, paid_transaction_id | Inscripción a torneo |
| `matches` | Quién jugó contra quién, scores, fecha | Ranking + historial |
| `match_results` | Resultados detallados (set por set) | Stats + ranking |
| `class_sessions` + `enrollments` | Clases tomadas | Historial coaching |
| `lessons_1on1` | Lecciones privadas con coach | Historial |
| `friendships` | Amigos en la plataforma | Social |
| `friend_requests` | Solicitudes pending | Social |
| `messages`, `conversations` | Chats entre users | Mensajería |

## 4. Financiero

| Tabla | Qué guarda | Propósito |
|---|---|---|
| `transactions` | Pagos (kind, monto, estado, customer, comprobante URL) | Cobros |
| `refunds` | Devoluciones con razón + referencia | Auditoría de refunds |
| `payouts` | Pagos de MP a clubes/partners | Conciliación |
| `coach_commissions` | % por coach-club | Cálculo de pagos a coaches |

⚠️ **NO guardamos**: números de tarjeta, CVV, datos bancarios completos
(MatchPoint no usa PSP). Los comprobantes de transferencia van a Storage
bucket privado.

## 5. Documentos legales (KYC de clubs)

Cuando alguien aplica para tener un club en la plataforma:

| Tabla / bucket | Qué guarda | Visibilidad |
|---|---|---|
| `club_applications` | nombre, legal_name, tax_id, contact info | Admin only |
| `club_application_documents` | RUC, acta constitutiva, permisos | Admin only |
| `club_application_photos` | Fotos del club | Admin (durante revisión) → público al aprobar |
| Storage `kyc_docs` | Archivos físicos de los docs | Admin only, signed URLs 30min |
| Storage `club_covers` | Fotos del club | Público |

## 6. Logs y telemetría

| Tabla | Qué guarda | Propósito | Retención |
|---|---|---|---|
| `audit_log` | Mutaciones críticas + acciones admin | Compliance | Indefinida (TODO archivar) |
| `notification_jobs` | Cola de notifs pending → sent/failed | Reliability | Auto-cleanup post-sent (TODO) |
| `notifications` | Notifs entregadas, leídas/no leídas | UX | Manual delete del user |
| `audit_log` reads | Lecturas críticas | (no se loguea hoy) | — |
| Supabase Auth logs | Logins, signups, fail attempts | Seguridad | Supabase managed |
| Vercel logs | Requests HTTP, errores | Debugging | Vercel managed (30d default) |

## 7. Geolocalización

- `clubs.coords` (lat/long) — pública.
- `profiles.city`, `country` — opt-in del user en perfil.
- **NO** trackeamos geolocation en tiempo real del browser.

## 8. Cookies

| Cookie | Tipo | Almacena | Duración |
|---|---|---|---|
| `sb-*-auth-token` | Auth | JWT Supabase | refresh continuo |
| `mp_active_role` | Funcional | rol activo seleccionado | session |
| `mp_active_club_id` | Funcional | club activo en contexto | session |

Sin cookies de tracking publicitario, analytics third-party, ni similar.

## 9. Storage buckets

| Bucket | Privado/Público | Contenido |
|---|---|---|
| `avatars` | público | Fotos de perfil |
| `club_covers` | público | Hero photos de clubes |
| `payment_proofs` | privado (signed URLs) | Comprobantes de transferencia |
| `kyc_docs` | privado (signed URLs admin) | Docs legales de aprobación |

Reglas:
- Validar mime type + tamaño antes de aceptar upload.
- Privados → siempre signed URL TTL ≤ 30min.
- Públicos → URL directa OK.

## 10. Lo que NO guardamos

Para que quede explícito (y para no agregar accidentalmente):

- ❌ Números de tarjeta de crédito / CVV / fecha de vencimiento
- ❌ Datos bancarios completos (sí cuentas/refs de transferencia entrante)
- ❌ Geolocalización del browser en tiempo real
- ❌ Histórico de browsing / fingerprints publicitarios
- ❌ Datos de salud (lesiones, peso, etc — explícitamente no recolectados)
- ❌ Datos de menores de edad sin consentimiento (TODO: validar edad al signup)
- ❌ Contraseñas en texto plano (Supabase hashea automático)
- ❌ Mensajes encriptados E2E (los chats van en plano en DB — admin podría
  leerlos, ver `privacy/01`)

## 11. Reglas para devs

1. **Antes de agregar un campo**, preguntar: ¿este dato es necesario para
   la feature, o nice-to-have? Si es nice-to-have → no lo agregues.
2. **Si el dato es sensible** (salud, financiero, identidad legal),
   considerar RLS más estricta + audit de lecturas.
3. **Si el dato es PII** (nombre real, email, teléfono), revisá
   `privacy/01-data-sharing.md` antes de hacerlo público.
4. **NO crear tablas sin RLS** — el default debe ser restrictivo.
5. **Archivos sensibles** → bucket privado + signed URLs, nunca público.

## 12. TODOs

- [ ] Validación de edad al signup (≥18 o consentimiento parental)
- [ ] Página `/privacy` con resumen legible para users
- [ ] Mecanismo de export de mis datos (GDPR-style, ley Ecuador)
- [ ] Mecanismo de delete de cuenta (ver `02-retention.md`)
- [ ] Encriptación at-rest extra para `kyc_docs` y `payment_proofs`
      (hoy Supabase Storage los encripta default)
