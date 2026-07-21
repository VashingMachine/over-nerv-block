import type { BeatGrid } from "@rhythm-game/chart-schema";

import type {
  BeatAnalysisErrorCode,
  BeatAnalysisProgress,
} from "./beatAnalyzer";

export const beatAnalysisProtocolVersion = 1 as const;

export interface AnalyzeBeatRequest {
  readonly protocolVersion: typeof beatAnalysisProtocolVersion;
  readonly type: "analyze";
  readonly requestId: string;
  readonly input: {
    readonly channels: readonly ArrayBuffer[];
    readonly sampleRate: number;
    readonly durationSeconds: number;
  };
}

export interface CancelBeatRequest {
  readonly protocolVersion: typeof beatAnalysisProtocolVersion;
  readonly type: "cancel";
  readonly requestId: string;
}

export type BeatAnalysisWorkerRequest = AnalyzeBeatRequest | CancelBeatRequest;

export type BeatAnalysisWorkerErrorCode =
  BeatAnalysisErrorCode | "analysis_failed";

export type BeatAnalysisWorkerResponse =
  | {
      readonly protocolVersion: typeof beatAnalysisProtocolVersion;
      readonly type: "progress";
      readonly requestId: string;
      readonly progress: BeatAnalysisProgress;
    }
  | {
      readonly protocolVersion: typeof beatAnalysisProtocolVersion;
      readonly type: "complete";
      readonly requestId: string;
      readonly result: BeatGrid;
    }
  | {
      readonly protocolVersion: typeof beatAnalysisProtocolVersion;
      readonly type: "cancelled";
      readonly requestId: string;
    }
  | {
      readonly protocolVersion: typeof beatAnalysisProtocolVersion;
      readonly type: "error";
      readonly requestId: string;
      readonly code: BeatAnalysisWorkerErrorCode;
    };

const progressStages = new Set([
  "downmix",
  "resample",
  "onset_envelope",
  "tempo",
  "beat_tracking",
  "finalizing",
]);

export function isBeatAnalysisProgress(
  value: unknown,
): value is BeatAnalysisProgress {
  if (!value || typeof value !== "object") {
    return false;
  }
  const progress = value as Record<string, unknown>;
  return (
    typeof progress.stage === "string" &&
    progressStages.has(progress.stage) &&
    typeof progress.percent === "number" &&
    Number.isFinite(progress.percent) &&
    progress.percent >= 0 &&
    progress.percent <= 100
  );
}

export function responseIdentity(
  value: unknown,
): { readonly requestId: string; readonly type: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const response = value as Record<string, unknown>;
  if (
    response.protocolVersion !== beatAnalysisProtocolVersion ||
    typeof response.requestId !== "string" ||
    typeof response.type !== "string"
  ) {
    return null;
  }
  return { requestId: response.requestId, type: response.type };
}
