import { describe, expect, it, vi } from "vitest";

import {
  baselineAnalyzerVersion,
  beatGridCheckpointVersion,
  qualityAnalyzerVersion,
  schemaVersion,
  type BeatGridCheckpoint,
  type QualityRhythmAnalysis,
} from "@rhythm-game/chart-schema";

import { correctionSourceFingerprint } from "../correction/rhythmCorrection";

import {
  createBeatGridCheckpoint,
  createBeatGridRecoveryStore,
  type RecoveryDatabaseSession,
} from "./beatGridRecoveryStore";

function validGrid(tempoBpm = 120): QualityRhythmAnalysis {
  return {
    schemaVersion,
    kind: "quality_rhythm_analysis",
    analyzerVersion: qualityAnalyzerVersion,
    durationSeconds: 8,
    analysisSampleRate: 11_025,
    tempoBpm,
    meter: 4,
    confidence: {
      tempo: 0.9,
      beat: 0.8,
      downbeat: 0.82,
      agreement: 1,
      overall: 0.86,
    },
    tempoCandidates: [{ bpm: tempoBpm, score: 1, relation: "selected" }],
    warnings: [],
    baselineComparison: {
      analyzerVersion: baselineAnalyzerVersion,
      tempoDeltaBpm: 0,
      beatAgreement: 1,
      fallbackUsed: false,
    },
    beats: [
      { timeSeconds: 1, strength: 1, isDownbeat: true, positionInBar: 1 },
      {
        timeSeconds: 1.5,
        strength: 0.8,
        isDownbeat: false,
        positionInBar: 2,
      },
    ],
  };
}

function memoryDatabase(seed?: unknown) {
  let latest = seed;
  const database: RecoveryDatabaseSession = {
    readLatest: vi.fn(async () => latest),
    writeLatest: vi.fn(async (checkpoint: BeatGridCheckpoint) => {
      latest = checkpoint;
    }),
    deleteLatest: vi.fn(async () => {
      latest = undefined;
    }),
    close: vi.fn(),
  };
  return {
    database,
    latest: () => latest,
    open: vi.fn(async () => database),
  };
}

describe("completed beat-grid recovery store", () => {
  it("creates the strict versioned filename-free checkpoint", () => {
    const checkpoint = createBeatGridCheckpoint(validGrid(), () => 1234);

    expect(checkpoint).toEqual({
      checkpointVersion: beatGridCheckpointVersion,
      kind: "completed_beat_grid_checkpoint",
      savedAtEpochMs: 1234,
      sourceFingerprint: correctionSourceFingerprint(validGrid()),
      grid: validGrid(),
    });
    expect(Object.keys(checkpoint).sort()).toEqual([
      "checkpointVersion",
      "grid",
      "kind",
      "savedAtEpochMs",
      "sourceFingerprint",
    ]);
    expect(JSON.stringify(checkpoint)).not.toMatch(
      /filename|private\.wav|blob:|objecturl|mime|generated_rhythm_chart/i,
    );
  });

  it("round trips and atomically replaces the singleton latest grid", async () => {
    const memory = memoryDatabase();
    const store = createBeatGridRecoveryStore(memory.open, () => 5678);

    await expect(store.readLatest()).resolves.toEqual({ status: "empty" });
    await expect(store.saveLatest(validGrid())).resolves.toBe("saved");
    await expect(store.readLatest()).resolves.toMatchObject({
      status: "loaded",
      checkpoint: { savedAtEpochMs: 5678, grid: { tempoBpm: 120 } },
    });
    await expect(store.saveLatest(validGrid(90))).resolves.toBe("saved");
    await expect(store.readLatest()).resolves.toMatchObject({
      status: "loaded",
      checkpoint: { grid: { tempoBpm: 90 } },
    });
    expect(memory.database.writeLatest).toHaveBeenCalledTimes(2);
    expect(memory.database.close).toHaveBeenCalledTimes(5);
  });

  it.each([
    ["corrupt", { private: "not a grid" }],
    [
      "unknown version",
      {
        ...createBeatGridCheckpoint(validGrid()),
        checkpointVersion: 2,
      },
    ],
    [
      "foreign fingerprint",
      {
        ...createBeatGridCheckpoint(validGrid()),
        sourceFingerprint: "foreign123",
      },
    ],
    [
      "unexpected field",
      {
        ...createBeatGridCheckpoint(validGrid()),
        filename: "private.wav",
      },
    ],
    [
      "unexpected grid field",
      {
        ...createBeatGridCheckpoint(validGrid()),
        grid: { ...validGrid(), filename: "private.wav" },
      },
    ],
    [
      "unexpected nested beat field",
      {
        ...createBeatGridCheckpoint(validGrid()),
        grid: {
          ...validGrid(),
          beats: validGrid().beats.map((beat, index) =>
            index === 0 ? { ...beat, privateRuntime: "retained" } : beat,
          ),
        },
      },
    ],
  ])("discards and deletes %s recovery state", async (_case, seed) => {
    const memory = memoryDatabase(seed);
    const store = createBeatGridRecoveryStore(memory.open);

    await expect(store.readLatest()).resolves.toEqual({ status: "discarded" });
    expect(memory.database.deleteLatest).toHaveBeenCalledOnce();
    expect(memory.latest()).toBeUndefined();
  });

  it("never returns invalid state even when its cleanup is denied", async () => {
    const memory = memoryDatabase({ private: "invalid" });
    vi.mocked(memory.database.deleteLatest).mockRejectedValueOnce(
      new Error("denied"),
    );
    const store = createBeatGridRecoveryStore(memory.open);

    await expect(store.readLatest()).resolves.toEqual({ status: "discarded" });
  });

  it("makes unavailable read, write, and delete nonfatal", async () => {
    const store = createBeatGridRecoveryStore(async () => {
      throw new Error("blocked");
    });

    await expect(store.readLatest()).resolves.toEqual({
      status: "unavailable",
    });
    await expect(store.saveLatest(validGrid())).resolves.toBe("unavailable");
    await expect(store.deleteLatest()).resolves.toBe("unavailable");
  });

  it("deletes only the latest recovery record", async () => {
    const memory = memoryDatabase(createBeatGridCheckpoint(validGrid()));
    const store = createBeatGridRecoveryStore(memory.open);

    await expect(store.deleteLatest()).resolves.toBe("cleared");
    expect(memory.database.deleteLatest).toHaveBeenCalledOnce();
    expect(memory.latest()).toBeUndefined();
  });
});
