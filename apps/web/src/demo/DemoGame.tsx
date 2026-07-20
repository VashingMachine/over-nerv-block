import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GameResult, NoteJudgment } from "@rhythm-game/chart-schema";

import {
  createWebAudioEngine,
  type AudioEngine,
  type AudioEngineFactory,
} from "./audioEngine";
import { countdownSeconds, demoChart, demoSong } from "./demoContent";
import { loadPhaser } from "./phaserRuntime";
import {
  createGameResult,
  getBrowserStorage,
  readCalibrationOffset,
  readLatestResult,
  saveCalibrationOffset,
  saveLatestResult,
} from "./resultStore";
import { RhythmGameCanvas } from "./RhythmGameCanvas";
import {
  collectExpiredMisses,
  currentCombo,
  deriveResultSummary,
  recordInput,
} from "./scoring";

type GamePhase =
  | "idle"
  | "loading"
  | "countdown"
  | "playing"
  | "paused"
  | "finished"
  | "error";

interface DemoGameProps {
  createAudioEngine?: AudioEngineFactory;
  now?: () => string;
}

function readableError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "The demo track could not start.";
}

const currentIsoTimestamp = () => new Date().toISOString();

function judgmentLabel(record: NoteJudgment): string {
  if (record.judgment === "miss") {
    return "Miss";
  }
  const signedOffset = Math.round(record.offsetMilliseconds ?? 0);
  return `${record.judgment === "perfect" ? "Perfect" : "Good"} ${signedOffset >= 0 ? "+" : ""}${signedOffset} ms`;
}

export function DemoGame({
  createAudioEngine = createWebAudioEngine,
  now = currentIsoTimestamp,
}: DemoGameProps) {
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [countdownBeat, setCountdownBeat] = useState(3);
  const [songTime, setSongTime] = useState(0);
  const [judgments, setJudgments] = useState<NoteJudgment[]>([]);
  const [inputFeedback, setInputFeedback] = useState(
    "Waiting for the first note",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [transportError, setTransportError] = useState("");
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [storage] = useState(() => getBrowserStorage());
  const [calibrationOffset, setCalibrationOffset] = useState(() =>
    readCalibrationOffset(storage),
  );
  const [calibrationDraft, setCalibrationDraft] = useState(calibrationOffset);
  const [latestResult, setLatestResult] = useState<GameResult | null>(() =>
    readLatestResult(storage),
  );
  const [result, setResult] = useState<GameResult | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const judgmentsRef = useRef<NoteJudgment[]>([]);
  const judgedIndexesRef = useRef<ReadonlySet<number>>(new Set());
  const sessionRef = useRef(0);
  const pausedFromPhaseRef = useRef<"countdown" | "playing">("playing");

  useEffect(() => {
    judgmentsRef.current = judgments;
    judgedIndexesRef.current = new Set(
      judgments.map((record) => record.noteIndex),
    );
  }, [judgments]);

  const disposeEngine = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
  }, []);

  useEffect(
    () => () => {
      sessionRef.current += 1;
      disposeEngine();
    },
    [disposeEngine],
  );

  const getSongTime = useCallback(
    () => engineRef.current?.songTimeSeconds() ?? -Infinity,
    [],
  );
  const isNoteJudged = useCallback(
    (noteIndex: number) => judgedIndexesRef.current.has(noteIndex),
    [],
  );

  const finish = useCallback(
    (currentJudgments: readonly NoteJudgment[]) => {
      const completedResult = createGameResult(
        currentJudgments,
        calibrationOffset,
        now(),
      );
      judgmentsRef.current = completedResult.judgments;
      setJudgments(completedResult.judgments);
      setResult(completedResult);
      setLatestResult(completedResult);
      try {
        saveLatestResult(storage, completedResult);
      } catch {
        setTransportError("Results are shown, but could not be saved locally.");
      }
      setPhase("finished");
    },
    [calibrationOffset, now, storage],
  );

  const start = useCallback(async () => {
    sessionRef.current += 1;
    const sessionId = sessionRef.current;
    disposeEngine();
    setPhase("loading");
    setErrorMessage("");
    setTransportError("");
    judgmentsRef.current = [];
    setJudgments([]);
    setResult(null);
    setSongTime(0);
    setInputFeedback("Waiting for the first note");
    setCountdownBeat(3);
    pausedFromPhaseRef.current = "playing";

    const engine = createAudioEngine();
    engineRef.current = engine;

    try {
      await engine.start({
        audioUrl: new URL(demoSong.audioPath, document.baseURI).toString(),
        beforeSchedule: loadPhaser,
        countdownSeconds,
        onEnded: () => {
          if (
            engineRef.current === engine &&
            sessionRef.current === sessionId
          ) {
            finish(judgmentsRef.current);
          }
        },
      });
      if (engineRef.current === engine && sessionRef.current === sessionId) {
        setPhase("countdown");
      }
    } catch (error) {
      if (engineRef.current === engine && sessionRef.current === sessionId) {
        engine.dispose();
        engineRef.current = null;
        setErrorMessage(readableError(error));
        setPhase("error");
      }
    }
  }, [createAudioEngine, disposeEngine, finish]);

  const registerInput = useCallback(
    (eventTimestamp = performance.now()) => {
      if (phase !== "playing") {
        return;
      }
      const rawSongTime =
        engineRef.current?.songTimeForEvent(eventTimestamp) ?? getSongTime();
      const current = judgmentsRef.current;
      const next = recordInput(
        demoChart,
        current,
        rawSongTime,
        calibrationOffset,
      );
      const added = next.find(
        (record) =>
          record.inputTimeSeconds !== null &&
          !current.some((item) => item.noteIndex === record.noteIndex),
      );
      judgmentsRef.current = next;
      setJudgments(next);
      setInputFeedback(added ? judgmentLabel(added) : "No note in range");
    },
    [calibrationOffset, getSongTime, phase],
  );

  const pause = useCallback(async () => {
    if ((phase !== "countdown" && phase !== "playing") || !engineRef.current) {
      return;
    }
    const engine = engineRef.current;
    const sessionId = sessionRef.current;
    try {
      const paused = await engine.pause();
      if (
        !paused ||
        engineRef.current !== engine ||
        sessionRef.current !== sessionId
      ) {
        return;
      }
      setPhase((current) => {
        if (current !== "countdown" && current !== "playing") {
          return current;
        }
        pausedFromPhaseRef.current = current;
        return "paused";
      });
      setTransportError("");
    } catch (error) {
      if (engineRef.current === engine && sessionRef.current === sessionId) {
        setTransportError(readableError(error));
      }
    }
  }, [phase]);

  const resume = useCallback(async () => {
    if (phase !== "paused" || !engineRef.current) {
      return;
    }
    const engine = engineRef.current;
    const sessionId = sessionRef.current;
    try {
      const resumed = await engine.resume();
      if (
        !resumed ||
        engineRef.current !== engine ||
        sessionRef.current !== sessionId
      ) {
        return;
      }
      setPhase((current) =>
        current === "paused" ? pausedFromPhaseRef.current : current,
      );
      setTransportError("");
    } catch (error) {
      if (engineRef.current === engine && sessionRef.current === sessionId) {
        setTransportError(readableError(error));
      }
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing") {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        registerInput(event.timeStamp);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, registerInput]);

  useEffect(() => {
    if (phase !== "countdown" && phase !== "playing") {
      return;
    }
    const timer = window.setInterval(() => {
      const currentSongTime = getSongTime();
      if (currentSongTime >= 0) {
        setSongTime(Math.min(currentSongTime, demoSong.durationSeconds));
        setPhase("playing");
        const current = judgmentsRef.current;
        const next = collectExpiredMisses(
          demoChart,
          current,
          currentSongTime,
          calibrationOffset,
        );
        if (next.length > current.length) {
          judgmentsRef.current = next;
          setJudgments(next);
          setInputFeedback("Miss");
        }
        return;
      }
      const beatSeconds = 60 / demoSong.bpm;
      setCountdownBeat(Math.max(1, Math.ceil(-currentSongTime / beatSeconds)));
    }, 50);
    return () => window.clearInterval(timer);
  }, [calibrationOffset, getSongTime, phase]);

  useEffect(() => {
    if (phase !== "countdown" && phase !== "playing") {
      return;
    }
    const pauseWhenHidden = () => {
      if (document.hidden) {
        void pause();
      }
    };
    pauseWhenHidden();
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () =>
      document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, [pause, phase]);

  const saveCalibration = () => {
    try {
      const saved = saveCalibrationOffset(storage, calibrationDraft);
      setCalibrationOffset(saved);
      setCalibrationDraft(saved);
      setCalibrationOpen(false);
      setTransportError("");
    } catch {
      setTransportError("Calibration could not be saved on this device.");
    }
  };

  const liveSummary = useMemo(
    () => deriveResultSummary(judgments),
    [judgments],
  );
  const active =
    phase === "countdown" || phase === "playing" || phase === "paused";

  return (
    <section className="demo" aria-labelledby="demo-title">
      <div className="track-card">
        <div className="track-art" aria-hidden="true">
          <span>120</span>
          <small>BPM</small>
        </div>
        <div className="track-copy">
          <p className="section-label">Bundled demo · one lane</p>
          <h2 id="demo-title">{demoSong.title}</h2>
          <p>{demoSong.artist}</p>
          <dl className="track-facts">
            <div>
              <dt>Length</dt>
              <dd>{demoSong.durationSeconds} seconds</dd>
            </div>
            <div>
              <dt>Controls</dt>
              <dd>Space, canvas, or Hit</dd>
            </div>
            <div>
              <dt>Timing</dt>
              <dd>Perfect ±50 ms · Good ±120 ms</dd>
            </div>
            <div>
              <dt>Device offset</dt>
              <dd>
                {calibrationOffset >= 0 ? "+" : ""}
                {calibrationOffset} ms
              </dd>
            </div>
            <div>
              <dt>Origin</dt>
              <dd>{demoSong.provenance}</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>{demoSong.license}</dd>
            </div>
          </dl>
          {latestResult && phase === "idle" && (
            <p className="previous-result">
              Last score {latestResult.summary.score.toLocaleString()} ·{" "}
              {latestResult.summary.accuracyPercent.toFixed(0)}%
            </p>
          )}
        </div>

        <div className="track-actions">
          {(phase === "idle" || phase === "finished") && (
            <button
              className="button button--primary"
              type="button"
              onClick={start}
            >
              {phase === "finished" ? "Play again" : "Start demo"}
            </button>
          )}
          {phase === "loading" && (
            <button className="button button--primary" type="button" disabled>
              Preparing audio…
            </button>
          )}
          {!active && phase !== "loading" && (
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setCalibrationDraft(calibrationOffset);
                setCalibrationOpen(true);
              }}
            >
              Calibrate device
            </button>
          )}
        </div>
      </div>

      {calibrationOpen && (
        <div
          className="calibration-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calibration-title"
        >
          <p className="section-label">Timing setup</p>
          <h3 id="calibration-title">Calibrate this device</h3>
          <p>
            If your input is heard late, choose a positive offset. It is
            subtracted once from each audio-clock input.
          </p>
          <label htmlFor="device-offset">
            Device offset{" "}
            <output>
              {calibrationDraft >= 0 ? "+" : ""}
              {calibrationDraft} ms
            </output>
          </label>
          <input
            id="device-offset"
            type="range"
            min="-250"
            max="250"
            step="10"
            value={calibrationDraft}
            onChange={(event) =>
              setCalibrationDraft(Number(event.target.value))
            }
          />
          <div className="calibration-actions">
            <button
              className="button button--primary"
              type="button"
              onClick={saveCalibration}
            >
              Save calibration
            </button>
            <button
              className="button"
              type="button"
              onClick={() => setCalibrationOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {transportError && !active && phase !== "finished" && (
        <p className="transport-error" role="alert">
          {transportError}
        </p>
      )}

      {active && (
        <div className="play-stage">
          <div
            className="scoreboard"
            aria-label="Current score"
            data-testid="scoreboard"
          >
            <span>
              Score <strong>{liveSummary.score.toLocaleString()}</strong>
            </span>
            <span>
              Combo <strong>{currentCombo(judgments)}</strong>
            </span>
            <span>
              Miss <strong>{liveSummary.miss}</strong>
            </span>
          </div>
          <RhythmGameCanvas
            chart={demoChart}
            getSongTime={getSongTime}
            isNoteJudged={isNoteJudged}
            onInput={registerInput}
          />
          {phase === "countdown" && (
            <div className="countdown" role="status" aria-live="polite">
              <span>{countdownBeat}</span>
              <small>Get ready</small>
            </div>
          )}
          {phase === "paused" && (
            <div className="countdown" role="status">
              <span>Ⅱ</span>
              <small>Paused</small>
            </div>
          )}
          <div className="song-progress">
            <progress
              aria-label="Song progress"
              max={demoSong.durationSeconds}
              value={songTime}
            />
            <span data-testid="song-time">
              {songTime.toFixed(1)}s / {demoSong.durationSeconds}s
            </span>
          </div>
          <div className="play-controls">
            <p data-testid="input-feedback" aria-live="polite">
              {inputFeedback}
            </p>
            <div className="transport-actions">
              {phase === "paused" ? (
                <button className="button" type="button" onClick={resume}>
                  Resume
                </button>
              ) : (
                <button
                  className="button"
                  type="button"
                  onClick={pause}
                  disabled={phase !== "playing"}
                >
                  Pause
                </button>
              )}
              <button className="button" type="button" onClick={start}>
                Restart
              </button>
              <button
                className="button button--hit"
                type="button"
                onClick={(event) => registerInput(event.timeStamp)}
                disabled={phase !== "playing"}
              >
                Hit
              </button>
            </div>
          </div>
          {transportError && (
            <p className="transport-error" role="alert">
              {transportError}
            </p>
          )}
        </div>
      )}

      {phase === "finished" && result && (
        <div className="results-panel" role="status" aria-label="Track results">
          <p className="section-label">Track complete</p>
          <h3>Run results</h3>
          <div className="result-score">
            {result.summary.score.toLocaleString()}
          </div>
          <dl className="result-grid">
            <div>
              <dt>Accuracy</dt>
              <dd>{result.summary.accuracyPercent.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>Max combo</dt>
              <dd>{result.summary.maxCombo}</dd>
            </div>
            <div>
              <dt>Perfect</dt>
              <dd>{result.summary.perfect}</dd>
            </div>
            <div>
              <dt>Good</dt>
              <dd>{result.summary.good}</dd>
            </div>
            <div>
              <dt>Miss</dt>
              <dd>{result.summary.miss}</dd>
            </div>
          </dl>
          {transportError && (
            <p className="transport-error" role="alert">
              {transportError}
            </p>
          )}
          <button
            className="button button--primary"
            type="button"
            onClick={start}
          >
            Retry run
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="game-message game-message--error" role="alert">
          <p className="section-label">Audio unavailable</p>
          <h3>We couldn’t start the track.</h3>
          <p>{errorMessage}</p>
          <button className="button" type="button" onClick={start}>
            Retry demo
          </button>
        </div>
      )}
    </section>
  );
}
