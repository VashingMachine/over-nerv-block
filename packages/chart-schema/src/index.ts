import { z } from "zod";

export const schemaVersion = 1 as const;
export const perfectWindowMilliseconds = 50;
export const goodWindowMilliseconds = 120;
export const baselineAnalyzerVersion = "baseline-dsp-v1" as const;
export const qualityAnalyzerVersion = "quality-dsp-v1" as const;
export const qualityAnalysisContractVersion = 1 as const;
export const chartGeneratorVersion = "difficulty-generator-v1" as const;
export const chartGenerationContractVersion = 1 as const;
export const correctionEditorVersion = "correction-editor-v1" as const;
export const correctionContractVersion = 1 as const;
export const correctionStorageVersion = 1 as const;
export const beatGridCheckpointVersion = 1 as const;
export const maximumCorrectionOperations = 256 as const;
export const chartDifficulties = ["easy", "medium", "hard"] as const;
export const chartGenerationRules = {
  introGuardSeconds: 0.5,
  outroGuardSeconds: 0.25,
  lowConfidenceThreshold: 0.6,
  minimumNotes: 2,
  difficulties: {
    easy: {
      minimumSpacingSeconds: 0.9,
      maximumNotesPerMinute: 48,
      minimumStrength: 0.45,
      lowConfidenceMinimumStrength: 0.6,
    },
    medium: {
      minimumSpacingSeconds: 0.45,
      maximumNotesPerMinute: 96,
      minimumStrength: 0.32,
      lowConfidenceMinimumStrength: 0.5,
    },
    hard: {
      minimumSpacingSeconds: 0.24,
      maximumNotesPerMinute: 180,
      minimumStrength: 0.18,
      lowConfidenceMinimumStrength: 0.4,
    },
  },
} as const;
export const qualityAnalysisThresholds = {
  lowOverallConfidence: 0.6,
  maximumUncertainDownbeatConfidence: 0.55,
  halfDoubleAmbiguityScore: 0.72,
  baselineTempoDisagreementBpm: 3,
  minimumBaselineBeatAgreement: 0.85,
  tempoRelationToleranceBpm: 3,
  meterMinimumRelativeRange: 0.1,
  meterMinimumHypothesisScore: 0.42,
  meterMinimumWinningMargin: 0.1,
  meterMinimumCompleteBars: 3,
  meterMinimumStrongBarRatio: 0.75,
  meterMinimumBarContrast: 0.12,
  meterMinimumRawContrastRatio: 0.12,
} as const;
export const rhythmAnalysisWarningOrder = [
  "low_confidence",
  "meter_uncertain",
  "half_double_ambiguous",
  "baseline_disagreement",
] as const;

export function qualityTempoRelation(
  candidateBpm: number,
  selectedBpm: number,
): "selected" | "half" | "double" | "alternate" {
  if (Math.abs(candidateBpm - selectedBpm) <= 0.01) {
    return "selected";
  }
  if (
    Math.abs(candidateBpm * 2 - selectedBpm) <=
    qualityAnalysisThresholds.tempoRelationToleranceBpm
  ) {
    return "half";
  }
  if (
    Math.abs(candidateBpm / 2 - selectedBpm) <=
    qualityAnalysisThresholds.tempoRelationToleranceBpm
  ) {
    return "double";
  }
  return "alternate";
}

export const buildManifestSchema = z.object({
  status: z.literal("ready"),
  app: z.literal("over-nerv-block"),
  version: z.string().min(1),
  environment: z.string().min(1),
  buildIdentifier: z.string().min(1),
  schemaVersion: z.literal(schemaVersion),
  processing: z.literal("browser-local"),
});

export type BuildManifest = z.infer<typeof buildManifestSchema>;

export const songMetadataSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  durationSeconds: z.number().positive(),
  bpm: z.number().positive(),
  audioPath: z.string().min(1),
  license: z.string().min(1),
  provenance: z.string().min(1),
});

export type SongMetadata = z.infer<typeof songMetadataSchema>;

export const chartNoteSchema = z.object({
  timeSeconds: z.number().nonnegative(),
  lane: z.literal(0),
  source: z.enum(["manual", "beat", "downbeat", "onset"]),
});

export const rhythmChartSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    id: z.string().min(1),
    title: z.string().min(1),
    durationSeconds: z.number().positive(),
    notes: z.array(chartNoteSchema),
  })
  .superRefine((chart, context) => {
    chart.notes.forEach((note, index) => {
      if (note.timeSeconds > chart.durationSeconds) {
        context.addIssue({
          code: "custom",
          message: "Chart note falls after the song duration",
          path: ["notes", index, "timeSeconds"],
        });
      }
      if (index > 0 && note.timeSeconds < chart.notes[index - 1]!.timeSeconds) {
        context.addIssue({
          code: "custom",
          message: "Chart notes must be ordered by time",
          path: ["notes", index, "timeSeconds"],
        });
      }
    });
  });

export type RhythmChart = z.infer<typeof rhythmChartSchema>;

export const beatPointSchema = z.object({
  timeSeconds: z.number().nonnegative(),
  strength: z.number().min(0).max(1),
});

export const tempoCandidateSchema = z.object({
  bpm: z.number().min(40).max(240),
  score: z.number().min(0).max(1),
});

export const beatGridSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    kind: z.literal("beat_grid"),
    analyzerVersion: z.literal(baselineAnalyzerVersion),
    durationSeconds: z.number().positive(),
    analysisSampleRate: z.number().int().positive(),
    tempoBpm: z.number().min(40).max(240),
    confidence: z.number().min(0).max(1),
    tempoCandidates: z.array(tempoCandidateSchema).min(1).max(5),
    beats: z.array(beatPointSchema).min(2),
  })
  .superRefine((grid, context) => {
    grid.beats.forEach((beat, index) => {
      if (beat.timeSeconds > grid.durationSeconds) {
        context.addIssue({
          code: "custom",
          message: "Beat falls after the analyzed audio duration",
          path: ["beats", index, "timeSeconds"],
        });
      }
      if (index > 0 && beat.timeSeconds <= grid.beats[index - 1]!.timeSeconds) {
        context.addIssue({
          code: "custom",
          message: "Beats must be strictly ordered without duplicates",
          path: ["beats", index, "timeSeconds"],
        });
      }
    });

    grid.tempoCandidates.forEach((candidate, index) => {
      if (
        index > 0 &&
        candidate.score > grid.tempoCandidates[index - 1]!.score
      ) {
        context.addIssue({
          code: "custom",
          message: "Tempo candidates must be ordered by descending score",
          path: ["tempoCandidates", index, "score"],
        });
      }
    });
  });

export type BeatPoint = z.infer<typeof beatPointSchema>;
export type TempoCandidate = z.infer<typeof tempoCandidateSchema>;
export type BeatGrid = z.infer<typeof beatGridSchema>;

export const rhythmAnalysisWarningSchema = z.enum(rhythmAnalysisWarningOrder);

export const confidenceComponentsSchema = z
  .object({
    tempo: z.number().min(0).max(1),
    beat: z.number().min(0).max(1),
    downbeat: z.number().min(0).max(1),
    agreement: z.number().min(0).max(1),
    overall: z.number().min(0).max(1),
  })
  .strict();

export const qualityBeatPointSchema = beatPointSchema
  .extend({
    isDownbeat: z.boolean(),
    positionInBar: z.number().int().min(1).max(4).nullable(),
  })
  .strict();

export const qualityTempoCandidateSchema = tempoCandidateSchema
  .extend({
    relation: z.enum(["selected", "half", "double", "alternate"]),
  })
  .strict();

export const baselineComparisonSchema = z
  .object({
    analyzerVersion: z.literal(baselineAnalyzerVersion),
    tempoDeltaBpm: z.number().nonnegative(),
    beatAgreement: z.number().min(0).max(1),
    fallbackUsed: z.boolean(),
  })
  .strict();

export const qualityRhythmAnalysisSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    kind: z.literal("quality_rhythm_analysis"),
    analyzerVersion: z.literal(qualityAnalyzerVersion),
    durationSeconds: z.number().positive(),
    analysisSampleRate: z.number().int().positive(),
    tempoBpm: z.number().min(40).max(240),
    meter: z.union([z.literal(3), z.literal(4)]).nullable(),
    confidence: confidenceComponentsSchema,
    tempoCandidates: z.array(qualityTempoCandidateSchema).min(1).max(5),
    warnings: z.array(rhythmAnalysisWarningSchema).max(4),
    baselineComparison: baselineComparisonSchema,
    beats: z.array(qualityBeatPointSchema).min(2),
  })
  .strict()
  .superRefine((analysis, context) => {
    analysis.beats.forEach((beat, index) => {
      if (beat.timeSeconds > analysis.durationSeconds) {
        context.addIssue({
          code: "custom",
          message: "Beat falls after the analyzed audio duration",
          path: ["beats", index, "timeSeconds"],
        });
      }
      if (
        index > 0 &&
        beat.timeSeconds <= analysis.beats[index - 1]!.timeSeconds
      ) {
        context.addIssue({
          code: "custom",
          message: "Beats must be strictly ordered without duplicates",
          path: ["beats", index, "timeSeconds"],
        });
      }
    });

    analysis.tempoCandidates.forEach((candidate, index) => {
      if (
        index > 0 &&
        candidate.score > analysis.tempoCandidates[index - 1]!.score
      ) {
        context.addIssue({
          code: "custom",
          message: "Tempo candidates must be ordered by descending score",
          path: ["tempoCandidates", index, "score"],
        });
      }
      if (
        candidate.relation !==
        qualityTempoRelation(candidate.bpm, analysis.tempoBpm)
      ) {
        context.addIssue({
          code: "custom",
          message: "Tempo candidate relation must match the selected tempo",
          path: ["tempoCandidates", index, "relation"],
        });
      }
    });
    const selectedCandidates = analysis.tempoCandidates.filter(
      (candidate) => candidate.relation === "selected",
    );
    if (
      selectedCandidates.length !== 1 ||
      Math.abs((selectedCandidates[0]?.bpm ?? 0) - analysis.tempoBpm) > 0.01
    ) {
      context.addIssue({
        code: "custom",
        message: "Exactly one selected tempo candidate must match the tempo",
        path: ["tempoCandidates"],
      });
    }

    const uniqueWarnings = new Set(analysis.warnings);
    if (uniqueWarnings.size !== analysis.warnings.length) {
      context.addIssue({
        code: "custom",
        message: "Analysis warnings must be unique",
        path: ["warnings"],
      });
    }

    const expectedWarnings = rhythmAnalysisWarningOrder.filter((warning) => {
      if (warning === "low_confidence") {
        return (
          analysis.confidence.overall <
          qualityAnalysisThresholds.lowOverallConfidence
        );
      }
      if (warning === "meter_uncertain") {
        return analysis.meter === null;
      }
      if (warning === "half_double_ambiguous") {
        return analysis.tempoCandidates.some(
          (candidate) =>
            (candidate.relation === "half" ||
              candidate.relation === "double") &&
            candidate.score >=
              qualityAnalysisThresholds.halfDoubleAmbiguityScore,
        );
      }
      return (
        analysis.baselineComparison.tempoDeltaBpm >
          qualityAnalysisThresholds.baselineTempoDisagreementBpm ||
        analysis.baselineComparison.beatAgreement <
          qualityAnalysisThresholds.minimumBaselineBeatAgreement
      );
    });
    if (
      analysis.warnings.length !== expectedWarnings.length ||
      analysis.warnings.some(
        (warning, index) => warning !== expectedWarnings[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Analysis warnings must match their thresholds in canonical order",
        path: ["warnings"],
      });
    }

    if (analysis.meter === null) {
      if (
        analysis.beats.some(
          (beat) => beat.isDownbeat || beat.positionInBar !== null,
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Uncertain meter cannot contain downbeats or bar positions",
          path: ["beats"],
        });
      }
      if (
        analysis.confidence.downbeat >=
        qualityAnalysisThresholds.maximumUncertainDownbeatConfidence
      ) {
        context.addIssue({
          code: "custom",
          message: "Uncertain meter requires low downbeat confidence",
          path: ["confidence", "downbeat"],
        });
      }
    } else {
      analysis.beats.forEach((beat, index) => {
        if (
          beat.positionInBar === null ||
          beat.positionInBar > analysis.meter!
        ) {
          context.addIssue({
            code: "custom",
            message: "Metered beats require a valid bar position",
            path: ["beats", index, "positionInBar"],
          });
          return;
        }
        if (beat.isDownbeat !== (beat.positionInBar === 1)) {
          context.addIssue({
            code: "custom",
            message: "Downbeats must be the first beat in each bar",
            path: ["beats", index, "isDownbeat"],
          });
        }
        if (index > 0) {
          const previous = analysis.beats[index - 1]!.positionInBar;
          const expected = previous === analysis.meter ? 1 : previous! + 1;
          if (beat.positionInBar !== expected) {
            context.addIssue({
              code: "custom",
              message: "Bar positions must advance cyclically",
              path: ["beats", index, "positionInBar"],
            });
          }
        }
      });
      if (!analysis.beats.some((beat) => beat.isDownbeat)) {
        context.addIssue({
          code: "custom",
          message: "A metered analysis requires at least one downbeat",
          path: ["beats"],
        });
      }
    }

    if (
      analysis.baselineComparison.fallbackUsed !==
      (analysis.meter === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Baseline fallback must match metrical uncertainty",
        path: ["baselineComparison", "fallbackUsed"],
      });
    }
  });

export type RhythmAnalysisWarning = z.infer<typeof rhythmAnalysisWarningSchema>;
export type ConfidenceComponents = z.infer<typeof confidenceComponentsSchema>;
export type QualityBeatPoint = z.infer<typeof qualityBeatPointSchema>;
export type QualityTempoCandidate = z.infer<typeof qualityTempoCandidateSchema>;
export type QualityRhythmAnalysis = z.infer<typeof qualityRhythmAnalysisSchema>;

export const beatGridCheckpointSchema = z
  .object({
    checkpointVersion: z.literal(beatGridCheckpointVersion),
    kind: z.literal("completed_beat_grid_checkpoint"),
    savedAtEpochMs: z.number().int().nonnegative(),
    sourceFingerprint: z.string().regex(/^[0-9a-z]+$/),
    grid: qualityRhythmAnalysisSchema,
  })
  .strict();

export type BeatGridCheckpoint = z.infer<typeof beatGridCheckpointSchema>;

const correctionBeatTimeSchema = z.number().nonnegative();

export const rhythmCorrectionOperationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("offset"),
      milliseconds: z.number().int().min(-1000).max(1000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("tempo_scale"),
      factor: z.union([z.literal(0.5), z.literal(2)]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("set_meter"),
      meter: z.union([z.literal(3), z.literal(4)]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("first_downbeat"),
      timeSeconds: correctionBeatTimeSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("tap_grid"),
      tapTimesSeconds: z.array(correctionBeatTimeSchema).min(3).max(16),
    })
    .strict()
    .superRefine((operation, context) => {
      operation.tapTimesSeconds.forEach((time, index) => {
        if (index > 0 && time <= operation.tapTimesSeconds[index - 1]!) {
          context.addIssue({
            code: "custom",
            message: "Tap times must be strictly increasing",
            path: ["tapTimesSeconds", index],
          });
        }
      });
    }),
  z
    .object({
      kind: z.literal("add_beat"),
      timeSeconds: correctionBeatTimeSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("remove_beat"),
      timeSeconds: correctionBeatTimeSchema,
    })
    .strict(),
]);

export const rhythmCorrectionDocumentSchema = z
  .strictObject({
    storageVersion: z.literal(correctionStorageVersion),
    kind: z.literal("rhythm_correction_document"),
    editorVersion: z.literal(correctionEditorVersion),
    correctionContractVersion: z.literal(correctionContractVersion),
    sourceFingerprint: z.string().regex(/^[a-z0-9]+$/),
    originalAnalyzerVersion: z.literal(qualityAnalyzerVersion),
    revision: z.number().int().nonnegative(),
    operations: z
      .array(rhythmCorrectionOperationSchema)
      .max(maximumCorrectionOperations),
  })
  .superRefine((document, context) => {
    if (document.revision !== document.operations.length) {
      context.addIssue({
        code: "custom",
        message: "Correction revision must equal the operation count",
        path: ["revision"],
      });
    }
  });

export const correctedRhythmAnalysisSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    kind: z.literal("corrected_rhythm_analysis"),
    analyzerVersion: z.literal(qualityAnalyzerVersion),
    editorVersion: z.literal(correctionEditorVersion),
    correctionContractVersion: z.literal(correctionContractVersion),
    sourceFingerprint: z.string().regex(/^[a-z0-9]+$/),
    revision: z.number().int().nonnegative(),
    durationSeconds: z.number().positive(),
    analysisSampleRate: z.number().int().positive(),
    tempoBpm: z.number().min(40).max(240),
    meter: z.union([z.literal(3), z.literal(4)]).nullable(),
    confidence: confidenceComponentsSchema,
    beats: z.array(qualityBeatPointSchema).min(2),
  })
  .superRefine((analysis, context) => {
    analysis.beats.forEach((beat, index) => {
      if (beat.timeSeconds > analysis.durationSeconds) {
        context.addIssue({
          code: "custom",
          message: "Corrected beat falls after the audio duration",
          path: ["beats", index, "timeSeconds"],
        });
      }
      if (
        index > 0 &&
        beat.timeSeconds <= analysis.beats[index - 1]!.timeSeconds
      ) {
        context.addIssue({
          code: "custom",
          message: "Corrected beats must be strictly ordered",
          path: ["beats", index, "timeSeconds"],
        });
      }
      if (analysis.meter === null) {
        if (beat.isDownbeat || beat.positionInBar !== null) {
          context.addIssue({
            code: "custom",
            message: "An uncertain corrected meter cannot assert bar positions",
            path: ["beats", index],
          });
        }
        return;
      }
      if (beat.positionInBar === null || beat.positionInBar > analysis.meter) {
        context.addIssue({
          code: "custom",
          message: "Corrected metered beats require a valid bar position",
          path: ["beats", index, "positionInBar"],
        });
        return;
      }
      if (beat.isDownbeat !== (beat.positionInBar === 1)) {
        context.addIssue({
          code: "custom",
          message: "Corrected downbeats must be position one",
          path: ["beats", index, "isDownbeat"],
        });
      }
      if (index > 0) {
        const previous = analysis.beats[index - 1]!.positionInBar!;
        const expected = previous === analysis.meter ? 1 : previous + 1;
        if (beat.positionInBar !== expected) {
          context.addIssue({
            code: "custom",
            message: "Corrected bar positions must advance cyclically",
            path: ["beats", index, "positionInBar"],
          });
        }
      }
    });
    if (
      analysis.meter !== null &&
      !analysis.beats.some((beat) => beat.isDownbeat)
    ) {
      context.addIssue({
        code: "custom",
        message: "A corrected metered analysis requires a downbeat",
        path: ["beats"],
      });
    }
  });

export const generationRhythmAnalysisSchema = z.union([
  qualityRhythmAnalysisSchema,
  correctedRhythmAnalysisSchema,
]);

export type RhythmCorrectionOperation = z.infer<
  typeof rhythmCorrectionOperationSchema
>;
export type RhythmCorrectionDocument = z.infer<
  typeof rhythmCorrectionDocumentSchema
>;
export type CorrectedRhythmAnalysis = z.infer<
  typeof correctedRhythmAnalysisSchema
>;
export type GenerationRhythmAnalysis = z.infer<
  typeof generationRhythmAnalysisSchema
>;

export const chartDifficultySchema = z.enum(chartDifficulties);

const generatedChartIdentitySchema = z.object({
  kind: z.literal("generated_rhythm_chart"),
  analyzerVersion: z.literal(qualityAnalyzerVersion),
  generatorVersion: z.literal(chartGeneratorVersion),
  generatorContractVersion: z.literal(chartGenerationContractVersion),
  difficulty: chartDifficultySchema,
  seed: z.number().int().nonnegative(),
  correction: z
    .object({
      editorVersion: z.literal(correctionEditorVersion),
      correctionContractVersion: z.literal(correctionContractVersion),
      sourceFingerprint: z.string().regex(/^[a-z0-9]+$/),
      revision: z.number().int().positive(),
    })
    .optional(),
  generation: z.object({
    inputBeatCount: z.number().int().min(2),
    eligibleBeatCount: z.number().int().nonnegative(),
    selectedNoteCount: z.number().int().min(chartGenerationRules.minimumNotes),
    minimumSpacingSeconds: z.number().positive(),
    maximumNotesPerMinute: z.number().positive(),
    lowConfidenceGuardApplied: z.boolean(),
  }),
});

export const generatedRhythmChartSchema = rhythmChartSchema
  .and(generatedChartIdentitySchema)
  .superRefine((chart, context) => {
    const rules = chartGenerationRules.difficulties[chart.difficulty];
    if (chart.generation.selectedNoteCount !== chart.notes.length) {
      context.addIssue({
        code: "custom",
        message: "Selected-note count must match the generated chart",
        path: ["generation", "selectedNoteCount"],
      });
    }
    if (chart.generation.eligibleBeatCount < chart.notes.length) {
      context.addIssue({
        code: "custom",
        message: "Eligible-beat count cannot be lower than selected notes",
        path: ["generation", "eligibleBeatCount"],
      });
    }
    if (chart.generation.eligibleBeatCount > chart.generation.inputBeatCount) {
      context.addIssue({
        code: "custom",
        message: "Eligible-beat count cannot exceed input beats",
        path: ["generation", "eligibleBeatCount"],
      });
    }
    if (
      chart.generation.minimumSpacingSeconds !== rules.minimumSpacingSeconds ||
      chart.generation.maximumNotesPerMinute !== rules.maximumNotesPerMinute
    ) {
      context.addIssue({
        code: "custom",
        message: "Generated-chart rules must match the declared difficulty",
        path: ["generation"],
      });
    }

    chart.notes.forEach((note, index) => {
      if (note.source === "manual") {
        context.addIssue({
          code: "custom",
          message: "An automatic chart cannot contain manual notes",
          path: ["notes", index, "source"],
        });
      }
      if (
        note.timeSeconds < chartGenerationRules.introGuardSeconds ||
        note.timeSeconds >
          chart.durationSeconds - chartGenerationRules.outroGuardSeconds
      ) {
        context.addIssue({
          code: "custom",
          message: "Generated note falls inside an intro or outro guard",
          path: ["notes", index, "timeSeconds"],
        });
      }
      if (
        index > 0 &&
        note.timeSeconds - chart.notes[index - 1]!.timeSeconds <
          rules.minimumSpacingSeconds - 0.000_001
      ) {
        context.addIssue({
          code: "custom",
          message: "Generated notes violate minimum spacing",
          path: ["notes", index, "timeSeconds"],
        });
      }
    });

    const density = chart.notes.length / (chart.durationSeconds / 60);
    if (density > rules.maximumNotesPerMinute + 0.000_001) {
      context.addIssue({
        code: "custom",
        message: "Generated chart exceeds maximum density",
        path: ["notes"],
      });
    }
  });

export type ChartDifficulty = z.infer<typeof chartDifficultySchema>;
export type GeneratedRhythmChart = z.infer<typeof generatedRhythmChartSchema>;

export const judgmentSchema = z.enum(["perfect", "good", "miss"]);

export const noteJudgmentSchema = z
  .object({
    noteIndex: z.number().int().nonnegative(),
    noteTimeSeconds: z.number().nonnegative(),
    inputTimeSeconds: z.number().nonnegative().nullable(),
    offsetMilliseconds: z.number().nullable(),
    judgment: judgmentSchema,
  })
  .superRefine((record, context) => {
    if (record.judgment === "miss") {
      if (
        record.inputTimeSeconds !== null ||
        record.offsetMilliseconds !== null
      ) {
        context.addIssue({
          code: "custom",
          message: "A missed note cannot contain input timing",
          path: ["judgment"],
        });
      }
      return;
    }

    if (
      record.inputTimeSeconds === null ||
      record.offsetMilliseconds === null
    ) {
      context.addIssue({
        code: "custom",
        message: "A hit judgment requires input timing",
        path: ["judgment"],
      });
      return;
    }

    const expectedOffset =
      Math.round(
        (record.inputTimeSeconds - record.noteTimeSeconds) * 1_000_000_000,
      ) / 1_000_000;
    if (Math.abs(expectedOffset - record.offsetMilliseconds) > 0.000_001) {
      context.addIssue({
        code: "custom",
        message: "Judgment offset must match note and input time",
        path: ["offsetMilliseconds"],
      });
    }

    const distance = Math.abs(record.offsetMilliseconds);
    const expectedJudgment =
      distance <= perfectWindowMilliseconds
        ? "perfect"
        : distance <= goodWindowMilliseconds
          ? "good"
          : "miss";
    if (record.judgment !== expectedJudgment) {
      context.addIssue({
        code: "custom",
        message: "Judgment label does not match its timing offset",
        path: ["judgment"],
      });
    }
  });

export const resultSummarySchema = z.object({
  perfect: z.number().int().nonnegative(),
  good: z.number().int().nonnegative(),
  miss: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
  maxCombo: z.number().int().nonnegative(),
  accuracyPercent: z.number().min(0).max(100),
});

export const gameResultSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    songId: z.string().min(1),
    chartId: z.string().min(1),
    playedAt: z.string().datetime(),
    calibrationOffsetMilliseconds: z.number().int().min(-250).max(250),
    judgments: z.array(noteJudgmentSchema),
    summary: resultSummarySchema,
  })
  .superRefine((result, context) => {
    const noteIndexes = new Set<number>();
    result.judgments.forEach((record, index) => {
      if (noteIndexes.has(record.noteIndex)) {
        context.addIssue({
          code: "custom",
          message: "A result cannot judge the same note twice",
          path: ["judgments", index, "noteIndex"],
        });
      }
      noteIndexes.add(record.noteIndex);
    });
  });

export type NoteJudgment = z.infer<typeof noteJudgmentSchema>;
export type ResultSummary = z.infer<typeof resultSummarySchema>;
export type GameResult = z.infer<typeof gameResultSchema>;
