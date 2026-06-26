import { describe, expect, it } from "vitest";
import {
  isScoredMatchStatus,
  nextBracketFeederSlot,
  winnerSideFromSets,
} from "@/lib/tournaments/match-score";

describe("isScoredMatchStatus", () => {
  it("detecta reported y confirmed", () => {
    expect(isScoredMatchStatus("reported")).toBe(true);
    expect(isScoredMatchStatus("confirmed")).toBe(true);
  });

  it("rechaza pending y scheduled", () => {
    expect(isScoredMatchStatus("pending")).toBe(false);
    expect(isScoredMatchStatus("scheduled")).toBe(false);
  });
});

describe("winnerSideFromSets", () => {
  it("elige lado con más sets", () => {
    expect(winnerSideFromSets(2, 1)).toBe("a");
    expect(winnerSideFromSets(0, 2)).toBe("b");
  });

  it("lanza en empate", () => {
    expect(() => winnerSideFromSets(1, 1)).toThrow("INVALID_SCORE_TIE");
  });
});

describe("nextBracketFeederSlot", () => {
  it("posición par alimenta lado a", () => {
    expect(nextBracketFeederSlot(0, 0)).toEqual({
      nextRound: 1,
      nextPos: 0,
      feederSide: "a",
    });
    expect(nextBracketFeederSlot(0, 2)).toEqual({
      nextRound: 1,
      nextPos: 1,
      feederSide: "a",
    });
  });

  it("posición impar alimenta lado b", () => {
    expect(nextBracketFeederSlot(0, 1)).toEqual({
      nextRound: 1,
      nextPos: 0,
      feederSide: "b",
    });
  });
});
