import { describe, expect, it } from "vitest";

import { demoChart } from "./demoContent";
import {
  createGameResult,
  getBrowserStorage,
  readCalibrationOffset,
  readLatestResult,
  resultStorageKeys,
  saveCalibrationOffset,
  saveLatestResult,
} from "./resultStore";
import { recordInput } from "./scoring";

describe("validated local game metadata", () => {
  it("bounds and reloads calibration", () => {
    localStorage.clear();
    expect(saveCalibrationOffset(localStorage, 42.4)).toBe(42);
    expect(readCalibrationOffset(localStorage)).toBe(42);
    expect(saveCalibrationOffset(localStorage, 500)).toBe(250);
  });

  it("rejects fractional persisted calibration outside the result contract", () => {
    localStorage.setItem(resultStorageKeys.calibration, "42.4");
    expect(readCalibrationOffset(localStorage)).toBe(0);
  });

  it("derives and validates the result before persistence", () => {
    localStorage.clear();
    const records = recordInput(demoChart, [], 1, 0);
    const result = createGameResult(records, 0, "2026-07-20T20:00:00.000Z");
    saveLatestResult(localStorage, result);

    expect(readLatestResult(localStorage)).toMatchObject({
      summary: { perfect: 1, miss: 12, score: 1_000 },
    });
  });

  it("rejects corrupt persisted result metadata", () => {
    localStorage.setItem(resultStorageKeys.latestResult, '{"score":"trusted"}');
    expect(readLatestResult(localStorage)).toBeNull();
    expect(localStorage.getItem(resultStorageKeys.latestResult)).toBeNull();
  });

  it("rejects a summary that disagrees with its judgment records", () => {
    const result = createGameResult([], 0, "2026-07-20T20:00:00.000Z");
    localStorage.setItem(
      resultStorageKeys.latestResult,
      JSON.stringify({
        ...result,
        summary: { ...result.summary, score: 99_999 },
      }),
    );

    expect(readLatestResult(localStorage)).toBeNull();
  });

  it("rejects foreign chart identity and impossible judgment semantics", () => {
    const result = createGameResult([], 0, "2026-07-20T20:00:00.000Z");
    localStorage.setItem(
      resultStorageKeys.latestResult,
      JSON.stringify({ ...result, songId: "foreign-song" }),
    );
    expect(readLatestResult(localStorage)).toBeNull();

    localStorage.setItem(
      resultStorageKeys.latestResult,
      JSON.stringify({
        ...result,
        judgments: result.judgments.map((record, index) =>
          index === 0 ? { ...record, judgment: "perfect" } : record,
        ),
        summary: {
          perfect: 1,
          good: 0,
          miss: 12,
          score: 1_000,
          maxCombo: 1,
          accuracyPercent: 100 / 13,
        },
      }),
    );
    expect(readLatestResult(localStorage)).toBeNull();
  });

  it("rejects invalid result semantics before saving", () => {
    const result = createGameResult([], 0, "2026-07-20T20:00:00.000Z");
    expect(() =>
      saveLatestResult(localStorage, { ...result, chartId: "foreign-chart" }),
    ).toThrow("current chart");
  });

  it("falls back when the browser denies access to its storage getter", () => {
    const deniedBrowser = Object.defineProperty({}, "localStorage", {
      get: () => {
        throw new DOMException("denied", "SecurityError");
      },
    }) as Pick<Window, "localStorage">;

    expect(getBrowserStorage(deniedBrowser)).toBeNull();
    expect(readCalibrationOffset(null)).toBe(0);
    expect(readLatestResult(null)).toBeNull();
  });
});
