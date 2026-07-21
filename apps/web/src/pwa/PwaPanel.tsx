import { usePwaStatus } from "./usePwaStatus";

export function PwaPanel({
  buildIdentifier,
}: {
  readonly buildIdentifier: string;
}) {
  const pwa = usePwaStatus(buildIdentifier);
  return (
    <section className="pwa-card" aria-labelledby="pwa-title">
      <div>
        <p className="section-label">Local app</p>
        <h2 id="pwa-title">Install and play offline</h2>
        <p
          data-testid="pwa-message"
          role={pwa.phase === "error" ? "alert" : "status"}
        >
          {pwa.message}
        </p>
      </div>
      <dl className="pwa-facts">
        <div>
          <dt>Connection</dt>
          <dd>{pwa.online ? "Online" : "Offline"}</dd>
        </div>
        <div>
          <dt>Bundled demo</dt>
          <dd>
            {pwa.cacheReady ? "Offline ready" : "Online only until cached"}
          </dd>
        </div>
        <div>
          <dt>Selected music</dt>
          <dd>Browser-local · never cached</dd>
        </div>
      </dl>
      <div className="pwa-actions">
        {pwa.installAvailable && !pwa.installed ? (
          <button
            className="button button--primary"
            type="button"
            onClick={() => void pwa.requestInstall()}
          >
            Install app
          </button>
        ) : (
          <p className="pwa-guidance">
            {pwa.installed
              ? "Installed as an app on this device."
              : "If supported, use your browser menu to install this app."}
          </p>
        )}
        {pwa.updateWaiting ? (
          <button className="button" type="button" onClick={pwa.applyUpdate}>
            Apply update
          </button>
        ) : null}
        {pwa.supported && !pwa.cacheReady ? (
          <button
            className="button"
            type="button"
            onClick={() => void pwa.checkCache()}
          >
            Check offline readiness
          </button>
        ) : null}
      </div>
      <p className="privacy-note">
        Offline storage contains only this app and its owned demo. Local songs,
        filenames, decoded audio, and generated previews stay out of the cache.
      </p>
    </section>
  );
}
