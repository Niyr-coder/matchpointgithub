// Server: configuración del club desde clubs + club_settings + court_pricing.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { ClubConfigScreenView, type ConfigData, type Section } from "./ClubConfigScreenView";

const DAYS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function fmtRange(o: { open?: string; close?: string } | undefined): string {
  if (!o?.open || !o?.close) return "—";
  return `${o.open} – ${o.close}`;
}

async function loadData(): Promise<ConfigData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) return { clubId: null, sections: null, logoUrl: null, coverUrl: null };

  const supabase = await getServerClient();
  const [{ data: club }, { data: settings }, { data: courts }] = await Promise.all([
    supabase
      .from("clubs")
      .select("name,address,phone,email,slug,city,country,logo_url,cover_url")
      .eq("id", clubId)
      .maybeSingle(),
    supabase
      .from("club_settings")
      .select("open_hours,cancellation_window_hours,charge_no_show_pct")
      .eq("club_id", clubId)
      .maybeSingle(),
    supabase
      .from("courts")
      .select("id,surface")
      .eq("club_id", clubId)
      .eq("active", true),
  ]);

  // Horarios: open_hours esperado como { monday: {open,close}, ... }
  const oh = (settings?.open_hours as Record<string, { open?: string; close?: string }>) ?? {};
  const weekdayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const weekdayRanges = weekdayKeys.map((k) => fmtRange(oh[k]));
  const allSameWeekday =
    weekdayRanges.every((r) => r === weekdayRanges[0]) && weekdayRanges[0] !== "—";

  const horariosItems: [string, string][] = [];
  if (allSameWeekday) {
    horariosItems.push(["Lunes a Viernes", weekdayRanges[0]]);
  } else {
    for (let i = 0; i < weekdayKeys.length; i++) {
      horariosItems.push([DAYS_ES[i + 1], weekdayRanges[i]]);
    }
  }
  horariosItems.push(["Sábado", fmtRange(oh.saturday)]);
  horariosItems.push(["Domingo", fmtRange(oh.sunday)]);

  // Tarifas: precio mínimo por superficie a partir de court_pricing.
  const courtIds = (courts ?? []).map((c) => c.id as string);
  const surfaceByCourt = new Map<string, string | null>();
  for (const c of courts ?? []) surfaceByCourt.set(c.id as string, (c.surface as string | null) ?? null);

  const minBySurface = new Map<string, number>();
  if (courtIds.length > 0) {
    const { data: pricing } = await supabase
      .from("court_pricing")
      .select("court_id,price_cents")
      .in("court_id", courtIds)
      .eq("active", true);
    for (const p of pricing ?? []) {
      const surf = surfaceByCourt.get(p.court_id as string) ?? "estándar";
      const cents = p.price_cents as number;
      if (!minBySurface.has(surf) || cents < (minBySurface.get(surf) ?? Infinity)) {
        minBySurface.set(surf, cents);
      }
    }
  }

  const tarifasItems: ([string, string] | [string, string, "critical"])[] = [];
  if (minBySurface.size > 0) {
    for (const [surf, cents] of minBySurface) {
      const label = surf === "indoor" ? "Cancha indoor" : `Cancha ${surf}`;
      const row: [string, string, "critical"] = [label, `$${Math.round(cents / 100)}/h`, "critical"];
      tarifasItems.push(row);
    }
  } else {
    tarifasItems.push(["Cancha estándar", "Sin tarifas configuradas", "critical"]);
  }
  if (settings?.cancellation_window_hours != null) {
    tarifasItems.push([
      "Cancelación gratuita",
      `Hasta ${settings.cancellation_window_hours}h antes`,
    ]);
  }
  if (settings?.charge_no_show_pct != null) {
    tarifasItems.push(["Cargo por no-show", `${settings.charge_no_show_pct}% del valor`]);
  }

  const sections: Record<string, Section> = {
    info: {
      i: "building-2",
      t: "Información",
      items: [
        ["Nombre del club", (club?.name as string) ?? "—"],
        ["Dirección", (club?.address as string) ?? "—"],
        [
          "Ciudad",
          club?.city || club?.country
            ? [club?.city, club?.country].filter(Boolean).join(", ")
            : "—",
        ],
        ["Teléfono", (club?.phone as string) ?? "—"],
        ["Email", (club?.email as string) ?? "—"],
        ["Slug público", club?.slug ? `/${club.slug}` : "—"],
      ],
    },
    horarios: { i: "clock", t: "Horarios", items: horariosItems },
    tarifas: { i: "wallet", t: "Tarifas", items: tarifasItems },
    reglas: {
      i: "scroll-text",
      t: "Reglas del club",
      // Reglas no están modeladas todavía: placeholders neutros, no defaults inventados.
      items: [
        ["Edad mínima sin acompañante", "—"],
        ["Vestimenta deportiva", "—"],
        ["Calzado adecuado", "—"],
        ["Mascotas", "—"],
        ["Bebidas alcohólicas", "—"],
      ],
    },
  };

  return {
    clubId,
    sections,
    logoUrl: (club?.logo_url as string | null | undefined) ?? null,
    coverUrl: (club?.cover_url as string | null | undefined) ?? null,
  };
}

export async function ClubConfigScreen() {
  const data = await loadData();
  return <ClubConfigScreenView data={data} />;
}
