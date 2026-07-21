import {
  beatGridCheckpointSchema,
  beatGridCheckpointVersion,
  qualityRhythmAnalysisSchema,
  type BeatGridCheckpoint,
  type QualityRhythmAnalysis,
} from "@rhythm-game/chart-schema";

import { correctionSourceFingerprint } from "../correction/rhythmCorrection";

export const recoveryDatabaseName = "rhythm-game-recovery";
export const recoveryDatabaseVersion = 1;
export const recoveryObjectStoreName = "completed-analysis";
export const latestRecoveryKey = "latest";

export interface RecoveryDatabaseSession {
  readLatest(): Promise<unknown>;
  writeLatest(checkpoint: BeatGridCheckpoint): Promise<void>;
  deleteLatest(): Promise<void>;
  close(): void;
}

export type OpenRecoveryDatabase = () => Promise<RecoveryDatabaseSession>;

export type RecoveryReadResult =
  | { readonly status: "empty" | "discarded" | "unavailable" }
  | { readonly status: "loaded"; readonly checkpoint: BeatGridCheckpoint };

export type RecoveryWriteResult = "saved" | "unavailable";
export type RecoveryDeleteResult = "cleared" | "unavailable";

export interface BeatGridRecoveryStore {
  readLatest(): Promise<RecoveryReadResult>;
  saveLatest(grid: QualityRhythmAnalysis): Promise<RecoveryWriteResult>;
  deleteLatest(): Promise<RecoveryDeleteResult>;
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
        reject(new Error("IndexedDB recovery transaction failed"));
      }
    };

    try {
      const transaction = database.transaction(recoveryObjectStoreName, mode);
      const request = start(transaction.objectStore(recoveryObjectStoreName));
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

export function openIndexedDbRecoveryDatabase(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<RecoveryDatabaseSession> {
  if (!factory) {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let request: IDBOpenDBRequest;
    const fail = () => {
      if (!settled) {
        settled = true;
        reject(new Error("IndexedDB recovery database could not be opened"));
      }
    };

    try {
      request = factory.open(recoveryDatabaseName, recoveryDatabaseVersion);
    } catch {
      fail();
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(recoveryObjectStoreName)) {
        database.createObjectStore(recoveryObjectStoreName);
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
        readLatest: () =>
          completeTransaction(database, "readonly", (store) =>
            store.get(latestRecoveryKey),
          ),
        writeLatest: (checkpoint) =>
          completeTransaction(database, "readwrite", (store) =>
            store.put(checkpoint, latestRecoveryKey),
          ).then(() => undefined),
        deleteLatest: () =>
          completeTransaction(database, "readwrite", (store) =>
            store.delete(latestRecoveryKey),
          ).then(() => undefined),
        close: () => database.close(),
      });
    };
  });
}

export function createBeatGridCheckpoint(
  input: QualityRhythmAnalysis,
  now: () => number = Date.now,
): BeatGridCheckpoint {
  const grid = qualityRhythmAnalysisSchema.parse(input);
  return beatGridCheckpointSchema.parse({
    checkpointVersion: beatGridCheckpointVersion,
    kind: "completed_beat_grid_checkpoint",
    savedAtEpochMs: now(),
    sourceFingerprint: correctionSourceFingerprint(grid),
    grid,
  });
}

function validatedCheckpoint(input: unknown): BeatGridCheckpoint | null {
  const parsed = beatGridCheckpointSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }
  return parsed.data.sourceFingerprint ===
    correctionSourceFingerprint(parsed.data.grid)
    ? parsed.data
    : null;
}

export function createBeatGridRecoveryStore(
  openDatabase: OpenRecoveryDatabase = openIndexedDbRecoveryDatabase,
  now: () => number = Date.now,
): BeatGridRecoveryStore {
  return {
    async readLatest() {
      let database: RecoveryDatabaseSession | null = null;
      try {
        database = await openDatabase();
        const raw = await database.readLatest();
        if (raw === undefined) {
          return { status: "empty" };
        }
        const checkpoint = validatedCheckpoint(raw);
        if (!checkpoint) {
          try {
            await database.deleteLatest();
          } catch {
            // The invalid value is never returned even if cleanup is denied.
          }
          return { status: "discarded" };
        }
        return { status: "loaded", checkpoint };
      } catch {
        return { status: "unavailable" };
      } finally {
        database?.close();
      }
    },

    async saveLatest(input) {
      let database: RecoveryDatabaseSession | null = null;
      try {
        const checkpoint = createBeatGridCheckpoint(input, now);
        database = await openDatabase();
        await database.writeLatest(checkpoint);
        return "saved";
      } catch {
        return "unavailable";
      } finally {
        database?.close();
      }
    },

    async deleteLatest() {
      let database: RecoveryDatabaseSession | null = null;
      try {
        database = await openDatabase();
        await database.deleteLatest();
        return "cleared";
      } catch {
        return "unavailable";
      } finally {
        database?.close();
      }
    },
  };
}
