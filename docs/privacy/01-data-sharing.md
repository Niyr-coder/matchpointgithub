# Quién ve qué

> Matriz de visibilidad de datos entre roles. Si tienes que decidir si un
> campo debe ser visible a otro user/rol → consultalo aquí primero.

## 1. Matriz general

`U`=user logueado · `O`=owner club · `M`=manager club · `E`=employee club ·
`C`=coach · `P`=partner organizador · `A`=admin · `Ad`=cualquier
autenticado · `Pu`=público sin auth

### Profile de un user
| Dato | Pu | Ad (autenticado) | El propio user | Owner del club que frecuenta | Admin |
|---|---|---|---|---|---|
| `id`, `display_name`, `username`, `avatar_url` | ✅ (via v_public_profiles) | ✅ | ✅ | ✅ | ✅ |
| `bio`, `city`, `country`, `skill_level` | ❌ | 🟠 ¹ | ✅ | ✅ | ✅ |
| `email`, `phone` | ❌ | ❌ | ✅ | ❌ ² | ✅ |
| `plan_tier`, `plan_expires_at` | ❌ | ❌ | ✅ | ❌ | ✅ |
| `created_at`, `onboarded_at` | ❌ | ❌ | ✅ | ❌ | ✅ |

¹ **Fuga conocida**: la policy `profiles_authn_select_limited` actual deja
a cualquier autenticado leer todos los campos del profile (bio, ciudad,
etc). Permite enumeración. Ver §6.

² Cuando el user reserva o se inscribe, el staff puede ver su nombre +
foto pero **no** email/teléfono. Si necesitan contactarlo, el flujo lo
hace via notif inapp (no via revelar el contacto).

### Reservas
| Dato | Otro user | Staff del club | Owner | Admin |
|---|---|---|---|---|
| Que existe | ❌ | ✅ | ✅ | ✅ |
| Cancha, hora | ❌ | ✅ | ✅ | ✅ |
| Organizador | ❌ | ✅ | ✅ | ✅ |
| Monto pagado | ❌ | ✅ | ✅ | ✅ |

### Inscripciones a torneo
| Dato | Público | Otro inscrito | Partner del torneo | Admin |
|---|---|---|---|---|
| Lista de inscritos (nombres) | ✅ (en detalle público) | ✅ | ✅ | ✅ |
| Status (pending/accepted) | ❌ | ✅ los suyos | ✅ todos | ✅ |
| Pago: método, status | ❌ | ❌ | ✅ | ✅ |
| Pago: monto, fecha | ❌ | ❌ | ✅ | ✅ |
| Comprobante (URL) | ❌ | ❌ | ❌ | ✅ |

### Matches y stats
| Dato | Otro user | El propio | Coach | Admin |
|---|---|---|---|---|
| Score de matches públicos | ✅ | ✅ | ✅ | ✅ |
| Ranking ELO | ✅ | ✅ | ✅ | ✅ |
| Historial completo | ✅ (público) | ✅ | ✅ | ✅ |
| Notas privadas del coach | ❌ | ❌ ³ | ✅ propias | ✅ |

³ El coach tiene un campo `notas privadas` por alumno (TODO model) que
solo él ve. Nunca el alumno.

### Mensajería (chats)
| Dato | Otros users | Participantes | Admin |
|---|---|---|---|
| Que existe una conversación | ❌ | ✅ | ✅ (read-only para soporte) |
| Contenido de mensajes | ❌ | ✅ | 🟠 técnicamente sí (sin E2E) |

⚠️ **No tenemos E2E encryption** en chats. Admin con service role puede
leer cualquier mensaje. Esto debería comunicarse al user en la política
de privacidad pública. Hoy no está explicitado en UI.

### Documentos KYC (aprobación de club)
| Dato | El aplicante | Otros users | Admin |
|---|---|---|---|
| Datos legales (tax_id, legal_name) | ✅ (los suyos) | ❌ | ✅ |
| Docs subidos (RUC, etc) | ✅ (los suyos) | ❌ | ✅ |
| Status de revisión | ✅ | ❌ | ✅ |

Una vez aprobado, lo que se mueve a `clubs` es **público** (nombre,
ciudad, fotos). Los docs legales quedan en bucket privado para auditoría
admin.

### Pagos (transactions)
| Dato | El customer | Staff club | Partner torneo | Admin |
|---|---|---|---|---|
| Sus tx | ✅ | si toca su club | si toca su torneo | ✅ |
| Tx de otros | ❌ | sus tx del club | sus tx del torneo | ✅ |
| Comprobante de pago | ✅ propio | ❌ | ❌ | ✅ |
| Rejection reason | ✅ propio (en notif) | ❌ | ❌ | ✅ |

### MATCHPOINT+ (subscripciones)
| Dato | Otros users | El propio | Admin |
|---|---|---|---|
| Que tiene premium (badge) | ✅ | ✅ | ✅ |
| Fecha de expiración | ❌ | ✅ | ✅ |
| Historial de pagos del plan | ❌ | ✅ | ✅ |
| Razón de revoke (si fue revoked) | ❌ | ❌ | ✅ |

## 2. Vistas públicas (sin auth)

`v_public_profiles` — vista filtrada con solo:
- `id`, `display_name`, `username`, `avatar_url`, `city` (sin teléfono,
  email, bio)

`tournaments_public_summary` — torneos NOT IN ('draft', 'cancelled'):
- todos los campos del torneo + count de inscritos
- excluye partners externos no aprobados

`clubs_public_summary` — clubs verificados:
- info general + count de socios + sports

Anon (sin login) solo puede leer estas vistas + las tablas con `using
(true)` (`clubs`, `courts`, `tournament_categories`, etc).

## 3. Cuando un user busca/explora

- Lista de clubes → ve `clubs.name, city, coords, cover_url, founded_year`.
  NO ve revenue, members count exacto, owner_id.
- Lista de torneos → ve datos públicos + count inscritos.
- Click en perfil de otro user → debería ir a `v_public_profiles` (TODO:
  validar que la UI use la vista y no la tabla cruda).
- Ranking → ve top N users con nombre, foto, rating. No ve email/teléfono.

## 4. Cuando un user juega con otro

- En match results, ambos players quedan loggeados (público).
- El historial es público para social/competitivo (estilo Strava).
- **Pendiente**: opt-out de aparecer en ranking público (TODO).

## 5. Cuando un user contacta a otro

Hoy:
- A través de mensajes inapp (no revelan email/teléfono).
- Friend requests via inapp.

NO hay forma de obtener email/teléfono ajeno desde la UI.

## 6. Fuga conocida: `profiles_authn_select_limited`

**Problema** (audit reciente):
```sql
create policy profiles_authn_select_limited on profiles
  for select using (auth.uid() is not null);
```

Cualquier user autenticado puede `select *` de profiles y obtener bio,
city, country, skill_level de **todos** los usuarios.

**Por qué está así**: convenience al inicio — varias pantallas hidratan
nombres de otros users (lista de inscritos, friends, etc) y era más fácil
permitir SELECT general.

**Riesgo**: enumeración masiva (scraper crea cuenta, hace query gigante,
exporta base de datos de users).

**Solución sugerida** (no implementada):
1. Restringir SELECT general a la **view** `v_public_profiles` (campos
   públicos solo).
2. Para campos privados (bio, ciudad), policy:
   `using (id = auth.uid() or exists friendship)`.
3. Server actions que hidratan nombres usan `getAdminClient()` después de
   validar contexto (ej. lista de inscritos del torneo solo si el caller
   es partner del torneo).

## 7. Datos compartidos con terceros

**Hoy**: ninguno. Cero analytics third-party, cero ads, cero CRM externo.

Si en el futuro agregamos:
- Analytics (PostHog/Mixpanel) → solo `id` + eventos agregados, sin PII.
- Email service (Resend/Postmark) → email + nombre solo para el envío.
- Payment processor → no aplica (no usamos PSP).

## 8. Regla de oro

Cuando dudes si exponer un dato:
1. ¿La feature funciona si NO lo exponés? → no lo expongas.
2. ¿El user esperaría que ese dato sea visible? → preguntale (opt-in).
3. ¿Hay alternativa privada (ej. notif inapp en lugar de revelar email)?
   → usar esa.

## 9. TODOs

- [ ] Restringir RLS de `profiles` (fuga conocida)
- [ ] Migrar UIs que hacen `select * from profiles` a `v_public_profiles`
      cuando aplique
- [ ] Opt-out de aparecer en ranking público
- [ ] Indicador "este chat NO está encriptado E2E" en mensajería
- [ ] Política de privacidad pública en `/privacy`
- [ ] Auditar lecturas de tablas sensibles (kyc_docs, transactions, etc)
