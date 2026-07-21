import { useMemo, useState } from "react";

import {
  rhythmCorrectionDocumentSchema,
  type GenerationRhythmAnalysis,
  type QualityRhythmAnalysis,
  type RhythmCorrectionDocument,
  type RhythmCorrectionOperation,
} from "@rhythm-game/chart-schema";

import { GeneratedDifficultyPicker } from "../chartGeneration/GeneratedDifficultyPicker";

import {
  readCorrectionDocument,
  saveCorrectionDocument,
} from "./correctionStore";
import {
  appendCorrectionOperation,
  correctionOperationLabel,
  correctionSourceFingerprint,
  createCorrectionDocument,
  projectCorrections,
  RhythmCorrectionError,
} from "./rhythmCorrection";

interface RhythmCorrectionEditorProps {
  readonly analysis: QualityRhythmAnalysis;
  readonly audioUrl: string;
  readonly getPreviewTime: () => number;
  readonly storage?: Storage | null;
}

type PersistenceState =
  "empty" | "saved" | "loaded" | "migrated" | "discarded" | "unavailable";

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function persistenceCopy(state: PersistenceState): string {
  switch (state) {
    case "saved":
      return "Corrections saved locally. Audio and analysis were not saved.";
    case "loaded":
      return "Saved corrections restored for this matching analysis.";
    case "migrated":
      return "Saved corrections migrated and restored for this analysis.";
    case "discarded":
      return "Invalid saved corrections were discarded. The original analysis is unchanged.";
    case "unavailable":
      return "Browser storage is unavailable. Corrections still work in this tab but will not survive reload.";
    case "empty":
      return "No correction is saved. Audio and analyzer output are never stored here.";
  }
}

function readableCorrectionError(error: unknown): string {
  return error instanceof RhythmCorrectionError
    ? error.message
    : "That correction could not be applied. Check the values and try again.";
}

function createInitialState(
  analysis: QualityRhythmAnalysis,
  storage: Storage | null,
): {
  document: RhythmCorrectionDocument;
  persistence: PersistenceState;
} {
  const empty = createCorrectionDocument(analysis);
  const loaded = readCorrectionDocument(storage, empty.sourceFingerprint);
  if (!loaded.document) {
    return { document: empty, persistence: loaded.status };
  }
  try {
    projectCorrections(analysis, loaded.document);
    return {
      document: loaded.document,
      persistence: loaded.status,
    };
  } catch {
    saveCorrectionDocument(storage, empty);
    return { document: empty, persistence: "discarded" };
  }
}

export function RhythmCorrectionEditor({
  analysis,
  audioUrl,
  getPreviewTime,
  storage = browserStorage(),
}: RhythmCorrectionEditorProps) {
  const sourceFingerprint = useMemo(
    () => correctionSourceFingerprint(analysis),
    [analysis],
  );
  const initial = useMemo(
    () => createInitialState(analysis, storage),
    [analysis, storage],
  );
  const [document, setDocument] = useState(initial.document);
  const [persistence, setPersistence] = useState<PersistenceState>(
    initial.persistence,
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [offsetMilliseconds, setOffsetMilliseconds] = useState("0");
  const [beatTime, setBeatTime] = useState(
    String(analysis.beats[0]!.timeSeconds),
  );
  const [newBeatTime, setNewBeatTime] = useState(
    String(
      Math.min(analysis.durationSeconds, analysis.beats[0]!.timeSeconds + 0.25),
    ),
  );
  const [tapTimes, setTapTimes] = useState<number[]>([]);

  const corrected = useMemo(
    () => projectCorrections(analysis, document),
    [analysis, document],
  );
  const generationAnalysis: GenerationRhythmAnalysis =
    document.revision === 0 ? analysis : corrected;
  const selectedBeatTime = corrected.beats.some(
    (beat) => beat.timeSeconds === Number(beatTime),
  )
    ? beatTime
    : String(corrected.beats[0]!.timeSeconds);

  const persist = (nextDocument: RhythmCorrectionDocument) => {
    const result = saveCorrectionDocument(storage, nextDocument);
    setPersistence(result === "cleared" ? "empty" : result);
  };

  const commit = (operation: RhythmCorrectionOperation) => {
    try {
      const next = appendCorrectionOperation(analysis, document, operation);
      setDocument(next.document);
      persist(next.document);
      setErrorMessage("");
      return true;
    } catch (error) {
      setErrorMessage(readableCorrectionError(error));
      return false;
    }
  };

  const applyOffset = () => {
    const milliseconds = Number(offsetMilliseconds);
    if (!Number.isInteger(milliseconds)) {
      setErrorMessage(
        "Enter a whole number of milliseconds from -1000 to 1000.",
      );
      return;
    }
    commit({ kind: "offset", milliseconds });
  };

  const addBeat = () => {
    const timeSeconds = Number(newBeatTime);
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
      setErrorMessage("Enter a valid beat time inside this song.");
      return;
    }
    commit({ kind: "add_beat", timeSeconds });
  };

  const recordTap = () => {
    const timeSeconds = Math.round(getPreviewTime() * 1_000) / 1_000;
    if (
      !Number.isFinite(timeSeconds) ||
      timeSeconds < 0 ||
      timeSeconds > analysis.durationSeconds ||
      (tapTimes.length > 0 && timeSeconds <= tapTimes.at(-1)!)
    ) {
      setErrorMessage(
        "Play the local preview and tap later than the previous tap.",
      );
      return;
    }
    setTapTimes((current) => [...current, timeSeconds].slice(0, 16));
    setErrorMessage("");
  };

  const applyTaps = () => {
    if (tapTimes.length < 3) {
      setErrorMessage("Record at least three taps before applying a tap grid.");
      return;
    }
    if (commit({ kind: "tap_grid", tapTimesSeconds: tapTimes })) {
      setTapTimes([]);
    }
  };

  const undo = () => {
    if (document.operations.length === 0) {
      return;
    }
    const operations = document.operations.slice(0, -1);
    const next = rhythmCorrectionDocumentSchema.parse({
      ...document,
      revision: operations.length,
      operations,
    });
    projectCorrections(analysis, next);
    setDocument(next);
    persist(next);
    setErrorMessage("");
  };

  const reset = () => {
    const next = createCorrectionDocument(analysis);
    setDocument(next);
    persist(next);
    setTapTimes([]);
    setErrorMessage("");
  };

  return (
    <section
      className="correction-editor"
      aria-labelledby="correction-editor-title"
      data-testid="correction-editor"
    >
      <p className="local-audio__status-label">correction_workspace_ready</p>
      <h4 id="correction-editor-title">Correct the detected rhythm</h4>
      <p>
        Use musical fixes, not algorithm settings. The detected result stays
        unchanged; this editor saves only your compact correction steps.
      </p>

      <dl className="correction-comparison">
        <div>
          <dt>Original</dt>
          <dd>
            {analysis.tempoBpm.toFixed(1)} BPM · {analysis.beats.length} beats ·{" "}
            {analysis.meter ? `${analysis.meter}/4` : "uncertain meter"}
          </dd>
        </div>
        <div>
          <dt>Working</dt>
          <dd>
            {corrected.tempoBpm.toFixed(1)} BPM · {corrected.beats.length} beats
            · {corrected.meter ? `${corrected.meter}/4` : "uncertain meter"}
          </dd>
        </div>
        <div>
          <dt>Correction revision</dt>
          <dd>{document.revision}</dd>
        </div>
        <div>
          <dt>Editor contract</dt>
          <dd>
            {document.editorVersion} · v{document.correctionContractVersion}
          </dd>
        </div>
        <div>
          <dt>Source fingerprint</dt>
          <dd>{sourceFingerprint.slice(0, 12)}</dd>
        </div>
      </dl>

      <p className="correction-persistence" role="status">
        {persistenceCopy(persistence)}
      </p>
      {errorMessage ? (
        <p className="correction-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="correction-controls">
        <fieldset>
          <legend>Shift every beat</legend>
          <label htmlFor="correction-offset">Offset in milliseconds</label>
          <input
            id="correction-offset"
            type="number"
            min="-1000"
            max="1000"
            step="10"
            value={offsetMilliseconds}
            onChange={(event) => setOffsetMilliseconds(event.target.value)}
          />
          <button className="button" type="button" onClick={applyOffset}>
            Apply offset
          </button>
        </fieldset>

        <fieldset>
          <legend>Fix tempo interpretation</legend>
          <button
            className="button"
            type="button"
            onClick={() => commit({ kind: "tempo_scale", factor: 0.5 })}
          >
            Use half tempo
          </button>
          <button
            className="button"
            type="button"
            onClick={() => commit({ kind: "tempo_scale", factor: 2 })}
          >
            Use double tempo
          </button>
        </fieldset>

        <fieldset>
          <legend>Fix bars and downbeats</legend>
          <div className="correction-inline-actions">
            <button
              className="button"
              type="button"
              aria-pressed={corrected.meter === 3}
              onClick={() => commit({ kind: "set_meter", meter: 3 })}
            >
              Use 3/4
            </button>
            <button
              className="button"
              type="button"
              aria-pressed={corrected.meter === 4}
              onClick={() => commit({ kind: "set_meter", meter: 4 })}
            >
              Use 4/4
            </button>
          </div>
          <label htmlFor="correction-beat-select">Selected beat</label>
          <select
            id="correction-beat-select"
            value={selectedBeatTime}
            onChange={(event) => setBeatTime(event.target.value)}
          >
            {corrected.beats.map((beat, index) => (
              <option
                key={`${index}-${beat.timeSeconds}`}
                value={beat.timeSeconds}
              >
                Beat {index + 1} · {beat.timeSeconds.toFixed(2)} s
              </option>
            ))}
          </select>
          <button
            className="button"
            type="button"
            onClick={() =>
              commit({
                kind: "first_downbeat",
                timeSeconds: Number(selectedBeatTime),
              })
            }
          >
            Set as first downbeat
          </button>
        </fieldset>

        <fieldset>
          <legend>Tap tempo and phase</legend>
          <p>Play the private preview, then tap 3–16 steady beats.</p>
          <p>
            <strong>{tapTimes.length}</strong> taps recorded
          </p>
          <div className="correction-inline-actions">
            <button className="button" type="button" onClick={recordTap}>
              Tap beat
            </button>
            <button className="button" type="button" onClick={applyTaps}>
              Apply tap grid
            </button>
            <button
              className="button"
              type="button"
              onClick={() => setTapTimes([])}
            >
              Clear taps
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Add or remove a beat</legend>
          <label htmlFor="correction-new-beat">New beat time in seconds</label>
          <input
            id="correction-new-beat"
            type="number"
            min="0"
            max={analysis.durationSeconds}
            step="0.01"
            value={newBeatTime}
            onChange={(event) => setNewBeatTime(event.target.value)}
          />
          <button className="button" type="button" onClick={addBeat}>
            Add beat
          </button>
          <button
            className="button"
            type="button"
            onClick={() =>
              commit({
                kind: "remove_beat",
                timeSeconds: Number(selectedBeatTime),
              })
            }
          >
            Remove selected beat
          </button>
        </fieldset>
      </div>

      <div
        className="correction-timeline"
        role="img"
        aria-label={`Corrected grid with ${corrected.beats.length} beats across ${corrected.durationSeconds.toFixed(1)} seconds`}
      >
        {corrected.beats.map((beat, index) => (
          <span
            key={`${index}-${beat.timeSeconds}`}
            className={beat.isDownbeat ? "is-downbeat" : undefined}
            style={{
              left: `${Math.min(100, (beat.timeSeconds / corrected.durationSeconds) * 100)}%`,
            }}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="correction-history">
        <div>
          <h5>Correction history</h5>
          <p>{document.operations.length} committed operations</p>
        </div>
        {document.operations.length > 0 ? (
          <ol>
            {document.operations.map((operation, index) => (
              <li key={`${index}-${operation.kind}`}>
                {correctionOperationLabel(operation)}
              </li>
            ))}
          </ol>
        ) : (
          <p>Working grid matches the original analysis.</p>
        )}
        <div className="correction-inline-actions">
          <button
            className="button"
            type="button"
            disabled={document.operations.length === 0}
            onClick={undo}
          >
            Undo last correction
          </button>
          <button
            className="button"
            type="button"
            disabled={document.operations.length === 0}
            onClick={reset}
          >
            Reset all corrections
          </button>
        </div>
      </div>

      <GeneratedDifficultyPicker
        analysis={generationAnalysis}
        audioUrl={audioUrl}
      />
    </section>
  );
}
