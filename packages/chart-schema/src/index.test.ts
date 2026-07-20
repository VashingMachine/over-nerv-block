import { describe, expect, it } from "vitest";

import { buildManifestSchema, rhythmChartSchema, schemaVersion } from "./index";

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
});
