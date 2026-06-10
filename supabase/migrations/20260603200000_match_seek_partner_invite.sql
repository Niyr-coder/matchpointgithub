-- Partner en dobles: invitación + confirmación antes de mostrar el aviso en el feed.
-- Ver docs/product/03-match-seeks.md.

create type mp_match_seek_partner_status as enum ('pending', 'accepted', 'rejected');

alter table match_seeks
  add column if not exists partner_status mp_match_seek_partner_status;

-- Avisos doubles existentes → ya publicados, marcar como aceptados.
update match_seeks
   set partner_status = 'accepted'
 where mode = 'doubles'
   and partner_status is null;

alter table match_seeks
  add constraint match_seeks_partner_status_by_mode check (
    (mode = 'singles' and partner_status is null)
    or (mode = 'doubles' and partner_status is not null)
  );

alter table match_seeks
  alter column partner_status set default 'pending';

insert into notification_kinds (kind, description, allowed_roles, default_channels, category)
values (
  'match_seek_partner_invited',
  'Te invitaron como partner en un aviso "Busco partido"',
  array['user']::mp_role[],
  array['inapp']::mp_notification_channel[],
  'matches'
)
on conflict (kind) do nothing;
