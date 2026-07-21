import { z } from "zod";

import {
  chartHistoryDocumentSchema,
  chartHistoryEntryId,
  chartHistoryEntrySchema,
  chartHistoryEntryVersion,
  chartHistoryStorageVersion,
  deriveResultSummary,
  gameResultSchema,
  generatedRhythmChartSchema,
  maximumChartHistoryEntries,
  type ChartHistoryDocument,
  type ChartHistoryEntry,
  type GameResult,
  type GeneratedRhythmChart,
} from "@rhythm-game/chart-schema";

export { chartHistoryEntryId } from "@rhythm-game/chart-schema";

export const chartHistoryDatabaseName = "rhythm-game-history";
export const chartHistoryDatabaseVersion = 1;
export const chartHistoryObjectStoreName = "chart-results";
export const recentChartHistoryKey = "recent";

export interface ChartHistoryDatabaseSession {
  readRecent(): Promise<unknown>;
  writeRecent(document: ChartHistoryDocument): Promise<void>;
  deleteRecent(): Promise<void>;
  close(): void;
}

export type OpenChartHistoryDatabase =
  () => Promise<ChartHistoryDatabaseSession>;

export type ChartHistoryReadResult =
  | { readonly status: "empty" | "discarded" | "unavailable" }
  | {
      readonly status: "loaded" | "migrated";
      readonly entries: readonly ChartHistoryEntry[];
    };

export type ChartHistorySaveResult = "saved" | "unavailable";
export type ChartHistoryDeleteResult =
  "deleted" | "not_found" | "discarded" | "unavailable";
export type ChartHistoryClearResult = "cleared" | "unavailable";

export interface ChartHistoryStore {
  readHistory(): Promise<ChartHistoryReadResult>;
  saveEntry(entry: ChartHistoryEntry): Promise<ChartHistorySaveResult>;
  deleteEntry(id: string): Promise<ChartHistoryDeleteResult>;
  clearHistory(): Promise<ChartHistoryClearResult>;
}

const legacyChartHistoryEntrySchema = z.strictObject({
  savedAtEpochMs: z.number().int().nonnegative(),
  tempoBpm: z.number().min(40).max(240),
  meter: z.union([z.literal(3), z.literal(4)]).nullable(),
  chart: generatedRhythmChartSchema,
  result: gameResultSchema,
});

const legacyChartHistoryDocumentSchema = z.strictObject({
  historyVersion: z.literal(0),
  entries: z
    .array(legacyChartHistoryEntrySchema)
    .max(maximumChartHistoryEntries),
});

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactSchemaParse<T>(schema: z.ZodType<T>, input: unknown): T | null {
  const parsed = schema.safeParse(input);
  if (!parsed.success || stableJson(input) !== stableJson(parsed.data)) {
    return null;
  }
  return parsed.data;
}

function resultMatchesChart(entry: ChartHistoryEntry): boolean {
  if (
    entry.id !== chartHistoryEntryId(entry.chart.id, entry.result.playedAt) ||
    entry.result.songId !== entry.chart.id ||
    entry.result.chartId !== entry.chart.id ||
    entry.result.judgments.length !== entry.chart.notes.length ||
    entry.savedAtEpochMs !== Date.parse(entry.result.playedAt)
  ) {
    return false;
  }
  const exactNotes = entry.result.judgments.every(
    (judgment, index) =>
      judgment.noteIndex === index &&
      judgment.noteTimeSeconds === entry.chart.notes[index]?.timeSeconds,
  );
  return (
    exactNotes &&
    stableJson(entry.result.summary) ===
      stableJson(deriveResultSummary(entry.result.judgments))
  );
}

function compareEntries(
  left: ChartHistoryEntry,
  right: ChartHistoryEntry,
): number {
  return (
    right.savedAtEpochMs - left.savedAtEpochMs ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

function validCurrentDocument(input: unknown): ChartHistoryDocument | null {
  const document = exactSchemaParse(chartHistoryDocumentSchema, input);
  if (!document) {
    return null;
  }
  const ids = new Set(document.entries.map((entry) => entry.id));
  if (
    ids.size !== document.entries.length ||
    document.entries.some((entry) => !resultMatchesChart(entry)) ||
    document.entries.some(
      (entry, index) =>
        index > 0 && compareEntries(document.entries[index - 1]!, entry) > 0,
    )
  ) {
    return null;
  }
  return document;
}

function migrateLegacyDocument(input: unknown): ChartHistoryDocument | null {
  const legacy = exactSchemaParse(legacyChartHistoryDocumentSchema, input);
  if (!legacy) {
    return null;
  }
  const entries = legacy.entries.map((entry) =>
    chartHistoryEntrySchema.parse({
      ...entry,
      entryVersion: chartHistoryEntryVersion,
      kind: "chart_result_history_entry",
      id: chartHistoryEntryId(entry.chart.id, entry.result.playedAt),
    }),
  );
  const document = chartHistoryDocumentSchema.parse({
    historyVersion: chartHistoryStorageVersion,
    kind: "chart_result_history",
    entries: entries.sort(compareEntries),
  });
  return validCurrentDocument(document);
}

export function createChartHistoryEntry({
  chart,
  result,
  tempoBpm,
  meter,
}: {
  readonly chart: GeneratedRhythmChart;
  readonly result: GameResult;
  readonly tempoBpm: number;
  readonly meter: 3 | 4 | null;
}): ChartHistoryEntry {
  const entry = exactSchemaParse(chartHistoryEntrySchema, {
    entryVersion: chartHistoryEntryVersion,
    kind: "chart_result_history_entry",
    id: chartHistoryEntryId(chart.id, result.playedAt),
    savedAtEpochMs: Date.parse(result.playedAt),
    tempoBpm,
    meter,
    chart,
    result,
  });
  if (!entry || !resultMatchesChart(entry)) {
    throw new Error("Chart history result does not match its chart");
  }
  return entry;
}

function upsertEntry(
  entries: readonly ChartHistoryEntry[],
  entry: ChartHistoryEntry,
): ChartHistoryDocument {
  return chartHistoryDocumentSchema.parse({
    historyVersion: chartHistoryStorageVersion,
    kind: "chart_result_history",
    entries: [entry, ...entries.filter((item) => item.id !== entry.id)]
      .sort(compareEntries)
      .slice(0, maximumChartHistoryEntries),
  });
}

function completeTransaction<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  start: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let result!: T;
    let settled = false;
    const fail = () => {
      if (!settled) {
        settled = true;
        reject(new Error("IndexedDB chart-history transaction failed"));
      }
    };
    try {
      const transaction = database.transaction(
        chartHistoryObjectStoreName,
        mode,
      );
      const request = start(
        transaction.objectStore(chartHistoryObjectStoreName),
      );
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = fail;
      transaction.onerror = fail;
      transaction.onabort = fail;
      transaction.oncomplete = () => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
    } catch {
      fail();
    }
  });
}

export function openIndexedDbChartHistoryDatabase(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<ChartHistoryDatabaseSession> {
  if (!factory) {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let request: IDBOpenDBRequest;
    const fail = () => {
      if (!settled) {
        settled = true;
        reject(new Error("IndexedDB chart-history database could not open"));
      }
    };
    try {
      request = factory.open(
        chartHistoryDatabaseName,
        chartHistoryDatabaseVersion,
      );
    } catch {
      fail();
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(chartHistoryObjectStoreName)) {
        database.createObjectStore(chartHistoryObjectStoreName);
      }
    };
    request.onerror = fail;
    request.onblocked = fail;
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      resolve({
        readRecent: () =>
          completeTransaction(database, "readonly", (store) =>
            store.get(recentChartHistoryKey),
          ),
        writeRecent: (document) =>
          completeTransaction(database, "readwrite", (store) =>
            store.put(document, recentChartHistoryKey),
          ).then(() => undefined),
        deleteRecent: () =>
          completeTransaction(database, "readwrite", (store) =>
            store.delete(recentChartHistoryKey),
          ).then(() => undefined),
        close: () => database.close(),
      });
    };
  });
}

async function readSessionDocument(
  database: ChartHistoryDatabaseSession,
): Promise<
  | { readonly status: "empty" }
  | { readonly status: "discarded" }
  | {
      readonly status: "loaded";
      readonly document: ChartHistoryDocument;
    }
  | {
      readonly status: "migrated";
      readonly document: ChartHistoryDocument;
    }
> {
  const raw = await database.readRecent();
  if (raw === undefined) {
    return { status: "empty" };
  }
  const current = validCurrentDocument(raw);
  if (current) {
    return { status: "loaded", document: current };
  }
  const migrated = migrateLegacyDocument(raw);
  if (migrated) {
    await database.writeRecent(migrated);
    return { status: "migrated", document: migrated };
  }
  try {
    await database.deleteRecent();
  } catch {
    // Invalid history is never returned even when cleanup is denied.
  }
  return { status: "discarded" };
}

export function createChartHistoryStore(
  openDatabase: OpenChartHistoryDatabase = openIndexedDbChartHistoryDatabase,
): ChartHistoryStore {
  let operationQueue: Promise<void> = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    readHistory() {
      return enqueue(async () => {
        let database: ChartHistoryDatabaseSession | null = null;
        try {
          database = await openDatabase();
          const result = await readSessionDocument(database);
          if (result.status === "loaded" || result.status === "migrated") {
            return { status: result.status, entries: result.document.entries };
          }
          return result;
        } catch {
          return { status: "unavailable" };
        } finally {
          database?.close();
        }
      });
    },

    saveEntry(input) {
      return enqueue(async () => {
        let database: ChartHistoryDatabaseSession | null = null;
        try {
          const entry = exactSchemaParse(chartHistoryEntrySchema, input);
          if (!entry || !resultMatchesChart(entry)) {
            throw new Error("Chart history entry is invalid");
          }
          database = await openDatabase();
          const existing = await readSessionDocument(database);
          const entries =
            existing.status === "loaded" || existing.status === "migrated"
              ? existing.document.entries
              : [];
          await database.writeRecent(upsertEntry(entries, entry));
          return "saved";
        } catch {
          return "unavailable";
        } finally {
          database?.close();
        }
      });
    },

    deleteEntry(id) {
      return enqueue(async () => {
        let database: ChartHistoryDatabaseSession | null = null;
        try {
          database = await openDatabase();
          const existing = await readSessionDocument(database);
          if (existing.status === "discarded") {
            return "discarded";
          }
          if (existing.status === "empty") {
            return "not_found";
          }
          const entries = existing.document.entries.filter(
            (entry) => entry.id !== id,
          );
          if (entries.length === existing.document.entries.length) {
            return "not_found";
          }
          if (entries.length === 0) {
            await database.deleteRecent();
          } else {
            await database.writeRecent({ ...existing.document, entries });
          }
          return "deleted";
        } catch {
          return "unavailable";
        } finally {
          database?.close();
        }
      });
    },

    clearHistory() {
      return enqueue(async () => {
        let database: ChartHistoryDatabaseSession | null = null;
        try {
          database = await openDatabase();
          await database.deleteRecent();
          return "cleared";
        } catch {
          return "unavailable";
        } finally {
          database?.close();
        }
      });
    },
  };
}
