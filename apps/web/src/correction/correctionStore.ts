import { z } from "zod";

import {
  correctionContractVersion,
  correctionEditorVersion,
  correctionStorageVersion,
  qualityAnalyzerVersion,
  rhythmCorrectionDocumentSchema,
  rhythmCorrectionOperationSchema,
  type RhythmCorrectionDocument,
} from "@rhythm-game/chart-schema";

export const correctionStorageKeyPrefix = "over-nerv-block:rhythm-correction:";

const legacyCorrectionDocumentSchema = z.strictObject({
  storageVersion: z.literal(0),
  sourceFingerprint: z.string().regex(/^[a-z0-9]+$/),
  operations: z.array(rhythmCorrectionOperationSchema).max(256),
});

export type CorrectionLoadStatus =
  "empty" | "loaded" | "migrated" | "discarded" | "unavailable";

export interface CorrectionLoadResult {
  readonly document: RhythmCorrectionDocument | null;
  readonly status: CorrectionLoadStatus;
}

export function correctionStorageKey(sourceFingerprint: string): string {
  return `${correctionStorageKeyPrefix}${sourceFingerprint}`;
}

function removeInvalid(storage: Storage, key: string): CorrectionLoadResult {
  try {
    storage.removeItem(key);
    return { document: null, status: "discarded" };
  } catch {
    return { document: null, status: "unavailable" };
  }
}

export function readCorrectionDocument(
  storage: Storage | null,
  sourceFingerprint: string,
): CorrectionLoadResult {
  if (!storage) {
    return { document: null, status: "unavailable" };
  }
  const key = correctionStorageKey(sourceFingerprint);
  let serialized: string | null;
  try {
    serialized = storage.getItem(key);
  } catch {
    return { document: null, status: "unavailable" };
  }
  if (serialized === null) {
    return { document: null, status: "empty" };
  }

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return removeInvalid(storage, key);
  }

  const current = rhythmCorrectionDocumentSchema.safeParse(value);
  if (current.success) {
    if (current.data.sourceFingerprint !== sourceFingerprint) {
      return removeInvalid(storage, key);
    }
    return { document: current.data, status: "loaded" };
  }

  const legacy = legacyCorrectionDocumentSchema.safeParse(value);
  if (!legacy.success || legacy.data.sourceFingerprint !== sourceFingerprint) {
    return removeInvalid(storage, key);
  }
  const migrated = rhythmCorrectionDocumentSchema.parse({
    storageVersion: correctionStorageVersion,
    kind: "rhythm_correction_document",
    editorVersion: correctionEditorVersion,
    correctionContractVersion,
    sourceFingerprint,
    originalAnalyzerVersion: qualityAnalyzerVersion,
    revision: legacy.data.operations.length,
    operations: legacy.data.operations,
  });
  try {
    storage.setItem(key, JSON.stringify(migrated));
    return { document: migrated, status: "migrated" };
  } catch {
    return { document: migrated, status: "unavailable" };
  }
}

export function saveCorrectionDocument(
  storage: Storage | null,
  documentInput: RhythmCorrectionDocument,
): "saved" | "cleared" | "unavailable" {
  if (!storage) {
    return "unavailable";
  }
  const document = rhythmCorrectionDocumentSchema.parse(documentInput);
  const key = correctionStorageKey(document.sourceFingerprint);
  try {
    if (document.operations.length === 0) {
      storage.removeItem(key);
      return "cleared";
    }
    storage.setItem(key, JSON.stringify(document));
    return "saved";
  } catch {
    return "unavailable";
  }
}
