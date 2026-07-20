import { describe, expect, it } from "vitest";

import { demoChart } from "./demoContent";
import {
  calibratedSongTime,
  collectExpiredMisses,
  completeJudgments,
  currentCombo,
  deriveResultSummary,
  judgmentForOffset,
  recordInput,
} from "./scoring";

describe("deterministic scoring", () => {
  it.each([
    [-121, "miss"],
    [-120, "good"],
    [-51, "good"],
    [-50, "perfect"],
    [0, "perfect"],
    [50, "perfect"],
    [51, "good"],
    [120, "good"],
    [121, "miss"],
  ] as const)("classifies %d ms as %s", (offset, expected) => {
    expect(judgmentForOffset(offset)).toBe(expected);
  });

  it("applies a positive device offset exactly once", () => {
    expect(calibratedSongTime(1.08, 80)).toBeCloseTo(1, 8);
    const records = recordInput(demoChart, [], 1.08, 80);
    expect(records[0]).toMatchObject({
      judgment: "perfect",
      offsetMilliseconds: 0,
    });
  });

  it.each([
    [0.88, "good"],
    [0.95, "perfect"],
    [1.05, "perfect"],
    [1.12, "good"],
  ] as const)(
    "preserves the inclusive chart-relative boundary at %s seconds",
    (inputTime, expected) => {
      expect(recordInput(demoChart, [], inputTime, 0)[0]).toMatchObject({
        noteIndex: 0,
        judgment: expected,
      });
    },
  );

  it("keeps input beyond a timing window outside that note", () => {
    expect(recordInput(demoChart, [], 0.879_999, 0)).toEqual([]);
    expect(recordInput(demoChart, [], 1.120_001, 0)[0]).toMatchObject({
      noteIndex: 0,
      judgment: "miss",
    });
  });

  it("uses song time rather than frame count when collecting misses", () => {
    expect(collectExpiredMisses(demoChart, [], 1.12, 0)).toHaveLength(0);
    expect(collectExpiredMisses(demoChart, [], 1.120_001, 0)[0]).toMatchObject({
      noteIndex: 0,
      judgment: "miss",
    });
    const afterDroppedFrame = collectExpiredMisses(demoChart, [], 2.2, 0);
    expect(afterDroppedFrame.map((record) => record.noteIndex)).toEqual([
      0, 1, 2,
    ]);
  });

  it("derives totals and combos only from immutable judgment records", () => {
    let records = recordInput(demoChart, [], 1, 0);
    records = recordInput(demoChart, records, 1.58, 0);
    records = collectExpiredMisses(demoChart, records, 2.2, 0);
    const completed = completeJudgments(demoChart, records);
    const summary = deriveResultSummary(completed);

    expect(summary).toMatchObject({
      perfect: 1,
      good: 1,
      miss: 11,
      score: 1_500,
      maxCombo: 2,
    });
    expect(currentCombo(completed)).toBe(0);
  });
});
