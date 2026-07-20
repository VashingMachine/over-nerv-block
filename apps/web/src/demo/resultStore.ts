import {
  gameResultSchema,
  type GameResult,
  type NoteJudgment,
} from "@rhythm-game/chart-schema";

import { demoChart, demoSong } from "./demoContent";
import { completeJudgments, deriveResultSummary } from "./scoring";

const CALIBRATION_KEY = "over-nerv-block:calibration:v1";
const LATEST_RESULT_KEY = "over-nerv-block:latest-result:v1";

export function getBrowserStorage(
  browser: Pick<Window, "localStorage"> = window,
): Storage | null {
  try {
    return browser.localStorage;
  } catch {
    return null;
  }
}

export function readCalibrationOffset(storage: Storage | null): number {
  if (!storage) {
    return 0;
  }
  try {
    const value = Number(storage.getItem(CALIBRATION_KEY));
    return Number.isInteger(value) && value >= -250 && value <= 250 ? value : 0;
  } catch {
    return 0;
  }
}

export function saveCalibrationOffset(
  storage: Storage | null,
  value: number,
): number {
  if (!storage) {
    throw new Error("Browser storage is unavailable");
  }
  const validated = Math.max(-250, Math.min(250, Math.round(value)));
  storage.setItem(CALIBRATION_KEY, String(validated));
  return validated;
}

export function createGameResult(
  judgments: readonly NoteJudgment[],
  calibrationOffsetMilliseconds: number,
  playedAt: string,
): GameResult {
  const complete = completeJudgments(demoChart, judgments);
  return gameResultSchema.parse({
    schemaVersion: 1,
    songId: demoSong.id,
    chartId: demoChart.id,
    playedAt,
    calibrationOffsetMilliseconds,
    judgments: complete,
    summary: deriveResultSummary(complete),
  });
}

function validateCurrentResult(value: unknown): GameResult {
  const parsed = gameResultSchema.parse(value);
  const derivedSummary = deriveResultSummary(parsed.judgments);
  const validRecords =
    parsed.songId === demoSong.id &&
    parsed.chartId === demoChart.id &&
    parsed.judgments.length === demoChart.notes.length &&
    parsed.judgments.every(
      (record, index) =>
        record.noteIndex === index &&
        demoChart.notes[index]?.timeSeconds === record.noteTimeSeconds,
    );
  if (
    !validRecords ||
    JSON.stringify(parsed.summary) !== JSON.stringify(derivedSummary)
  ) {
    throw new Error("Persisted result does not match the current chart");
  }
  return parsed;
}

export function saveLatestResult(
  storage: Storage | null,
  result: GameResult,
): void {
  if (!storage) {
    throw new Error("Browser storage is unavailable");
  }
  const validated = validateCurrentResult({
    ...result,
    summary: deriveResultSummary(result.judgments),
  });
  storage.setItem(LATEST_RESULT_KEY, JSON.stringify(validated));
}

export function readLatestResult(storage: Storage | null): GameResult | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(LATEST_RESULT_KEY);
    if (!raw) {
      return null;
    }
    return validateCurrentResult(JSON.parse(raw));
  } catch {
    try {
      storage.removeItem(LATEST_RESULT_KEY);
    } catch {
      // Storage can be unavailable in hardened browser modes.
    }
    return null;
  }
}

export const resultStorageKeys = {
  calibration: CALIBRATION_KEY,
  latestResult: LATEST_RESULT_KEY,
} as const;
