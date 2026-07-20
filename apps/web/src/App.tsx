import { SystemStatus } from "./components/SystemStatus";
import { DemoGame } from "./demo/DemoGame";
import { useBuildManifest } from "./hooks/useBuildManifest";

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
            <span>02</span>
            <span>Fair timing and score</span>
          </div>
          <div className="hero-copy">
            <p className="kicker">Your music. Your timing.</p>
            <h1>Make every beat playable.</h1>
            <p className="lede">
              Calibrate your device, follow an original eight-second track, and
              turn accurate hits into score and combo.
            </p>
          </div>
          <SystemStatus state={systemState} onRetry={retry} />
        </section>
        <DemoGame />
      </main>

      <footer className="footer">
        <p>Stage 02 / Fair scoring</p>
        <p>Runs locally in your browser.</p>
      </footer>
    </div>
  );
}
