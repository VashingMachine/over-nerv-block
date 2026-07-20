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

export const chartNoteSchema = z.object({
  timeSeconds: z.number().nonnegative(),
  lane: z.literal(0),
  source: z.enum(["manual", "beat", "downbeat", "onset"]),
});

export const rhythmChartSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  id: z.string().min(1),
  title: z.string().min(1),
  durationSeconds: z.number().positive(),
  notes: z.array(chartNoteSchema),
});

export type RhythmChart = z.infer<typeof rhythmChartSchema>;
