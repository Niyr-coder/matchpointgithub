import { describe, expect, it } from "vitest";
import { getTournamentRegistrationEligibility } from "@/lib/tournaments/registration-eligibility";

const base = {
  status: "registration_open",
  registrationOpensAt: null,
  registrationClosesAt: null,
  maxParticipants: 32,
  registrationCount: 10,
  categories: [] as Array<{ id: string; maxTeams: number | null }>,
  categoryRegistrationCounts: {} as Record<string, number>,
  now: new Date("2026-06-01T12:00:00.000Z"),
};

describe("getTournamentRegistrationEligibility", () => {
  it("permite inscripción con cupo y status abierto", () => {
    const r = getTournamentRegistrationEligibility(base);
    expect(r.canRegister).toBe(true);
    expect(r.block).toBeNull();
  });

  it("bloquea cuando el torneo está lleno", () => {
    const r = getTournamentRegistrationEligibility({ ...base, registrationCount: 32 });
    expect(r.canRegister).toBe(false);
    expect(r.block).toBe("full");
    expect(r.label).toBe("Cupos llenos");
  });

  it("bloquea inscripciones cerradas por status", () => {
    const r = getTournamentRegistrationEligibility({
      ...base,
      status: "registration_closed",
    });
    expect(r.canRegister).toBe(false);
    expect(r.block).toBe("closed");
  });

  it("bloquea cuando todas las categorías están llenas", () => {
    const r = getTournamentRegistrationEligibility({
      ...base,
      maxParticipants: null,
      registrationCount: 8,
      categories: [{ id: "c1", maxTeams: 4 }, { id: "c2", maxTeams: 4 }],
      categoryRegistrationCounts: { c1: 4, c2: 4 },
    });
    expect(r.canRegister).toBe(false);
    expect(r.block).toBe("full");
  });

  it("respeta registration_closes_at en el pasado", () => {
    const r = getTournamentRegistrationEligibility({
      ...base,
      registrationClosesAt: "2026-05-01T00:00:00.000Z",
    });
    expect(r.canRegister).toBe(false);
    expect(r.block).toBe("past_close");
  });
});
