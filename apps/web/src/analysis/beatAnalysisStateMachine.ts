import type { BeatAnalysisBoundaryErrorCode } from "./workerBeatAnalyzer";

export const maximumBeatAnalysisAttempts = 2 as const;
export const beatAnalysisAttemptTimeoutMilliseconds = 90_000 as const;

type TerminalPhase = "succeeded" | "failed" | "timed_out" | "cancelled";

export type BeatAnalysisJobState =
  | {
      readonly phase: "preparing";
      readonly attempt: 0;
      readonly maximumAttempts: typeof maximumBeatAnalysisAttempts;
    }
  | {
      readonly phase: "running";
      readonly attempt: 1 | 2;
      readonly maximumAttempts: typeof maximumBeatAnalysisAttempts;
      readonly requestId: string;
    }
  | {
      readonly phase: "retrying";
      readonly attempt: 2;
      readonly maximumAttempts: typeof maximumBeatAnalysisAttempts;
      readonly cause: "worker_failed" | "analysis_timeout";
    }
  | {
      readonly phase: TerminalPhase;
      readonly attempt: 0 | 1 | 2;
      readonly maximumAttempts: typeof maximumBeatAnalysisAttempts;
      readonly cause?: BeatAnalysisBoundaryErrorCode;
    };

export type BeatAnalysisJobEvent =
  | { readonly type: "begin_attempt"; readonly requestId: string }
  | {
      readonly type: "retry";
      readonly cause: "worker_failed" | "analysis_timeout";
    }
  | { readonly type: "succeed" }
  | { readonly type: "fail"; readonly cause: BeatAnalysisBoundaryErrorCode }
  | { readonly type: "cancel" };

export class BeatAnalysisStateError extends Error {
  constructor() {
    super("Illegal beat-analysis job transition");
    this.name = "BeatAnalysisStateError";
  }
}

export function createBeatAnalysisJobState(): BeatAnalysisJobState {
  return {
    phase: "preparing",
    attempt: 0,
    maximumAttempts: maximumBeatAnalysisAttempts,
  };
}

function terminal(state: BeatAnalysisJobState): boolean {
  return (
    state.phase === "succeeded" ||
    state.phase === "failed" ||
    state.phase === "timed_out" ||
    state.phase === "cancelled"
  );
}

export function transitionBeatAnalysisJob(
  state: BeatAnalysisJobState,
  event: BeatAnalysisJobEvent,
): BeatAnalysisJobState {
  if (terminal(state)) {
    return state;
  }
  if (event.type === "cancel") {
    return {
      phase: "cancelled",
      attempt: state.attempt,
      maximumAttempts: maximumBeatAnalysisAttempts,
    };
  }
  if (event.type === "begin_attempt") {
    if (state.phase === "preparing") {
      return {
        phase: "running",
        attempt: 1,
        maximumAttempts: maximumBeatAnalysisAttempts,
        requestId: event.requestId,
      };
    }
    if (state.phase === "retrying") {
      return {
        phase: "running",
        attempt: 2,
        maximumAttempts: maximumBeatAnalysisAttempts,
        requestId: event.requestId,
      };
    }
    throw new BeatAnalysisStateError();
  }
  if (event.type === "retry") {
    if (
      state.phase !== "running" ||
      state.attempt !== 1 ||
      (event.cause !== "worker_failed" && event.cause !== "analysis_timeout")
    ) {
      throw new BeatAnalysisStateError();
    }
    return {
      phase: "retrying",
      attempt: 2,
      maximumAttempts: maximumBeatAnalysisAttempts,
      cause: event.cause,
    };
  }
  if (event.type === "succeed") {
    if (state.phase !== "running") {
      throw new BeatAnalysisStateError();
    }
    return {
      phase: "succeeded",
      attempt: state.attempt,
      maximumAttempts: maximumBeatAnalysisAttempts,
    };
  }
  if (event.type === "fail") {
    if (state.phase !== "preparing" && state.phase !== "running") {
      throw new BeatAnalysisStateError();
    }
    return {
      phase: event.cause === "analysis_timeout" ? "timed_out" : "failed",
      attempt: state.attempt,
      maximumAttempts: maximumBeatAnalysisAttempts,
      cause: event.cause,
    };
  }
  throw new BeatAnalysisStateError();
}
