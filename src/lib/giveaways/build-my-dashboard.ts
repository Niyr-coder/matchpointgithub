import {
  MECHANIC_CATALOG,
  mechanicByKind,
  parseMechanics,
  type MechanicKind,
} from "@/lib/giveaways/mechanics";
import { isGiveawayQualified, qualifiedProbabilityPct } from "@/lib/giveaways/qualification";
import type { MyGiveawaysDashboard } from "@/lib/schemas/giveaways";

type GiveawayBundle = {
  id: string;
  title: string;
  subtitle: string | null;
  status: string;
  closesAt: string | null;
  drawAt: string | null;
  drawChannel: string | null;
  prizeLabel: string;
  prizeImageUrl: string | null;
  ownerType: string;
  clubId: string;
  clubName: string;
  clubSlug: string;
  qualifierCount: number;
  mechanics: ReturnType<typeof parseMechanics>;
  doneKinds: Set<string>;
  sharePending: boolean;
  totalEntries: number;
  drawnAt: string | null;
  winnerName: string | null;
  userWon: boolean;
};

export function isGiveawayUrgent(closesAt: string | null, drawAt: string | null): boolean {
  const now = Date.now();
  if (closesAt) {
    const ms = new Date(closesAt).getTime() - now;
    if (ms > 0 && ms <= 24 * 3_600_000) return true;
  }
  if (drawAt) {
    const d = new Date(drawAt);
    const today = new Date();
    if (d.toDateString() === today.toDateString() && d.getTime() > now) return true;
  }
  return false;
}

export function formatGiveawayDrawAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `Hoy · ${h}:${m}`;
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${h}:${m}`;
}

function buildRequirements(g: GiveawayBundle) {
  const enabled = g.mechanics.filter((m) => m.enabled);
  return enabled.map((m) => {
    const def = mechanicByKind(m.kind);
    const done = g.doneKinds.has(m.kind);
    const pending = m.kind === "share" && g.sharePending && !done;
    return {
      kind: m.kind,
      label: def?.label ?? m.kind,
      met: done,
      pending: pending || undefined,
    };
  });
}

function shortSorteoTitle(title: string, max = 22): string {
  if (title.length <= max) return title;
  return `${title.slice(0, max - 1)}…`;
}

function baseFields(g: GiveawayBundle) {
  return {
    id: g.id,
    title: g.title,
    subtitle: g.subtitle,
    clubName: g.clubName,
    clubSlug: g.clubSlug,
    ownerType: g.ownerType as "club" | "partner" | "matchpoint",
    prizeImageUrl: g.prizeImageUrl,
    prizeLabel: g.prizeLabel,
    closesAt: g.closesAt,
    drawAt: g.drawAt,
    drawChannel: g.drawChannel,
    urgent: isGiveawayUrgent(g.closesAt, g.drawAt),
    qualifierCount: Math.max(g.qualifierCount, 1),
    probabilityPct: qualifiedProbabilityPct(g.totalEntries >= 1, Math.max(g.qualifierCount, 1)),
  };
}

export function buildMyGiveawaysDashboard(input: {
  displayName: string;
  username: string | null;
  bundles: GiveawayBundle[];
}): MyGiveawaysDashboard {
  const adentro: MyGiveawaysDashboard["adentro"] = [];
  const pendientes: MyGiveawaysDashboard["pendientes"] = [];
  const ganados: MyGiveawaysDashboard["ganados"] = [];
  const pasados: MyGiveawaysDashboard["pasados"] = [];

  for (const g of input.bundles) {
    const active = g.status === "open" || g.status === "closing";
    const enabled = g.mechanics.filter((m) => m.enabled);
    const qualified = g.totalEntries >= 1 || isGiveawayQualified(enabled, g.doneKinds);

    if (active) {
      const fields = baseFields({ ...g, totalEntries: qualified ? 1 : 0 });
      if (qualified) {
        adentro.push(fields);
      } else {
        const requirements = buildRequirements(g);
        const metCount = requirements.filter((r) => r.met).length;
        pendientes.push({
          ...fields,
          requirements,
          metCount,
          totalReq: requirements.length,
        });
      }
      continue;
    }

    if (g.status === "drawn") {
      if (g.userWon) {
        ganados.push({
          id: g.id,
          title: g.title,
          subtitle: g.subtitle,
          clubName: g.clubName,
          clubSlug: g.clubSlug,
          ownerType: g.ownerType as "club" | "partner" | "matchpoint",
          prizeImageUrl: g.prizeImageUrl,
          prizeLabel: g.prizeLabel,
          drawnAt: g.drawnAt ?? g.drawAt,
          claimStatus: "pending",
          claimHint: g.drawChannel
            ? `Reclama en ${g.drawChannel}`
            : "Contacta al club para reclamar tu premio",
        });
      } else {
        pasados.push({
          id: g.id,
          title: g.title,
          subtitle: g.winnerName ? `Ganó ${g.winnerName}` : g.subtitle,
          clubName: g.clubName,
          clubSlug: g.clubSlug,
          ownerType: g.ownerType as "club" | "partner" | "matchpoint",
          prizeImageUrl: g.prizeImageUrl,
          qualifierCount: Math.max(g.qualifierCount, 1),
          drawnAt: g.drawnAt ?? g.drawAt,
        });
      }
    } else if (g.status === "closed" || g.status === "cancelled") {
      pasados.push({
        id: g.id,
        title: g.title,
        subtitle: g.subtitle,
        clubName: g.clubName,
        clubSlug: g.clubSlug,
        ownerType: g.ownerType as "club" | "partner" | "matchpoint",
        prizeImageUrl: g.prizeImageUrl,
        qualifierCount: Math.max(g.qualifierCount, 1),
        drawnAt: g.drawAt,
      });
    }
  }

  const unlockMap = new Map<
    MechanicKind,
    { kind: MechanicKind; label: string; icon: string; autoVerify: boolean; qualifiesFor: Map<string, { sorteo: string; giveawayId: string; already: boolean }> }
  >();

  for (const p of pendientes) {
    const bundle = input.bundles.find((b) => b.id === p.id);
    if (!bundle) continue;
    const requirements = buildRequirements(bundle);
    for (const req of requirements) {
      const kind = req.kind as MechanicKind;
      const def = mechanicByKind(kind) ?? MECHANIC_CATALOG.find((m) => m.kind === kind);
      if (!def) continue;
      let row = unlockMap.get(kind);
      if (!row) {
        row = {
          kind,
          label: def.label,
          icon: def.icon,
          autoVerify: def.autoVerify,
          qualifiesFor: new Map(),
        };
        unlockMap.set(kind, row);
      }
      row.qualifiesFor.set(p.id, {
        sorteo: shortSorteoTitle(p.title),
        giveawayId: p.id,
        already: req.met,
      });
    }
  }

  const unlockActions = [...unlockMap.values()]
    .map((row) => ({
      kind: row.kind,
      label: row.label,
      icon: row.icon,
      autoVerify: row.autoVerify,
      qualifiesFor: [...row.qualifiesFor.values()],
    }))
    .sort((a, b) => {
      const pa = a.qualifiesFor.filter((q) => !q.already).length;
      const pb = b.qualifiesFor.filter((q) => !q.already).length;
      return pb - pa;
    });

  const nextCandidate = [...adentro]
    .filter((g) => g.drawAt)
    .sort((a, b) => new Date(a.drawAt!).getTime() - new Date(b.drawAt!).getTime())[0];

  const nextDraw = nextCandidate
    ? {
        giveawayId: nextCandidate.id,
        title: nextCandidate.title,
        drawAt: nextCandidate.drawAt!,
        drawChannel: nextCandidate.drawChannel,
        probabilityPct: nextCandidate.probabilityPct,
        urgent: nextCandidate.urgent,
      }
    : null;

  const drawnTotal = ganados.length + pasados.filter((p) => input.bundles.find((b) => b.id === p.id)?.status === "drawn").length;
  const winRatePct = drawnTotal > 0 ? Math.round((ganados.length / drawnTotal) * 100) : 0;

  return {
    displayName: input.displayName,
    username: input.username,
    adentro,
    pendientes,
    ganados,
    pasados,
    unlockActions,
    nextDraw,
    stats: {
      adentro: adentro.length,
      pendientes: pendientes.length,
      ganados: ganados.length,
      pasados: pasados.length,
      winRatePct,
    },
  };
}

export function formatGiveawayHeroUser(displayName: string, username: string | null): string {
  const display = displayName.trim();
  const user = username?.trim();
  if (!user) return display || "Tu perfil";
  if (!display) return `@${user}`;
  const norm = (s: string) => s.toLowerCase().replace(/[\s._-]+/g, "");
  if (norm(display) === norm(user)) return `@${user}`;
  return `${display} · @${user}`;
}

export type { GiveawayBundle };
