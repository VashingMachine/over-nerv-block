import { describe, expect, it } from "vitest";

import {
  buildManifestSchema,
  rhythmChartSchema,
  schemaVersion,
  songMetadataSchema,
} from "./index";

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
});
