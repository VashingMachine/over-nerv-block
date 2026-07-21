import { describe, expect, it } from "vitest";

import {
  baselineAnalyzerVersion,
  chartDifficulties,
  chartGenerationRules,
  chartGeneratorVersion,
  generatedRhythmChartSchema,
  qualityAnalyzerVersion,
  schemaVersion,
  type QualityRhythmAnalysis,
} from "@rhythm-game/chart-schema";

import {
  ChartGenerationError,
  generateDifficultyCharts,
} from "./generateDifficultyCharts";

function analysisFixture(
  overrides: Partial<QualityRhythmAnalysis> = {},
): QualityRhythmAnalysis {
  const beats = Array.from({ length: 13 }, (_, index) => ({
    timeSeconds: 1 + index * 0.5,
    strength: index % 4 === 0 ? 1 : index % 2 === 0 ? 0.72 : 0.55,
    isDownbeat: index % 4 === 0,
    positionInBar: (index % 4) + 1,
  }));
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
    tempoCandidates: [{ bpm: 120, score: 1, relation: "selected" }],
    warnings: [],
    baselineComparison: {
      analyzerVersion: baselineAnalyzerVersion,
      tempoDeltaBpm: 0,
      beatAgreement: 1,
      fallbackUsed: false,
    },
    beats,
    ...overrides,
  };
}

function noteTimes(chart: ReturnType<typeof generateDifficultyCharts>["easy"]) {
  return chart.notes.map((note) => note.timeSeconds);
}

function gridAnalysis({
  bpm,
  durationSeconds,
  meter,
  strength = () => 0.8,
}: {
  bpm: number;
  durationSeconds: number;
  meter: 3 | 4 | null;
  strength?: (index: number) => number;
}): QualityRhythmAnalysis {
  const base = analysisFixture();
  const interval = 60 / bpm;
  const beatCount =
    Math.floor(
      (durationSeconds - chartGenerationRules.outroGuardSeconds - 0.5) /
        interval,
    ) + 1;
  const beats = Array.from({ length: beatCount }, (_, index) => {
    const positionInBar = meter === null ? null : (index % meter) + 1;
    return {
      timeSeconds: 0.5 + index * interval,
      strength: strength(index),
      isDownbeat: positionInBar === 1,
      positionInBar,
    };
  });
  return {
    ...base,
    durationSeconds,
    tempoBpm: bpm,
    meter,
    confidence: {
      ...base.confidence,
      downbeat: meter === null ? 0.3 : 0.9,
    },
    tempoCandidates: [{ bpm, score: 1, relation: "selected" }],
    warnings: meter === null ? ["meter_uncertain"] : [],
    baselineComparison: {
      ...base.baselineComparison,
      fallbackUsed: meter === null,
    },
    beats,
  };
}

describe("difficulty chart generation", () => {
  it("matches the owned 120 BPM golden chart and records its identities", () => {
    const charts = generateDifficultyCharts(analysisFixture(), 17);

    expect(noteTimes(charts.easy)).toEqual([1, 3, 5, 7]);
    expect(noteTimes(charts.medium)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(noteTimes(charts.hard)).toEqual([
      1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7,
    ]);
    expect(charts.hard).toMatchObject({
      schemaVersion,
      analyzerVersion: qualityAnalyzerVersion,
      generatorVersion: chartGeneratorVersion,
      difficulty: "hard",
      seed: 17,
      generation: {
        inputBeatCount: 13,
        eligibleBeatCount: 13,
        selectedNoteCount: 13,
      },
    });
  });

  it("is deterministic and keeps every easier note in harder charts", () => {
    const first = generateDifficultyCharts(analysisFixture(), 42);
    const second = generateDifficultyCharts(analysisFixture(), 42);

    expect(first).toEqual(second);
    expect(noteTimes(first.medium)).toEqual(
      expect.arrayContaining(noteTimes(first.easy)),
    );
    expect(noteTimes(first.hard)).toEqual(
      expect.arrayContaining(noteTimes(first.medium)),
    );
    expect(first.easy.notes.length).toBeLessThan(first.medium.notes.length);
    expect(first.medium.notes.length).toBeLessThan(first.hard.notes.length);
  });

  it.each(chartDifficulties)(
    "enforces boundaries, spacing, density, and the shared schema for %s",
    (difficulty) => {
      const chart = generateDifficultyCharts(analysisFixture())[difficulty];
      const rules = chartGenerationRules.difficulties[difficulty];
      expect(() => generatedRhythmChartSchema.parse(chart)).not.toThrow();
      expect(chart.notes[0]!.timeSeconds).toBeGreaterThanOrEqual(
        chartGenerationRules.introGuardSeconds,
      );
      expect(chart.notes.at(-1)!.timeSeconds).toBeLessThanOrEqual(
        chart.durationSeconds - chartGenerationRules.outroGuardSeconds,
      );
      chart.notes.slice(1).forEach((note, index) => {
        expect(
          note.timeSeconds - chart.notes[index]!.timeSeconds,
        ).toBeGreaterThanOrEqual(rules.minimumSpacingSeconds);
      });
      expect(
        chart.notes.length / (chart.durationSeconds / 60),
      ).toBeLessThanOrEqual(rules.maximumNotesPerMinute);
    },
  );

  it("uses stable beat, downbeat, and onset source labels", () => {
    const chart = generateDifficultyCharts(analysisFixture()).hard;
    expect(
      chart.notes.filter((note) => note.source === "downbeat"),
    ).toHaveLength(4);
    expect(chart.notes.some((note) => note.source === "onset")).toBe(true);
    expect(chart.notes.some((note) => note.source === "beat")).toBe(true);
  });

  it("uses conservative index anchors when meter is uncertain", () => {
    const base = analysisFixture();
    const uncertain = analysisFixture({
      meter: null,
      confidence: { ...base.confidence, downbeat: 0.3 },
      warnings: ["meter_uncertain"],
      baselineComparison: { ...base.baselineComparison, fallbackUsed: true },
      beats: base.beats.map((beat) => ({
        ...beat,
        isDownbeat: false,
        positionInBar: null,
      })),
    });

    expect(noteTimes(generateDifficultyCharts(uncertain).easy)).toEqual([
      1, 3, 5, 7,
    ]);
  });

  it("applies the low-confidence salience guard without promoting weak beats", () => {
    const base = analysisFixture();
    const lowConfidence = analysisFixture({
      confidence: {
        tempo: 0.55,
        beat: 0.55,
        downbeat: 0.7,
        agreement: 0.55,
        overall: 0.55,
      },
      warnings: ["low_confidence"],
      beats: base.beats.map((beat, index) => ({
        ...beat,
        strength: index % 4 === 0 ? 0.9 : index % 2 === 0 ? 0.52 : 0.2,
      })),
    });
    const charts = generateDifficultyCharts(lowConfidence);

    expect(charts.easy.generation.lowConfidenceGuardApplied).toBe(true);
    expect(noteTimes(charts.easy)).toEqual([1, 3, 5, 7]);
    expect(noteTimes(charts.medium)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(noteTimes(charts.hard)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(charts.hard.id).not.toBe(generateDifficultyCharts(base).hard.id);
  });

  it("finds feasible outer anchors instead of choosing a blocking strong middle", () => {
    const analysis = gridAnalysis({
      bpm: 240,
      durationSeconds: 2.5,
      meter: 3,
      strength: (index) => (index === 3 ? 1 : 0.7),
    });

    expect(noteTimes(generateDifficultyCharts(analysis).easy)).toEqual([
      0.5, 2,
    ]);
  });

  it("thins density across the whole timeline while preferring salience per bucket", () => {
    const charts = generateDifficultyCharts(
      gridAnalysis({ bpm: 240, durationSeconds: 20, meter: 4 }),
    );

    expect(charts.easy.notes).toHaveLength(16);
    expect(charts.medium.notes).toHaveLength(32);
    expect(charts.hard.notes).toHaveLength(60);
    expect(charts.easy.notes.at(-1)!.timeSeconds).toBe(19.5);
    expect(charts.medium.notes.at(-1)!.timeSeconds).toBe(19.5);
    expect(charts.hard.notes.at(-1)!.timeSeconds).toBe(19.75);
  });

  it.each([
    [60, 3],
    [120, 4],
    [200, 3],
    [240, 4],
    [120, null],
    [240, null],
  ] as const)(
    "preserves nested valid whole-track charts at %s BPM and meter %s",
    (bpm, meter) => {
      const analysis = gridAnalysis({ bpm, durationSeconds: 20, meter });
      const charts = generateDifficultyCharts(analysis, 9);
      expect(charts.medium.notes.length).toBeGreaterThanOrEqual(
        charts.easy.notes.length,
      );
      expect(charts.hard.notes.length).toBeGreaterThanOrEqual(
        charts.medium.notes.length,
      );
      expect(noteTimes(charts.medium)).toEqual(
        expect.arrayContaining(noteTimes(charts.easy)),
      );
      expect(noteTimes(charts.hard)).toEqual(
        expect.arrayContaining(noteTimes(charts.medium)),
      );
      chartDifficulties.forEach((difficulty) => {
        const chart = charts[difficulty];
        expect(() => generatedRhythmChartSchema.parse(chart)).not.toThrow();
        expect(chart.notes.at(-1)!.timeSeconds).toBeGreaterThan(
          analysis.durationSeconds - 5,
        );
      });
    },
  );

  it("changes chart identity when metrical positions change", () => {
    const analysis = analysisFixture();
    const shifted = analysisFixture({
      beats: analysis.beats.map((beat, index) => {
        const positionInBar = ((index + 1) % 4) + 1;
        return {
          ...beat,
          positionInBar,
          isDownbeat: positionInBar === 1,
        };
      }),
    });

    expect(generateDifficultyCharts(analysis).easy.id).not.toBe(
      generateDifficultyCharts(shifted).easy.id,
    );
  });

  it("fails clearly when safe chart anchors are insufficient", () => {
    const base = analysisFixture();
    expect(() =>
      generateDifficultyCharts(
        analysisFixture({
          durationSeconds: 2,
          meter: null,
          confidence: { ...base.confidence, downbeat: 0.2 },
          warnings: ["meter_uncertain"],
          baselineComparison: {
            ...base.baselineComparison,
            fallbackUsed: true,
          },
          beats: [
            {
              timeSeconds: 0.1,
              strength: 1,
              isDownbeat: false,
              positionInBar: null,
            },
            {
              timeSeconds: 1,
              strength: 0.1,
              isDownbeat: false,
              positionInBar: null,
            },
          ],
        }),
      ),
    ).toThrowError(ChartGenerationError);
  });

  it("rejects invalid seeds before generating an identity", () => {
    expect(() => generateDifficultyCharts(analysisFixture(), -1)).toThrow(
      RangeError,
    );
    expect(() => generateDifficultyCharts(analysisFixture(), 0.5)).toThrow(
      RangeError,
    );
  });
});
