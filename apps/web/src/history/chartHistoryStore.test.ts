import { describe, expect, it, vi } from "vitest";

import {
  baselineAnalyzerVersion,
  chartHistoryStorageVersion,
  qualityAnalyzerVersion,
  schemaVersion,
  type ChartHistoryDocument,
  type QualityRhythmAnalysis,
} from "@rhythm-game/chart-schema";

import { generateDifficultyCharts } from "../chartGeneration/generateDifficultyCharts";
import { createGameResultForChart } from "../demo/resultStore";

import {
  chartHistoryEntryId,
  createChartHistoryEntry,
  createChartHistoryStore,
  type ChartHistoryDatabaseSession,
} from "./chartHistoryStore";

function analysis(): QualityRhythmAnalysis {
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
      strength: index % 4 === 0 ? 1 : 0.75,
      isDownbeat: index % 4 === 0,
      positionInBar: (index % 4) + 1,
    })),
  };
}

function entry(playedAt = "2026-07-21T06:00:00.000Z") {
  const rhythm = analysis();
  const chart = generateDifficultyCharts(rhythm).easy;
  const result = createGameResultForChart(chart, chart.id, [], 0, playedAt);
  return createChartHistoryEntry({
    chart,
    result,
    tempoBpm: rhythm.tempoBpm,
    meter: rhythm.meter,
  });
}

function document(entries = [entry()]): ChartHistoryDocument {
  return {
    historyVersion: chartHistoryStorageVersion,
    kind: "chart_result_history",
    entries,
  };
}

function memoryDatabase(seed?: unknown) {
  let recent = seed;
  const database: ChartHistoryDatabaseSession = {
    readRecent: vi.fn(async () => recent),
    writeRecent: vi.fn(async (value) => {
      recent = value;
    }),
    deleteRecent: vi.fn(async () => {
      recent = undefined;
    }),
    close: vi.fn(),
  };
  return {
    database,
    recent: () => recent,
    setRecent: (value: unknown) => {
      recent = value;
    },
    open: vi.fn(async () => database),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function pauseNextWrite(memory: ReturnType<typeof memoryDatabase>) {
  const entered = deferred<void>();
  const release = deferred<void>();
  vi.mocked(memory.database.writeRecent).mockImplementationOnce(
    async (value) => {
      entered.resolve();
      await release.promise;
      memory.setRecent(value);
    },
  );
  return { entered: entered.promise, release: release.resolve };
}

describe("chart-only result history", () => {
  it("creates and round trips one exact audio-free chart/result entry", async () => {
    const created = entry();
    const memory = memoryDatabase();
    const store = createChartHistoryStore(memory.open);

    expect(created.id).toBe(
      chartHistoryEntryId(created.chart.id, created.result.playedAt),
    );
    expect(JSON.stringify(created)).not.toMatch(
      /filename|private\.wav|objecturl|blob:|mime|audio bytes|decoded/i,
    );
    await expect(store.saveEntry(created)).resolves.toBe("saved");
    await expect(store.readHistory()).resolves.toEqual({
      status: "loaded",
      entries: [created],
    });
  });

  it("upserts deterministically and retains only the 20 newest entries", async () => {
    const memory = memoryDatabase();
    const store = createChartHistoryStore(memory.open);
    const entries = Array.from({ length: 21 }, (_, index) =>
      entry(`2026-07-21T06:${String(index).padStart(2, "0")}:00.000Z`),
    );

    for (const item of entries) {
      await expect(store.saveEntry(item)).resolves.toBe("saved");
    }
    await expect(store.saveEntry(entries[20]!)).resolves.toBe("saved");
    const loaded = await store.readHistory();

    expect(loaded.status).toBe("loaded");
    if (loaded.status !== "loaded") {
      throw new Error("expected loaded history");
    }
    expect(loaded.entries).toHaveLength(20);
    expect(loaded.entries[0]!.id).toBe(entries[20]!.id);
    expect(loaded.entries.at(-1)!.id).toBe(entries[1]!.id);
    expect(new Set(loaded.entries.map((item) => item.id)).size).toBe(20);
  });

  it("serializes concurrent saves without losing either result", async () => {
    const firstEntry = entry("2026-07-21T06:02:00.000Z");
    const secondEntry = entry("2026-07-21T06:03:00.000Z");
    const memory = memoryDatabase();
    const pause = pauseNextWrite(memory);
    const store = createChartHistoryStore(memory.open);

    const firstSave = store.saveEntry(firstEntry);
    await pause.entered;
    const secondSave = store.saveEntry(secondEntry);
    expect(memory.open).toHaveBeenCalledTimes(1);
    pause.release();

    await expect(Promise.all([firstSave, secondSave])).resolves.toEqual([
      "saved",
      "saved",
    ]);
    expect(memory.recent()).toEqual(document([secondEntry, firstEntry]));
  });

  it("serializes concurrent deletes without resurrecting an entry", async () => {
    const newest = entry("2026-07-21T06:02:00.000Z");
    const oldest = entry("2026-07-21T06:01:00.000Z");
    const memory = memoryDatabase(document([newest, oldest]));
    const pause = pauseNextWrite(memory);
    const store = createChartHistoryStore(memory.open);

    const firstDelete = store.deleteEntry(newest.id);
    await pause.entered;
    const secondDelete = store.deleteEntry(oldest.id);
    expect(memory.open).toHaveBeenCalledTimes(1);
    pause.release();

    await expect(Promise.all([firstDelete, secondDelete])).resolves.toEqual([
      "deleted",
      "deleted",
    ]);
    expect(memory.recent()).toBeUndefined();
  });

  it("orders a save before a concurrent delete without restoring old data", async () => {
    const oldest = entry("2026-07-21T06:01:00.000Z");
    const newest = entry("2026-07-21T06:02:00.000Z");
    const memory = memoryDatabase(document([oldest]));
    const pause = pauseNextWrite(memory);
    const store = createChartHistoryStore(memory.open);

    const save = store.saveEntry(newest);
    await pause.entered;
    const removeOldest = store.deleteEntry(oldest.id);
    expect(memory.open).toHaveBeenCalledTimes(1);
    pause.release();

    await expect(Promise.all([save, removeOldest])).resolves.toEqual([
      "saved",
      "deleted",
    ]);
    expect(memory.recent()).toEqual(document([newest]));
  });

  it("orders clear after a concurrent delete so cleared data stays cleared", async () => {
    const newest = entry("2026-07-21T06:02:00.000Z");
    const oldest = entry("2026-07-21T06:01:00.000Z");
    const memory = memoryDatabase(document([newest, oldest]));
    const pause = pauseNextWrite(memory);
    const store = createChartHistoryStore(memory.open);

    const removeNewest = store.deleteEntry(newest.id);
    await pause.entered;
    const clear = store.clearHistory();
    expect(memory.open).toHaveBeenCalledTimes(1);
    pause.release();

    await expect(Promise.all([removeNewest, clear])).resolves.toEqual([
      "deleted",
      "cleared",
    ]);
    expect(memory.recent()).toBeUndefined();
  });

  it("migrates a strict version-zero envelope once", async () => {
    const current = entry();
    const legacy = {
      savedAtEpochMs: current.savedAtEpochMs,
      tempoBpm: current.tempoBpm,
      meter: current.meter,
      chart: current.chart,
      result: current.result,
    };
    const memory = memoryDatabase({ historyVersion: 0, entries: [legacy] });
    const store = createChartHistoryStore(memory.open);

    await expect(store.readHistory()).resolves.toEqual({
      status: "migrated",
      entries: [current],
    });
    expect(memory.database.writeRecent).toHaveBeenCalledOnce();
    expect(memory.recent()).toEqual(document([current]));

    await expect(store.readHistory()).resolves.toMatchObject({
      status: "loaded",
    });
  });

  it.each([
    ["unknown version", { ...document(), historyVersion: 99 }],
    ["foreign ID", document([{ ...entry(), id: "foreign" }])],
    [
      "result/chart mismatch",
      document([
        {
          ...entry(),
          result: { ...entry().result, chartId: "foreign-chart" },
        },
      ]),
    ],
    [
      "unknown nested note field",
      document([
        {
          ...entry(),
          chart: {
            ...entry().chart,
            notes: entry().chart.notes.map((note, index) =>
              index === 0 ? { ...note, filename: "private.wav" } : note,
            ),
          },
        },
      ]),
    ],
    ["duplicate IDs", document([entry(), entry()])],
    [
      "noncanonical order",
      document([
        entry("2026-07-21T06:00:00.000Z"),
        entry("2026-07-21T06:01:00.000Z"),
      ]),
    ],
  ])("discards and deletes %s", async (_case, seed) => {
    const memory = memoryDatabase(seed);
    const store = createChartHistoryStore(memory.open);

    await expect(store.readHistory()).resolves.toEqual({
      status: "discarded",
    });
    expect(memory.database.deleteRecent).toHaveBeenCalledOnce();
    expect(memory.recent()).toBeUndefined();
  });

  it("deletes one entry and clears all without touching another store", async () => {
    const newest = entry("2026-07-21T06:02:00.000Z");
    const oldest = entry("2026-07-21T06:01:00.000Z");
    const memory = memoryDatabase(document([newest, oldest]));
    const store = createChartHistoryStore(memory.open);

    await expect(store.deleteEntry(newest.id)).resolves.toBe("deleted");
    expect(memory.recent()).toEqual(document([oldest]));
    await expect(store.clearHistory()).resolves.toBe("cleared");
    expect(memory.recent()).toBeUndefined();
  });

  it("keeps entries durable when delete or clear is denied", async () => {
    const saved = document();
    const memory = memoryDatabase(saved);
    vi.mocked(memory.database.deleteRecent).mockRejectedValue(
      new Error("denied"),
    );
    const store = createChartHistoryStore(memory.open);

    await expect(store.deleteEntry(saved.entries[0]!.id)).resolves.toBe(
      "unavailable",
    );
    expect(memory.recent()).toEqual(saved);
    await expect(store.clearHistory()).resolves.toBe("unavailable");
    expect(memory.recent()).toEqual(saved);
  });

  it("makes denied read and write nonfatal", async () => {
    const store = createChartHistoryStore(async () => {
      throw new Error("blocked");
    });

    await expect(store.readHistory()).resolves.toEqual({
      status: "unavailable",
    });
    await expect(store.saveEntry(entry())).resolves.toBe("unavailable");
    await expect(store.deleteEntry("any")).resolves.toBe("unavailable");
    await expect(store.clearHistory()).resolves.toBe("unavailable");
  });
});
