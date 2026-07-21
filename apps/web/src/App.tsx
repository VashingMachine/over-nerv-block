import { SystemStatus } from "./components/SystemStatus";
import { AccessibilityPanel } from "./accessibility/AccessibilityPanel";
import { DemoGame } from "./demo/DemoGame";
import { useBuildManifest } from "./hooks/useBuildManifest";
import { LocalAudioPicker } from "./localAudio/LocalAudioPicker";
import { PwaPanel } from "./pwa/PwaPanel";

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
            <span>10</span>
            <span>Responsive, accessible local app</span>
          </div>
          <div className="hero-copy">
            <p className="kicker">Your music. Your timing.</p>
            <h1>Make every beat playable.</h1>
            <p className="lede">
              Prepare music privately, correct its rhythm, play a generated
              chart, and keep recent chart/results without saving audio. Nothing
              is uploaded.
            </p>
          </div>
          <SystemStatus state={systemState} onRetry={retry} />
        </section>
        <div className="settings-grid">
          <PwaPanel buildIdentifier={buildId} />
          <AccessibilityPanel />
        </div>
        <LocalAudioPicker />
        <DemoGame />
      </main>

      <footer className="footer">
        <p>Stage 10 / Responsive, accessible PWA</p>
        <p>Local production build · no cloud server.</p>
      </footer>
    </div>
  );
}
