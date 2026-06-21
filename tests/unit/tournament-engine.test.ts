import { describe, expect, it } from "vitest";
import { normalizeClubPartnerLinkCode } from "@/lib/partners/club-link-code";
import {
  buildGroupCourtSchedule,
  normalizeSchedulingConfig,
} from "@/lib/tournaments/group-court-schedule";
import {
  distributeToGroups,
  buildRoundRobinRounds,
  computeGroupStandings,
  groupLabel,
} from "@/lib/tournaments/group-stage";
import {
  isTournamentSetupLocked,
  tournamentSetupLockMessage,
} from "@/lib/tournaments/setup-lock";

describe("normalizeClubPartnerLinkCode", () => {
  it("normaliza espacios y mayúsculas", () => {
    expect(normalizeClubPartnerLinkCode(" clb-ab12-cd34 ")).toBe("CLB-AB12-CD34");
  });
});

describe("normalizeSchedulingConfig", () => {
  it("retorna null sin canchas", () => {
    expect(normalizeSchedulingConfig(null)).toBeNull();
    expect(normalizeSchedulingConfig({ courtIds: [], slotDurationMin: 50 })).toBeNull();
  });

  it("aplica defaults de slot y gap", () => {
    const cfg = normalizeSchedulingConfig({
      courtIds: ["c1"],
      slotDurationMin: 0,
      fechaGapHours: 0,
    });
    expect(cfg?.slotDurationMin).toBe(50);
    expect(cfg?.fechaGapHours).toBe(24);
  });
});

describe("buildGroupCourtSchedule", () => {
  const courts = ["court-a", "court-b"];
  const base = "2026-06-01T10:00:00.000Z";

  it("asigna olas cuando hay más partidos que canchas", () => {
    const matches = [
      { id: "m1", roundNo: 1, groupSortOrder: 0, matchNo: 1 },
      { id: "m2", roundNo: 1, groupSortOrder: 0, matchNo: 2 },
      { id: "m3", roundNo: 1, groupSortOrder: 1, matchNo: 1 },
    ];
    const slots = buildGroupCourtSchedule(matches, {
      courtIds: courts,
      slotDurationMin: 50,
      roundOneStartsAt: base,
      fechaGapHours: 24,
    });
    expect(slots).toHaveLength(3);
    expect(slots.filter((s) => s.waveNo === 0)).toHaveLength(2);
    expect(slots.filter((s) => s.waveNo === 1)).toHaveLength(1);
    expect(new Set(slots.map((s) => s.courtId)).size).toBeGreaterThan(0);
  });

  it("separa fechas por round_no", () => {
    const matches = [
      { id: "m1", roundNo: 1, groupSortOrder: 0, matchNo: 1 },
      { id: "m2", roundNo: 2, groupSortOrder: 0, matchNo: 1 },
    ];
    const slots = buildGroupCourtSchedule(matches, {
      courtIds: courts,
      slotDurationMin: 50,
      roundOneStartsAt: base,
      fechaGapHours: 24,
    });
    const t1 = new Date(slots[0]!.scheduledAt).getTime();
    const t2 = new Date(slots[1]!.scheduledAt).getTime();
    expect(t2 - t1).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
  });
});

describe("distributeToGroups", () => {
  it("reparte equitativamente 8 equipos en 2 grupos", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `r${i}`);
    const groups = distributeToGroups(ids, 2);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.length + groups[1]!.length).toBe(8);
    expect(Math.abs(groups[0]!.length - groups[1]!.length)).toBeLessThanOrEqual(1);
  });

  it("falla si faltan inscripciones", () => {
    expect(() => distributeToGroups(["a"], 2)).toThrow(/suficientes/);
  });
});

describe("buildRoundRobinRounds", () => {
  it("genera n-1 fechas para n equipos pares", () => {
    const rounds = buildRoundRobinRounds(["a", "b", "c", "d"]);
    expect(rounds).toHaveLength(3);
    expect(rounds.every((r) => r.length === 2)).toBe(true);
  });
});

describe("computeGroupStandings", () => {
  it("ordena por victorias", () => {
    const standings = computeGroupStandings(["a", "b"], [
      {
        sideARegistrationId: "a",
        sideBRegistrationId: "b",
        winnerSide: "a",
        score: { sets: [{ a: 2, b: 0 }] },
        status: "confirmed",
      },
    ]);
    expect(standings[0]!.registrationId).toBe("a");
    expect(standings[0]!.wins).toBe(1);
    expect(standings[1]!.losses).toBe(1);
  });
});

describe("groupLabel", () => {
  it("devuelve letras A, B, C", () => {
    expect(groupLabel(0)).toBe("A");
    expect(groupLabel(1)).toBe("B");
  });
});

describe("setup-lock", () => {
  it("bloquea cuando hay group_stage", () => {
    expect(
      isTournamentSetupLocked({ status: "active", categoryStages: ["group_stage"] }),
    ).toBe(true);
    expect(tournamentSetupLockMessage({ status: "active", categoryStages: ["group_stage"] })).toMatch(
      /competencia/i,
    );
  });

  it("no bloquea borrador sin bracket", () => {
    expect(isTournamentSetupLocked({ status: "draft", categoryStages: ["pending_groups"] })).toBe(
      false,
    );
  });
});
