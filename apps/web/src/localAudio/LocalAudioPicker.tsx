import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

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

interface LocalAudioPickerProps {
  readonly decodeAudio?: DecodeAudio;
  readonly capabilityAvailable?: boolean;
  readonly createObjectURL?: (file: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly minimumProgressMilliseconds?: number;
}

function hasBrowserAudioCapability(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.AudioContext === "function" &&
    typeof URL.createObjectURL === "function" &&
    typeof URL.revokeObjectURL === "function"
  );
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

export function LocalAudioPicker({
  decodeAudio = decodeLocalAudio,
  capabilityAvailable = hasBrowserAudioCapability(),
  createObjectURL = createPreviewUrl,
  revokeObjectURL = revokePreviewUrl,
  minimumProgressMilliseconds = 350,
}: LocalAudioPickerProps) {
  const [state, setState] = useState<PickerState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const operationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const decodedRef = useRef<DisposableDecodedAudio | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const pageWasCachedRef = useRef(false);

  const releaseSelection = useCallback(() => {
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
              The browser decoded this track successfully. Beat detection
              arrives in the next stage.
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
