import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  baselineAnalyzerVersion,
  schemaVersion,
  type BeatGrid,
} from "@rhythm-game/chart-schema";

import { analyzeBeatGrid, type BeatAnalysisInput } from "./beatAnalyzer";
import {
  analyzeQualityRhythm,
  classifyTempoCandidates,
  inferMeterFromAccents,
  qualityWarnings,
} from "./qualityBeatAnalyzer";

interface MeterTrack {
  readonly input: BeatAnalysisInput;
  readonly beats: readonly number[];
  readonly downbeats: readonly number[];
}

function deterministicNoise(index: number): number {
  let value = (index + 1) * 2_654_435_761;
  value = (value ^ (value >>> 13)) * 1_597_334_677;
  return ((value ^ (value >>> 16)) >>> 0) / 2 ** 31 - 1;
}

function meteredPulseTrack({
  bpm,
  meter,
  durationSeconds = 14,
  sampleRate = 22_050,
  flatAccents = false,
  accentPattern,
}: {
  readonly bpm: number;
  readonly meter: 3 | 4;
  readonly durationSeconds?: number;
  readonly sampleRate?: number;
  readonly flatAccents?: boolean;
  readonly accentPattern?: readonly number[];
}): MeterTrack {
  const samples = new Float32Array(Math.round(durationSeconds * sampleRate));
  const beats: number[] = [];
  const downbeats: number[] = [];
  const interval = 60 / bpm;
  let beatIndex = 0;
  for (
    let beatTime = 0.75;
    beatTime <= durationSeconds - 0.3;
    beatTime += interval
  ) {
    beats.push(beatTime);
    if (beatIndex % meter === 0) {
      downbeats.push(beatTime);
    }
    const accent = accentPattern
      ? accentPattern[beatIndex % accentPattern.length]!
      : flatAccents || beatIndex % meter === 0
        ? 1
        : 0.52;
    const start = Math.round(beatTime * sampleRate);
    const pulseLength = Math.round(0.17 * sampleRate);
    for (let offset = 0; offset < pulseLength; offset += 1) {
      const elapsed = offset / sampleRate;
      const envelope = Math.exp(-elapsed * 27);
      const kick =
        Math.sin(2 * Math.PI * (80 - elapsed * 140) * elapsed) *
        envelope *
        accent *
        0.72;
      const click =
        elapsed < 0.035
          ? deterministicNoise(start + offset) *
            Math.exp(-elapsed * 92) *
            accent *
            0.18
          : 0;
      if (start + offset < samples.length) {
        samples[start + offset] = Math.max(-1, Math.min(1, kick + click));
      }
    }
    beatIndex += 1;
  }
  return {
    input: { channels: [samples], sampleRate, durationSeconds },
    beats,
    downbeats,
  };
}

function eventF1(
  predicted: readonly number[],
  reference: readonly number[],
  toleranceSeconds: number,
): number {
  const used = new Set<number>();
  let matches = 0;
  predicted.forEach((event) => {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    reference.forEach((expected, index) => {
      const distance = Math.abs(event - expected);
      if (
        !used.has(index) &&
        distance <= toleranceSeconds &&
        distance < bestDistance
      ) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      used.add(bestIndex);
      matches += 1;
    }
  });
  const precision = matches / Math.max(1, predicted.length);
  const recall = matches / Math.max(1, reference.length);
  return (
    (2 * precision * recall) / Math.max(Number.EPSILON, precision + recall)
  );
}

function ownedDemoWave(): BeatAnalysisInput {
  const wave = readFileSync(path.resolve("public/audio/demo-pulse.wav"));
  const sampleRate = wave.readUInt32LE(24);
  const sampleCount = wave.readUInt32LE(40) / 2;
  const samples = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = wave.readInt16LE(44 + index * 2) / 32_768;
  }
  return {
    channels: [samples],
    sampleRate,
    durationSeconds: sampleCount / sampleRate,
  };
}

function baselineWithAlternatives(): BeatGrid {
  return {
    schemaVersion,
    kind: "beat_grid",
    analyzerVersion: baselineAnalyzerVersion,
    durationSeconds: 8,
    analysisSampleRate: 11_025,
    tempoBpm: 120,
    confidence: 0.8,
    tempoCandidates: [
      { bpm: 120, score: 1 },
      { bpm: 60, score: 0.74 },
      { bpm: 90, score: 0.4 },
    ],
    beats: [
      { timeSeconds: 1, strength: 1 },
      { timeSeconds: 1.5, strength: 0.8 },
    ],
  };
}

describe("quality beat and downbeat analyzer", () => {
  it.each([
    [3, 108],
    [4, 132],
  ] as const)(
    "adds accurate %s/4 downbeats without regressing beat F1 at %s BPM",
    async (meter, bpm) => {
      const track = meteredPulseTrack({ bpm, meter });
      const baseline = await analyzeBeatGrid(track.input);
      const quality = await analyzeQualityRhythm(track.input);
      const baselineF1 = eventF1(
        baseline.beats.map((beat) => beat.timeSeconds),
        track.beats,
        0.07,
      );
      const qualityF1 = eventF1(
        quality.beats.map((beat) => beat.timeSeconds),
        track.beats,
        0.07,
      );
      const downbeatF1 = eventF1(
        quality.beats
          .filter((beat) => beat.isDownbeat)
          .map((beat) => beat.timeSeconds),
        track.downbeats,
        0.09,
      );

      expect(quality.meter).toBe(meter);
      expect(qualityF1).toBeGreaterThanOrEqual(baselineF1);
      expect(downbeatF1).toBeGreaterThanOrEqual(0.85);
      expect(quality.baselineComparison).toMatchObject({
        beatAgreement: 1,
        fallbackUsed: false,
      });
    },
    10_000,
  );

  it("identifies the owned demo as a confident 4/4 quality result", async () => {
    const result = await analyzeQualityRhythm(ownedDemoWave());

    expect(result.analyzerVersion).toBe("quality-dsp-v1");
    expect(result.tempoBpm).toBeGreaterThanOrEqual(115);
    expect(result.tempoBpm).toBeLessThanOrEqual(125);
    expect(result.meter).toBe(4);
    expect(result.beats).toHaveLength(13);
    expect(result.beats.filter((beat) => beat.isDownbeat)).toHaveLength(4);
    expect(result.warnings).not.toContain("low_confidence");
    expect(result.baselineComparison.fallbackUsed).toBe(false);
  });

  it("withholds meter and downbeats when accents are flat", async () => {
    const track = meteredPulseTrack({ bpm: 120, meter: 4, flatAccents: true });
    const result = await analyzeQualityRhythm(track.input);

    expect(result.meter).toBeNull();
    expect(result.confidence.downbeat).toBeLessThan(0.55);
    expect(result.warnings).toContain("meter_uncertain");
    expect(result.beats.every((beat) => !beat.isDownbeat)).toBe(true);
    expect(result.beats.every((beat) => beat.positionInBar === null)).toBe(
      true,
    );
    expect(result.baselineComparison.fallbackUsed).toBe(true);
  });

  it("classifies and warns for a strong half-tempo alternative", () => {
    const candidates = classifyTempoCandidates(baselineWithAlternatives());
    const warnings = qualityWarnings({
      meter: 4,
      confidence: {
        tempo: 0.65,
        beat: 0.8,
        downbeat: 0.8,
        agreement: 1,
        overall: 0.78,
      },
      tempoCandidates: candidates,
      baselineComparison: {
        analyzerVersion: baselineAnalyzerVersion,
        tempoDeltaBpm: 0,
        beatAgreement: 1,
        fallbackUsed: false,
      },
    });

    expect(candidates[1]).toMatchObject({ relation: "half", score: 0.74 });
    expect(warnings).toEqual(["half_double_ambiguous"]);
  });

  it("keeps warning order stable across every classification", () => {
    expect(
      qualityWarnings({
        meter: null,
        confidence: {
          tempo: 0.4,
          beat: 0.5,
          downbeat: 0.2,
          agreement: 0.7,
          overall: 0.4,
        },
        tempoCandidates: classifyTempoCandidates(baselineWithAlternatives()),
        baselineComparison: {
          analyzerVersion: baselineAnalyzerVersion,
          tempoDeltaBpm: 4,
          beatAgreement: 0.7,
          fallbackUsed: true,
        },
      }),
    ).toEqual([
      "low_confidence",
      "meter_uncertain",
      "half_double_ambiguous",
      "baseline_disagreement",
    ]);
  });

  it("uses conservative pure meter thresholds", () => {
    expect(inferMeterFromAccents([1, 1, 1, 1, 1, 1, 1, 1])).toMatchObject({
      meter: null,
    });
    expect(
      inferMeterFromAccents([1, 0.2, 0.2, 1, 0.2, 0.2, 1, 0.2, 0.2]),
    ).toMatchObject({ meter: 3, phase: 0 });
  });

  it.each([
    [
      "non-periodic isolated peaks",
      [
        0.54, 0.62, 0.94, 0.61, 0.55, 0.86, 0.68, 0.66, 0.58, 0.55, 0.94, 0.51,
        0.61,
      ],
    ],
    [
      "contradictory 3/4 and 4/4 accents",
      [1, 0.55, 0.55, 0.82, 0.82, 0.55, 0.82, 0.55, 0.82, 0.82, 0.55, 0.55, 1],
    ],
    [
      "near-flat accents",
      [0.5, 0.51, 0.49, 0.5, 0.48, 0.51, 0.5, 0.49, 0.51, 0.5, 0.49, 0.5],
    ],
  ] as const)("withholds meter for %s", (_case, accents) => {
    expect(inferMeterFromAccents(accents)).toMatchObject({
      meter: null,
      phase: null,
    });
    expect(inferMeterFromAccents(accents).confidence).toBeLessThan(0.55);
  });

  it.each([
    [
      "non-periodic",
      [
        0.54, 0.62, 0.94, 0.61, 0.55, 0.86, 0.68, 0.66, 0.58, 0.55, 0.94, 0.51,
        0.61,
      ],
    ],
    [
      "contradictory",
      [1, 0.55, 0.55, 0.82, 0.82, 0.55, 0.82, 0.55, 0.82, 0.82, 0.55, 0.55],
    ],
  ] as const)(
    "emits no downbeats for %s pulse evidence",
    async (_case, accentPattern) => {
      const track = meteredPulseTrack({
        bpm: 120,
        meter: 4,
        durationSeconds: 14,
        accentPattern,
      });
      const result = await analyzeQualityRhythm(track.input);

      expect(result.meter).toBeNull();
      expect(result.confidence.downbeat).toBeLessThan(0.55);
      expect(result.warnings).toContain("meter_uncertain");
      expect(
        result.beats.every(
          (beat) => !beat.isDownbeat && beat.positionInBar === null,
        ),
      ).toBe(true);
    },
  );

  it("is deterministic and reports the quality-specific progress stage", async () => {
    const track = meteredPulseTrack({ bpm: 120, meter: 4, durationSeconds: 8 });
    const onProgress = vi.fn();
    const first = await analyzeQualityRhythm(track.input, { onProgress });
    const second = await analyzeQualityRhythm(track.input);

    expect(first).toEqual(second);
    expect(onProgress.mock.calls.map(([progress]) => progress.stage)).toContain(
      "metrical_analysis",
    );
  });

  it("honors cancellation before metrical inference", async () => {
    const track = meteredPulseTrack({ bpm: 120, meter: 4, durationSeconds: 8 });
    let cancelled = false;
    await expect(
      analyzeQualityRhythm(track.input, {
        isCancelled: () => cancelled,
        yieldControl: async () => {
          cancelled = true;
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("analyzes 60 seconds within the quality performance budget", async () => {
    const track = meteredPulseTrack({
      bpm: 120,
      meter: 4,
      durationSeconds: 60,
    });
    const firstStartedAt = performance.now();
    const first = await analyzeQualityRhythm(track.input);
    const firstElapsedMilliseconds = performance.now() - firstStartedAt;
    const secondStartedAt = performance.now();
    const second = await analyzeQualityRhythm(track.input);
    const secondElapsedMilliseconds = performance.now() - secondStartedAt;

    expect(first.meter).toBe(4);
    expect(second).toEqual(first);
    expect(firstElapsedMilliseconds).toBeLessThan(5_000);
    expect(secondElapsedMilliseconds).toBeLessThan(5_000);
  }, 10_000);
});
