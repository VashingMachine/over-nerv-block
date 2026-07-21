import { describe, expect, it } from "vitest";

import {
  baselineAnalyzerVersion,
  qualityAnalyzerVersion,
  schemaVersion,
  type QualityRhythmAnalysis,
  type RhythmCorrectionDocument,
  type RhythmCorrectionOperation,
} from "@rhythm-game/chart-schema";

import { generateDifficultyCharts } from "../chartGeneration/generateDifficultyCharts";

import {
  appendCorrectionOperation,
  correctionSourceFingerprint,
  createCorrectionDocument,
  projectCorrections,
  type RhythmCorrectionError,
  type RhythmCorrectionErrorCode,
} from "./rhythmCorrection";

function qualityAnalysis(): QualityRhythmAnalysis {
  return {
    schemaVersion,
    kind: "quality_rhythm_analysis",
    analyzerVersion: qualityAnalyzerVersion,
    durationSeconds: 8,
    analysisSampleRate: 11_025,
    tempoBpm: 120,
    meter: 4,
    confidence: {
      tempo: 0.9,
      beat: 0.9,
      downbeat: 0.9,
      agreement: 1,
      overall: 0.9,
    },
    tempoCandidates: [
      { bpm: 120, score: 1, relation: "selected" },
      { bpm: 60, score: 0.4, relation: "half" },
    ],
    warnings: [],
    baselineComparison: {
      analyzerVersion: baselineAnalyzerVersion,
      tempoDeltaBpm: 0,
      beatAgreement: 1,
      fallbackUsed: false,
    },
    beats: Array.from({ length: 15 }, (_, index) => ({
      timeSeconds: 0.5 + index * 0.5,
      strength: index % 4 === 0 ? 1 : 0.7,
      isDownbeat: index % 4 === 0,
      positionInBar: (index % 4) + 1,
    })),
  };
}

function append(
  analysis: QualityRhythmAnalysis,
  document: RhythmCorrectionDocument,
  operation: Parameters<typeof appendCorrectionOperation>[2],
) {
  return appendCorrectionOperation(analysis, document, operation);
}

describe("rhythm correction projection", () => {
  it("fingerprints every source-analysis change without a filename", () => {
    const original = qualityAnalysis();
    const first = correctionSourceFingerprint(original);
    expect(first).toBe(correctionSourceFingerprint(structuredClone(original)));
    expect(first).not.toContain("wav");

    const confidenceChange = structuredClone(original);
    confidenceChange.confidence.overall = 0.89;
    expect(correctionSourceFingerprint(confidenceChange)).not.toBe(first);
    const beatChange = structuredClone(original);
    beatChange.beats[2]!.timeSeconds += 0.01;
    expect(correctionSourceFingerprint(beatChange)).not.toBe(first);
  });

  it("starts from byte-equivalent rhythm data without mutating the source", () => {
    const original = qualityAnalysis();
    const before = structuredClone(original);
    const projected = projectCorrections(
      original,
      createCorrectionDocument(original),
    );

    expect(projected.beats).toEqual(original.beats);
    expect(projected.tempoBpm).toBe(original.tempoBpm);
    expect(projected.meter).toBe(original.meter);
    expect(original).toEqual(before);
  });

  it("replays offset and half/double tempo deterministically", () => {
    const original = qualityAnalysis();
    let result = append(original, createCorrectionDocument(original), {
      kind: "offset",
      milliseconds: 100,
    });
    expect(result.analysis.beats[0]!.timeSeconds).toBe(0.6);

    result = append(original, result.document, {
      kind: "tempo_scale",
      factor: 0.5,
    });
    expect(result.analysis.tempoBpm).toBe(60);
    expect(result.analysis.beats).toHaveLength(8);

    result = append(original, result.document, {
      kind: "tempo_scale",
      factor: 2,
    });
    expect(result.analysis.tempoBpm).toBe(120);
    expect(result.analysis.beats).toHaveLength(15);
    expect(projectCorrections(original, result.document)).toEqual(
      result.analysis,
    );
  });

  it("sets meter and a chosen first downbeat with a valid cycle", () => {
    const original = qualityAnalysis();
    let result = append(original, createCorrectionDocument(original), {
      kind: "set_meter",
      meter: 3,
    });
    result = append(original, result.document, {
      kind: "first_downbeat",
      timeSeconds: 2,
    });

    const selectedIndex = result.analysis.beats.findIndex(
      (beat) => beat.timeSeconds === 2,
    );
    expect(result.analysis.meter).toBe(3);
    expect(result.analysis.beats[selectedIndex]).toMatchObject({
      isDownbeat: true,
      positionInBar: 1,
    });
    expect(
      result.analysis.beats.map((beat) => beat.positionInBar).slice(0, 6),
    ).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it("derives tempo and phase from taps across the full duration", () => {
    const original = qualityAnalysis();
    const result = append(original, createCorrectionDocument(original), {
      kind: "tap_grid",
      tapTimesSeconds: [1, 1.5, 2.02, 2.5],
    });

    expect(result.analysis.tempoBpm).toBe(120);
    expect(result.analysis.beats[0]!.timeSeconds).toBe(0);
    expect(result.analysis.beats.at(-1)!.timeSeconds).toBe(8);
    expect(
      result.analysis.beats.find((beat) => beat.timeSeconds === 1),
    ).toMatchObject({ isDownbeat: true, positionInBar: 1 });
  });

  it.each([
    [[0.25, 0.75, 1.25], 120, 16],
    [[0.5, 1.25, 2], 80, 11],
    [[1, 2.5, 4], 40, 5],
  ] as const)(
    "projects tap grid %j deterministically at %s BPM",
    (tapTimesSeconds, expectedTempo, expectedBeatCount) => {
      const original = qualityAnalysis();
      const operation = {
        kind: "tap_grid" as const,
        tapTimesSeconds: [...tapTimesSeconds],
      };
      const first = append(
        original,
        createCorrectionDocument(original),
        operation,
      ).analysis;
      const second = append(
        original,
        createCorrectionDocument(original),
        operation,
      ).analysis;

      expect(first).toEqual(second);
      expect(first.tempoBpm).toBe(expectedTempo);
      expect(first.beats).toHaveLength(expectedBeatCount);
      expect(
        first.beats.every(
          (beat, index) =>
            index === 0 ||
            beat.timeSeconds > first.beats[index - 1]!.timeSeconds,
        ),
      ).toBe(true);
    },
  );

  it("adds and removes exact beats while preserving deterministic relabeling", () => {
    const original = qualityAnalysis();
    let result = append(original, createCorrectionDocument(original), {
      kind: "add_beat",
      timeSeconds: 0.75,
    });
    expect(
      result.analysis.beats.some((beat) => beat.timeSeconds === 0.75),
    ).toBe(true);
    result = append(original, result.document, {
      kind: "remove_beat",
      timeSeconds: 0.75,
    });
    expect(result.analysis.beats).toEqual(original.beats);
  });

  it.each([
    ["offset_out_of_bounds", { kind: "offset", milliseconds: -600 }],
    ["offset_out_of_bounds", { kind: "offset", milliseconds: 600 }],
    ["tempo_out_of_bounds", { kind: "tempo_scale", factor: 2 }],
    ["duplicate_beat", { kind: "add_beat", timeSeconds: 1 }],
    ["beat_not_found", { kind: "remove_beat", timeSeconds: 0.7 }],
    [
      "tap_tempo_out_of_bounds",
      { kind: "tap_grid", tapTimesSeconds: [1, 1.1, 1.2] },
    ],
    ["tap_out_of_bounds", { kind: "tap_grid", tapTimesSeconds: [7, 7.5, 8.5] }],
  ] satisfies readonly (readonly [
    RhythmCorrectionErrorCode,
    RhythmCorrectionOperation,
  ])[])("rejects %s without changing the document", (code, operation) => {
    const original = qualityAnalysis();
    if (code === "tempo_out_of_bounds") {
      original.tempoBpm = 130;
      original.tempoCandidates = [
        { bpm: 130, score: 1, relation: "selected" },
        { bpm: 65, score: 0.4, relation: "half" },
      ];
    }
    const document = createCorrectionDocument(original);
    expect(() => append(original, document, operation)).toThrowError(
      expect.objectContaining<Partial<RhythmCorrectionError>>({ code }),
    );
    expect(document.revision).toBe(0);
    expect(document.operations).toEqual([]);
  });

  it("rejects foreign correction documents", () => {
    const original = qualityAnalysis();
    const document = {
      ...createCorrectionDocument(original),
      sourceFingerprint: "foreign",
    };
    expect(() => projectCorrections(original, document)).toThrowError(
      expect.objectContaining<Partial<RhythmCorrectionError>>({
        code: "source_mismatch",
      }),
    );
  });

  it("regenerates every difficulty with correction provenance and new IDs", () => {
    const original = qualityAnalysis();
    const uncorrected = generateDifficultyCharts(original);
    const corrected = append(original, createCorrectionDocument(original), {
      kind: "offset",
      milliseconds: 100,
    }).analysis;
    const charts = generateDifficultyCharts(corrected);

    expect(charts.easy.correction).toMatchObject({
      revision: 1,
      sourceFingerprint: corrected.sourceFingerprint,
    });
    expect(charts.medium.correction).toMatchObject({ revision: 1 });
    expect(charts.hard.correction).toMatchObject({ revision: 1 });
    expect(charts.easy.id).not.toBe(uncorrected.easy.id);
    expect(charts.easy.notes[0]!.timeSeconds).toBe(
      uncorrected.easy.notes[0]!.timeSeconds + 0.1,
    );
  });
});
