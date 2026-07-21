import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { analyzeBeatGrid, type BeatAnalysisInput } from "./beatAnalyzer";
import type { BeatAnalysisError } from "./beatAnalyzer";

interface SyntheticTrack {
  readonly input: BeatAnalysisInput;
  readonly referenceBeats: readonly number[];
}

function deterministicNoise(index: number): number {
  let value = (index + 1) * 2_654_435_761;
  value = (value ^ (value >>> 13)) * 1_597_334_677;
  return ((value ^ (value >>> 16)) >>> 0) / 2 ** 31 - 1;
}

function syntheticPulseTrack(
  bpm: number,
  durationSeconds = 12,
  sampleRate = 22_050,
  phaseSeconds = 0.75,
): SyntheticTrack {
  const length = Math.round(durationSeconds * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const interval = 60 / bpm;
  const referenceBeats: number[] = [];
  for (
    let beatTime = phaseSeconds;
    beatTime <= durationSeconds - 0.25;
    beatTime += interval
  ) {
    referenceBeats.push(beatTime);
    const start = Math.round(beatTime * sampleRate);
    const pulseLength = Math.round(0.16 * sampleRate);
    for (let offset = 0; offset < pulseLength; offset += 1) {
      const elapsed = offset / sampleRate;
      const envelope = Math.exp(-elapsed * 28);
      const kick =
        Math.sin(2 * Math.PI * (82 - elapsed * 150) * elapsed) *
        envelope *
        0.78;
      const click =
        elapsed < 0.035
          ? deterministicNoise(start + offset) * Math.exp(-elapsed * 95) * 0.24
          : 0;
      const index = start + offset;
      if (index < length) {
        left[index] = Math.max(-1, Math.min(1, kick + click));
        right[index] = Math.max(-1, Math.min(1, kick * 0.92 - click * 0.7));
      }
    }
  }
  return {
    input: {
      channels: [left, right],
      sampleRate,
      durationSeconds,
    },
    referenceBeats,
  };
}

function beatF1(
  predicted: readonly number[],
  reference: readonly number[],
  toleranceSeconds = 0.07,
): number {
  const used = new Set<number>();
  let truePositives = 0;
  for (const beat of predicted) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    reference.forEach((expected, index) => {
      if (used.has(index)) {
        return;
      }
      const distance = Math.abs(expected - beat);
      if (distance <= toleranceSeconds && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      used.add(bestIndex);
      truePositives += 1;
    }
  }
  const precision = truePositives / Math.max(1, predicted.length);
  const recall = truePositives / Math.max(1, reference.length);
  return (
    (2 * precision * recall) / Math.max(Number.EPSILON, precision + recall)
  );
}

function ownedDemoWave(): BeatAnalysisInput {
  const wave = readFileSync(path.resolve("public/audio/demo-pulse.wav"));
  const channels = wave.readUInt16LE(22);
  const sampleRate = wave.readUInt32LE(24);
  const bitsPerSample = wave.readUInt16LE(34);
  const dataBytes = wave.readUInt32LE(40);
  if (channels !== 1 || bitsPerSample !== 16) {
    throw new Error("Owned beat-analysis fixture must remain mono 16-bit PCM");
  }
  const sampleCount = dataBytes / 2;
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

describe("baseline beat analyzer", () => {
  it.each([90, 120, 150])(
    "meets the synthetic quality floor at %s BPM",
    async (bpm) => {
      const track = syntheticPulseTrack(bpm);
      const result = await analyzeBeatGrid(track.input);
      const f1 = beatF1(
        result.beats.map((beat) => beat.timeSeconds),
        track.referenceBeats,
      );

      expect(Math.abs(result.tempoBpm - bpm)).toBeLessThanOrEqual(3);
      expect(f1).toBeGreaterThanOrEqual(0.85);
      expect(result.analyzerVersion).toBe("baseline-dsp-v1");
    },
    10_000,
  );

  it("is deterministic for identical input", async () => {
    const track = syntheticPulseTrack(120, 8);
    await expect(analyzeBeatGrid(track.input)).resolves.toEqual(
      await analyzeBeatGrid(track.input),
    );
  });

  it("tracks the repository-owned 120 BPM fixture", async () => {
    const result = await analyzeBeatGrid(ownedDemoWave());
    const expectedBeats = Array.from(
      { length: 13 },
      (_, index) => 1 + index * 0.5,
    );
    const f1 = beatF1(
      result.beats.map((beat) => beat.timeSeconds),
      expectedBeats,
    );

    expect(result.tempoBpm).toBeGreaterThanOrEqual(115);
    expect(result.tempoBpm).toBeLessThanOrEqual(125);
    expect(f1).toBeGreaterThanOrEqual(0.85);
  });

  it("reports every pipeline stage in order", async () => {
    const track = syntheticPulseTrack(120, 5);
    const onProgress = vi.fn();
    await analyzeBeatGrid(track.input, { onProgress });

    const stages = onProgress.mock.calls.map(
      ([progress]) => progress.stage as string,
    );
    expect(stages[0]).toBe("downmix");
    expect(stages).toContain("resample");
    expect(stages).toContain("onset_envelope");
    expect(stages).toContain("tempo");
    expect(stages).toContain("beat_tracking");
    expect(stages.at(-1)).toBe("finalizing");
  });

  it("honors cancellation at cooperative stage boundaries", async () => {
    const track = syntheticPulseTrack(120, 8);
    let cancelled = false;
    await expect(
      analyzeBeatGrid(track.input, {
        isCancelled: () => cancelled,
        yieldControl: async () => {
          cancelled = true;
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("classifies silent audio without leaking input details", async () => {
    await expect(
      analyzeBeatGrid({
        channels: [new Float32Array(44_100)],
        sampleRate: 44_100,
        durationSeconds: 1,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<BeatAnalysisError>>({
        code: "no_onsets",
        message: "No clear rhythmic onsets were found in this audio.",
      }),
    );
  });

  it("analyzes 60 seconds within the CI performance budget", async () => {
    const track = syntheticPulseTrack(120, 60);
    const startedAt = performance.now();
    const result = await analyzeBeatGrid(track.input);
    const elapsedMilliseconds = performance.now() - startedAt;

    expect(result.beats.length).toBeGreaterThan(100);
    expect(elapsedMilliseconds).toBeLessThan(4_000);
  }, 10_000);
});
