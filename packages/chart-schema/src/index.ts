import { z } from "zod";

export const schemaVersion = 1 as const;

export const systemHealthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
  environment: z.string().min(1),
  version: z.string().min(1),
  commit: z.string().min(1),
});

export type SystemHealth = z.infer<typeof systemHealthSchema>;

export const systemVersionSchema = z.object({
  name: z.literal("over-nerv-block-api"),
  version: z.string().min(1),
  environment: z.string().min(1),
  commit: z.string().min(1),
  schemaVersion: z.literal(schemaVersion),
});

export type SystemVersion = z.infer<typeof systemVersionSchema>;

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
