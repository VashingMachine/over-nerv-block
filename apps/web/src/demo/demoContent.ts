import {
  rhythmChartSchema,
  songMetadataSchema,
} from "@rhythm-game/chart-schema";

export const demoSong = songMetadataSchema.parse({
  id: "circuit-pulse",
  title: "Circuit Pulse",
  artist: "Over Nerv Block",
  durationSeconds: 8,
  bpm: 120,
  audioPath: "audio/demo-pulse.wav",
  license: "CC0-1.0",
  provenance: "Original percussion synthesized by this repository",
});

export const demoChart = rhythmChartSchema.parse({
  schemaVersion: 1,
  id: "circuit-pulse-demo",
  title: "Circuit Pulse — one-lane demo",
  durationSeconds: demoSong.durationSeconds,
  notes: Array.from({ length: 13 }, (_, index) => ({
    timeSeconds: 1 + index * 0.5,
    lane: 0 as const,
    source: index % 4 === 0 ? ("downbeat" as const) : ("beat" as const),
  })),
});

export const countdownSeconds = (60 / demoSong.bpm) * 3;
