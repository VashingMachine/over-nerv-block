import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import type {
  QualityRhythmAnalysis,
  RhythmAnalysisWarning,
} from "@rhythm-game/chart-schema";

import type {
  BeatAnalysisProgress,
  BeatAnalysisStage,
} from "../analysis/beatAnalyzer";
import type { BeatAnalysisJobState } from "../analysis/beatAnalysisStateMachine";
import {
  analyzeDecodedAudioInWorker,
  BeatAnalysisBoundaryError,
} from "../analysis/workerBeatAnalyzer";
import { RhythmCorrectionEditor } from "../correction/RhythmCorrectionEditor";
import { correctionSourceFingerprint } from "../correction/rhythmCorrection";
import { playbackCoordinator } from "../demo/playbackCoordinator";
import {
  createBeatGridRecoveryStore,
  type BeatGridRecoveryStore,
} from "../recovery/beatGridRecoveryStore";

import {
  LocalAudioError,
  validateLocalAudioFile,
  type ValidatedLocalAudioFile,
} from "./filePolicy";
import {
  decodeLocalAudio,
  type DecodeLocalAudioOptions,
  type DisposableDecodedAudio,
} from "./localAudioDecoder";

type DecodeAudio = (
  file: File,
  options: DecodeLocalAudioOptions,
) => Promise<DisposableDecodedAudio>;
type AnalyzeBeats = typeof analyzeDecodedAudioInWorker;

type PickerState =
  | { readonly kind: "idle"; readonly notice?: string }
  | {
      readonly kind: "reading" | "decoding";
      readonly percent: number;
    }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly file: ValidatedLocalAudioFile;
      readonly durationSeconds: number;
      readonly numberOfChannels: number;
      readonly sampleRate: number;
      readonly previewUrl: string;
    };

type AnalysisState =
  | { readonly kind: "idle"; readonly notice?: string }
  | {
      readonly kind: "running";
      readonly stage: "preparing" | BeatAnalysisStage;
      readonly percent: number;
      readonly attempt: 1 | 2;
      readonly maximumAttempts: 2;
      readonly workerPhase: "preparing" | "running" | "retrying";
    }
  | {
      readonly kind: "error";
      readonly message: string;
      readonly recovery: "retry" | "replace";
    }
  | { readonly kind: "complete"; readonly grid: QualityRhythmAnalysis };

interface LocalAudioPickerProps {
  readonly decodeAudio?: DecodeAudio;
  readonly analyzeBeats?: AnalyzeBeats;
  readonly capabilityAvailable?: boolean;
  readonly workerAvailable?: boolean;
  readonly createObjectURL?: (file: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly minimumProgressMilliseconds?: number;
  readonly minimumAnalysisMilliseconds?: number;
  readonly recoveryStore?: BeatGridRecoveryStore;
}

type RecoveryStatus =
  | "loading"
  | "empty"
  | "loaded"
  | "saving"
  | "saved"
  | "discarded"
  | "unavailable"
  | "clearing"
  | "cleared"
  | "forget_failed";

function hasBrowserAudioCapability(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.AudioContext === "function" &&
    typeof URL.createObjectURL === "function" &&
    typeof URL.revokeObjectURL === "function"
  );
}

function hasWorkerCapability(): boolean {
  return typeof Worker === "function";
}

function readableUnexpectedError(): string {
  return "This audio could not be prepared. Choose another file.";
}

const createPreviewUrl = (file: Blob) => URL.createObjectURL(file);
const revokePreviewUrl = (url: string) => URL.revokeObjectURL(url);
const browserRecoveryStore = createBeatGridRecoveryStore();

function waitForVisibleProgress(
  startedAt: number,
  minimumMilliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(
      new DOMException("Local audio preparation was cancelled", "AbortError"),
    );
  }
  const remaining = minimumMilliseconds - (performance.now() - startedAt);
  if (remaining <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    const cancel = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(
        new DOMException("Local audio preparation was cancelled", "AbortError"),
      );
    };
    const timer = window.setTimeout(finish, remaining);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  return `${seconds.toFixed(1)} seconds`;
}

function confidenceLabel(value: number): string {
  if (value >= 0.75) {
    return "High";
  }
  if (value >= 0.6) {
    return "Moderate";
  }
  return "Low";
}

const analysisWarningLabels: Record<RhythmAnalysisWarning, string> = {
  low_confidence:
    "Overall confidence is low. Treat this as a first pass and review the alternatives.",
  meter_uncertain:
    "Meter and downbeats are uncertain. The detected beat timing may still be usable.",
  half_double_ambiguous:
    "The musical pulse may be half or double this tempo. Compare the alternatives.",
  baseline_disagreement:
    "The quality interpretation disagrees with the baseline timing. Use caution.",
};

const analysisStageLabels: Record<"preparing" | BeatAnalysisStage, string> = {
  preparing: "Preparing decoded samples",
  downmix: "Combining audio channels",
  resample: "Resampling for analysis",
  onset_envelope: "Finding rhythmic onsets",
  tempo: "Estimating tempo candidates",
  beat_tracking: "Tracking the beat grid",
  metrical_analysis: "Finding bars and downbeats",
  finalizing: "Validating the beat grid",
};

function recoveryStatusCopy(status: RecoveryStatus): string | null {
  switch (status) {
    case "loading":
      return "Checking this browser for a completed beat grid…";
    case "loaded":
      return "Completed beat grid recovered from this device. Audio was never saved.";
    case "saving":
      return "Saving the completed beat grid for reload recovery…";
    case "saved":
      return "Completed beat grid saved on this device. Audio was not saved.";
    case "discarded":
      return "Invalid recovery data was discarded. Choose a local song to create a new checkpoint.";
    case "unavailable":
      return "Browser recovery storage is unavailable. This tab still works, but the grid may not survive reload.";
    case "clearing":
      return "Forgetting the recovered beat grid…";
    case "cleared":
      return "Recovered beat grid forgotten. Separate corrections were not changed.";
    case "forget_failed":
      return "Could not forget the recovered beat grid. It is still saved on this device; try again. Separate corrections were not changed.";
    case "empty":
      return null;
  }
}

function BeatGridDetails({
  grid,
  onAnalyzeAgain,
}: {
  readonly grid: QualityRhythmAnalysis;
  readonly onAnalyzeAgain?: () => void;
}) {
  const downbeatCount = grid.beats.filter((beat) => beat.isDownbeat).length;
  return (
    <div data-testid="beat-grid">
      <p className="local-audio__status-label">quality_rhythm_analysis_ready</p>
      <h4>Quality beat and downbeat grid</h4>
      <dl className="beat-grid__summary">
        <div>
          <dt>Estimated tempo</dt>
          <dd>{grid.tempoBpm.toFixed(1)} BPM</dd>
        </div>
        <div>
          <dt>Detected beats</dt>
          <dd>{grid.beats.length}</dd>
        </div>
        <div>
          <dt>Meter</dt>
          <dd>{grid.meter ? `${grid.meter}/4` : "Uncertain"}</dd>
        </div>
        <div>
          <dt>Downbeats</dt>
          <dd>{downbeatCount}</dd>
        </div>
        <div>
          <dt>Analyzer</dt>
          <dd>{grid.analyzerVersion}</dd>
        </div>
        <div>
          <dt>Overall confidence</dt>
          <dd>
            {confidenceLabel(grid.confidence.overall)} ·{" "}
            {Math.round(grid.confidence.overall * 100)}%
          </dd>
        </div>
      </dl>
      <div className="beat-grid__legend" aria-label="Timeline legend">
        <span>
          <i className="beat-grid__legend-marker" /> Beat
        </span>
        <span>
          <i className="beat-grid__legend-marker beat-grid__legend-marker--downbeat" />{" "}
          Downbeat · bar start
        </span>
      </div>
      <div
        className="beat-grid__timeline"
        role="img"
        aria-label={`${grid.beats.length} detected beats with ${downbeatCount} downbeats across ${formatDuration(grid.durationSeconds)}`}
      >
        {grid.beats.map((beat, index) => (
          <span
            key={`${index}-${beat.timeSeconds}`}
            className={
              beat.isDownbeat
                ? "beat-grid__marker beat-grid__marker--downbeat"
                : "beat-grid__marker"
            }
            style={{
              left: `${Math.min(100, (beat.timeSeconds / grid.durationSeconds) * 100)}%`,
              opacity: 0.35 + beat.strength * 0.65,
            }}
            aria-hidden="true"
          />
        ))}
      </div>
      <ol className="beat-grid__times" aria-label="First beat times">
        {grid.beats.slice(0, 8).map((beat, index) => (
          <li key={`${index}-${beat.timeSeconds}`}>
            <span>
              {beat.isDownbeat ? "Downbeat" : "Beat"} {index + 1}
              {beat.positionInBar
                ? ` · bar position ${beat.positionInBar}`
                : ""}
            </span>
            <strong>{beat.timeSeconds.toFixed(2)} s</strong>
          </li>
        ))}
      </ol>
      <section
        className="beat-grid__confidence"
        aria-labelledby="analysis-confidence-title"
      >
        <h5 id="analysis-confidence-title">Confidence by signal</h5>
        <dl>
          {(["tempo", "beat", "downbeat", "agreement"] as const).map(
            (component) => (
              <div key={component}>
                <dt>{component}</dt>
                <dd>
                  {confidenceLabel(grid.confidence[component])} ·{" "}
                  {Math.round(grid.confidence[component] * 100)}%
                </dd>
              </div>
            ),
          )}
        </dl>
      </section>
      <section
        className="beat-grid__alternatives"
        aria-labelledby="tempo-alternatives-title"
      >
        <h5 id="tempo-alternatives-title">Tempo alternatives</h5>
        <ol>
          {grid.tempoCandidates.map((candidate) => (
            <li key={`${candidate.bpm}-${candidate.relation}`}>
              <strong>{candidate.bpm.toFixed(1)} BPM</strong>
              <span>
                {candidate.relation} · {Math.round(candidate.score * 100)}%
                relative score
              </span>
            </li>
          ))}
        </ol>
      </section>
      {grid.warnings.length > 0 ? (
        <aside className="beat-grid__warnings" aria-label="Analysis warnings">
          <h5>Check this estimate</h5>
          <ul>
            {grid.warnings.map((warning) => (
              <li key={warning}>{analysisWarningLabels[warning]}</li>
            ))}
          </ul>
        </aside>
      ) : (
        <p className="beat-grid__confidence-note">
          No confidence warning was triggered for this track.
        </p>
      )}
      <p className="beat-grid__comparison">
        {grid.baselineComparison.fallbackUsed
          ? "Baseline beat timing retained; meter and downbeats were not asserted."
          : `Quality interpretation agrees ${Math.round(
              grid.baselineComparison.beatAgreement * 100,
            )}% with ${grid.baselineComparison.analyzerVersion}.`}
      </p>
      {onAnalyzeAgain ? (
        <button className="button button--secondary" onClick={onAnalyzeAgain}>
          Analyze again
        </button>
      ) : null}
    </div>
  );
}

function RecoveredGridWorkspace({
  grid,
  status,
  onForget,
}: {
  readonly grid: QualityRhythmAnalysis;
  readonly status: RecoveryStatus;
  readonly onForget: () => void;
}) {
  return (
    <section
      className="recovered-grid"
      aria-labelledby="recovered-grid-title"
      data-testid="recovered-grid"
    >
      <p className="section-label">Recovered from this device</p>
      <h3 id="recovered-grid-title">Recovered beat grid</h3>
      <p className="recovered-grid__audio-notice">
        <strong>Audio was never saved.</strong> Select and analyze the local
        song again to play. The chart remains available to review meanwhile.
      </p>
      {recoveryStatusCopy(status) ? (
        <p className="recovery-status" role="status">
          {recoveryStatusCopy(status)}
        </p>
      ) : null}
      <BeatGridDetails grid={grid} />
      <RhythmCorrectionEditor
        key={correctionSourceFingerprint(grid)}
        analysis={grid}
      />
      <button
        className="button button--secondary"
        type="button"
        disabled={status === "clearing"}
        onClick={onForget}
      >
        Forget recovered grid
      </button>
    </section>
  );
}

export function LocalAudioPicker({
  decodeAudio = decodeLocalAudio,
  analyzeBeats = analyzeDecodedAudioInWorker,
  capabilityAvailable = hasBrowserAudioCapability(),
  workerAvailable = hasWorkerCapability(),
  createObjectURL = createPreviewUrl,
  revokeObjectURL = revokePreviewUrl,
  minimumProgressMilliseconds = 350,
  minimumAnalysisMilliseconds = 500,
  recoveryStore = browserRecoveryStore,
}: LocalAudioPickerProps) {
  const [state, setState] = useState<PickerState>({ kind: "idle" });
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    kind: "idle",
  });
  const [recoveredGrid, setRecoveredGrid] =
    useState<QualityRhythmAnalysis | null>(null);
  const [recoveryStatus, setRecoveryStatus] =
    useState<RecoveryStatus>("loading");
  const inputRef = useRef<HTMLInputElement>(null);
  const operationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const decodedRef = useRef<DisposableDecodedAudio | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const selectedFileRef = useRef<File | null>(null);
  const pageWasCachedRef = useRef(false);
  const previewRef = useRef<HTMLAudioElement>(null);
  const previewPlaybackOwnerRef = useRef(Symbol("local-audio-preview"));
  const recoveryGenerationRef = useRef(0);
  const recoveryWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    const generation = recoveryGenerationRef.current;
    void recoveryStore.readLatest().then((result) => {
      if (!active || generation !== recoveryGenerationRef.current) {
        return;
      }
      if (result.status === "loaded") {
        setRecoveredGrid(result.checkpoint.grid);
      }
      setRecoveryStatus(result.status);
    });
    return () => {
      active = false;
    };
  }, [recoveryStore]);

  const checkpointCompletedGrid = useCallback(
    (grid: QualityRhythmAnalysis) => {
      const generation = ++recoveryGenerationRef.current;
      setRecoveredGrid(grid);
      setRecoveryStatus("saving");
      recoveryWriteQueueRef.current = recoveryWriteQueueRef.current.then(
        async () => {
          const result = await recoveryStore.saveLatest(grid);
          if (generation === recoveryGenerationRef.current) {
            setRecoveryStatus(result === "saved" ? "saved" : "unavailable");
          }
        },
      );
    },
    [recoveryStore],
  );

  const forgetRecoveredGrid = useCallback(() => {
    const generation = ++recoveryGenerationRef.current;
    setRecoveryStatus("clearing");
    recoveryWriteQueueRef.current = recoveryWriteQueueRef.current.then(
      async () => {
        const result = await recoveryStore.deleteLatest();
        if (generation === recoveryGenerationRef.current) {
          if (result === "cleared") {
            setRecoveredGrid(null);
            setRecoveryStatus("cleared");
          } else {
            setRecoveryStatus("forget_failed");
          }
        }
      },
    );
  }, [recoveryStore]);

  const releaseSelection = useCallback(() => {
    playbackCoordinator.release(previewPlaybackOwnerRef.current);
    selectedFileRef.current = null;
    const decoded = decodedRef.current;
    decodedRef.current = null;
    decoded?.release();

    const previewUrl = previewUrlRef.current;
    previewUrlRef.current = null;
    if (previewUrl) {
      revokeObjectURL(previewUrl);
    }
  }, [revokeObjectURL]);

  const stopCurrentWork = useCallback(() => {
    const controller = controllerRef.current;
    controllerRef.current = null;
    controller?.abort();
  }, []);

  const reset = useCallback(
    (notice: string) => {
      operationRef.current += 1;
      stopCurrentWork();
      releaseSelection();
      setState({ kind: "idle", notice });
      setAnalysisState({ kind: "idle" });
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [releaseSelection, stopCurrentWork],
  );

  const prepareFile = useCallback(
    async (file: File) => {
      operationRef.current += 1;
      const operation = operationRef.current;
      stopCurrentWork();
      releaseSelection();
      setAnalysisState({ kind: "idle" });

      let validated: ValidatedLocalAudioFile;
      try {
        validated = validateLocalAudioFile(file);
      } catch (error) {
        setState({
          kind: "error",
          message:
            error instanceof LocalAudioError
              ? error.message
              : readableUnexpectedError(),
        });
        return;
      }

      const controller = new AbortController();
      controllerRef.current = controller;
      const progressStartedAt = performance.now();
      setState({ kind: "reading", percent: 5 });

      let decoded: DisposableDecodedAudio | null = null;
      try {
        decoded = await decodeAudio(file, {
          signal: controller.signal,
          onProgress: (progress) => {
            if (
              operationRef.current === operation &&
              !controller.signal.aborted
            ) {
              setState({
                kind: progress.stage,
                percent: Math.round(progress.percent),
              });
            }
          },
        });
        await waitForVisibleProgress(
          progressStartedAt,
          minimumProgressMilliseconds,
          controller.signal,
        );

        if (operationRef.current !== operation || controller.signal.aborted) {
          decoded.release();
          return;
        }

        const previewUrl = createObjectURL(file);
        decodedRef.current = decoded;
        previewUrlRef.current = previewUrl;
        selectedFileRef.current = file;
        controllerRef.current = null;
        setState({
          kind: "ready",
          file: validated,
          durationSeconds: decoded.durationSeconds,
          numberOfChannels: decoded.numberOfChannels,
          sampleRate: decoded.sampleRate,
          previewUrl,
        });
        decoded = null;
      } catch (error) {
        decoded?.release();
        if (operationRef.current !== operation) {
          return;
        }
        controllerRef.current = null;
        if (error instanceof DOMException && error.name === "AbortError") {
          setState({
            kind: "idle",
            notice: "Selection cancelled. No audio was retained.",
          });
          return;
        }
        setState({
          kind: "error",
          message:
            error instanceof LocalAudioError
              ? error.message
              : readableUnexpectedError(),
        });
      }
    },
    [
      createObjectURL,
      decodeAudio,
      minimumProgressMilliseconds,
      releaseSelection,
      stopCurrentWork,
    ],
  );

  const startAnalysis = useCallback(async () => {
    operationRef.current += 1;
    const operation = operationRef.current;
    stopCurrentWork();

    const selectedFile = selectedFileRef.current;
    if (!selectedFile) {
      setAnalysisState({
        kind: "error",
        message: "Choose the local audio file again before analysis.",
        recovery: "replace",
      });
      return;
    }
    if (!workerAvailable) {
      setAnalysisState({
        kind: "error",
        message:
          "This browser cannot start local beat analysis. Choose another browser.",
        recovery: "replace",
      });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    const analysisStartedAt = performance.now();
    setAnalysisState({
      kind: "running",
      stage: "preparing",
      percent: 5,
      attempt: 1,
      maximumAttempts: 2,
      workerPhase: "preparing",
    });

    let decoded = decodedRef.current;
    decodedRef.current = null;
    try {
      if (!decoded) {
        decoded = await decodeAudio(selectedFile, {
          signal: controller.signal,
          onProgress: (progress) => {
            if (
              operationRef.current === operation &&
              !controller.signal.aborted
            ) {
              setAnalysisState({
                kind: "running",
                stage: "preparing",
                percent:
                  progress.stage === "reading"
                    ? Math.round(5 + progress.percent * 0.1)
                    : Math.round(15 + progress.percent * 0.05),
                attempt: 1,
                maximumAttempts: 2,
                workerPhase: "preparing",
              });
            }
          },
        });
      }
      if (operationRef.current !== operation || controller.signal.aborted) {
        decoded.release();
        return;
      }

      const ownedDecoded = decoded;
      decoded = null;
      const resultPromise = analyzeBeats(ownedDecoded, {
        signal: controller.signal,
        onStateChange: (job: BeatAnalysisJobState) => {
          if (operationRef.current !== operation || controller.signal.aborted) {
            return;
          }
          if (job.phase === "retrying") {
            setAnalysisState({
              kind: "running",
              stage: "preparing",
              percent: 5,
              attempt: 2,
              maximumAttempts: 2,
              workerPhase: "retrying",
            });
          } else if (job.phase === "running") {
            setAnalysisState((current) => ({
              kind: "running",
              stage:
                current.kind === "running" && current.attempt === job.attempt
                  ? current.stage
                  : "preparing",
              percent:
                current.kind === "running" && current.attempt === job.attempt
                  ? current.percent
                  : 5,
              attempt: job.attempt,
              maximumAttempts: job.maximumAttempts,
              workerPhase: "running",
            }));
          }
        },
        onProgress: (progress: BeatAnalysisProgress) => {
          if (
            operationRef.current === operation &&
            !controller.signal.aborted
          ) {
            setAnalysisState((current) => ({
              kind: "running",
              stage: progress.stage,
              percent: Math.round(20 + progress.percent * 0.8),
              attempt: current.kind === "running" ? current.attempt : 1,
              maximumAttempts: 2,
              workerPhase: "running",
            }));
          }
        },
      });
      const grid = await resultPromise;
      await waitForVisibleProgress(
        analysisStartedAt,
        minimumAnalysisMilliseconds,
        controller.signal,
      );
      if (operationRef.current !== operation || controller.signal.aborted) {
        return;
      }
      controllerRef.current = null;
      setAnalysisState({ kind: "complete", grid });
      checkpointCompletedGrid(grid);
    } catch (error) {
      decoded?.release();
      if (operationRef.current !== operation) {
        return;
      }
      controllerRef.current = null;
      if (error instanceof DOMException && error.name === "AbortError") {
        setAnalysisState({
          kind: "idle",
          notice: "Beat analysis cancelled. The local preview is still ready.",
        });
        return;
      }
      setAnalysisState({
        kind: "error",
        message:
          error instanceof LocalAudioError ||
          error instanceof BeatAnalysisBoundaryError
            ? error.message
            : "Local beat analysis could not finish. Try again.",
        recovery:
          error instanceof BeatAnalysisBoundaryError &&
          error.code === "analysis_too_large"
            ? "replace"
            : "retry",
      });
    }
  }, [
    analyzeBeats,
    checkpointCompletedGrid,
    decodeAudio,
    minimumAnalysisMilliseconds,
    stopCurrentWork,
    workerAvailable,
  ]);

  const cancelAnalysis = useCallback(() => {
    operationRef.current += 1;
    stopCurrentWork();
    setAnalysisState({
      kind: "idle",
      notice: "Beat analysis cancelled. The local preview is still ready.",
    });
  }, [stopCurrentWork]);

  useEffect(() => {
    const releasePageResources = () => {
      operationRef.current += 1;
      stopCurrentWork();
      releaseSelection();
    };
    const handlePageHide = (event: PageTransitionEvent) => {
      pageWasCachedRef.current = event.persisted;
      releasePageResources();
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || !pageWasCachedRef.current) {
        return;
      }
      pageWasCachedRef.current = false;
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setState({
        kind: "idle",
        notice: "Page restored. Choose the local audio file again.",
      });
      setAnalysisState({ kind: "idle" });
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      pageWasCachedRef.current = false;
      releasePageResources();
    };
  }, [releaseSelection, stopCurrentWork]);

  const chooseFile = () => inputRef.current?.click();
  const onFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    if (!capabilityAvailable) {
      return;
    }
    const input = event.currentTarget;
    const file = event.currentTarget.files?.[0];
    if (file) {
      void prepareFile(file).finally(() => {
        if (inputRef.current === input) {
          input.value = "";
        }
      });
    }
  };

  const busy = state.kind === "reading" || state.kind === "decoding";

  return (
    <section className="local-audio" aria-labelledby="local-audio-title">
      <div className="local-audio__intro">
        <p className="section-label">Your music · private by design</p>
        <h2 id="local-audio-title">Prepare a local song</h2>
        <p className="local-audio__privacy">
          Decoded only in this tab. Nothing is uploaded. Audio is not saved.
        </p>
        <p className="local-audio__guidance">
          WAV, MP3, M4A, AAC, OGG, Opus, FLAC, or WebM · up to 25 MB and 10
          minutes. Browser codec support varies.
        </p>
        {!recoveredGrid && recoveryStatusCopy(recoveryStatus) ? (
          <p className="recovery-status" role="status">
            {recoveryStatusCopy(recoveryStatus)}
          </p>
        ) : null}
      </div>

      <div className={`local-audio__state local-audio__state--${state.kind}`}>
        {capabilityAvailable ? (
          <input
            ref={inputRef}
            hidden
            tabIndex={-1}
            type="file"
            accept=".wav,.mp3,.m4a,.aac,.ogg,.opus,.flac,.webm,audio/*"
            aria-label="Choose local music file"
            onChange={onFileSelected}
          />
        ) : null}

        {!capabilityAvailable ? (
          <div role="status">
            <p className="local-audio__status-label">Browser unavailable</p>
            <h3>Local audio needs Web Audio support.</h3>
            <p>Open this page in a current browser to prepare a song.</p>
          </div>
        ) : null}

        {capabilityAvailable && state.kind === "idle" ? (
          <div>
            <p className="local-audio__status-label">No song selected</p>
            <p className="local-audio__state-copy">
              Choose a file from this device. It stays in this browser tab.
            </p>
            {state.notice ? <p role="status">{state.notice}</p> : null}
            <button className="button button--primary" onClick={chooseFile}>
              Choose music file
            </button>
          </div>
        ) : null}

        {capabilityAvailable && busy ? (
          <div aria-live="polite">
            <p className="local-audio__status-label">
              {state.kind === "reading"
                ? "Reading locally"
                : "Decoding locally"}
            </p>
            <h3>
              {state.kind === "reading"
                ? "Reading audio in this tab"
                : "Checking browser playback"}
            </h3>
            <progress
              aria-label="Local audio preparation progress"
              max={100}
              value={state.percent}
            />
            <p>{state.percent}% · no upload in progress</p>
            <button
              className="button button--secondary"
              onClick={() =>
                reset("Selection cancelled. No audio was retained.")
              }
            >
              Cancel preparation
            </button>
          </div>
        ) : null}

        {capabilityAvailable && state.kind === "error" ? (
          <div role="alert">
            <p className="local-audio__status-label">Could not prepare audio</p>
            <h3>Choose another song</h3>
            <p>{state.message}</p>
            <button className="button button--primary" onClick={chooseFile}>
              Choose another file
            </button>
          </div>
        ) : null}

        {capabilityAvailable && state.kind === "ready" ? (
          <div aria-live="polite">
            <p className="local-audio__status-label">ready_for_analysis</p>
            <h3>Ready for analysis</h3>
            <p className="local-audio__state-copy">
              The browser decoded this track successfully. Run the transparent
              quality analyzer locally in a dedicated worker.
            </p>
            <dl className="local-audio__facts">
              <div>
                <dt>Length</dt>
                <dd>{formatDuration(state.durationSeconds)}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatBytes(state.file.bytes)}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{state.file.format}</dd>
              </div>
              <div>
                <dt>Audio</dt>
                <dd>
                  {state.numberOfChannels} channel
                  {state.numberOfChannels === 1 ? "" : "s"} · {state.sampleRate}{" "}
                  Hz
                </dd>
              </div>
            </dl>
            <audio
              ref={previewRef}
              className="local-audio__preview"
              controls
              preload="metadata"
              src={state.previewUrl}
              aria-label="Local audio preview"
              onPlay={() =>
                playbackCoordinator.claim(previewPlaybackOwnerRef.current, () =>
                  previewRef.current?.pause(),
                )
              }
              onPause={() =>
                playbackCoordinator.release(previewPlaybackOwnerRef.current)
              }
              onEnded={() =>
                playbackCoordinator.release(previewPlaybackOwnerRef.current)
              }
            />
            <div className="beat-analysis" data-testid="beat-analysis">
              {!workerAvailable ? (
                <div role="status">
                  <p className="local-audio__status-label">
                    Analysis unavailable
                  </p>
                  <h4>Local beat analysis needs Web Worker support.</h4>
                  <p>The audio preview remains available in this tab.</p>
                </div>
              ) : null}

              {workerAvailable && analysisState.kind === "idle" ? (
                <div>
                  <p className="local-audio__status-label">
                    Quality beat and downbeat detection
                  </p>
                  <h4>Find beats, bars, and uncertainty</h4>
                  <p>
                    Analysis runs off the main thread. It never uploads or saves
                    audio. A completed beat grid is saved on this device for
                    reload recovery.
                  </p>
                  <p>
                    Very long or multichannel tracks may be declined before
                    analysis to protect this tab&apos;s memory.
                  </p>
                  {analysisState.notice ? (
                    <p role="status">{analysisState.notice}</p>
                  ) : null}
                  <button
                    className="button button--primary"
                    onClick={() => void startAnalysis()}
                  >
                    Analyze beats
                  </button>
                </div>
              ) : null}

              {workerAvailable && analysisState.kind === "running" ? (
                <div aria-live="polite">
                  <p className="local-audio__status-label">
                    Analyzing locally · attempt {analysisState.attempt} of{" "}
                    {analysisState.maximumAttempts}
                  </p>
                  <h4>
                    {analysisState.workerPhase === "retrying"
                      ? "Restarting the local analyzer"
                      : analysisStageLabels[analysisState.stage]}
                  </h4>
                  <progress
                    aria-label="Beat analysis progress"
                    max={100}
                    value={analysisState.percent}
                  />
                  <p>{analysisState.percent}% · main thread stays available</p>
                  <button
                    className="button button--secondary"
                    onClick={cancelAnalysis}
                  >
                    Cancel analysis
                  </button>
                </div>
              ) : null}

              {workerAvailable && analysisState.kind === "error" ? (
                <div role="alert">
                  <p className="local-audio__status-label">
                    Analysis did not finish
                  </p>
                  <h4>
                    {analysisState.recovery === "retry"
                      ? "Try the baseline again"
                      : "Choose a smaller track"}
                  </h4>
                  <p>{analysisState.message}</p>
                  {analysisState.recovery === "retry" ? (
                    <button
                      className="button button--primary"
                      onClick={() => void startAnalysis()}
                    >
                      Retry analysis
                    </button>
                  ) : (
                    <button
                      className="button button--primary"
                      onClick={chooseFile}
                    >
                      Choose different music
                    </button>
                  )}
                </div>
              ) : null}

              {workerAvailable && analysisState.kind === "complete" ? (
                <BeatGridDetails
                  grid={analysisState.grid}
                  onAnalyzeAgain={() => void startAnalysis()}
                />
              ) : null}
            </div>
            {analysisState.kind === "complete" ? (
              <>
                {recoveryStatusCopy(recoveryStatus) ? (
                  <p className="recovery-status" role="status">
                    {recoveryStatusCopy(recoveryStatus)}
                  </p>
                ) : null}
                <RhythmCorrectionEditor
                  key={correctionSourceFingerprint(analysisState.grid)}
                  analysis={analysisState.grid}
                  audioUrl={state.previewUrl}
                  getPreviewTime={() => previewRef.current?.currentTime ?? 0}
                />
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={recoveryStatus === "clearing"}
                  onClick={forgetRecoveredGrid}
                >
                  Forget recovered grid
                </button>
              </>
            ) : null}
            <div className="local-audio__actions">
              <button className="button button--primary" onClick={chooseFile}>
                Replace music
              </button>
              <button
                className="button button--secondary"
                onClick={() =>
                  reset("Selection cleared. No audio was retained.")
                }
              >
                Clear selection
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {recoveredGrid && analysisState.kind !== "complete" ? (
        <RecoveredGridWorkspace
          grid={recoveredGrid}
          status={recoveryStatus}
          onForget={forgetRecoveredGrid}
        />
      ) : null}
    </section>
  );
}
