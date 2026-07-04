import { describe, expect, it } from "vitest";
import {
  buildLateEntryMatchRows,
  pickAllQualifiers,
  pickBestThirdsGlobal,
  previewGroupPlayoff,
  validateGroupPlayoffConfig,
  validateManualGroupAssignment,
  type GroupMatchResult,
} from "@/lib/tournaments/group-stage";

function mockGroup(
  id: string,
  name: string,
  sortOrder: number,
  memberIds: string[],
  results: Array<[string, string, "a" | "b"]>,
): {
  id: string;
  name: string;
  sortOrder: number;
  memberIds: string[];
  matches: GroupMatchResult[];
} {
  return {
    id,
    name,
    sortOrder,
    memberIds,
    matches: results.map(([a, b, w]) => ({
      sideARegistrationId: a,
      sideBRegistrationId: b,
      winnerSide: w,
      score: { sets: [{ a: w === "a" ? 2 : 0, b: w === "b" ? 2 : 0 }] },
      status: "reported",
    })),
  };
}

describe("pickBestThirdsGlobal", () => {
  it("elige los mejores terceros entre grupos", () => {
    const groups = [
      mockGroup("g1", "A", 0, ["a1", "a2", "a3", "a4"], [
        ["a1", "a2", "a"],
        ["a1", "a3", "a"],
        ["a1", "a4", "a"],
        ["a2", "a3", "a"],
        ["a2", "a4", "a"],
        ["a3", "a4", "a"],
      ]),
      mockGroup("g2", "B", 1, ["b1", "b2", "b3", "b4"], [
        ["b1", "b2", "b"],
        ["b1", "b3", "b"],
        ["b1", "b4", "b"],
        ["b2", "b3", "b"],
        ["b2", "b4", "b"],
        ["b3", "b4", "b"],
      ]),
    ];
    const wildcards = pickBestThirdsGlobal(groups, 2, 1);
    expect(wildcards).toHaveLength(1);
    expect(wildcards[0]?.isWildcard).toBe(true);
    expect(wildcards[0]?.rankInGroup).toBe(3);
  });
});

describe("pickAllQualifiers", () => {
  it("suma top N por grupo + wildcards", () => {
    const groups = [
      mockGroup("g1", "A", 0, ["a1", "a2", "a3"], [
        ["a1", "a2", "a"],
        ["a1", "a3", "a"],
        ["a2", "a3", "a"],
      ]),
      mockGroup("g2", "B", 1, ["b1", "b2", "b3"], [
        ["b1", "b2", "b"],
        ["b1", "b3", "b"],
        ["b2", "b3", "b"],
      ]),
    ];
    const all = pickAllQualifiers(groups, {
      groupsCount: 2,
      advancePerGroup: 2,
      wildcards: { mode: "best_thirds_global", count: 1 },
    });
    expect(all).toHaveLength(5);
    expect(all.filter((e) => e.isWildcard)).toHaveLength(1);
  });
});

describe("previewGroupPlayoff", () => {
  it("calcula byes hacia potencia de 2", () => {
    const p = previewGroupPlayoff(
      {
        groupsCount: 4,
        advancePerGroup: 2,
        wildcards: { mode: "best_thirds_global", count: 2 },
      },
      16,
    );
    expect(p.qualified).toBe(10);
    expect(p.bracketSize).toBe(16);
    expect(p.byes).toBe(6);
  });
});

describe("validateGroupPlayoffConfig", () => {
  it("rechaza más wildcards que grupos", () => {
    const err = validateGroupPlayoffConfig(
      {
        groupsCount: 2,
        advancePerGroup: 2,
        wildcards: { mode: "best_thirds_global", count: 3 },
      },
      8,
    );
    expect(err).toMatch(/mejores 3/);
  });

  it("rechaza mejores terceros si solo clasifica 1 por grupo", () => {
    const err = validateGroupPlayoffConfig(
      {
        groupsCount: 4,
        advancePerGroup: 1,
        wildcards: { mode: "best_thirds_global", count: 1 },
      },
      16,
    );
    expect(err).toMatch(/al menos 2 por grupo/);
  });
});

describe("validateManualGroupAssignment", () => {
  const accepted = ["r1", "r2", "r3", "r4", "r5", "r6"];

  it("acepta una partición válida (incluye grupos disparejos)", () => {
    const err = validateManualGroupAssignment(
      [
        { groupIndex: 0, registrationIds: ["r1", "r2", "r3", "r4"] },
        { groupIndex: 1, registrationIds: ["r5", "r6"] },
      ],
      accepted,
      2,
    );
    expect(err).toBeNull();
  });

  it("rechaza si el número de grupos no coincide con groupsCount", () => {
    const err = validateManualGroupAssignment(
      [{ groupIndex: 0, registrationIds: accepted }],
      accepted,
      2,
    );
    expect(err).toMatch(/exactamente 2/);
  });

  it("rechaza índices de grupo repetidos", () => {
    const err = validateManualGroupAssignment(
      [
        { groupIndex: 0, registrationIds: ["r1", "r2", "r3"] },
        { groupIndex: 0, registrationIds: ["r4", "r5", "r6"] },
      ],
      accepted,
      2,
    );
    expect(err).toMatch(/repetido/);
  });

  it("rechaza un grupo con menos de 2 parejas", () => {
    const err = validateManualGroupAssignment(
      [
        { groupIndex: 0, registrationIds: ["r1"] },
        { groupIndex: 1, registrationIds: ["r2", "r3", "r4", "r5", "r6"] },
      ],
      accepted,
      2,
    );
    expect(err).toMatch(/al menos 2 parejas/);
  });

  it("rechaza una inscripción en dos grupos", () => {
    const err = validateManualGroupAssignment(
      [
        { groupIndex: 0, registrationIds: ["r1", "r2", "r3"] },
        { groupIndex: 1, registrationIds: ["r3", "r4", "r5"] },
      ],
      accepted,
      2,
    );
    expect(err).toMatch(/más de un grupo/);
  });

  it("rechaza una inscripción que no está aceptada", () => {
    const err = validateManualGroupAssignment(
      [
        { groupIndex: 0, registrationIds: ["r1", "r2", "rX"] },
        { groupIndex: 1, registrationIds: ["r3", "r4", "r5"] },
      ],
      accepted,
      2,
    );
    expect(err).toMatch(/no está aceptada/);
  });

  it("rechaza si quedan parejas sin asignar", () => {
    const err = validateManualGroupAssignment(
      [
        { groupIndex: 0, registrationIds: ["r1", "r2"] },
        { groupIndex: 1, registrationIds: ["r3", "r4"] },
      ],
      accepted,
      2,
    );
    expect(err).toMatch(/Faltan 2 pareja/);
  });
});

describe("buildLateEntryMatchRows", () => {
  it("crea un partido del nuevo contra cada miembro en fechas nuevas", () => {
    const rows = buildLateEntryMatchRows("new", ["m1", "m2", "m3"], 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.roundNo)).toEqual([4, 5, 6]);
    expect(rows.every((r) => r.sideA === "new")).toBe(true);
    expect(rows.map((r) => r.sideB)).toEqual(["m1", "m2", "m3"]);
  });

  it("grupo sin miembros previos → sin partidos", () => {
    expect(buildLateEntryMatchRows("new", [], 0)).toHaveLength(0);
  });
});
