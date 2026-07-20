import { useCallback, useEffect, useRef, useState } from "react";

import {
  createWebAudioEngine,
  type AudioEngine,
  type AudioEngineFactory,
} from "./audioEngine";
import { countdownSeconds, demoChart, demoSong } from "./demoContent";
import { loadPhaser } from "./phaserRuntime";
import { RhythmGameCanvas } from "./RhythmGameCanvas";

type GamePhase =
  "idle" | "loading" | "countdown" | "playing" | "finished" | "error";

interface DemoGameProps {
  createAudioEngine?: AudioEngineFactory;
}

function readableError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "The demo track could not start.";
}

export function DemoGame({
  createAudioEngine = createWebAudioEngine,
}: DemoGameProps) {
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [countdownBeat, setCountdownBeat] = useState(3);
  const [inputCount, setInputCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const engineRef = useRef<AudioEngine | null>(null);

  const disposeEngine = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
  }, []);

  useEffect(() => disposeEngine, [disposeEngine]);

  const getSongTime = useCallback(
    () => engineRef.current?.songTimeSeconds() ?? -Infinity,
    [],
  );

  const registerInput = useCallback(() => {
    setInputCount((current) => current + 1);
  }, []);

  useEffect(() => {
    if (phase !== "countdown" && phase !== "playing") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        registerInput();
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
      const songTime = getSongTime();
      if (songTime >= 0) {
        setPhase("playing");
        return;
      }
      const beatSeconds = 60 / demoSong.bpm;
      setCountdownBeat(Math.max(1, Math.ceil(-songTime / beatSeconds)));
    }, 50);

    return () => window.clearInterval(timer);
  }, [getSongTime, phase]);

  const start = useCallback(async () => {
    disposeEngine();
    setPhase("loading");
    setErrorMessage("");
    setInputCount(0);
    setCountdownBeat(3);

    const engine = createAudioEngine();
    engineRef.current = engine;

    try {
      await engine.start({
        audioUrl: new URL(demoSong.audioPath, document.baseURI).toString(),
        beforeSchedule: loadPhaser,
        countdownSeconds,
        onEnded: () => {
          if (engineRef.current === engine) {
            setPhase("finished");
          }
        },
      });
      if (engineRef.current === engine) {
        setPhase("countdown");
      }
    } catch (error) {
      if (engineRef.current === engine) {
        engine.dispose();
        engineRef.current = null;
        setErrorMessage(readableError(error));
        setPhase("error");
      }
    }
  }, [createAudioEngine, disposeEngine]);

  const active = phase === "countdown" || phase === "playing";

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
              <dt>Origin</dt>
              <dd>{demoSong.provenance}</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>{demoSong.license}</dd>
            </div>
          </dl>
        </div>

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
      </div>

      {active && (
        <div className="play-stage">
          <RhythmGameCanvas
            chart={demoChart}
            getSongTime={getSongTime}
            onInput={registerInput}
          />
          {phase === "countdown" && (
            <div className="countdown" role="status" aria-live="polite">
              <span>{countdownBeat}</span>
              <small>Get ready</small>
            </div>
          )}
          <div className="play-controls">
            <p data-testid="input-feedback" aria-live="polite">
              {inputCount === 0
                ? "Waiting for input"
                : `Input ${inputCount} received`}
            </p>
            <button
              className="button button--hit"
              type="button"
              onClick={registerInput}
            >
              Hit
            </button>
          </div>
        </div>
      )}

      {phase === "finished" && (
        <div className="game-message game-message--success" role="status">
          <p className="section-label">Track complete</p>
          <h3>Nice run.</h3>
          <p>The full demo played from the Web Audio clock.</p>
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
