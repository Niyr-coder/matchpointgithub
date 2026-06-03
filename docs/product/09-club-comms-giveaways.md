# Comunicación de clubes · anuncios, chat VIP y giveaways

> Dos canales por club + sorteos en el canal de anuncios. Mig `20260605150000`.

## Canales

| Kind | Audiencia | Quién escribe |
|---|---|---|
| `club_announcements` | Seguidores + VIP + staff | Owner/manager |
| `club_channel` | VIP activos + staff | Todos los miembros |

## Auto-join (triggers DB)

- **Seguir** (`club_followers`) → entra a anuncios.
- **VIP activo** (`club_memberships`) → anuncios + comunidad.
- **Staff** del club → ambos como `admin`.
- **VIP expira/revoca** → sale de comunidad; permanece en anuncios si sigue el club.
- **Dejar de seguir** → sale de anuncios (re-sync).

Funciones: `fn_ensure_club_channels`, `fn_club_comms_sync_user`, `fn_club_comms_sync_all`.

## Giveaways

Tablas: `club_giveaways`, `club_giveaway_entries`, `club_giveaway_winners`.

- Staff crea/publica desde `/dashboard/{owner|manager}/club-anuncios`.
- Mensaje `giveaway_post` en el hilo de anuncios con card interactiva.
- Participación: botón → `enterClubGiveaway` (elegibilidad `followers|members|all`).
- Sorteo **manual** v1: `drawClubGiveawayWinners` (Fisher-Yates en servidor).

## Server actions

`src/server/actions/club-comms.ts`:

- `publishClubAnnouncement`
- `createClubGiveaway` / `enterClubGiveaway` / `drawClubGiveawayWinners`
- `getClubCommsStaffOverview` / `listClubGiveaways`

## Notificaciones

| Kind | Cuándo |
|---|---|
| `club_announcement_new` | Staff publica aviso o sorteo |
| `club_membership_chat_welcome` | VIP activado → chat comunidad |
| `giveaway_won` | Ganador tras sorteo manual |

Deep-link: `conversation_id` → `/dashboard/user/chat?conv=…`

## Cosas que rompen seguido

1. **`club_channel` no es `isSystem`** — es chat grupal normal en inbox.
2. Anuncios = read-only en Mensajes; publicar solo desde panel staff o RLS bloquea.
3. Triggers deben correr **después** de backfill de clubs existentes (incluido en mig).
4. `approveClubMembership` llama `fn_club_comms_sync_user` + notif con `conversation_id`.
