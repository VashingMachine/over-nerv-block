import {
  qualityRhythmAnalysisSchema,
  type QualityRhythmAnalysis,
} from "@rhythm-game/chart-schema";

import type { DisposableDecodedAudio } from "../localAudio/localAudioDecoder";
import type { BeatAnalysisProgress } from "./beatAnalyzer";
import {
  beatAnalysisProtocolVersion,
  isBeatAnalysisProgress,
  responseIdentity,
  type BeatAnalysisWorkerErrorCode,
  type BeatAnalysisWorkerRequest,
} from "./beatAnalysisProtocol";

export type BeatAnalysisBoundaryErrorCode =
  | "missing_samples"
  | "analysis_too_large"
  | "worker_unavailable"
  | "worker_failed"
  | "invalid_result"
  | BeatAnalysisWorkerErrorCode;

const boundaryMessages: Record<BeatAnalysisBoundaryErrorCode, string> = {
  missing_samples: "Decoded audio is no longer available. Try analysis again.",
  analysis_too_large:
    "This track is too large for safe local beat analysis. Choose a shorter or lower-channel file.",
  worker_unavailable:
    "This browser cannot start local beat analysis. Choose another browser.",
  worker_failed: "Local beat analysis stopped unexpectedly. Try again.",
  invalid_result: "Local beat analysis returned an invalid result. Try again.",
  invalid_input: "The decoded audio is not valid for analysis.",
  insufficient_audio: "This audio is too short for beat analysis.",
  no_onsets: "No clear rhythmic onsets were found in this audio.",
  no_tempo: "A stable baseline tempo could not be estimated.",
  no_beats: "A stable baseline beat grid could not be tracked.",
  analysis_failed: "Local beat analysis could not finish. Try again.",
};

export class BeatAnalysisBoundaryError extends Error {
  constructor(readonly code: BeatAnalysisBoundaryErrorCode) {
    super(boundaryMessages[code]);
    this.name = "BeatAnalysisBoundaryError";
  }
}

interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  addEventListener(type: "message" | "error", listener: EventListener): void;
  removeEventListener(type: "message" | "error", listener: EventListener): void;
}

export type BeatAnalysisWorkerFactory = () => WorkerLike;

export interface AnalyzeDecodedAudioOptions {
  readonly signal: AbortSignal;
  readonly onProgress: (progress: BeatAnalysisProgress) => void;
  readonly createWorker?: BeatAnalysisWorkerFactory;
}

const createModuleWorker: BeatAnalysisWorkerFactory = () =>
  new Worker(new URL("./beatAnalysis.worker.ts", import.meta.url), {
    type: "module",
    name: "quality-rhythm-analysis",
  });

let requestSequence = 0;

export const maximumDecodedAnalysisChannelSamples = 24_000_000;

function cancellationError(): DOMException {
  return new DOMException("Beat analysis was cancelled", "AbortError");
}

function channelCopies(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (
    let channelIndex = 0;
    channelIndex < buffer.numberOfChannels;
    channelIndex += 1
  ) {
    const channel = new Float32Array(buffer.length);
    buffer.copyFromChannel(channel, channelIndex);
    channels.push(channel);
  }
  return channels;
}

export function decodedAnalysisFitsBudget(
  buffer: Pick<AudioBuffer, "length" | "numberOfChannels">,
): boolean {
  const channelSamples = buffer.length * buffer.numberOfChannels;
  return (
    Number.isSafeInteger(channelSamples) &&
    channelSamples > 0 &&
    channelSamples <= maximumDecodedAnalysisChannelSamples
  );
}

/**
 * Consumes `decoded`: every return path releases its sample handle, and callers
 * must not release or read the handle after invoking this function.
 */
export function analyzeDecodedAudioInWorker(
  decoded: DisposableDecodedAudio,
  {
    signal,
    onProgress,
    createWorker = createModuleWorker,
  }: AnalyzeDecodedAudioOptions,
): Promise<QualityRhythmAnalysis> {
  const audioBuffer = decoded.getAudioBuffer();
  if (!audioBuffer) {
    decoded.release();
    return Promise.reject(new BeatAnalysisBoundaryError("missing_samples"));
  }
  if (signal.aborted) {
    decoded.release();
    return Promise.reject(cancellationError());
  }
  if (!decodedAnalysisFitsBudget(audioBuffer)) {
    decoded.release();
    return Promise.reject(new BeatAnalysisBoundaryError("analysis_too_large"));
  }

  let channels: Float32Array[];
  try {
    channels = channelCopies(audioBuffer);
  } catch {
    decoded.release();
    return Promise.reject(new BeatAnalysisBoundaryError("missing_samples"));
  }
  decoded.release();

  let worker: WorkerLike;
  try {
    worker = createWorker();
  } catch {
    return Promise.reject(new BeatAnalysisBoundaryError("worker_unavailable"));
  }

  const requestId = `beat-analysis-${++requestSequence}`;
  const channelBuffers = channels.map(
    (channel) => channel.buffer as ArrayBuffer,
  );
  const analyzeRequest: BeatAnalysisWorkerRequest = {
    protocolVersion: beatAnalysisProtocolVersion,
    type: "analyze",
    requestId,
    input: {
      channels: channelBuffers,
      sampleRate: audioBuffer.sampleRate,
      durationSeconds: decoded.durationSeconds,
    },
  };

  return new Promise<QualityRhythmAnalysis>((resolve, reject) => {
    let finished = false;
    const finish = (outcome: () => void) => {
      if (finished) {
        return;
      }
      finished = true;
      signal.removeEventListener("abort", handleAbort);
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleWorkerError);
      worker.terminate();
      outcome();
    };
    const handleAbort = () => {
      try {
        worker.postMessage({
          protocolVersion: beatAnalysisProtocolVersion,
          type: "cancel",
          requestId,
        } satisfies BeatAnalysisWorkerRequest);
      } catch {
        // Termination below remains the authoritative cancellation boundary.
      }
      finish(() => reject(cancellationError()));
    };
    const handleWorkerError: EventListener = (event) => {
      event.preventDefault();
      finish(() => reject(new BeatAnalysisBoundaryError("worker_failed")));
    };
    const handleMessage: EventListener = (event) => {
      const data = (event as MessageEvent<unknown>).data;
      const identity = responseIdentity(data);
      if (!identity) {
        finish(() => reject(new BeatAnalysisBoundaryError("invalid_result")));
        return;
      }
      if (identity.requestId !== requestId) {
        return;
      }
      const response = data as Record<string, unknown>;
      if (identity.type === "progress") {
        if (!isBeatAnalysisProgress(response.progress)) {
          finish(() => reject(new BeatAnalysisBoundaryError("invalid_result")));
          return;
        }
        try {
          onProgress(response.progress);
        } catch {
          finish(() => reject(new BeatAnalysisBoundaryError("worker_failed")));
        }
        return;
      }
      if (identity.type === "complete") {
        const parsed = qualityRhythmAnalysisSchema.safeParse(response.result);
        if (!parsed.success) {
          finish(() => reject(new BeatAnalysisBoundaryError("invalid_result")));
          return;
        }
        finish(() => resolve(parsed.data));
        return;
      }
      if (identity.type === "cancelled") {
        finish(() => reject(cancellationError()));
        return;
      }
      if (identity.type === "error") {
        const code = response.code;
        if (
          typeof code !== "string" ||
          !Object.hasOwn(boundaryMessages, code)
        ) {
          finish(() => reject(new BeatAnalysisBoundaryError("worker_failed")));
          return;
        }
        finish(() =>
          reject(
            new BeatAnalysisBoundaryError(
              code as BeatAnalysisBoundaryErrorCode,
            ),
          ),
        );
        return;
      }
      finish(() => reject(new BeatAnalysisBoundaryError("invalid_result")));
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleWorkerError);
    signal.addEventListener("abort", handleAbort, { once: true });
    try {
      worker.postMessage(analyzeRequest, channelBuffers);
    } catch {
      finish(() => reject(new BeatAnalysisBoundaryError("worker_failed")));
    }
  });
}
