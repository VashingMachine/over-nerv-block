import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  baselineAnalyzerVersion,
  qualityAnalyzerVersion,
  schemaVersion,
  type QualityRhythmAnalysis,
} from "@rhythm-game/chart-schema";

import { generateDifficultyCharts } from "../chartGeneration/generateDifficultyCharts";
import { createGameResultForChart } from "../demo/resultStore";

import { ChartHistoryPanel } from "./ChartHistoryPanel";
import {
  createChartHistoryEntry,
  type ChartHistoryStore,
} from "./chartHistoryStore";

function entry(playedAt = "2026-07-21T06:00:00.000Z") {
  const analysis: QualityRhythmAnalysis = {
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
      strength: index % 4 === 0 ? 1 : 0.75,
      isDownbeat: index % 4 === 0,
      positionInBar: (index % 4) + 1,
    })),
  };
  const chart = generateDifficultyCharts(analysis).easy;
  const result = createGameResultForChart(chart, chart.id, [], 0, playedAt);
  return createChartHistoryEntry({
    chart,
    result,
    tempoBpm: analysis.tempoBpm,
    meter: analysis.meter,
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function store(overrides: Partial<ChartHistoryStore> = {}): ChartHistoryStore {
  return {
    readHistory: vi.fn(async () => ({
      status: "loaded" as const,
      entries: [entry()],
    })),
    saveEntry: vi.fn(async () => "saved" as const),
    deleteEntry: vi.fn(async () => "deleted" as const),
    clearHistory: vi.fn(async () => "cleared" as const),
    ...overrides,
  };
}

describe("chart-only history panel", () => {
  it("shows safe chart/result facts without a historical play action", async () => {
    const onSelectLocalSong = vi.fn();
    render(
      <ChartHistoryPanel
        store={store()}
        refreshToken={0}
        onSelectLocalSong={onSelectLocalSong}
      />,
    );

    const article = await screen.findByRole("article");
    expect(article).toHaveTextContent("Generated Easy chart");
    expect(article).toHaveTextContent("4 notes");
    expect(article).toHaveTextContent("120.0 BPM · 4/4");
    expect(article).toHaveTextContent("difficulty-generator-v1");
    expect(screen.getByText(/Up to 20 recent/)).toBeVisible();
    expect(
      screen.getByText(/Audio and filenames are never saved/),
    ).toBeVisible();
    expect(
      within(article).queryByRole("button", { name: /Start|Play/ }),
    ).toBeNull();

    fireEvent.click(
      within(article).getByRole("button", {
        name: "Select and analyze local song again",
      }),
    );
    expect(onSelectLocalSong).toHaveBeenCalledOnce();
  });

  it("keeps a denied deletion visible and retryable", async () => {
    const historyStore = store({
      deleteEntry: vi
        .fn<ChartHistoryStore["deleteEntry"]>()
        .mockResolvedValueOnce("unavailable")
        .mockResolvedValueOnce("deleted"),
    });
    render(
      <ChartHistoryPanel
        store={historyStore}
        refreshToken={0}
        onSelectLocalSong={vi.fn()}
      />,
    );

    const article = await screen.findByRole("article");
    fireEvent.click(
      within(article).getByRole("button", { name: "Delete entry" }),
    );
    expect(await screen.findByText(/Could not delete/)).toBeVisible();
    expect(screen.getByRole("article")).toBeVisible();
    expect(
      within(screen.getByRole("article")).getByRole("button", {
        name: "Delete entry",
      }),
    ).toBeEnabled();

    fireEvent.click(
      within(screen.getByRole("article")).getByRole("button", {
        name: "Delete entry",
      }),
    );
    await waitFor(() =>
      expect(historyStore.deleteEntry).toHaveBeenCalledTimes(2),
    );
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("clears history only after durable success", async () => {
    const historyStore = store();
    render(
      <ChartHistoryPanel
        store={historyStore}
        refreshToken={0}
        onSelectLocalSong={vi.fn()}
      />,
    );

    await screen.findByRole("article");
    fireEvent.click(
      screen.getByRole("button", { name: "Clear chart history" }),
    );

    expect(await screen.findByText(/history cleared/)).toBeVisible();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getByText("No local chart results yet")).toBeVisible();
  });

  it("disables every destructive control while one mutation is pending", async () => {
    const deletion = deferred<"deleted">();
    const historyStore = store({
      readHistory: vi.fn(async () => ({
        status: "loaded" as const,
        entries: [
          entry("2026-07-21T06:01:00.000Z"),
          entry("2026-07-21T06:00:00.000Z"),
        ],
      })),
      deleteEntry: vi.fn(() => deletion.promise),
    });
    render(
      <ChartHistoryPanel
        store={historyStore}
        refreshToken={0}
        onSelectLocalSong={vi.fn()}
      />,
    );

    const deleteButtons = await screen.findAllByRole("button", {
      name: "Delete entry",
    });
    fireEvent.click(deleteButtons[0]!);
    expect(deleteButtons[0]).toBeDisabled();
    expect(deleteButtons[1]).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Clear chart history" }),
    ).toBeDisabled();

    deletion.resolve("deleted");
    expect(await screen.findByText(/entry deleted/)).toBeVisible();
  });

  it("disables every entry delete while clear is pending", async () => {
    const clearing = deferred<"cleared">();
    const historyStore = store({
      clearHistory: vi.fn(() => clearing.promise),
    });
    render(
      <ChartHistoryPanel
        store={historyStore}
        refreshToken={0}
        onSelectLocalSong={vi.fn()}
      />,
    );

    await screen.findByRole("article");
    fireEvent.click(
      screen.getByRole("button", { name: "Clear chart history" }),
    );
    expect(screen.getByRole("button", { name: "Delete entry" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Clear chart history" }),
    ).toBeDisabled();

    clearing.resolve("cleared");
    expect(await screen.findByText(/history cleared/)).toBeVisible();
  });

  it.each([
    ["migrated", "migrated and restored"],
    ["discarded", "Invalid chart history was discarded"],
    ["unavailable", "history storage is unavailable"],
  ] as const)("shows the %s storage state", async (status, copy) => {
    const historyStore = store({
      readHistory: vi.fn(async () =>
        status === "migrated" ? { status, entries: [entry()] } : { status },
      ),
    });
    render(
      <ChartHistoryPanel
        store={historyStore}
        refreshToken={0}
        onSelectLocalSong={vi.fn()}
      />,
    );

    expect(await screen.findByText(new RegExp(copy, "i"))).toBeVisible();
  });
});
