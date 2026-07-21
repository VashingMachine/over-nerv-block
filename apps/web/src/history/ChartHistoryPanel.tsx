import { useEffect, useState } from "react";

import type { ChartHistoryEntry } from "@rhythm-game/chart-schema";

import type {
  ChartHistoryReadResult,
  ChartHistoryStore,
} from "./chartHistoryStore";

type HistoryStatus =
  | ChartHistoryReadResult["status"]
  | "loading"
  | "deleting"
  | "deleted"
  | "delete_failed"
  | "clearing"
  | "cleared"
  | "clear_failed";

function statusCopy(status: HistoryStatus): string | null {
  switch (status) {
    case "loading":
      return "Checking this browser for chart-only history…";
    case "migrated":
      return "Chart-only history was migrated and restored.";
    case "discarded":
      return "Invalid chart history was discarded. Current music and recovery data were not changed.";
    case "unavailable":
      return "Chart history storage is unavailable. The game still works, but new local results may not survive reload.";
    case "deleting":
      return "Deleting this chart/result entry…";
    case "deleted":
      return "Chart/result entry deleted. Music, recovery, corrections, and calibration were not changed.";
    case "delete_failed":
      return "Could not delete that chart/result entry. It remains saved and can be retried.";
    case "clearing":
      return "Clearing chart-only history…";
    case "cleared":
      return "Chart-only history cleared. Music, recovery, corrections, and calibration were not changed.";
    case "clear_failed":
      return "Could not clear chart-only history. Saved entries remain visible and can be retried.";
    case "loaded":
    case "empty":
      return null;
  }
}

function playedAtLabel(epochMilliseconds: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(epochMilliseconds));
}

export function ChartHistoryPanel({
  store,
  refreshToken,
  onSelectLocalSong,
}: {
  readonly store: ChartHistoryStore;
  readonly refreshToken: number;
  readonly onSelectLocalSong: () => void;
}) {
  const [entries, setEntries] = useState<readonly ChartHistoryEntry[]>([]);
  const [status, setStatus] = useState<HistoryStatus>("loading");

  useEffect(() => {
    let active = true;
    void store.readHistory().then((result) => {
      if (!active) {
        return;
      }
      setEntries(
        result.status === "loaded" || result.status === "migrated"
          ? result.entries
          : [],
      );
      setStatus(result.status);
    });
    return () => {
      active = false;
    };
  }, [refreshToken, store]);

  const deleteEntry = (id: string) => {
    setStatus("deleting");
    void store.deleteEntry(id).then((result) => {
      if (result === "deleted") {
        setEntries((current) => current.filter((entry) => entry.id !== id));
        setStatus("deleted");
      } else if (result === "discarded") {
        setEntries([]);
        setStatus("discarded");
      } else if (result === "not_found") {
        setEntries((current) => current.filter((entry) => entry.id !== id));
        setStatus("deleted");
      } else {
        setStatus("delete_failed");
      }
    });
  };

  const clearHistory = () => {
    setStatus("clearing");
    void store.clearHistory().then((result) => {
      if (result === "cleared") {
        setEntries([]);
        setStatus("cleared");
      } else {
        setStatus("clear_failed");
      }
    });
  };

  return (
    <section className="chart-history" aria-labelledby="chart-history-title">
      <p className="section-label">Chart-only history · this browser</p>
      <h2 id="chart-history-title">Recent charts and results</h2>
      <p className="chart-history__privacy">
        <strong>Audio and filenames are never saved.</strong> Up to 20 recent
        generated charts/results stay on this device until you delete them,
        clear site data, or the browser evicts local storage.
      </p>
      <p>
        A saved chart can be reviewed without music. To play it again, select
        the local song and analyze it; history never matches files by name.
      </p>
      {statusCopy(status) ? (
        <p className="recovery-status" role="status">
          {statusCopy(status)}
        </p>
      ) : null}

      {entries.length === 0 && status !== "loading" ? (
        <div className="chart-history__empty">
          <h3>No local chart results yet</h3>
          <p>Complete a generated local chart to add its audio-free result.</p>
        </div>
      ) : null}

      <div className="chart-history__entries">
        {entries.map((entry) => (
          <article className="chart-history__entry" key={entry.id}>
            <div className="chart-history__heading">
              <div>
                <p className="local-audio__status-label">
                  {entry.chart.difficulty} · chart and result
                </p>
                <h3>{entry.chart.title}</h3>
                <time dateTime={entry.result.playedAt}>
                  Played {playedAtLabel(entry.savedAtEpochMs)}
                </time>
              </div>
              <strong>{entry.result.summary.score.toLocaleString()}</strong>
            </div>
            <dl className="chart-history__facts">
              <div>
                <dt>Accuracy</dt>
                <dd>{entry.result.summary.accuracyPercent.toFixed(1)}%</dd>
              </div>
              <div>
                <dt>Max combo</dt>
                <dd>{entry.result.summary.maxCombo}</dd>
              </div>
              <div>
                <dt>Chart</dt>
                <dd>{entry.chart.notes.length} notes</dd>
              </div>
              <div>
                <dt>Rhythm</dt>
                <dd>
                  {entry.tempoBpm.toFixed(1)} BPM · {entry.meter ?? "?"}/4
                </dd>
              </div>
              <div>
                <dt>Analyzer</dt>
                <dd>{entry.chart.analyzerVersion}</dd>
              </div>
              <div>
                <dt>Generator</dt>
                <dd>{entry.chart.generatorVersion}</dd>
              </div>
              {entry.chart.correction ? (
                <div>
                  <dt>Correction</dt>
                  <dd>revision {entry.chart.correction.revision}</dd>
                </div>
              ) : null}
            </dl>
            <div
              className="chart-history__timeline"
              role="img"
              aria-label={`${entry.chart.difficulty} historical chart with ${entry.chart.notes.length} notes`}
            >
              {entry.chart.notes.map((note, index) => (
                <span
                  key={`${note.timeSeconds}-${index}`}
                  style={{
                    left: `${Math.min(100, (note.timeSeconds / entry.chart.durationSeconds) * 100)}%`,
                  }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <p className="generated-chart__audio-needed">
              Audio was never saved. Select and analyze the local song again
              before playing this chart.
            </p>
            <div className="chart-history__actions">
              <button
                className="button button--primary"
                type="button"
                onClick={onSelectLocalSong}
              >
                Select and analyze local song again
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={status === "deleting" || status === "clearing"}
                onClick={() => deleteEntry(entry.id)}
              >
                Delete entry
              </button>
            </div>
          </article>
        ))}
      </div>

      {entries.length > 0 ? (
        <button
          className="button button--secondary"
          type="button"
          disabled={status === "clearing" || status === "deleting"}
          onClick={clearHistory}
        >
          Clear chart history
        </button>
      ) : null}
    </section>
  );
}
