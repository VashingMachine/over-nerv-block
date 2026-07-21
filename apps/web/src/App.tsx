import { SystemStatus } from "./components/SystemStatus";
import { DemoGame } from "./demo/DemoGame";
import { useBuildManifest } from "./hooks/useBuildManifest";
import { LocalAudioPicker } from "./localAudio/LocalAudioPicker";

const buildId = import.meta.env.VITE_BUILD_ID ?? "development";

export function App() {
  const { retry, ...systemState } = useBuildManifest();

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="./" aria-label="Over Nerv Block home">
          <span>OVER</span>
          <span>NERV</span>
          <span>BLOCK</span>
        </a>
        <span className="build-label">Build {buildId.slice(0, 12)}</span>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow">
            <span>04</span>
            <span>Baseline beat grid</span>
          </div>
          <div className="hero-copy">
            <p className="kicker">Your music. Your timing.</p>
            <h1>Make every beat playable.</h1>
            <p className="lede">
              Prepare music privately, detect a first-pass beat grid off the
              main thread, or calibrate on the original demo. Nothing is
              uploaded.
            </p>
          </div>
          <SystemStatus state={systemState} onRetry={retry} />
        </section>
        <LocalAudioPicker />
        <DemoGame />
      </main>

      <footer className="footer">
        <p>Stage 04 / Baseline beat grid</p>
        <p>Runs locally in your browser.</p>
      </footer>
    </div>
  );
}
