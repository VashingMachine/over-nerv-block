import { SystemStatus } from "./components/SystemStatus";
import { useSystemSnapshot } from "./hooks/useSystemSnapshot";

const buildId = import.meta.env.VITE_BUILD_ID ?? "development";

export function App() {
  const { retry, ...systemState } = useSystemSnapshot();

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Over Nerv Block home">
          <span>OVER</span>
          <span>NERV</span>
          <span>BLOCK</span>
        </a>
        <span className="build-label">Build {buildId.slice(0, 12)}</span>
      </header>

      <main className="hero">
        <div className="eyebrow">
          <span>01</span>
          <span>System heartbeat</span>
        </div>
        <div className="hero-copy">
          <p className="kicker">Your music. Your timing.</p>
          <h1>Make every beat playable.</h1>
          <p className="lede">
            A web-first rhythm game that will turn your own music into a chart.
            The delivery runway is live; the first playable pulse comes next.
          </p>
        </div>
        <SystemStatus state={systemState} onRetry={retry} />
      </main>

      <footer className="footer">
        <p>Stage 00 / Delivery runway</p>
        <p>Audio stays private by default.</p>
      </footer>
    </div>
  );
}
