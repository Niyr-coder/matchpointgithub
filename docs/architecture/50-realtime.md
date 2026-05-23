# 50 · Realtime

> Supabase Realtime (Postgres CDC + Broadcast). 3 dominios "live" desde día 1: **mensajes**, **reservas/check-in**, **brackets/scoring**. Más el canal cross **notifications** que es transversal.

---

## 1. Modos de Realtime

Supabase ofrece dos transportes — usamos ambos según el caso:

| Modo | Cuándo | Pros / Cons |
|---|---|---|
| **Postgres CDC** (`postgres_changes`) | Cambios en una fila los queremos como evento (`INSERT/UPDATE/DELETE`) | Sin código backend extra. Limitado a 200 cambios/s por canal. Sujeto a RLS. |
| **Broadcast** (`broadcast`) | Eventos sin necesariamente persistir o que requieren payload custom (typing indicators, scoring en vivo) | Más control. Hace falta server que emita. No persiste. |

Convención: **CDC para state changes, Broadcast para ephemeral**.

---

## 2. Convenciones de canales

```
mp:<domain>:<scope>:<id>:<sub>?
```

| Patrón | Ejemplo | Propósito |
|---|---|---|
| `mp:user:{userId}:role:{role}:notifications` | `mp:user:abc:role:owner:notifications` | Feed de notifs filtrado por rol activo |
| `mp:conv:{conversationId}` | `mp:conv:c-123` | Mensajes + typing |
| `mp:reservations:club:{clubId}` | `mp:reservations:club:c-789` | Cambios en reservas del club |
| `mp:checkins:club:{clubId}` | `mp:checkins:club:c-789` | Cola de check-in |
| `mp:bracket:{bracketId}` | `mp:bracket:br-456` | Avance de cuadro + scoring |
| `mp:tournament:{id}:presence` | – | Presencia en sala de transmisión |

Cada canal documenta debajo: **modo**, **eventos**, **payload**, **quién suscribe**, **RLS check**.

---

## 3. Canal · `mp:user:{userId}:role:{role}:notifications`

**Modo:** CDC sobre `notifications`
**Eventos:** `INSERT`, `UPDATE` (cuando se marca read)
**Payload (INSERT):**

```ts
type NotificationInsertPayload = {
  type: 'INSERT';
  schema: 'public';
  table: 'notifications';
  new: {
    id: string;
    recipient_user_id: string;
    recipient_role: MpRole;
    kind: string;
    title: string;
    body: string | null;
    payload: Record<string, unknown>;
    read_at: null;
    created_at: string;
  };
};
```

**Quién suscribe:** todo cliente autenticado, **un canal por rol activo**. Cuando el user switchea rol con el RoleSwitcher, el hook desuscribe el canal previo y suscribe el nuevo.

**RLS:** la policy `notif_self_active_role` ya filtra por `recipient_user_id = auth.uid() AND recipient_role = auth.active_role()` — Supabase aplica la misma RLS al stream, así que el cliente solo recibe lo que puede leer.

**Hook (cliente):**

```ts
// src/lib/realtime/hooks/useNotificationsChannel.ts
"use client";
export function useNotificationsChannel({ userId, role, onInsert, onRead }: {
  userId: string; role: MpRole;
  onInsert: (n: Notification) => void;
  onRead?: (n: Notification) => void;
}) {
  useEffect(() => {
    const channel = supabase
      .channel(`mp:user:${userId}:role:${role}:notifications`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications',
          filter: `recipient_user_id=eq.${userId}` },
        ({ new: n }) => { if (n.recipient_role === role) onInsert(n as Notification); })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications',
          filter: `recipient_user_id=eq.${userId}` },
        ({ new: n }) => { if (n.read_at && n.recipient_role === role) onRead?.(n as Notification); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, role]);
}
```

**Dónde se monta:** `TopBar` (badge campana) lo monta una sola vez al cargar layout del dashboard. La pantalla del notification center la usa también.

---

## 4. Canal · `mp:conv:{conversationId}`

**Modo:** mixto
- CDC sobre `messages` para nuevos mensajes (persistente)
- Broadcast para `typing`, `read_receipt`, `member_online`

**Eventos:**

| Evento | Modo | Payload |
|---|---|---|
| `message:new` | CDC INSERT en `messages` | row de message |
| `message:edited` | CDC UPDATE | row con `edited_at` |
| `message:deleted` | CDC UPDATE | row con `deleted_at` |
| `typing:start` / `typing:stop` | Broadcast | `{userId, conversationId}` |
| `read:ack` | Broadcast | `{userId, lastMessageId}` |
| `presence:join` / `presence:leave` | Presence | `{userId, ts}` |

**Quién suscribe:** miembros del `conversation`. El hook valida membership vía RLS antes de mostrar.

**Server-side:** la Server Action `sendMessage` no necesita emitir nada (CDC se ocupa). Solo `typing` se broadcastea desde cliente.

**Hook:**

```ts
export function useConversationChannel(convId: string, handlers: ConvHandlers) {
  useEffect(() => {
    const ch = supabase.channel(`mp:conv:${convId}`, { config: { presence: { key: userId } } });
    ch.on('postgres_changes',
       { event: 'INSERT', schema: 'public', table: 'messages',
         filter: `conversation_id=eq.${convId}` },
       p => handlers.onMessage(p.new as Message))
      .on('broadcast', { event: 'typing' }, ({ payload }) => handlers.onTyping?.(payload))
      .on('broadcast', { event: 'read' }, ({ payload }) => handlers.onRead?.(payload))
      .on('presence', { event: 'sync' }, () => handlers.onPresence?.(ch.presenceState()))
      .subscribe(status => {
        if (status === 'SUBSCRIBED') ch.track({ userId, ts: Date.now() });
      });
    return () => { supabase.removeChannel(ch); };
  }, [convId]);
}
```

**Rate-limit typing:** debounce 500ms en cliente.

---

## 5. Canal · `mp:reservations:club:{clubId}`

**Modo:** CDC sobre `reservations`
**Eventos:** `INSERT`, `UPDATE` (status change), `DELETE`

**Payload típico** (UPDATE cancellation):
```ts
{ type: 'UPDATE', new: { id, status: 'cancelled', cancelled_at, ... }, old: { ..., status: 'booked' } }
```

**Quién suscribe:**
- Pantalla `/owner/club-reservas`, `/manager/club-reservas` — vista calendario en tiempo real
- Pantalla `/employee/e-reservas`
- Cliente público de reserva pública (visibility='public') se suscribe solo a su propia row (filtro por id)

**RLS:** las policies de `reservations` filtran ya en el stream. Staff ve todo del club, organizador ve la propia.

**Acoplamiento con check-in:** un check-in dispara `UPDATE reservations SET status='checked_in'`, lo que se propaga vía este canal y actualiza la UI del calendario sin extra round-trip.

---

## 6. Canal · `mp:checkins:club:{clubId}`

**Modo:** CDC sobre `check_ins`
**Eventos:** `INSERT` (nuevo scan)

**Payload:**
```ts
{ type: 'INSERT', new: { id, reservation_id, user_id, method, scanned_at, ... } }
```

**Quién suscribe:**
- `/employee/e-checkin` — para que las recepcionistas vean en vivo cuando un colega escanea
- `/employee` (RHPanel "Próximos check-ins") — refresca tachando los ya atendidos

**Bonus broadcast** `walkin:queued` para cuando un employee crea un walkin (más rápido que esperar al CDC).

---

## 7. Canal · `mp:bracket:{bracketId}`

**Modo:** mixto
- CDC sobre `bracket_matches` para schedule + score updates
- Broadcast para `live_score:tick` (set/game/punto en vivo durante un match en cancha)

**Eventos:**

| Evento | Modo | Payload | Quién emite |
|---|---|---|---|
| `match:scheduled` | CDC UPDATE | row de bracket_match con `scheduled_at` | partner via Server Action |
| `match:score_update` | CDC UPDATE | row con `score`, `winner_side` | partner / jugador via REST PATCH |
| `match:advance` | CDC INSERT/UPDATE en match siguiente | match siguiente con side_X_registration_id resuelto | trigger Postgres `tg_advance_bracket` |
| `live_score:tick` | Broadcast | `{matchId, set, game, point, server}` | client-side scoreboard tool (partner/umpire) |

**Quién suscribe:**
- `/partner/p-brackets` — vista del partner organizador
- `/user/eventos` cuando el user está mirando un torneo específico
- Spectator deep-links (`/tournament/:slug/bracket/:id`)

**Presence:** `mp:tournament:{id}:presence` lista quién está mirando (analytics).

---

## 8. Canal · `mp:club:{clubId}:dashboard` (opcional)

**Modo:** Broadcast
Pulse de eventos heterogéneos del club para Owner/Manager Home (KPIs en vivo):
- `tx:created` → actualiza KPI de caja
- `walkin:created` → bump al contador
- `incident:reported` → toast

**Emitter:** cada Server Action relevante hace `supabase.channel(...).send({type:'broadcast', event:'tx:created', payload:{...}})` después del commit.

### 8.1 Consistencia cross-domain (gaps detectados)

Cada pantalla debe suscribirse a TODAS las tablas que afectan su data — incluyendo tablas que escribe **otra pantalla**. Si la pantalla A muestra un conteo derivado de la tabla `X` que es insertada en la pantalla B, A debe suscribirse a `X` (o re-fetchear apropiadamente).

Gaps corregidos en audit:
- `ManagerHomeView` ahora suscribe a `walkins` (filtrado por club). Antes solo escuchaba `reservations`, `transactions`, `events` — el contador de cola no refrescaba al crear un walk-in.
- `UserHomeView` ahora suscribe a `registrations`. Antes el `registrationsCount` de torneos featured quedaba stale al inscribirse el propio usuario.

**Regla práctica:** cuando agregues una mutación que escribe tabla X, hacé `grep "table.*X" src/components/dashboard/**/*Screen*.tsx` y verificá cada pantalla que la lee — agregale la suscripción si falta.

---

## 9. Matriz rol × canal

| Canal | admin | partner | owner | manager | coach | employee | user |
|---|---|---|---|---|---|---|---|
| `notifications:role:admin` | ✓ | – | – | – | – | – | – |
| `notifications:role:owner` | – | – | ✓ | – | – | – | – |
| `notifications:role:user` | – | – | – | – | – | – | ✓ |
| `conv:*` | mod | ✓ if member | ✓ if member | ✓ if member | ✓ if member | – (limitado) | ✓ if member |
| `reservations:club:X` | ✓ | – | ✓ own | ✓ own | – | ✓ own | self rows only |
| `checkins:club:X` | – | – | ✓ own | ✓ own | – | ✓ own | – |
| `bracket:X` | ✓ | ✓ own | – | – | – | – | spectator |
| `club:X:dashboard` | – | – | ✓ own | ✓ own | – | – | – |

---

## 10. Autorización en canales

Supabase Realtime aplica RLS automáticamente para CDC (server checa la policy antes de enviar el cambio). Para **Broadcast**, agregamos un wrapper en el cliente:

```ts
// src/lib/realtime/channels.ts
export async function joinAuthorizedChannel(name: string, opts?: ChannelOpts) {
  const session = await getSession();
  if (!session) throw new Error('AUTH.UNAUTHENTICATED');
  if (!canSubscribe(session, name)) throw new Error('AUTH.SCOPE_REQUIRED');
  return supabase.channel(name, opts);
}

function canSubscribe(s: Session, channelName: string): boolean {
  // parsea pattern y valida contra activeRole + role_assignments
  const parsed = parseChannelName(channelName);
  if (parsed.kind === 'reservations' && parsed.clubId) {
    return s.allRoles.some(r => r.club_id === parsed.clubId &&
      ['owner','manager','employee','admin'].includes(r.role));
  }
  ...
}
```

Esto evita que un cliente malicioso intente suscribirse a un canal de otro club (no recibiría payloads pero gastaría conexiones).

---

## 11. Patrón de hook tipado

Cada canal expone un hook React que devuelve el último estado + handlers:

```ts
// src/lib/realtime/hooks/useReservationsChannel.ts
export function useReservationsChannel(clubId: string) {
  const [reservations, setReservations] = useState<Map<string, Reservation>>(new Map());
  useEffect(() => {
    let ch: RealtimeChannel;
    (async () => {
      ch = await joinAuthorizedChannel(`mp:reservations:club:${clubId}`);
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table: 'reservations',
          filter: `club_id=eq.${clubId}` },
        ({ eventType, new: n, old }) => {
          setReservations(prev => {
            const next = new Map(prev);
            if (eventType === 'DELETE') next.delete(old.id);
            else next.set(n.id, n as Reservation);
            return next;
          });
        }
      ).subscribe();
    })();
    return () => { if (ch) supabase.removeChannel(ch); };
  }, [clubId]);
  return Array.from(reservations.values());
}
```

Patrón uniforme: **lookup Map** indexado por id, mutado por evento, `Array.from()` al final. Re-render eficiente con keys estables.

---

## 12. Reconnect & backfill

Cuando hay reconnect, Supabase reenvía cambios pero **no garantiza** los que ocurrieron mientras estuvimos offline. Estrategia:

1. Al re-suscribir, hacemos un `GET /api/v1/<recurso>?updatedAfter=<lastSeen>` para rehidratar gaps.
2. `lastSeen` se guarda en `sessionStorage` por canal.
3. UI muestra banner discreto "Reconectando…" si el `subscribe` status no es `SUBSCRIBED` por más de 3s.

---

## 13. Límites operacionales

| Métrica | Default Supabase | Plan |
|---|---|---|
| Conexiones simultáneas por proyecto | 500 (Free) → escalable | Pro plan desde lanzamiento |
| Mensajes / segundo | 100/s broadcast | Suficiente para chat normal |
| Cambios CDC / segundo | 200/s por canal | Aplica a `reservations` durante torneos grandes — si vamos a más, splitamos por categoría |

**Mitigación de hotspots:**
- Bracket grande (>200 matches) → canal por categoría (`mp:bracket:{id}:cat:{catId}`).
- Mensajería de un club masivo (>1k members) → splitear por sub-canal.

---

## 14. Testing

- Cliente test usa `@supabase/supabase-js` con WebSocket mockeado (`ws-mock`) en Vitest.
- Test E2E con Playwright suscribe 2 navegadores al mismo `mp:conv:X` y valida que el mensaje aparece en el segundo.
- pgTAP valida policies — la misma RLS que rige REST rige Realtime.

---

## 15. `supabase_realtime` publication — tablas inscritas

El hook genérico `useRealtimeRefresh([{ table, filter }])` se suscribe vía
`postgres_changes` y dispara `router.refresh()` al recibir eventos. Para que
funcione, la tabla debe estar en el publication `supabase_realtime`.

**Inventario actual** (migs 061, 078):

| Tabla | Usada por | Mig |
|---|---|---|
| `notifications` | TopBar bell, todas las pantallas con badge | 050 |
| `reservations` | ClubReservas, UserHome (mis reservas) | 022 |
| `ranking_snapshots` | UserHome rating widget, Ranking | 028 |
| `player_stats` | UserHome rating widget | 028 |
| `tournaments` | UserHome mis-torneos, panel partner, listings | 061 |
| `registrations` | PartnerInscritos, gestión torneo, UserHome | 061 |
| `club_followers` | ClubSocial | 062 |
| `tournament_categories` | Panel gestión torneo (edits concurrentes) | 078 |
| `tournament_schedule_blocks` | Panel gestión torneo | 078 |
| `tournament_prizes` | Panel gestión torneo | 078 |
| `match_seeks` | BuscoPartido feed + mis avisos | 117 |
| `match_seek_applications` | BuscoPartido (postulantes en vivo) | 117 |
| `matches` | chat del partido + Mis avisos (cancel/reschedule en vivo) | 121 |
| `quedadas` | cupos/estado en vivo (panel + detalle jugador) | 131 |
| `quedada_participants` | cupos/pagos en vivo | 131 |
| `quedada_categories` | panel gestión (edits concurrentes) | 133 |
| `quedada_pairs` | panel gestión (parejas/slots en vivo) | 133 |
| `quedada_rounds` | motor de juego — rondas en vivo (panel + detalle jugador) | 141 |
| `quedada_games` | motor de juego — scoreboard/tabla en vivo | 141 |

**Para sumar una tabla nueva**:

```sql
alter publication supabase_realtime add table public.<tabla>;
```

Y luego del lado cliente:

```tsx
useRealtimeRefresh([
  { table: "tu_tabla", filter: `tournament_id=eq.${id}` },
]);
```

**Filtros válidos**: solo igualdad simple (`columna=eq.valor`). Sin `in`, sin
joins. Para queries más complejas, suscribirse a la tabla cruda y filtrar
client-side.

### Modo callback (granular)

Por default el hook hace `router.refresh()` debounced, lo cual re-corre TODAS
las server queries de la pantalla. Si solo necesitas refetchear una sección
puntual (una lista, un counter, un chart), pasá `onChange` y evitás el
refresh global:

```tsx
useRealtimeRefresh(
  [{ table: "transactions", filter: "kind=eq.tournament" }],
  {
    onChange: (table, payload) => {
      // payload.eventType: "INSERT" | "UPDATE" | "DELETE"
      // payload.new, payload.old: rows raw de Supabase
      startTransition(async () => {
        const r = await refetchMyTxs();
        if (r.ok) setTxs(r.data);
      });
    },
  },
);
```

Cuándo usar callback:
- La pantalla tiene muchas server queries pesadas y solo una se ve afectada.
- Querés UX optimista (actualizar contadores sin re-render completo).
- Necesitás reaccionar al payload (ej. mostrar toast "nuevo torneo").

Cuándo dejar default (`router.refresh()`):
- La pantalla es chica, refrescar todo no duele.
- El estado a actualizar viene de varias queries entrelazadas.

---

## 16. Próximo: `60-openapi.md`

Cierra Fase 1 documentando cómo se autogenera la spec desde Zod y cómo se sirve la UI de Scalar en `/docs`.
