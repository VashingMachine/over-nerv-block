import { describe, expect, it } from "vitest";

import {
  baselineAnalyzerVersion,
  beatGridCheckpointSchema,
  beatGridCheckpointVersion,
  beatGridSchema,
  buildManifestSchema,
  chartHistoryDocumentSchema,
  chartHistoryEntryVersion,
  chartHistoryStorageVersion,
  chartGenerationContractVersion,
  chartGenerationRules,
  chartGeneratorVersion,
  correctedRhythmAnalysisSchema,
  correctionContractVersion,
  correctionEditorVersion,
  correctionStorageVersion,
  gameResultSchema,
  generatedRhythmChartSchema,
  goodWindowMilliseconds,
  noteJudgmentSchema,
  perfectWindowMilliseconds,
  qualityAnalyzerVersion,
  qualityRhythmAnalysisSchema,
  rhythmChartSchema,
  rhythmCorrectionDocumentSchema,
  rhythmCorrectionOperationSchema,
  schemaVersion,
  songMetadataSchema,
  type QualityRhythmAnalysis,
} from "./index";

function validQualityAnalysis(): QualityRhythmAnalysis {
  return {
    schemaVersion,
    kind: "quality_rhythm_analysis" as const,
    analyzerVersion: qualityAnalyzerVersion,
    durationSeconds: 8,
    analysisSampleRate: 11_025,
    tempoBpm: 120,
    meter: 4 as const,
    confidence: {
      tempo: 0.84,
      beat: 0.88,
      downbeat: 0.82,
      agreement: 1,
      overall: 0.86,
    },
    tempoCandidates: [
      { bpm: 120, score: 1, relation: "selected" as const },
      { bpm: 90, score: 0.4, relation: "alternate" as const },
    ],
    warnings: [],
    baselineComparison: {
      analyzerVersion: baselineAnalyzerVersion,
      tempoDeltaBpm: 0,
      beatAgreement: 1,
      fallbackUsed: false,
    },
    beats: Array.from({ length: 8 }, (_, index) => ({
      timeSeconds: 1 + index * 0.5,
      strength: index % 4 === 0 ? 1 : 0.7,
      isDownbeat: index % 4 === 0,
      positionInBar: (index % 4) + 1,
    })),
  };
}

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

  it("accepts a versioned generated chart that remains playable", () => {
    expect(
      generatedRhythmChartSchema.parse({
        schemaVersion,
        kind: "generated_rhythm_chart",
        id: "generated-owned-easy",
        title: "Generated Easy chart",
        durationSeconds: 8,
        analyzerVersion: qualityAnalyzerVersion,
        generatorVersion: chartGeneratorVersion,
        generatorContractVersion: chartGenerationContractVersion,
        difficulty: "easy",
        seed: 0,
        generation: {
          inputBeatCount: 13,
          eligibleBeatCount: 4,
          selectedNoteCount: 4,
          minimumSpacingSeconds:
            chartGenerationRules.difficulties.easy.minimumSpacingSeconds,
          maximumNotesPerMinute:
            chartGenerationRules.difficulties.easy.maximumNotesPerMinute,
          lowConfidenceGuardApplied: false,
        },
        notes: [1, 3, 5, 7].map((timeSeconds) => ({
          timeSeconds,
          lane: 0,
          source: "downbeat",
        })),
      }),
    ).toMatchObject({
      analyzerVersion: qualityAnalyzerVersion,
      generatorVersion: chartGeneratorVersion,
      difficulty: "easy",
    });
  });

  it.each([
    ["wrong generator", { generatorVersion: "difficulty-generator-v2" }],
    ["wrong analyzer", { analyzerVersion: baselineAnalyzerVersion }],
    ["fractional seed", { seed: 0.5 }],
    [
      "mismatched difficulty rules",
      {
        generation: {
          inputBeatCount: 13,
          eligibleBeatCount: 4,
          selectedNoteCount: 4,
          minimumSpacingSeconds: 0.45,
          maximumNotesPerMinute: 48,
          lowConfidenceGuardApplied: false,
        },
      },
    ],
    [
      "eligible beats exceed input beats",
      {
        generation: {
          inputBeatCount: 3,
          eligibleBeatCount: 4,
          selectedNoteCount: 4,
          minimumSpacingSeconds: 0.9,
          maximumNotesPerMinute: 48,
          lowConfidenceGuardApplied: false,
        },
      },
    ],
    [
      "intro note",
      {
        notes: [0.4, 3, 5, 7].map((timeSeconds) => ({
          timeSeconds,
          lane: 0,
          source: "downbeat",
        })),
      },
    ],
    [
      "manual note",
      {
        notes: [1, 3, 5, 7].map((timeSeconds, index) => ({
          timeSeconds,
          lane: 0,
          source: index === 0 ? "manual" : "downbeat",
        })),
      },
    ],
  ])("rejects generated-chart contract violation: %s", (_case, mutation) => {
    const base = {
      schemaVersion,
      kind: "generated_rhythm_chart" as const,
      id: "generated-owned-easy",
      title: "Generated Easy chart",
      durationSeconds: 8,
      analyzerVersion: qualityAnalyzerVersion,
      generatorVersion: chartGeneratorVersion,
      generatorContractVersion: chartGenerationContractVersion,
      difficulty: "easy" as const,
      seed: 0,
      generation: {
        inputBeatCount: 13,
        eligibleBeatCount: 4,
        selectedNoteCount: 4,
        minimumSpacingSeconds:
          chartGenerationRules.difficulties.easy.minimumSpacingSeconds,
        maximumNotesPerMinute:
          chartGenerationRules.difficulties.easy.maximumNotesPerMinute,
        lowConfidenceGuardApplied: false,
      },
      notes: [1, 3, 5, 7].map((timeSeconds) => ({
        timeSeconds,
        lane: 0 as const,
        source: "downbeat" as const,
      })),
    };
    expect(() =>
      generatedRhythmChartSchema.parse({ ...base, ...mutation }),
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

  it("accepts one versioned audio-free chart/result history document", () => {
    const chart = generatedRhythmChartSchema.parse({
      schemaVersion,
      kind: "generated_rhythm_chart",
      id: "generated-owned-easy",
      title: "Generated Easy chart",
      durationSeconds: 8,
      analyzerVersion: qualityAnalyzerVersion,
      generatorVersion: chartGeneratorVersion,
      generatorContractVersion: chartGenerationContractVersion,
      difficulty: "easy",
      seed: 0,
      generation: {
        inputBeatCount: 13,
        eligibleBeatCount: 4,
        selectedNoteCount: 4,
        minimumSpacingSeconds:
          chartGenerationRules.difficulties.easy.minimumSpacingSeconds,
        maximumNotesPerMinute:
          chartGenerationRules.difficulties.easy.maximumNotesPerMinute,
        lowConfidenceGuardApplied: false,
      },
      notes: [1, 3, 5, 7].map((timeSeconds) => ({
        timeSeconds,
        lane: 0,
        source: "downbeat",
      })),
    });
    const playedAt = "2026-07-21T06:00:00.000Z";
    const history = chartHistoryDocumentSchema.parse({
      historyVersion: chartHistoryStorageVersion,
      kind: "chart_result_history",
      entries: [
        {
          entryVersion: chartHistoryEntryVersion,
          kind: "chart_result_history_entry",
          id: `${chart.id}:${playedAt}`,
          savedAtEpochMs: Date.parse(playedAt),
          tempoBpm: 120,
          meter: 4,
          chart,
          result: {
            schemaVersion,
            songId: chart.id,
            chartId: chart.id,
            playedAt,
            calibrationOffsetMilliseconds: 0,
            judgments: chart.notes.map((note, noteIndex) => ({
              noteIndex,
              noteTimeSeconds: note.timeSeconds,
              inputTimeSeconds: null,
              offsetMilliseconds: null,
              judgment: "miss",
            })),
            summary: {
              perfect: 0,
              good: 0,
              miss: chart.notes.length,
              score: 0,
              maxCombo: 0,
              accuracyPercent: 0,
            },
          },
        },
      ],
    });

    expect(history.entries[0]!.chart.notes).toHaveLength(4);
    expect(JSON.stringify(history)).not.toMatch(
      /filename|mime|objecturl|blob:|audio bytes/i,
    );
    expect(() =>
      chartHistoryDocumentSchema.parse({ ...history, filename: "private.wav" }),
    ).toThrow();

    const stored = history.entries[0]!;
    const nestedUnknownFields = [
      { ...stored, filename: "private.wav" },
      { ...stored, chart: { ...stored.chart, filename: "private.wav" } },
      {
        ...stored,
        chart: {
          ...stored.chart,
          notes: stored.chart.notes.map((note, index) =>
            index === 0 ? { ...note, filename: "private.wav" } : note,
          ),
        },
      },
      {
        ...stored,
        chart: {
          ...stored.chart,
          generation: {
            ...stored.chart.generation,
            filename: "private.wav",
          },
        },
      },
      {
        ...stored,
        chart: {
          ...stored.chart,
          correction: {
            editorVersion: correctionEditorVersion,
            correctionContractVersion,
            sourceFingerprint: "abc123",
            revision: 1,
            filename: "private.wav",
          },
        },
      },
      { ...stored, result: { ...stored.result, filename: "private.wav" } },
      {
        ...stored,
        result: {
          ...stored.result,
          judgments: stored.result.judgments.map((judgment, index) =>
            index === 0 ? { ...judgment, filename: "private.wav" } : judgment,
          ),
        },
      },
      {
        ...stored,
        result: {
          ...stored.result,
          summary: { ...stored.result.summary, filename: "private.wav" },
        },
      },
    ];
    for (const invalidEntry of nestedUnknownFields) {
      expect(() =>
        chartHistoryDocumentSchema.parse({
          ...history,
          entries: [invalidEntry],
        }),
      ).toThrow();
    }

    const semanticMismatches = [
      { ...stored, id: "foreign" },
      {
        ...stored,
        result: {
          ...stored.result,
          judgments: stored.result.judgments.slice(1),
        },
      },
      {
        ...stored,
        result: {
          ...stored.result,
          judgments: [
            stored.result.judgments[1]!,
            stored.result.judgments[0]!,
            ...stored.result.judgments.slice(2),
          ],
        },
      },
      {
        ...stored,
        result: {
          ...stored.result,
          judgments: stored.result.judgments.map((judgment, index) =>
            index === 0
              ? { ...judgment, noteTimeSeconds: judgment.noteTimeSeconds + 0.1 }
              : judgment,
          ),
        },
      },
      {
        ...stored,
        result: {
          ...stored.result,
          summary: { ...stored.result.summary, score: 99_999 },
        },
      },
    ];
    for (const invalidEntry of semanticMismatches) {
      expect(() =>
        chartHistoryDocumentSchema.parse({
          ...history,
          entries: [invalidEntry],
        }),
      ).toThrow();
    }

    expect(() =>
      chartHistoryDocumentSchema.parse({
        ...history,
        entries: [stored, stored],
      }),
    ).toThrow();
    const laterPlayedAt = "2026-07-21T06:01:00.000Z";
    const later = {
      ...stored,
      id: `${stored.chart.id}:${laterPlayedAt}`,
      savedAtEpochMs: Date.parse(laterPlayedAt),
      result: { ...stored.result, playedAt: laterPlayedAt },
    };
    expect(() =>
      chartHistoryDocumentSchema.parse({
        ...history,
        entries: [stored, later],
      }),
    ).toThrow();
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

  it("accepts a coherent versioned quality rhythm analysis", () => {
    expect(
      qualityRhythmAnalysisSchema.parse(validQualityAnalysis()),
    ).toMatchObject({
      analyzerVersion: qualityAnalyzerVersion,
      meter: 4,
      warnings: [],
    });
  });

  it("accepts truthful meter uncertainty without invented downbeats", () => {
    const analysis = validQualityAnalysis();
    analysis.meter = null;
    analysis.confidence.downbeat = 0.2;
    analysis.confidence.overall = 0.58;
    analysis.warnings = ["low_confidence", "meter_uncertain"];
    analysis.baselineComparison.fallbackUsed = true;
    analysis.beats = analysis.beats.map((beat) => ({
      ...beat,
      isDownbeat: false,
      positionInBar: null,
    }));

    expect(qualityRhythmAnalysisSchema.parse(analysis)).toMatchObject({
      meter: null,
      warnings: ["low_confidence", "meter_uncertain"],
    });
  });

  it.each([
    [
      "duplicate warnings",
      (analysis: ReturnType<typeof validQualityAnalysis>) => {
        analysis.warnings = ["low_confidence", "low_confidence"];
        analysis.confidence.overall = 0.5;
      },
    ],
    [
      "missing low-confidence warning",
      (analysis: ReturnType<typeof validQualityAnalysis>) => {
        analysis.confidence.overall = 0.5;
      },
    ],
    [
      "selected tempo mismatch",
      (analysis: ReturnType<typeof validQualityAnalysis>) => {
        analysis.tempoCandidates[0]!.bpm = 121;
      },
    ],
    [
      "broken bar-position cycle",
      (analysis: ReturnType<typeof validQualityAnalysis>) => {
        analysis.beats[2]!.positionInBar = 4;
      },
    ],
    [
      "downbeat outside position one",
      (analysis: ReturnType<typeof validQualityAnalysis>) => {
        analysis.beats[1]!.isDownbeat = true;
      },
    ],
    [
      "fallback without uncertainty",
      (analysis: ReturnType<typeof validQualityAnalysis>) => {
        analysis.baselineComparison.fallbackUsed = true;
      },
    ],
    [
      "unreported half-tempo ambiguity",
      (analysis: ReturnType<typeof validQualityAnalysis>) => {
        analysis.tempoCandidates[1] = {
          bpm: 60,
          score: 0.8,
          relation: "half",
        };
      },
    ],
    [
      "incorrect tempo relation",
      (analysis: ReturnType<typeof validQualityAnalysis>) => {
        analysis.tempoCandidates[1]!.relation = "half";
      },
    ],
    [
      "non-canonical warning order",
      (analysis: ReturnType<typeof validQualityAnalysis>) => {
        analysis.meter = null;
        analysis.confidence.downbeat = 0.2;
        analysis.confidence.overall = 0.58;
        analysis.warnings = ["meter_uncertain", "low_confidence"];
        analysis.baselineComparison.fallbackUsed = true;
        analysis.beats = analysis.beats.map((beat) => ({
          ...beat,
          isDownbeat: false,
          positionInBar: null,
        }));
      },
    ],
  ])("rejects quality analysis with %s", (_case, mutate) => {
    const analysis = validQualityAnalysis();
    mutate(analysis);
    expect(() => qualityRhythmAnalysisSchema.parse(analysis)).toThrow();
  });

  it("accepts a compact versioned correction document", () => {
    const document = rhythmCorrectionDocumentSchema.parse({
      storageVersion: correctionStorageVersion,
      kind: "rhythm_correction_document",
      editorVersion: correctionEditorVersion,
      correctionContractVersion,
      sourceFingerprint: "abc123",
      originalAnalyzerVersion: qualityAnalyzerVersion,
      revision: 3,
      operations: [
        { kind: "offset", milliseconds: 50 },
        { kind: "set_meter", meter: 4 },
        { kind: "add_beat", timeSeconds: 6.5 },
      ],
    });

    expect(document.operations).toHaveLength(3);
    expect(JSON.stringify(document)).not.toContain("beats");
    expect(JSON.stringify(document)).not.toContain("filename");
  });

  it("accepts only a strict filename-free completed-grid checkpoint", () => {
    const checkpoint = beatGridCheckpointSchema.parse({
      checkpointVersion: beatGridCheckpointVersion,
      kind: "completed_beat_grid_checkpoint",
      savedAtEpochMs: 1_721_534_400_000,
      sourceFingerprint: "abc123",
      grid: validQualityAnalysis(),
    });

    expect(checkpoint.grid.kind).toBe("quality_rhythm_analysis");
    expect(JSON.stringify(checkpoint)).not.toMatch(
      /filename|mime|objecturl|audio bytes|generated_rhythm_chart/i,
    );
    expect(() =>
      beatGridCheckpointSchema.parse({
        ...checkpoint,
        filename: "private.wav",
      }),
    ).toThrow();
    expect(() =>
      beatGridCheckpointSchema.parse({
        ...checkpoint,
        checkpointVersion: 2,
      }),
    ).toThrow();
    expect(() =>
      beatGridCheckpointSchema.parse({
        ...checkpoint,
        sourceFingerprint: "not a fingerprint!",
      }),
    ).toThrow();
    expect(() =>
      beatGridCheckpointSchema.parse({
        ...checkpoint,
        grid: { ...checkpoint.grid, filename: "private.wav" },
      }),
    ).toThrow();
    expect(() =>
      beatGridCheckpointSchema.parse({
        ...checkpoint,
        grid: {
          ...checkpoint.grid,
          confidence: {
            ...checkpoint.grid.confidence,
            privateRuntime: "retained",
          },
        },
      }),
    ).toThrow();
    expect(() =>
      beatGridCheckpointSchema.parse({
        ...checkpoint,
        grid: {
          ...checkpoint.grid,
          tempoCandidates: checkpoint.grid.tempoCandidates.map(
            (candidate, index) =>
              index === 0
                ? { ...candidate, privateRuntime: "retained" }
                : candidate,
          ),
        },
      }),
    ).toThrow();
    expect(() =>
      beatGridCheckpointSchema.parse({
        ...checkpoint,
        grid: {
          ...checkpoint.grid,
          baselineComparison: {
            ...checkpoint.grid.baselineComparison,
            privateRuntime: "retained",
          },
        },
      }),
    ).toThrow();
    expect(() =>
      beatGridCheckpointSchema.parse({
        ...checkpoint,
        grid: {
          ...checkpoint.grid,
          beats: checkpoint.grid.beats.map((beat, index) =>
            index === 0 ? { ...beat, privateRuntime: "retained" } : beat,
          ),
        },
      }),
    ).toThrow();
  });

  it.each([
    { kind: "offset", milliseconds: 1001 },
    { kind: "tempo_scale", factor: 1 },
    { kind: "set_meter", meter: 5 },
    { kind: "tap_grid", tapTimesSeconds: [1, 0.5, 2] },
    { kind: "tap_grid", tapTimesSeconds: [1, 2] },
  ])("rejects invalid correction operation $kind", (operation) => {
    expect(() => rhythmCorrectionOperationSchema.parse(operation)).toThrow();
  });

  it("rejects a correction revision that does not match its history", () => {
    expect(() =>
      rhythmCorrectionDocumentSchema.parse({
        storageVersion: correctionStorageVersion,
        kind: "rhythm_correction_document",
        editorVersion: correctionEditorVersion,
        correctionContractVersion,
        sourceFingerprint: "abc123",
        originalAnalyzerVersion: qualityAnalyzerVersion,
        revision: 0,
        operations: [{ kind: "offset", milliseconds: 50 }],
      }),
    ).toThrow();
  });

  it("accepts a corrected projection without embedding the source analysis", () => {
    const original = validQualityAnalysis();
    const corrected = correctedRhythmAnalysisSchema.parse({
      schemaVersion,
      kind: "corrected_rhythm_analysis",
      analyzerVersion: qualityAnalyzerVersion,
      editorVersion: correctionEditorVersion,
      correctionContractVersion,
      sourceFingerprint: "abc123",
      revision: 1,
      durationSeconds: original.durationSeconds,
      analysisSampleRate: original.analysisSampleRate,
      tempoBpm: original.tempoBpm,
      meter: original.meter,
      confidence: original.confidence,
      beats: original.beats,
    });

    expect(corrected.kind).toBe("corrected_rhythm_analysis");
    expect(JSON.stringify(corrected)).not.toContain("tempoCandidates");
    expect(JSON.stringify(corrected)).not.toContain("baselineComparison");
  });

  it("rejects corrected projections with broken timing or meter cycles", () => {
    const original = validQualityAnalysis();
    const base = {
      schemaVersion,
      kind: "corrected_rhythm_analysis" as const,
      analyzerVersion: qualityAnalyzerVersion,
      editorVersion: correctionEditorVersion,
      correctionContractVersion,
      sourceFingerprint: "abc123",
      revision: 1,
      durationSeconds: original.durationSeconds,
      analysisSampleRate: original.analysisSampleRate,
      tempoBpm: original.tempoBpm,
      meter: original.meter,
      confidence: original.confidence,
      beats: original.beats,
    };
    expect(() =>
      correctedRhythmAnalysisSchema.parse({
        ...base,
        beats: [base.beats[1], base.beats[0], ...base.beats.slice(2)],
      }),
    ).toThrow();
    expect(() =>
      correctedRhythmAnalysisSchema.parse({
        ...base,
        beats: base.beats.map((beat, index) =>
          index === 2 ? { ...beat, positionInBar: 4 } : beat,
        ),
      }),
    ).toThrow();
    expect(() =>
      correctedRhythmAnalysisSchema.parse({
        ...base,
        beats: base.beats.slice(1, 3).map((beat) => ({
          ...beat,
          isDownbeat: false,
        })),
      }),
    ).toThrow();
  });
});
