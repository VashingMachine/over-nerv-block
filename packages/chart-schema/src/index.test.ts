import { describe, expect, it } from "vitest";

import {
  baselineAnalyzerVersion,
  beatGridSchema,
  buildManifestSchema,
  gameResultSchema,
  goodWindowMilliseconds,
  noteJudgmentSchema,
  perfectWindowMilliseconds,
  rhythmChartSchema,
  schemaVersion,
  songMetadataSchema,
} from "./index";

describe("shared contracts", () => {
  it("accepts the production-build manifest", () => {
    expect(
      buildManifestSchema.parse({
        status: "ready",
        app: "over-nerv-block",
        version: "0.1.0",
        environment: "test",
        buildIdentifier: "abc123",
        schemaVersion,
        processing: "browser-local",
      }),
    ).toMatchObject({ status: "ready", schemaVersion });
  });

  it("rejects unsupported chart schema versions", () => {
    expect(() =>
      rhythmChartSchema.parse({
        schemaVersion: 2,
        id: "demo",
        title: "Demo",
        durationSeconds: 10,
        notes: [],
      }),
    ).toThrow();
  });

  it("requires playable song metadata to declare its origin and license", () => {
    expect(
      songMetadataSchema.parse({
        id: "demo-pulse",
        title: "Circuit Pulse",
        artist: "Over Nerv Block",
        durationSeconds: 8,
        bpm: 120,
        audioPath: "audio/demo-pulse.wav",
        license: "CC0-1.0",
        provenance: "Generated in this repository",
      }),
    ).toMatchObject({ bpm: 120, license: "CC0-1.0" });

    expect(() =>
      songMetadataSchema.parse({
        id: "unknown",
        title: "Unknown",
        artist: "Unknown",
        durationSeconds: 8,
        bpm: 120,
        audioPath: "audio/unknown.wav",
        license: "",
        provenance: "",
      }),
    ).toThrow();
  });

  it("rejects unordered or out-of-range chart notes", () => {
    expect(() =>
      rhythmChartSchema.parse({
        schemaVersion,
        id: "invalid-chart",
        title: "Invalid chart",
        durationSeconds: 2,
        notes: [
          { timeSeconds: 1.5, lane: 0, source: "beat" },
          { timeSeconds: 1, lane: 0, source: "beat" },
          { timeSeconds: 3, lane: 0, source: "beat" },
        ],
      }),
    ).toThrow();
  });

  it("accepts internally consistent result timing at both window edges", () => {
    expect(
      gameResultSchema.parse({
        schemaVersion,
        songId: "demo-pulse",
        chartId: "demo-chart",
        playedAt: "2026-07-20T20:00:00.000Z",
        calibrationOffsetMilliseconds: 0,
        judgments: [
          {
            noteIndex: 0,
            noteTimeSeconds: 1,
            inputTimeSeconds: 1.05,
            offsetMilliseconds: perfectWindowMilliseconds,
            judgment: "perfect",
          },
          {
            noteIndex: 1,
            noteTimeSeconds: 1.5,
            inputTimeSeconds: 1.62,
            offsetMilliseconds: goodWindowMilliseconds,
            judgment: "good",
          },
          {
            noteIndex: 2,
            noteTimeSeconds: 2,
            inputTimeSeconds: null,
            offsetMilliseconds: null,
            judgment: "miss",
          },
        ],
        summary: {
          perfect: 1,
          good: 1,
          miss: 1,
          score: 1_500,
          maxCombo: 2,
          accuracyPercent: 50,
        },
      }).judgments,
    ).toHaveLength(3);
  });

  it.each([
    {
      inputTimeSeconds: null,
      offsetMilliseconds: null,
      judgment: "perfect",
    },
    {
      inputTimeSeconds: 1.06,
      offsetMilliseconds: 60,
      judgment: "perfect",
    },
    {
      inputTimeSeconds: 1.06,
      offsetMilliseconds: 55,
      judgment: "good",
    },
    {
      inputTimeSeconds: 1.06,
      offsetMilliseconds: 60,
      judgment: "miss",
    },
  ])("rejects impossible judgment timing %#", (record) => {
    expect(() =>
      noteJudgmentSchema.parse({
        noteIndex: 0,
        noteTimeSeconds: 1,
        ...record,
      }),
    ).toThrow();
  });

  it.each([
    ["timestamp", { playedAt: "not-a-timestamp" }],
    ["integer calibration", { calibrationOffsetMilliseconds: 250.5 }],
  ])("rejects invalid result %s independently", (_case, mutation) => {
    expect(() =>
      gameResultSchema.parse({
        schemaVersion,
        songId: "demo-pulse",
        chartId: "demo-chart",
        playedAt: "2026-07-20T20:00:00.000Z",
        calibrationOffsetMilliseconds: 0,
        judgments: [],
        summary: {
          perfect: 0,
          good: 0,
          miss: 0,
          score: 0,
          maxCombo: 0,
          accuracyPercent: 0,
        },
        ...mutation,
      }),
    ).toThrow();
  });

  it("rejects a duplicate note independently", () => {
    expect(() =>
      gameResultSchema.parse({
        schemaVersion,
        songId: "demo-pulse",
        chartId: "demo-chart",
        playedAt: "2026-07-20T20:00:00.000Z",
        calibrationOffsetMilliseconds: 0,
        judgments: [
          {
            noteIndex: 0,
            noteTimeSeconds: 1,
            inputTimeSeconds: null,
            offsetMilliseconds: null,
            judgment: "miss",
          },
          {
            noteIndex: 0,
            noteTimeSeconds: 1,
            inputTimeSeconds: null,
            offsetMilliseconds: null,
            judgment: "miss",
          },
        ],
        summary: {
          perfect: 0,
          good: 0,
          miss: 2,
          score: 0,
          maxCombo: 0,
          accuracyPercent: 0,
        },
      }),
    ).toThrow();
  });

  it("accepts a versioned baseline beat grid", () => {
    expect(
      beatGridSchema.parse({
        schemaVersion,
        kind: "beat_grid",
        analyzerVersion: baselineAnalyzerVersion,
        durationSeconds: 8,
        analysisSampleRate: 11_025,
        tempoBpm: 120,
        confidence: 0.82,
        tempoCandidates: [
          { bpm: 120, score: 1 },
          { bpm: 60, score: 0.4 },
        ],
        beats: [
          { timeSeconds: 1, strength: 1 },
          { timeSeconds: 1.5, strength: 0.8 },
        ],
      }),
    ).toMatchObject({
      analyzerVersion: baselineAnalyzerVersion,
      tempoBpm: 120,
    });
  });

  it.each([
    [
      "out-of-range beat",
      {
        beats: [
          { timeSeconds: 1, strength: 1 },
          { timeSeconds: 8.1, strength: 0.8 },
        ],
      },
    ],
    [
      "duplicate beat",
      {
        beats: [
          { timeSeconds: 1, strength: 1 },
          { timeSeconds: 1, strength: 0.8 },
        ],
      },
    ],
    [
      "unsorted tempo candidates",
      {
        tempoCandidates: [
          { bpm: 120, score: 0.4 },
          { bpm: 60, score: 0.8 },
        ],
      },
    ],
    [
      "non-finite beat",
      {
        beats: [
          { timeSeconds: 1, strength: 1 },
          { timeSeconds: Number.NaN, strength: 0.8 },
        ],
      },
    ],
  ])("rejects a beat grid with %s", (_case, mutation) => {
    expect(() =>
      beatGridSchema.parse({
        schemaVersion,
        kind: "beat_grid",
        analyzerVersion: baselineAnalyzerVersion,
        durationSeconds: 8,
        analysisSampleRate: 11_025,
        tempoBpm: 120,
        confidence: 0.82,
        tempoCandidates: [{ bpm: 120, score: 1 }],
        beats: [
          { timeSeconds: 1, strength: 1 },
          { timeSeconds: 1.5, strength: 0.8 },
        ],
        ...mutation,
      }),
    ).toThrow();
  });
});
