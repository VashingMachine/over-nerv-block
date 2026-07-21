import {
  qualityRhythmAnalysisSchema,
  type QualityRhythmAnalysis,
} from "@rhythm-game/chart-schema";

import type { DisposableDecodedAudio } from "../localAudio/localAudioDecoder";
import {
  beatAnalysisAttemptTimeoutMilliseconds,
  createBeatAnalysisJobState,
  maximumBeatAnalysisAttempts,
  transitionBeatAnalysisJob,
  type BeatAnalysisJobEvent,
  type BeatAnalysisJobState,
} from "./beatAnalysisStateMachine";
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
  | "analysis_timeout"
  | "invalid_result"
  | BeatAnalysisWorkerErrorCode;

const boundaryMessages: Record<BeatAnalysisBoundaryErrorCode, string> = {
  missing_samples: "Decoded audio is no longer available. Try analysis again.",
  analysis_too_large:
    "This track is too large for safe local beat analysis. Choose a shorter or lower-channel file.",
  worker_unavailable:
    "This browser cannot start local beat analysis. Choose another browser.",
  worker_failed: "Local beat analysis stopped unexpectedly. Try again.",
  analysis_timeout:
    "Local beat analysis took too long. Try again or choose a shorter track.",
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

class WorkerAttemptFailure extends Error {
  constructor(
    readonly boundaryError: BeatAnalysisBoundaryError,
    readonly retryCause: "worker_failed" | "analysis_timeout" | null,
  ) {
    super(boundaryError.message);
    this.name = "WorkerAttemptFailure";
  }
}

function workerAttemptFailure(
  code: BeatAnalysisBoundaryErrorCode,
): WorkerAttemptFailure {
  return new WorkerAttemptFailure(new BeatAnalysisBoundaryError(code), null);
}

function retryableWorkerAttemptFailure(
  code: "worker_failed" | "analysis_timeout",
): WorkerAttemptFailure {
  return new WorkerAttemptFailure(new BeatAnalysisBoundaryError(code), code);
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
  readonly onStateChange?: (state: BeatAnalysisJobState) => void;
  readonly createWorker?: BeatAnalysisWorkerFactory;
  readonly attemptTimeoutMilliseconds?: number;
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

interface WorkerAttemptInput {
  readonly channels: readonly Float32Array[];
  readonly sampleRate: number;
  readonly durationSeconds: number;
}

function runWorkerAttempt(
  input: WorkerAttemptInput,
  requestId: string,
  {
    signal,
    onProgress,
    createWorker,
    timeoutMilliseconds,
  }: {
    readonly signal: AbortSignal;
    readonly onProgress: (progress: BeatAnalysisProgress) => void;
    readonly createWorker: BeatAnalysisWorkerFactory;
    readonly timeoutMilliseconds: number;
  },
): Promise<QualityRhythmAnalysis> {
  if (signal.aborted) {
    return Promise.reject(cancellationError());
  }

  let worker: WorkerLike;
  try {
    worker = createWorker();
  } catch {
    return Promise.reject(new BeatAnalysisBoundaryError("worker_unavailable"));
  }

  let channelBuffers: ArrayBuffer[];
  try {
    channelBuffers = input.channels.map(
      (channel) => channel.slice().buffer as ArrayBuffer,
    );
  } catch {
    worker.terminate();
    return Promise.reject(workerAttemptFailure("worker_failed"));
  }

  const analyzeRequest: BeatAnalysisWorkerRequest = {
    protocolVersion: beatAnalysisProtocolVersion,
    type: "analyze",
    requestId,
    input: {
      channels: channelBuffers,
      sampleRate: input.sampleRate,
      durationSeconds: input.durationSeconds,
    },
  };

  return new Promise<QualityRhythmAnalysis>((resolve, reject) => {
    let finished = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const finish = (outcome: () => void) => {
      if (finished) {
        return;
      }
      finished = true;
      signal.removeEventListener("abort", handleAbort);
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleWorkerError);
      if (timeout !== null) {
        clearTimeout(timeout);
      }
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
      finish(() => reject(retryableWorkerAttemptFailure("worker_failed")));
    };
    const handleTimeout = () => {
      finish(() => reject(retryableWorkerAttemptFailure("analysis_timeout")));
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
          finish(() => reject(workerAttemptFailure("worker_failed")));
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
          finish(() => reject(workerAttemptFailure("worker_failed")));
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
      timeout = setTimeout(handleTimeout, timeoutMilliseconds);
      worker.postMessage(analyzeRequest, channelBuffers);
    } catch {
      finish(() => reject(workerAttemptFailure("worker_failed")));
    }
  });
}

function boundaryError(error: unknown): BeatAnalysisBoundaryError {
  return error instanceof BeatAnalysisBoundaryError
    ? error
    : new BeatAnalysisBoundaryError("worker_failed");
}

/**
 * Consumes `decoded`: every return path releases its sample handle, and callers
 * must not release or read the handle after invoking this function.
 */
export async function analyzeDecodedAudioInWorker(
  decoded: DisposableDecodedAudio,
  {
    signal,
    onProgress,
    onStateChange,
    createWorker = createModuleWorker,
    attemptTimeoutMilliseconds = beatAnalysisAttemptTimeoutMilliseconds,
  }: AnalyzeDecodedAudioOptions,
): Promise<QualityRhythmAnalysis> {
  let state = createBeatAnalysisJobState();
  const publish = () => {
    try {
      onStateChange?.(state);
    } catch {
      // UI observation cannot change the analysis lifecycle.
    }
  };
  const transition = (event: BeatAnalysisJobEvent) => {
    state = transitionBeatAnalysisJob(state, event);
    publish();
  };
  publish();

  const failDuringPreparation = (code: BeatAnalysisBoundaryErrorCode) => {
    transition({ type: "fail", cause: code });
    return new BeatAnalysisBoundaryError(code);
  };

  const audioBuffer = decoded.getAudioBuffer();
  if (!audioBuffer) {
    decoded.release();
    throw failDuringPreparation("missing_samples");
  }
  if (signal.aborted) {
    decoded.release();
    transition({ type: "cancel" });
    throw cancellationError();
  }
  if (!decodedAnalysisFitsBudget(audioBuffer)) {
    decoded.release();
    throw failDuringPreparation("analysis_too_large");
  }
  if (
    !Number.isFinite(attemptTimeoutMilliseconds) ||
    attemptTimeoutMilliseconds <= 0
  ) {
    decoded.release();
    throw failDuringPreparation("invalid_input");
  }

  let channels: Float32Array[];
  try {
    channels = channelCopies(audioBuffer);
  } catch {
    decoded.release();
    throw failDuringPreparation("missing_samples");
  }
  const input: WorkerAttemptInput = {
    channels,
    sampleRate: audioBuffer.sampleRate,
    durationSeconds: decoded.durationSeconds,
  };
  decoded.release();

  for (let attempt = 1; attempt <= maximumBeatAnalysisAttempts; attempt += 1) {
    if (signal.aborted) {
      transition({ type: "cancel" });
      throw cancellationError();
    }
    const requestId = `beat-analysis-${++requestSequence}`;
    transition({ type: "begin_attempt", requestId });
    try {
      const grid = await runWorkerAttempt(input, requestId, {
        signal,
        onProgress,
        createWorker,
        timeoutMilliseconds: attemptTimeoutMilliseconds,
      });
      transition({ type: "succeed" });
      return grid;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        transition({ type: "cancel" });
        throw error;
      }
      const failure =
        error instanceof WorkerAttemptFailure
          ? error.boundaryError
          : boundaryError(error);
      const retryCause =
        error instanceof WorkerAttemptFailure ? error.retryCause : null;
      if (retryCause && attempt < maximumBeatAnalysisAttempts) {
        transition({ type: "retry", cause: retryCause });
        continue;
      }
      transition({ type: "fail", cause: failure.code });
      throw failure;
    }
  }

  throw new BeatAnalysisBoundaryError("worker_failed");
}
