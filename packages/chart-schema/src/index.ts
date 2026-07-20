import { z } from "zod";

export const schemaVersion = 1 as const;

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
