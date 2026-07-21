import { z } from "zod";

export const schemaVersion = 1 as const;
export const perfectWindowMilliseconds = 50;
export const goodWindowMilliseconds = 120;
export const baselineAnalyzerVersion = "baseline-dsp-v1" as const;

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
