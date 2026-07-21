import { useMemo, useState } from "react";

import {
  chartDifficulties,
  type ChartDifficulty,
  type GenerationRhythmAnalysis,
} from "@rhythm-game/chart-schema";

import { RhythmGame, type RhythmGameExperience } from "../demo/DemoGame";
import {
  createChartHistoryEntry,
  type ChartHistoryStore,
} from "../history/chartHistoryStore";

import {
  ChartGenerationError,
  generateDifficultyCharts,
} from "./generateDifficultyCharts";

interface GeneratedDifficultyPickerProps {
  readonly analysis: GenerationRhythmAnalysis;
  readonly audioUrl?: string;
  readonly historyStore?: ChartHistoryStore;
  readonly onHistoryChanged?: () => void;
}

const difficultyCopy: Record<
  ChartDifficulty,
  { readonly name: string; readonly description: string }
> = {
  easy: {
    name: "Easy",
    description: "Bar starts and the safest anchors.",
  },
  medium: {
    name: "Medium",
    description: "Adds alternating beats while preserving space.",
  },
  hard: {
    name: "Hard",
    description: "Uses every safe, salient detected beat.",
  },
};

function readableGenerationError(error: unknown): string {
  if (
    error instanceof ChartGenerationError &&
    error.code === "insufficient_safe_beats"
  ) {
    return "Not enough safe rhythmic anchors were found for three playable difficulties. Try another song or analyze again.";
  }
  return "The detected rhythm could not be converted into a safe chart. Analyze again or choose another song.";
}

export function GeneratedDifficultyPicker({
  analysis,
  audioUrl,
  historyStore,
  onHistoryChanged,
}: GeneratedDifficultyPickerProps) {
  const [difficulty, setDifficulty] = useState<ChartDifficulty>("easy");
  const [historyStatus, setHistoryStatus] = useState<
    "idle" | "saving" | "saved" | "unavailable"
  >("idle");
  const generation = useMemo(() => {
    try {
      return {
        kind: "complete" as const,
        charts: generateDifficultyCharts(analysis),
      };
    } catch (error) {
      return {
        kind: "error" as const,
        message: readableGenerationError(error),
      };
    }
  }, [analysis]);

  if (generation.kind === "error") {
    return (
      <section className="generated-difficulties generated-difficulties--error">
        <p className="local-audio__status-label">chart_generation_paused</p>
        <div role="alert">
          <h4>No safe playable chart</h4>
          <p>{generation.message}</p>
        </div>
      </section>
    );
  }

  const selectedChart = generation.charts[difficulty];
  const density = Math.round(
    selectedChart.notes.length / (selectedChart.durationSeconds / 60),
  );
  const experience: RhythmGameExperience | null = audioUrl
    ? {
        songId: selectedChart.id,
        title: `Your local song · ${difficultyCopy[difficulty].name}`,
        artist: "Analyzed and generated privately in this tab",
        durationSeconds: selectedChart.durationSeconds,
        bpm: analysis.tempoBpm,
        audioUrl,
        chart: selectedChart,
        sectionLabel: `${difficultyCopy[difficulty].name} generated chart · one lane`,
        startLabel: `Start ${difficultyCopy[difficulty].name} chart`,
        onResult: historyStore
          ? (result) => {
              setHistoryStatus("saving");
              void historyStore
                .saveEntry(
                  createChartHistoryEntry({
                    chart: selectedChart,
                    result,
                    tempoBpm: analysis.tempoBpm,
                    meter: analysis.meter,
                  }),
                )
                .then((status) => {
                  setHistoryStatus(status);
                  if (status === "saved") {
                    onHistoryChanged?.();
                  }
                });
            }
          : undefined,
      }
    : null;

  return (
    <section
      className="generated-difficulties"
      aria-labelledby="difficulty-title"
      data-testid="generated-difficulties"
    >
      <p className="local-audio__status-label">playable_charts_ready</p>
      <h4 id="difficulty-title">Choose your difficulty</h4>
      <p>
        All charts use the same detected rhythm. Harder levels add safe notes;
        they never move the easier ones.
      </p>

      <div className="difficulty-picker" aria-label="Chart difficulty">
        {chartDifficulties.map((candidate) => {
          const chart = generation.charts[candidate];
          const copy = difficultyCopy[candidate];
          return (
            <button
              className={`difficulty-card${difficulty === candidate ? " difficulty-card--selected" : ""}`}
              type="button"
              key={candidate}
              aria-pressed={difficulty === candidate}
              onClick={() => {
                setDifficulty(candidate);
                setHistoryStatus("idle");
              }}
            >
              <strong>{copy.name}</strong>
              <span>{copy.description}</span>
              <small>{chart.notes.length} notes</small>
            </button>
          );
        })}
      </div>

      <div className="generated-chart" data-testid="generated-chart">
        <div className="generated-chart__heading">
          <div>
            <p className="local-audio__status-label">Selected chart</p>
            <h5>{difficultyCopy[difficulty].name}</h5>
          </div>
          <strong>{selectedChart.notes.length} notes</strong>
        </div>
        <dl className="generated-chart__facts">
          <div>
            <dt>Density</dt>
            <dd>{density} notes/min</dd>
          </div>
          <div>
            <dt>Minimum spacing</dt>
            <dd>
              {selectedChart.generation.minimumSpacingSeconds.toFixed(2)} s
            </dd>
          </div>
          <div>
            <dt>Analyzer</dt>
            <dd>{selectedChart.analyzerVersion}</dd>
          </div>
          <div>
            <dt>Generator</dt>
            <dd>{selectedChart.generatorVersion}</dd>
          </div>
          {selectedChart.correction ? (
            <div>
              <dt>Correction</dt>
              <dd>
                revision {selectedChart.correction.revision} ·{" "}
                {selectedChart.correction.editorVersion}
              </dd>
            </div>
          ) : null}
        </dl>
        <div
          className="generated-chart__timeline"
          role="img"
          aria-label={`${difficultyCopy[difficulty].name} chart with ${selectedChart.notes.length} notes across ${selectedChart.durationSeconds.toFixed(1)} seconds`}
        >
          {selectedChart.notes.map((note, index) => (
            <span
              key={`${note.timeSeconds}-${index}`}
              className={`generated-chart__note generated-chart__note--${note.source}`}
              style={{
                left: `${Math.min(100, (note.timeSeconds / selectedChart.durationSeconds) * 100)}%`,
              }}
              aria-hidden="true"
            />
          ))}
        </div>
        <p className="generated-chart__guard">
          Intro, outro, quiet-beat, spacing, density, and confidence guards are
          active. Generation seed: {selectedChart.seed}.
        </p>
      </div>

      {experience ? (
        <>
          <RhythmGame key={selectedChart.id} experience={experience} />
          {historyStatus !== "idle" ? (
            <p className="recovery-status" role="status">
              {historyStatus === "saving"
                ? "Saving this audio-free chart/result to recent history…"
                : historyStatus === "saved"
                  ? "Chart and result saved to recent history. Audio and filename were not saved."
                  : "Results are visible, but chart history storage is unavailable."}
            </p>
          ) : null}
        </>
      ) : (
        <div className="generated-chart__audio-needed" role="status">
          <h5>Audio needed to play</h5>
          <p>
            Audio was never saved. Select and analyze the local song again to
            play this recovered chart.
          </p>
        </div>
      )}
    </section>
  );
}
