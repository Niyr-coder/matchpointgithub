import type { RoleKey } from "@/lib/roles";
import { listMyPreferences, listNotificationKinds } from "@/server/actions/notifications";
import {
  NotificationPreferencesView,
  type NotificationKindVM,
  type NotificationPreferenceVM,
} from "./NotificationPreferencesView";

export async function NotificationPreferencesScreen({ role }: { role: RoleKey }) {
  const [kindsRes, preferencesRes] = await Promise.all([
    listNotificationKinds(),
    listMyPreferences(),
  ]);

  const initialError = !kindsRes.ok
    ? kindsRes.error.message
    : !preferencesRes.ok
      ? preferencesRes.error.message
      : null;

  const kinds: NotificationKindVM[] = kindsRes.ok
    ? kindsRes.data.map((kind) => ({
        kind: kind.kind,
        description: kind.description,
        allowedRoles: kind.allowedRoles,
        defaultChannels: kind.defaultChannels,
        category: kind.category,
      }))
    : [];

  const preferences: NotificationPreferenceVM[] = preferencesRes.ok
    ? preferencesRes.data.map((preference) => ({
        role: preference.role,
        kind: preference.kind,
        channel: preference.channel,
        enabled: preference.enabled,
      }))
    : [];

  return (
    <NotificationPreferencesView
      role={role}
      kinds={kinds}
      preferences={preferences}
      initialError={initialError}
    />
  );
}
