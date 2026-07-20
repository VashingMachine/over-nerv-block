import type { SystemSnapshot } from "../api/system";

interface SystemStatusProps {
  state:
    | { status: "loading" }
    | { status: "online"; snapshot: SystemSnapshot }
    | { status: "offline"; message: string };
  onRetry: () => void;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-detail">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function SystemStatus({ state, onRetry }: SystemStatusProps) {
  if (state.status === "loading") {
    return (
      <section className="status-card" aria-live="polite" aria-busy="true">
        <div className="status-heading">
          <span className="status-dot status-dot--loading" aria-hidden="true" />
          <p>Contacting rhythm services</p>
        </div>
        <div className="loading-line" aria-hidden="true" />
      </section>
    );
  }

  if (state.status === "offline") {
    return (
      <section
        className="status-card status-card--offline"
        aria-live="assertive"
      >
        <div className="status-heading">
          <span className="status-dot status-dot--offline" aria-hidden="true" />
          <p>System unavailable</p>
        </div>
        <p className="status-message">
          We could not confirm the API heartbeat.
        </p>
        <p className="status-diagnostic">{state.message}</p>
        <button className="button" type="button" onClick={onRetry}>
          Try again
        </button>
      </section>
    );
  }

  const { health, version } = state.snapshot;

  return (
    <section className="status-card status-card--online" aria-live="polite">
      <div className="status-heading">
        <span className="status-dot status-dot--online" aria-hidden="true" />
        <div>
          <p>System online</p>
          <span>Web and API are speaking in tempo.</span>
        </div>
      </div>
      <dl className="status-details">
        <Detail label="Environment" value={health.environment} />
        <Detail label="API version" value={health.version} />
        <Detail label="Chart schema" value={`v${version.schemaVersion}`} />
        <Detail label="Build" value={health.commit.slice(0, 12)} />
      </dl>
    </section>
  );
}
