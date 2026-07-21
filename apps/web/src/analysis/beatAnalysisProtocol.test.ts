import { describe, expect, it } from "vitest";

import {
  beatAnalysisProtocolVersion,
  isBeatAnalysisWorkerRequest,
  responseIdentity,
} from "./beatAnalysisProtocol";

describe("quality analysis protocol v2", () => {
  it("accepts current analyze and cancel requests", () => {
    expect(beatAnalysisProtocolVersion).toBe(2);
    expect(
      isBeatAnalysisWorkerRequest({
        protocolVersion: 2,
        type: "analyze",
        requestId: "current",
        input: {
          channels: [new ArrayBuffer(8)],
          sampleRate: 48_000,
          durationSeconds: 1,
        },
      }),
    ).toBe(true);
    expect(
      isBeatAnalysisWorkerRequest({
        protocolVersion: 2,
        type: "cancel",
        requestId: "current",
      }),
    ).toBe(true);
  });

  it("rejects v1 requests and responses at both sides of the boundary", () => {
    expect(
      isBeatAnalysisWorkerRequest({
        protocolVersion: 1,
        type: "analyze",
        requestId: "old",
        input: {
          channels: [new ArrayBuffer(8)],
          sampleRate: 48_000,
          durationSeconds: 1,
        },
      }),
    ).toBe(false);
    expect(
      responseIdentity({
        protocolVersion: 1,
        type: "complete",
        requestId: "old",
      }),
    ).toBeNull();
  });

  it("rejects malformed current-version analysis input", () => {
    expect(
      isBeatAnalysisWorkerRequest({
        protocolVersion: 2,
        type: "analyze",
        requestId: "malformed",
        input: {
          channels: [],
          sampleRate: Number.NaN,
          durationSeconds: 0,
        },
      }),
    ).toBe(false);
  });
});
