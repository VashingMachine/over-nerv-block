import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import type { BeatGrid } from "@rhythm-game/chart-schema";

import type {
  BeatAnalysisProgress,
  BeatAnalysisStage,
} from "../analysis/beatAnalyzer";
import {
  analyzeDecodedAudioInWorker,
  BeatAnalysisBoundaryError,
} from "../analysis/workerBeatAnalyzer";

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
    }
  | {
      readonly kind: "error";
      readonly message: string;
      readonly recovery: "retry" | "replace";
    }
  | { readonly kind: "complete"; readonly grid: BeatGrid };

interface LocalAudioPickerProps {
  readonly decodeAudio?: DecodeAudio;
  readonly analyzeBeats?: AnalyzeBeats;
  readonly capabilityAvailable?: boolean;
  readonly workerAvailable?: boolean;
  readonly createObjectURL?: (file: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly minimumProgressMilliseconds?: number;
  readonly minimumAnalysisMilliseconds?: number;
}

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

const analysisStageLabels: Record<"preparing" | BeatAnalysisStage, string> = {
  preparing: "Preparing decoded samples",
  downmix: "Combining audio channels",
  resample: "Resampling for analysis",
  onset_envelope: "Finding rhythmic onsets",
  tempo: "Estimating tempo candidates",
  beat_tracking: "Tracking the beat grid",
  finalizing: "Validating the beat grid",
};

export function LocalAudioPicker({
  decodeAudio = decodeLocalAudio,
  analyzeBeats = analyzeDecodedAudioInWorker,
  capabilityAvailable = hasBrowserAudioCapability(),
  workerAvailable = hasWorkerCapability(),
  createObjectURL = createPreviewUrl,
  revokeObjectURL = revokePreviewUrl,
  minimumProgressMilliseconds = 350,
  minimumAnalysisMilliseconds = 500,
}: LocalAudioPickerProps) {
  const [state, setState] = useState<PickerState>({ kind: "idle" });
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    kind: "idle",
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const operationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const decodedRef = useRef<DisposableDecodedAudio | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const selectedFileRef = useRef<File | null>(null);
  const pageWasCachedRef = useRef(false);

  const releaseSelection = useCallback(() => {
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
    setAnalysisState({ kind: "running", stage: "preparing", percent: 5 });

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
        onProgress: (progress: BeatAnalysisProgress) => {
          if (
            operationRef.current === operation &&
            !controller.signal.aborted
          ) {
            setAnalysisState({
              kind: "running",
              stage: progress.stage,
              percent: Math.round(20 + progress.percent * 0.8),
            });
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
              baseline analyzer locally in a dedicated worker.
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
              className="local-audio__preview"
              controls
              preload="metadata"
              src={state.previewUrl}
              aria-label="Local audio preview"
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
                    Baseline beat detection
                  </p>
                  <h4>Find a first-pass beat grid</h4>
                  <p>
                    Analysis runs off the main thread. It does not upload or
                    save audio or beats.
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
                  <p className="local-audio__status-label">Analyzing locally</p>
                  <h4>{analysisStageLabels[analysisState.stage]}</h4>
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
                <div data-testid="beat-grid">
                  <p className="local-audio__status-label">beat_grid_ready</p>
                  <h4>Baseline beat grid</h4>
                  <dl className="beat-grid__summary">
                    <div>
                      <dt>Estimated tempo</dt>
                      <dd>{analysisState.grid.tempoBpm.toFixed(1)} BPM</dd>
                    </div>
                    <div>
                      <dt>Detected beats</dt>
                      <dd>{analysisState.grid.beats.length}</dd>
                    </div>
                    <div>
                      <dt>Analyzer</dt>
                      <dd>{analysisState.grid.analyzerVersion}</dd>
                    </div>
                  </dl>
                  <div
                    className="beat-grid__timeline"
                    role="img"
                    aria-label={`${analysisState.grid.beats.length} detected beats across ${formatDuration(analysisState.grid.durationSeconds)}`}
                  >
                    {analysisState.grid.beats.map((beat, index) => (
                      <span
                        key={`${index}-${beat.timeSeconds}`}
                        style={{
                          left: `${Math.min(100, (beat.timeSeconds / analysisState.grid.durationSeconds) * 100)}%`,
                          opacity: 0.35 + beat.strength * 0.65,
                        }}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  <ol
                    className="beat-grid__times"
                    aria-label="First beat times"
                  >
                    {analysisState.grid.beats.slice(0, 8).map((beat, index) => (
                      <li key={`${index}-${beat.timeSeconds}`}>
                        <span>Beat {index + 1}</span>
                        <strong>{beat.timeSeconds.toFixed(2)} s</strong>
                      </li>
                    ))}
                  </ol>
                  <p>
                    Baseline estimate only. Downbeats and uncertainty guidance
                    arrive in the next stage.
                  </p>
                  <button
                    className="button button--secondary"
                    onClick={() => void startAnalysis()}
                  >
                    Analyze again
                  </button>
                </div>
              ) : null}
            </div>
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
    </section>
  );
}
