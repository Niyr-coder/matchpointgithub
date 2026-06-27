import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { renderToBuffer } from "@react-pdf/renderer";
import { TournamentSchedulePdf, type PdfTournamentData } from "@/lib/pdf/TournamentSchedulePdf";
import { createElement } from "react";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Autenticar
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "No autenticado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Buscar torneo por slug
  const { data: t } = await supabase
    .from("tournaments")
    .select("id,name,slug,partner_id,starts_at,ends_at,sport,format,status")
    .eq("slug", slug)
    .maybeSingle();

  if (!t) {
    return new Response(JSON.stringify({ error: "Torneo no encontrado" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verificar autorización: admin o partner member
  const { data: adminRow } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  const isAdmin = !!adminRow;

  if (!isAdmin) {
    const partnerId = (t.partner_id as string | null) ?? null;
    if (!partnerId) {
      return new Response(JSON.stringify({ error: "Sin acceso" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const { data: member } = await supabase
      .from("partner_members")
      .select("user_id")
      .eq("partner_id", partnerId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) {
      return new Response(JSON.stringify({ error: "Sin acceso" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Leer datos del torneo via admin (RLS puede bloquear sub-tablas)
  const admin = getAdminClient();
  const tournamentId = t.id as string;

  // Bloques de cronograma
  const { data: scheduleBlocksRaw } = await (admin as any)
    .from("tournament_schedule_blocks")
    .select("id,datetime,label,notes,tournament_categories(name)")
    .eq("tournament_id", tournamentId)
    .order("datetime", { ascending: true });

  const scheduleBlocks = (scheduleBlocksRaw ?? []).map((b: any) => ({
    id: b.id as string,
    datetime: b.datetime as string | null,
    label: b.label as string,
    category_name: (b.tournament_categories as any)?.name ?? null,
    notes: b.notes as string | null,
  }));

  // Partidos de grupos
  const { data: groupMatchesRaw } = await (admin as any)
    .from("tournament_group_matches")
    .select(
      "id,side_a_registration_id,side_b_registration_id,status,scheduled_at,tournament_groups(name,tournament_categories(name)),tournament_registrations!tournament_group_matches_side_a_registration_id_fkey(teams(name),profiles(display_name)),trb:tournament_registrations!tournament_group_matches_side_b_registration_id_fkey(teams(name),profiles(display_name))"
    )
    .eq("tournament_id", tournamentId)
    .order("scheduled_at", { ascending: true, nullsFirst: false });

  // Bracket matches
  const { data: bracketsRaw } = await (admin as any)
    .from("brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .order("generated_at", { ascending: false })
    .limit(1);

  const bracketId = bracketsRaw?.[0]?.id as string | undefined;
  let bracketMatchesRaw: any[] = [];

  if (bracketId) {
    const { data: bm } = await (admin as any)
      .from("bracket_matches")
      .select(
        "id,round,position,side_a_registration_id,side_b_registration_id,status,scheduled_at,tournament_registrations!bracket_matches_side_a_registration_id_fkey(teams(name),profiles(display_name)),trb:tournament_registrations!bracket_matches_side_b_registration_id_fkey(teams(name),profiles(display_name))"
      )
      .eq("bracket_id", bracketId)
      .order("round", { ascending: true });
    bracketMatchesRaw = bm ?? [];
  }

  function getLabel(reg: any): string {
    if (!reg) return "Por definir";
    const team = reg?.teams?.name;
    const profile = reg?.profiles?.display_name;
    return (team ?? profile ?? "Por definir") as string;
  }

  const groupMatches = (groupMatchesRaw ?? []).map((m: any) => ({
    id: m.id as string,
    phase: "group" as const,
    groupName: (m.tournament_groups as any)?.name ?? "Grupo",
    labelA: getLabel(m.tournament_registrations),
    labelB: getLabel(m.trb),
    scheduledAt: m.scheduled_at as string | null,
    status: m.status as string,
  }));

  const bracketMatches = bracketMatchesRaw.map((m: any) => ({
    id: m.id as string,
    phase: "bracket" as const,
    round: m.round as number,
    labelA: getLabel(m.tournament_registrations),
    labelB: getLabel(m.trb),
    scheduledAt: m.scheduled_at as string | null,
    status: m.status as string,
  }));

  const now = new Date();
  const generatedAt = now.toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const data: PdfTournamentData = {
    name: (t.name as string) ?? slug,
    slug,
    startsAt: t.starts_at as string | null,
    endsAt: t.ends_at as string | null,
    sport: (t.sport as string) ?? "—",
    format: (t.format as string) ?? "—",
    scheduleBlocks,
    matches: [...groupMatches, ...bracketMatches],
    generatedAt,
  };

  let buffer: Uint8Array;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await renderToBuffer(
      createElement(TournamentSchedulePdf, { data }) as any
    );
    buffer = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  } catch (err) {
    console.error("[schedule.pdf] renderToBuffer error:", err);
    return new Response(JSON.stringify({ error: "Error generando PDF" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const filename = `calendario-${slug}.pdf`;
  return new Response(buffer.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
