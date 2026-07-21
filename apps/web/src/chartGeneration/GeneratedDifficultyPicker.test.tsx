import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  baselineAnalyzerVersion,
  qualityAnalyzerVersion,
  schemaVersion,
  type QualityRhythmAnalysis,
} from "@rhythm-game/chart-schema";

import type { ChartHistoryStore } from "../history/chartHistoryStore";

import { GeneratedDifficultyPicker } from "./GeneratedDifficultyPicker";

vi.mock("../demo/DemoGame", () => ({
  RhythmGame: ({
    experience,
  }: {
    experience: {
      title: string;
      startLabel: string;
      chart: {
        id: string;
        notes: readonly { timeSeconds: number }[];
      };
      onResult?: (result: never) => void;
    };
  }) => (
    <div
      data-testid="generated-rhythm-game"
      data-chart-id={experience.chart.id}
    >
      <span>{experience.title}</span>
      <button>{experience.startLabel}</button>
      <button
        onClick={() =>
          experience.onResult?.({
            schemaVersion: 1,
            songId: experience.chart.id,
            chartId: experience.chart.id,
            playedAt: "2026-07-21T06:00:00.000Z",
            calibrationOffsetMilliseconds: 0,
            judgments: experience.chart.notes.map((note, noteIndex) => ({
              noteIndex,
              noteTimeSeconds: note.timeSeconds,
              inputTimeSeconds: null,
              offsetMilliseconds: null,
              judgment: "miss",
            })),
            summary: {
              perfect: 0,
              good: 0,
              miss: experience.chart.notes.length,
              score: 0,
              maxCombo: 0,
              accuracyPercent: 0,
            },
          } as never)
        }
      >
        Complete owned run
      </button>
    </div>
  ),
}));

function analysisFixture(): QualityRhythmAnalysis {
  return {
    schemaVersion,
    kind: "quality_rhythm_analysis",
    analyzerVersion: qualityAnalyzerVersion,
    durationSeconds: 8,
    analysisSampleRate: 11_025,
    tempoBpm: 120,
    meter: 4,
    confidence: {
      tempo: 0.9,
      beat: 0.9,
      downbeat: 0.9,
      agreement: 1,
      overall: 0.9,
    },
    tempoCandidates: [{ bpm: 120, score: 1, relation: "selected" }],
    warnings: [],
    baselineComparison: {
      analyzerVersion: baselineAnalyzerVersion,
      tempoDeltaBpm: 0,
      beatAgreement: 1,
      fallbackUsed: false,
    },
    beats: Array.from({ length: 13 }, (_, index) => ({
      timeSeconds: 1 + index * 0.5,
      strength: index % 4 === 0 ? 1 : index % 2 === 0 ? 0.72 : 0.55,
      isDownbeat: index % 4 === 0,
      positionInBar: (index % 4) + 1,
    })),
  };
}

describe("generated difficulty picker", () => {
  it("shows all levels and defaults to a playable Easy chart", () => {
    render(
      <GeneratedDifficultyPicker
        analysis={analysisFixture()}
        audioUrl="blob:owned-fixture"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Choose your difficulty" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Bar starts and the safest anchors/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /Adds alternating beats/ }),
    ).toHaveTextContent("7 notes");
    expect(
      screen.getByRole("button", { name: /Uses every safe/ }),
    ).toHaveTextContent("13 notes");
    expect(screen.getByTestId("generated-chart")).toHaveTextContent(
      "difficulty-generator-v1",
    );
    expect(
      screen.getByRole("button", { name: "Start Easy chart" }),
    ).toBeVisible();
  });

  it("switches the selected chart and complete play action", () => {
    render(
      <GeneratedDifficultyPicker
        analysis={analysisFixture()}
        audioUrl="blob:owned-fixture"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Uses every safe/ }));

    expect(
      screen.getByRole("button", { name: /Uses every safe/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("generated-chart")).toHaveTextContent("13 notes");
    expect(
      screen.getByRole("img", { name: /Hard chart with 13 notes/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Start Hard chart" }),
    ).toBeVisible();
    expect(screen.getByText("Your local song · Hard")).toBeVisible();
  });

  it("saves a completed generated chart/result without audio identity", async () => {
    const saveEntry = vi.fn<ChartHistoryStore["saveEntry"]>(async () =>
      Promise.resolve("saved"),
    );
    const onHistoryChanged = vi.fn();
    const historyStore = {
      readHistory: vi.fn(),
      saveEntry,
      deleteEntry: vi.fn(),
      clearHistory: vi.fn(),
    } as unknown as ChartHistoryStore;
    render(
      <GeneratedDifficultyPicker
        analysis={analysisFixture()}
        audioUrl="blob:owned-fixture"
        historyStore={historyStore}
        onHistoryChanged={onHistoryChanged}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Complete owned run" }));

    expect(await screen.findByText(/saved to recent history/i)).toBeVisible();
    expect(saveEntry).toHaveBeenCalledOnce();
    expect(saveEntry.mock.calls[0]![0]).toMatchObject({
      kind: "chart_result_history_entry",
      chart: { difficulty: "easy" },
      result: { summary: { miss: 4 } },
    });
    expect(JSON.stringify(saveEntry.mock.calls[0]![0])).not.toMatch(
      /filename|blob:|audioUrl/i,
    );
    expect(onHistoryChanged).toHaveBeenCalledOnce();
  });

  it("restores every chart summary without inventing playable audio", () => {
    render(<GeneratedDifficultyPicker analysis={analysisFixture()} />);

    expect(
      screen.getByRole("heading", { name: "Choose your difficulty" }),
    ).toBeVisible();
    expect(screen.getByTestId("generated-chart")).toHaveTextContent("4 notes");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Audio was never saved. Select and analyze the local song again",
    );
    expect(screen.queryByTestId("generated-rhythm-game")).toBeNull();
    expect(screen.queryByRole("button", { name: /Start .* chart/ })).toBeNull();
  });

  it("shows a recoverable message instead of an unsafe play action", () => {
    const base = analysisFixture();
    render(
      <GeneratedDifficultyPicker
        analysis={{
          ...base,
          durationSeconds: 2,
          meter: null,
          confidence: { ...base.confidence, downbeat: 0.2 },
          warnings: ["meter_uncertain"],
          baselineComparison: {
            ...base.baselineComparison,
            fallbackUsed: true,
          },
          beats: [
            {
              timeSeconds: 0.1,
              strength: 1,
              isDownbeat: false,
              positionInBar: null,
            },
            {
              timeSeconds: 1,
              strength: 0.1,
              isDownbeat: false,
              positionInBar: null,
            },
          ],
        }}
        audioUrl="blob:owned-fixture"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Not enough safe rhythmic anchors",
    );
    expect(screen.queryByTestId("generated-rhythm-game")).toBeNull();
  });
});
