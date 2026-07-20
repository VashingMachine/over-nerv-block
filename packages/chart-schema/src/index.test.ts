import { describe, expect, it } from "vitest";

import {
  rhythmChartSchema,
  schemaVersion,
  systemHealthSchema,
  systemVersionSchema,
} from "./index";

describe("shared contracts", () => {
  it("accepts the system heartbeat contracts", () => {
    expect(
      systemHealthSchema.parse({
        status: "ok",
        service: "api",
        environment: "test",
        version: "0.1.0",
        commit: "abc123",
      }),
    ).toMatchObject({ status: "ok" });

    expect(
      systemVersionSchema.parse({
        name: "over-nerv-block-api",
        version: "0.1.0",
        environment: "test",
        commit: "abc123",
        schemaVersion,
      }),
    ).toMatchObject({ schemaVersion });
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
