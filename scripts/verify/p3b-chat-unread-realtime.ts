import { readFileSync } from "node:fs";
import path from "node:path";

type Check = {
  file: string;
  label: string;
  patterns: Array<{ label: string; pattern: RegExp }>;
};

const root = process.cwd();

const checks: Check[] = [
  {
    file: "supabase/migrations/100_fn_unread_messages_count.sql",
    label: "RPC fn_unread_messages_count",
    patterns: [
      { label: "define la RPC", pattern: /create or replace function\s+fn_unread_messages_count\(\)/i },
      { label: "corre como security invoker", pattern: /security\s+invoker/i },
      { label: "limita a conversaciones del usuario autenticado", pattern: /cm\.user_id\s*=\s*auth\.uid\(\)/i },
      { label: "excluye mensajes propios", pattern: /m\.sender_id\s*<>\s*auth\.uid\(\)/i },
      { label: "respeta last_read_message_id por timestamp", pattern: /m\.created_at\s*>\s*lr\.last_read_at/i },
      { label: "otorga execute a authenticated", pattern: /grant execute on function fn_unread_messages_count\(\) to authenticated/i },
    ],
  },
  {
    file: "src/server/actions/messaging.ts",
    label: "sendMessage bloquea conversaciones oficiales",
    patterns: [
      { label: "valida escritura antes de insertar", pattern: /await\s+assertConversationWritable\(supabase,\s*id,\s*userId\)/ },
      { label: "consulta profiles.is_system", pattern: /\.eq\("is_system",\s*true\)/ },
      { label: "retorna código MESSAGING.READ_ONLY", pattern: /"MESSAGING\.READ_ONLY"/ },
      { label: "no inserta antes del guard", pattern: /assertConversationWritable[\s\S]*?\.from\("messages"\)\s*[\s\S]*?\.insert\(/ },
    ],
  },
  {
    file: "src/app/api/v1/conversations/[id]/messages/route.ts",
    label: "API messages expone bloqueo read-only",
    patterns: [
      { label: "usa sendMessage", pattern: /sendMessage\(\{\s*id,\s*body\s*\}\)/ },
      { label: "mapea MESSAGING.READ_ONLY a 403", pattern: /c === "AUTH\.ROLE_REQUIRED" \|\| c === "MESSAGING\.READ_ONLY" \? 403/ },
    ],
  },
  {
    file: "supabase/migrations/111_matchpoint_friend_and_readonly.sql",
    label: "RLS bloquea envíos al perfil oficial",
    patterns: [
      { label: "policy restrictiva sobre messages", pattern: /create policy messages_no_send_to_system on public\.messages\s+as restrictive\s+for insert/i },
      { label: "detecta perfiles is_system", pattern: /p\.is_system\s*=\s*true/i },
      { label: "excluye al sender del chequeo", pattern: /cm\.user_id\s*<>\s*messages\.sender_id/i },
    ],
  },
  {
    file: "supabase/migrations/20260531044148_fix_conversation_members_rls_recursion.sql",
    label: "RLS de mensajería evita recursión",
    patterns: [
      { label: "define helper de membresía", pattern: /create or replace function public\.mp_is_conversation_member/i },
      { label: "helper corre como security definer", pattern: /mp_is_conversation_member[\s\S]*security\s+definer/i },
      { label: "recrea cm_member_select", pattern: /drop policy if exists cm_member_select[\s\S]*create policy cm_member_select/i },
      { label: "cm_member_select usa helper", pattern: /cm_member_select[\s\S]*mp_is_conversation_member\(conversation_members\.conversation_id,\s*auth\.uid\(\),\s*false\)/i },
      { label: "guard oficial usa helper sin leer conversation_members directo", pattern: /messages_no_send_to_system[\s\S]*mp_conversation_has_other_system_member\(messages\.conversation_id,\s*messages\.sender_id\)/i },
    ],
  },
  {
    file: "src/app/api/v1/me/notification-preferences/route.ts",
    label: "API notification preferences",
    patterns: [
      { label: "expone GET", pattern: /export async function GET\(\)/ },
      { label: "expone PATCH", pattern: /export async function PATCH\(req: Request\)/ },
      { label: "mapea unknown kind a 400", pattern: /"NOTIFICATIONS\.UNKNOWN_KIND"/ },
      { label: "mapea rol inválido a 400", pattern: /"NOTIFICATIONS\.ROLE_NOT_ALLOWED"/ },
    ],
  },
  {
    file: "supabase/migrations/20260531042132_p2a_notification_preferences.sql",
    label: "migración notification preferences",
    patterns: [
      { label: "crea notification_preferences", pattern: /create table if not exists public\.notification_preferences/i },
      { label: "primary key por user, rol, kind y canal", pattern: /primary key \(user_id,\s*role,\s*kind,\s*channel\)/i },
      { label: "default seguro desde notification_kinds", pattern: /p_channel\s*=\s*any\(k\.default_channels\)/i },
      { label: "respeta enabled=false", pattern: /p\.enabled\s*=\s*false/i },
      { label: "dispatcher omite preferencias desactivadas", pattern: /status\s*=\s*'skipped'[\s\S]*preferencia de notificación desactivada/i },
    ],
  },
  {
    file: "supabase/migrations/20260531003558_add_messaging_realtime_publication.sql",
    label: "publication realtime de mensajería",
    patterns: [
      { label: "incluye conversations", pattern: /'conversations'/ },
      { label: "incluye conversation_members", pattern: /'conversation_members'/ },
      { label: "incluye messages", pattern: /'messages'/ },
      { label: "usa alter publication supabase_realtime", pattern: /alter publication supabase_realtime add table public/i },
    ],
  },
  {
    file: "supabase/migrations/061_notifications_realtime_publication.sql",
    label: "publication realtime de notificaciones",
    patterns: [
      { label: "incluye notifications", pattern: /tablename\s*=\s*'notifications'/i },
      { label: "usa alter publication supabase_realtime", pattern: /alter publication supabase_realtime add table public\.notifications/i },
    ],
  },
];

const failures: string[] = [];

for (const check of checks) {
  const absolute = path.join(root, check.file);
  let content = "";
  try {
    content = readFileSync(absolute, "utf8");
  } catch (error) {
    failures.push(`${check.label}: no se pudo leer ${check.file} (${String(error)})`);
    continue;
  }

  for (const assertion of check.patterns) {
    if (!assertion.pattern.test(content)) {
      failures.push(`${check.label}: falta "${assertion.label}" en ${check.file}`);
    }
  }
}

if (failures.length > 0) {
  console.error("P3-B QA estático falló:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("P3-B QA estático OK:");
for (const check of checks) console.log(`- ${check.label}`);
