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
            <span>03</span>
            <span>Private local audio</span>
          </div>
          <div className="hero-copy">
            <p className="kicker">Your music. Your timing.</p>
            <h1>Make every beat playable.</h1>
            <p className="lede">
              Prepare music privately in this tab, or calibrate your timing on
              the original eight-second demo. Your audio is never uploaded.
            </p>
          </div>
          <SystemStatus state={systemState} onRetry={retry} />
        </section>
        <LocalAudioPicker />
        <DemoGame />
      </main>

      <footer className="footer">
        <p>Stage 03 / Private local audio</p>
        <p>Runs locally in your browser.</p>
      </footer>
    </div>
  );
}
