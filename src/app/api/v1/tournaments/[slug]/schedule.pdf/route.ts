import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { renderToBuffer } from "@react-pdf/renderer";
import { TournamentSchedulePdf, type PdfTournamentData } from "@/lib/pdf/TournamentSchedulePdf";
import { createElement } from "react";

export const dynamic = "force-dynamic";

function jsonError(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // Autenticar
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "No autenticado");

  // Buscar torneo por slug
  const { data: t } = await supabase
    .from("tournaments")
    .select("id,name,slug,partner_id,starts_at,ends_at,sport,format")
    .eq("slug", slug)
    .maybeSingle();

  if (!t) return jsonError(404, "Torneo no encontrado");

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
    if (!partnerId) return jsonError(403, "Sin acceso");
    const { data: member } = await supabase
      .from("partner_members")
      .select("user_id")
      .eq("partner_id", partnerId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return jsonError(403, "Sin acceso");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getAdminClient() as any;
  const tournamentId = t.id as string;

  // Bloques de cronograma
  const { data: scheduleBlocksRaw } = await admin
    .from("tournament_schedule_blocks")
    .select("id,datetime,label,notes,tournament_categories(name)")
    .eq("tournament_id", tournamentId)
    .order("datetime", { ascending: true });

  const scheduleBlocks = ((scheduleBlocksRaw as any[]) ?? []).map((b) => ({
    id: b.id as string,
    datetime: b.datetime as string | null,
    label: b.label as string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    category_name: (b.tournament_categories as any)?.name ?? null,
    notes: b.notes as string | null,
  }));

  // Registraciones del torneo → mapa id → nombre
  const { data: regsRaw } = await admin
    .from("registrations")
    .select("id,player_ids,teams(name)")
    .eq("tournament_id", tournamentId);

  const allRegIds = ((regsRaw as any[]) ?? []).map((r: any) => r.id as string);
  const guestsByRegId = new Map<string, string[]>();
  if (allRegIds.length > 0) {
    const { data: gr } = await admin
      .from("registrations")
      .select("id,guest_names")
      .in("id", allRegIds);
    for (const g of (gr as any[]) ?? []) {
      if ((g.guest_names as string[] | null)?.length) {
        guestsByRegId.set(g.id as string, g.guest_names as string[]);
      }
    }
  }

  const playerIdSet = new Set<string>();
  for (const r of (regsRaw as any[]) ?? []) {
    for (const pid of (r.player_ids as string[] | null) ?? []) playerIdSet.add(pid as string);
  }
  const profById = new Map<string, string>();
  if (playerIdSet.size > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id,display_name")
      .in("id", Array.from(playerIdSet));
    for (const p of (profs as any[]) ?? []) {
      profById.set(p.id as string, (p.display_name as string | null) ?? "Jugador");
    }
  }

  const nameByReg = new Map<string, string>();
  for (const r of (regsRaw as any[]) ?? []) {
    const teamName = (r.teams as any)?.name as string | null;
    const playerIds = (r.player_ids as string[] | null) ?? [];
    const guests = guestsByRegId.get(r.id as string) ?? [];
    const label = teamName
      ? teamName
      : playerIds.length > 0
        ? playerIds.map((pid: string) => profById.get(pid) ?? "Jugador").join(" / ")
        : guests.length > 0
          ? guests.join(" / ")
          : "Por definir";
    nameByReg.set(r.id as string, label);
  }

  // Categorías del torneo → IDs
  const { data: catsRaw } = await admin
    .from("tournament_categories")
    .select("id")
    .eq("tournament_id", tournamentId);
  const catIds = ((catsRaw as any[]) ?? []).map((c) => c.id as string);

  // Grupos → IDs mapeados a nombre
  const groupNameById = new Map<string, string>();
  const groupIds: string[] = [];
  if (catIds.length > 0) {
    const { data: groupsRaw } = await admin
      .from("tournament_groups")
      .select("id,name")
      .in("category_id", catIds);
    for (const g of (groupsRaw as any[]) ?? []) {
      groupNameById.set(g.id as string, g.name as string);
      groupIds.push(g.id as string);
    }
  }

  // Partidos de grupos
  const groupMatches: PdfTournamentData["matches"] = [];
  if (groupIds.length > 0) {
    const { data: gmRaw } = await admin
      .from("tournament_group_matches")
      .select("id,group_id,side_a_registration_id,side_b_registration_id,status,scheduled_at")
      .in("group_id", groupIds)
      .order("scheduled_at", { ascending: true, nullsFirst: false });

    for (const m of (gmRaw as any[]) ?? []) {
      groupMatches.push({
        id: m.id as string,
        phase: "group",
        groupName: groupNameById.get(m.group_id as string) ?? "Grupo",
        labelA: nameByReg.get(m.side_a_registration_id as string) ?? "Por definir",
        labelB: nameByReg.get(m.side_b_registration_id as string) ?? "Por definir",
        scheduledAt: m.scheduled_at as string | null,
        status: m.status as string,
      });
    }
  }

  // Bracket (knockout)
  const bracketMatches: PdfTournamentData["matches"] = [];
  const { data: bracketsRaw } = await admin
    .from("brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .order("generated_at", { ascending: false })
    .limit(1);

  const bracketId = (bracketsRaw as any[])?.[0]?.id as string | undefined;
  if (bracketId) {
    const { data: bmRaw } = await admin
      .from("bracket_matches")
      .select("id,round,is_bronze,side_a_registration_id,side_b_registration_id,status,scheduled_at")
      .eq("bracket_id", bracketId)
      .order("is_bronze", { ascending: true })
      .order("round", { ascending: true });

    for (const m of (bmRaw as any[]) ?? []) {
      bracketMatches.push({
        id: m.id as string,
        phase: "bracket",
        round: m.round as number,
        groupName: (m.is_bronze as boolean) ? "3.er lugar" : undefined,
        labelA: nameByReg.get(m.side_a_registration_id as string) ?? "Por definir",
        labelB: nameByReg.get(m.side_b_registration_id as string) ?? "Por definir",
        scheduledAt: m.scheduled_at as string | null,
        status: m.status as string,
      });
    }
  }

  const generatedAt = new Date().toLocaleDateString("es-EC", {
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

  let pdfBuffer: ArrayBuffer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await renderToBuffer(createElement(TournamentSchedulePdf, { data }) as any);
    // .slice() produce un ArrayBuffer nuevo con SOLO los bytes del PDF,
    // sin el overhead del pool de memoria de Node.js
    pdfBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  } catch (err) {
    console.error("[schedule.pdf] renderToBuffer error:", err);
    return jsonError(500, "Error al generar el PDF");
  }

  return new Response(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="calendario-${slug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
