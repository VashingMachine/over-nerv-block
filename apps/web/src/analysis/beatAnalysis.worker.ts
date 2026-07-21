/// <reference lib="webworker" />

import { BeatAnalysisError } from "./beatAnalyzer";
import {
  beatAnalysisProtocolVersion,
  isBeatAnalysisWorkerRequest,
  type AnalyzeBeatRequest,
  type BeatAnalysisWorkerRequest,
  type BeatAnalysisWorkerResponse,
} from "./beatAnalysisProtocol";
import { analyzeQualityRhythm } from "./qualityBeatAnalyzer";

const workerScope: DedicatedWorkerGlobalScope =
  self as DedicatedWorkerGlobalScope;
const cancelledRequests = new Set<string>();

function post(response: BeatAnalysisWorkerResponse): void {
  workerScope.postMessage(response);
}

const yieldToWorkerQueue = () =>
  new Promise<void>((resolve) => workerScope.setTimeout(resolve, 0));

async function analyze(request: AnalyzeBeatRequest): Promise<void> {
  try {
    const result = await analyzeQualityRhythm(
      {
        channels: request.input.channels.map(
          (buffer) => new Float32Array(buffer),
        ),
        sampleRate: request.input.sampleRate,
        durationSeconds: request.input.durationSeconds,
      },
      {
        isCancelled: () => cancelledRequests.has(request.requestId),
        onProgress: (progress) =>
          post({
            protocolVersion: beatAnalysisProtocolVersion,
            type: "progress",
            requestId: request.requestId,
            progress,
          }),
        yieldControl: yieldToWorkerQueue,
      },
    );
    if (cancelledRequests.has(request.requestId)) {
      post({
        protocolVersion: beatAnalysisProtocolVersion,
        type: "cancelled",
        requestId: request.requestId,
      });
      return;
    }
    post({
      protocolVersion: beatAnalysisProtocolVersion,
      type: "complete",
      requestId: request.requestId,
      result,
    });
  } catch (error) {
    if (
      cancelledRequests.has(request.requestId) ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      post({
        protocolVersion: beatAnalysisProtocolVersion,
        type: "cancelled",
        requestId: request.requestId,
      });
      return;
    }
    post({
      protocolVersion: beatAnalysisProtocolVersion,
      type: "error",
      requestId: request.requestId,
      code: error instanceof BeatAnalysisError ? error.code : "analysis_failed",
    });
  } finally {
    cancelledRequests.delete(request.requestId);
  }
}

workerScope.addEventListener(
  "message",
  (event: MessageEvent<BeatAnalysisWorkerRequest>) => {
    const request: unknown = event.data;
    if (!isBeatAnalysisWorkerRequest(request)) {
      return;
    }
    if (request.type === "cancel") {
      cancelledRequests.add(request.requestId);
      return;
    }
    void analyze(request);
  },
);

export {};
