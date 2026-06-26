import { describe, expect, it } from "vitest";
import {
  pickAllQualifiers,
  pickBestThirdsGlobal,
  previewGroupPlayoff,
  validateGroupPlayoffConfig,
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
});
