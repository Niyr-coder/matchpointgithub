# QA · Chat, unread y realtime

Este checklist cubre el cierre P3-B para mensajería, unread, canal oficial
MATCHPOINT y preferencias de notificación.

## Verificación automatizada

1. Ejecuta la verificación estática no destructiva:

```bash
npx tsx scripts/verify/p3b-chat-unread-realtime.ts
```

Valida que:
- `fn_unread_messages_count()` corre como `security invoker`, usa
  `auth.uid()`, excluye mensajes propios y respeta `last_read_message_id`.
- `sendMessage()` bloquea DMs con perfil `is_system=true` antes de insertar.
- La API de mensajes traduce `MESSAGING.READ_ONLY` a HTTP 403.
- La API de preferencias expone `GET`/`PATCH` y valida kind/rol.
- Las migraciones agregan `messages`, `conversations`,
  `conversation_members` y `notifications` a `supabase_realtime`.
- La migración `20260531044148_fix_conversation_members_rls_recursion`
  reemplaza los checks recursivos de `conversation_members` por helpers
  `SECURITY DEFINER`.

2. Si tienes Supabase de prueba con migraciones aplicadas y credenciales E2E,
   ejecuta la spec enfocada:

```bash
npm run test:e2e -- tests/e2e/p3b-chat-unread-realtime.spec.ts
```

La spec crea usuarios temporales `@matchpoint.demo`, conversaciones y
preferencias, y limpia los datos al finalizar.

## Checklist manual seguro

- [ ] Entra como usuario con un DM oficial MATCHPOINT existente.
- [ ] Confirma que el DM oficial aparece fijado arriba y con badge verificado.
- [ ] Confirma que no se muestra el composer, solo el texto de solo lectura.
- [ ] En otra conversación normal, envía un mensaje y verifica que aparece al
  refrescar por realtime.
- [ ] Desde otro usuario, envía dos mensajes; abre `/dashboard/user/chat` y
  verifica que el badge unread cuenta solo mensajes ajenos.
- [ ] Marca la conversación como leída al abrirla y verifica que el badge baja.
- [ ] Cambia una preferencia en `/dashboard/user/notificaciones` o por API y
  confirma que el override se refleja en `notification_preferences`.

## Bloqueadores esperados

- Si no hay sesión o credenciales E2E, no fuerces login ni uses credenciales
  personales. Usa la verificación estática y deja pendiente el recorrido UI.
- Si el proyecto Supabase no tiene las migraciones P0/P1/P2/P3 aplicadas, la
  spec E2E puede fallar por columnas, policies o RPC inexistentes.

## Resultado P3-B observado

En el entorno QA del 2026-05-30, la spec E2E detectó un blocker de RLS:
`fn_unread_messages_count()` y el guard de `sendMessage()` fallan con
`42P17 infinite recursion detected in policy for relation "conversation_members"`.
La migración `20260531044148_fix_conversation_members_rls_recursion` corrige
ese blocker moviendo la membresía de conversaciones a helpers
`SECURITY DEFINER`; con eso la API del DM oficial puede llegar al bloqueo
esperado `MESSAGING.READ_ONLY` (403).
