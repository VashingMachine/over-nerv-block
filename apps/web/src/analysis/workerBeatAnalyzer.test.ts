import { describe, expect, it, vi } from "vitest";

import {
  baselineAnalyzerVersion,
  qualityAnalyzerVersion,
  schemaVersion,
  type QualityRhythmAnalysis,
} from "@rhythm-game/chart-schema";

import type { DisposableDecodedAudio } from "../localAudio/localAudioDecoder";
import { beatAnalysisProtocolVersion } from "./beatAnalysisProtocol";
import {
  analyzeDecodedAudioInWorker,
  decodedAnalysisFitsBudget,
  maximumDecodedAnalysisChannelSamples,
} from "./workerBeatAnalyzer";
import type { BeatAnalysisBoundaryError } from "./workerBeatAnalyzer";

function validGrid(): QualityRhythmAnalysis {
  return {
    schemaVersion,
    kind: "quality_rhythm_analysis",
    analyzerVersion: qualityAnalyzerVersion,
    durationSeconds: 8,
    analysisSampleRate: 11_025,
    tempoBpm: 120,
    meter: 4,
    confidence: {
      tempo: 0.9,
      beat: 0.8,
      downbeat: 0.82,
      agreement: 1,
      overall: 0.86,
    },
    tempoCandidates: [{ bpm: 120, score: 1, relation: "selected" }],
    warnings: [],
    baselineComparison: {
      analyzerVersion: baselineAnalyzerVersion,
      tempoDeltaBpm: 0,
      beatAgreement: 1,
      fallbackUsed: false,
    },
    beats: [
      { timeSeconds: 1, strength: 1, isDownbeat: true, positionInBar: 1 },
      {
        timeSeconds: 1.5,
        strength: 0.8,
        isDownbeat: false,
        positionInBar: 2,
      },
    ],
  };
}

function decodedAudio(hasSamples = true) {
  const channelData = [
    new Float32Array([0.1, 0.2, 0.3, 0.4]),
    new Float32Array([-0.1, -0.2, -0.3, -0.4]),
  ];
  const buffer = {
    duration: 8,
    length: 4,
    numberOfChannels: 2,
    sampleRate: 48_000,
    copyFromChannel: (destination: Float32Array, channel: number) =>
      destination.set(channelData[channel]!),
  } as unknown as AudioBuffer;
  const release = vi.fn();
  const decoded: DisposableDecodedAudio = {
    durationSeconds: 8,
    numberOfChannels: 2,
    sampleRate: 48_000,
    getAudioBuffer: () => (hasSamples ? buffer : null),
    release,
  };
  return { channelData, decoded, release };
}

class FakeWorker {
  readonly messages: Array<{
    readonly message: unknown;
    readonly transfer?: readonly Transferable[];
  }> = [];
  readonly terminate = vi.fn();
  private readonly listeners = new Map<"message" | "error", Set<EventListener>>(
    [
      ["message", new Set()],
      ["error", new Set()],
    ],
  );

  postMessage(message: unknown, transfer?: Transferable[]) {
    this.messages.push({ message, transfer });
  }

  addEventListener(type: "message" | "error", listener: EventListener) {
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: "message" | "error", listener: EventListener) {
    this.listeners.get(type)!.delete(listener);
  }

  emitMessage(data: unknown) {
    const event = new MessageEvent("message", { data });
    this.listeners.get("message")!.forEach((listener) => listener(event));
  }

  emitError() {
    const event = new Event("error", { cancelable: true });
    this.listeners.get("error")!.forEach((listener) => listener(event));
    return event;
  }

  listenerCount() {
    return (
      this.listeners.get("message")!.size + this.listeners.get("error")!.size
    );
  }

  request() {
    return this.messages[0]!.message as {
      readonly requestId: string;
      readonly input: { readonly channels: readonly ArrayBuffer[] };
    };
  }
}

describe("beat-analysis worker boundary", () => {
  it("accepts the exact decoded channel-sample ceiling and rejects one sample above it", () => {
    expect(
      decodedAnalysisFitsBudget({
        length: maximumDecodedAnalysisChannelSamples / 2,
        numberOfChannels: 2,
      }),
    ).toBe(true);
    expect(
      decodedAnalysisFitsBudget({
        length: maximumDecodedAnalysisChannelSamples / 2 + 1,
        numberOfChannels: 2,
      }),
    ).toBe(false);
  });

  it("copies and transfers channels, releases decoded samples, and validates completion", async () => {
    const worker = new FakeWorker();
    const source = decodedAudio();
    const onProgress = vi.fn();
    const resultPromise = analyzeDecodedAudioInWorker(source.decoded, {
      signal: new AbortController().signal,
      onProgress,
      createWorker: () => worker,
    });

    expect(source.release).toHaveBeenCalledOnce();
    expect(worker.messages).toHaveLength(1);
    expect(worker.messages[0]!.message).toMatchObject({
      protocolVersion: 2,
      type: "analyze",
    });
    expect(worker.request().input.channels).toHaveLength(2);
    expect(worker.messages[0]!.transfer).toHaveLength(2);
    expect(
      Array.from(new Float32Array(worker.request().input.channels[0]!)),
    ).toEqual(Array.from(source.channelData[0]!));

    const requestId = worker.request().requestId;
    worker.emitMessage({
      protocolVersion: beatAnalysisProtocolVersion,
      type: "progress",
      requestId,
      progress: { stage: "tempo", percent: 72 },
    });
    expect(onProgress).toHaveBeenCalledWith({ stage: "tempo", percent: 72 });
    worker.emitMessage({
      protocolVersion: beatAnalysisProtocolVersion,
      type: "complete",
      requestId,
      result: validGrid(),
    });

    await expect(resultPromise).resolves.toEqual(validGrid());
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.listenerCount()).toBe(0);
  });

  it("sends cancellation, terminates once, and rejects promptly", async () => {
    const worker = new FakeWorker();
    const source = decodedAudio();
    const controller = new AbortController();
    const resultPromise = analyzeDecodedAudioInWorker(source.decoded, {
      signal: controller.signal,
      onProgress: vi.fn(),
      createWorker: () => worker,
    });

    controller.abort();

    await expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.messages).toHaveLength(2);
    expect(worker.messages[1]!.message).toMatchObject({
      protocolVersion: beatAnalysisProtocolVersion,
      type: "cancel",
      requestId: worker.request().requestId,
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.listenerCount()).toBe(0);
  });

  it("ignores stale request messages before accepting the current result", async () => {
    const worker = new FakeWorker();
    const source = decodedAudio();
    const resultPromise = analyzeDecodedAudioInWorker(source.decoded, {
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createWorker: () => worker,
    });

    worker.emitMessage({
      protocolVersion: beatAnalysisProtocolVersion,
      type: "complete",
      requestId: "stale-request",
      result: validGrid(),
    });
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.emitMessage({
      protocolVersion: beatAnalysisProtocolVersion,
      type: "complete",
      requestId: worker.request().requestId,
      result: validGrid(),
    });

    await expect(resultPromise).resolves.toEqual(validGrid());
  });

  it.each([
    [
      "malformed progress",
      (requestId: string) => ({
        protocolVersion: beatAnalysisProtocolVersion,
        type: "progress",
        requestId,
        progress: { stage: "private-stage", percent: 999 },
      }),
    ],
    [
      "malformed complete result",
      (requestId: string) => ({
        protocolVersion: beatAnalysisProtocolVersion,
        type: "complete",
        requestId,
        result: { privateWorkerDetail: "not a beat grid" },
      }),
    ],
    [
      "unknown response",
      (requestId: string) => ({
        protocolVersion: beatAnalysisProtocolVersion,
        type: "private-response",
        requestId,
      }),
    ],
  ])(
    "rejects %s with a stable invalid-result error",
    async (_case, response) => {
      const worker = new FakeWorker();
      const source = decodedAudio();
      const resultPromise = analyzeDecodedAudioInWorker(source.decoded, {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        createWorker: () => worker,
      });

      worker.emitMessage(response(worker.request().requestId));

      await expect(resultPromise).rejects.toEqual(
        expect.objectContaining<Partial<BeatAnalysisBoundaryError>>({
          code: "invalid_result",
          message: "Local beat analysis returned an invalid result. Try again.",
        }),
      );
      expect(worker.terminate).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["null payload", null],
    [
      "previous protocol version",
      { protocolVersion: 1, type: "complete", requestId: "any" },
    ],
    [
      "missing request ID",
      { protocolVersion: beatAnalysisProtocolVersion, type: "complete" },
    ],
    [
      "invalid request ID",
      {
        protocolVersion: beatAnalysisProtocolVersion,
        type: "complete",
        requestId: 42,
      },
    ],
    [
      "missing response type",
      { protocolVersion: beatAnalysisProtocolVersion, requestId: "any" },
    ],
  ])("rejects %s instead of leaving analysis pending", async (_case, data) => {
    const worker = new FakeWorker();
    const source = decodedAudio();
    const resultPromise = analyzeDecodedAudioInWorker(source.decoded, {
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createWorker: () => worker,
    });

    worker.emitMessage(data);

    await expect(resultPromise).rejects.toMatchObject({
      code: "invalid_result",
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.listenerCount()).toBe(0);
  });

  it("converts worker errors without exposing platform details", async () => {
    const worker = new FakeWorker();
    const source = decodedAudio();
    const resultPromise = analyzeDecodedAudioInWorker(source.decoded, {
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createWorker: () => worker,
    });

    const event = worker.emitError();

    await expect(resultPromise).rejects.toMatchObject({
      code: "worker_failed",
      message: "Local beat analysis stopped unexpectedly. Try again.",
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it("maps declared analysis failures to stable user messages", async () => {
    const worker = new FakeWorker();
    const source = decodedAudio();
    const resultPromise = analyzeDecodedAudioInWorker(source.decoded, {
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createWorker: () => worker,
    });

    worker.emitMessage({
      protocolVersion: beatAnalysisProtocolVersion,
      type: "error",
      requestId: worker.request().requestId,
      code: "no_onsets",
    });

    await expect(resultPromise).rejects.toMatchObject({
      code: "no_onsets",
      message: "No clear rhythmic onsets were found in this audio.",
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates and cleans listeners if worker posting fails", async () => {
    const worker = new FakeWorker();
    worker.postMessage = vi.fn(() => {
      throw new Error("private post detail");
    });
    const source = decodedAudio();

    await expect(
      analyzeDecodedAudioInWorker(source.decoded, {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        createWorker: () => worker,
      }),
    ).rejects.toMatchObject({
      code: "worker_failed",
      message: "Local beat analysis stopped unexpectedly. Try again.",
    });
    expect(source.release).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.listenerCount()).toBe(0);
  });

  it("releases missing samples without creating a worker", async () => {
    const source = decodedAudio(false);
    const createWorker = vi.fn();

    await expect(
      analyzeDecodedAudioInWorker(source.decoded, {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        createWorker,
      }),
    ).rejects.toMatchObject({ code: "missing_samples" });
    expect(source.release).toHaveBeenCalledOnce();
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("rejects decoded input above the channel-sample budget before copying", async () => {
    const release = vi.fn();
    const copyFromChannel = vi.fn();
    const numberOfChannels = 2;
    const decoded: DisposableDecodedAudio = {
      durationSeconds: 600,
      numberOfChannels,
      sampleRate: 48_000,
      getAudioBuffer: () =>
        ({
          duration: 600,
          length: Math.floor(maximumDecodedAnalysisChannelSamples / 2) + 1,
          numberOfChannels,
          sampleRate: 48_000,
          copyFromChannel,
        }) as unknown as AudioBuffer,
      release,
    };
    const createWorker = vi.fn();

    await expect(
      analyzeDecodedAudioInWorker(decoded, {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        createWorker,
      }),
    ).rejects.toMatchObject({
      code: "analysis_too_large",
      message:
        "This track is too large for safe local beat analysis. Choose a shorter or lower-channel file.",
    });
    expect(copyFromChannel).not.toHaveBeenCalled();
    expect(createWorker).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it("releases samples and reports unavailable worker construction", async () => {
    const source = decodedAudio();

    await expect(
      analyzeDecodedAudioInWorker(source.decoded, {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        createWorker: () => {
          throw new Error("private worker detail");
        },
      }),
    ).rejects.toMatchObject({
      code: "worker_unavailable",
      message:
        "This browser cannot start local beat analysis. Choose another browser.",
    });
    expect(source.release).toHaveBeenCalledOnce();
  });
});
