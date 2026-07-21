import { beforeEach, describe, expect, it } from "vitest";

import {
  correctionContractVersion,
  correctionEditorVersion,
  correctionStorageVersion,
  qualityAnalyzerVersion,
} from "@rhythm-game/chart-schema";

import {
  correctionStorageKey,
  readCorrectionDocument,
  saveCorrectionDocument,
} from "./correctionStore";

const fingerprint = "source123";

function document() {
  return {
    storageVersion: correctionStorageVersion,
    kind: "rhythm_correction_document" as const,
    editorVersion: correctionEditorVersion,
    correctionContractVersion,
    sourceFingerprint: fingerprint,
    originalAnalyzerVersion: qualityAnalyzerVersion,
    revision: 1,
    operations: [{ kind: "offset" as const, milliseconds: 50 }],
  };
}

describe("correction document storage", () => {
  beforeEach(() => localStorage.clear());

  it("saves and loads only the compact correction document", () => {
    expect(saveCorrectionDocument(localStorage, document())).toBe("saved");
    const serialized = localStorage.getItem(correctionStorageKey(fingerprint));
    expect(serialized).not.toBeNull();
    expect(serialized).not.toContain("beats");
    expect(serialized).not.toContain("audio");
    expect(readCorrectionDocument(localStorage, fingerprint)).toEqual({
      document: document(),
      status: "loaded",
    });
  });

  it("migrates the documented version-zero envelope", () => {
    localStorage.setItem(
      correctionStorageKey(fingerprint),
      JSON.stringify({
        storageVersion: 0,
        sourceFingerprint: fingerprint,
        operations: [{ kind: "set_meter", meter: 3 }],
      }),
    );

    const loaded = readCorrectionDocument(localStorage, fingerprint);
    expect(loaded.status).toBe("migrated");
    expect(loaded.document).toMatchObject({
      storageVersion: 1,
      editorVersion: correctionEditorVersion,
      revision: 1,
    });
    expect(
      JSON.parse(localStorage.getItem(correctionStorageKey(fingerprint))!),
    ).toMatchObject({ storageVersion: 1, revision: 1 });
  });

  it.each([
    "not-json",
    JSON.stringify({ storageVersion: 99 }),
    JSON.stringify({
      ...document(),
      sourceFingerprint: "foreign",
    }),
    JSON.stringify({
      ...document(),
      beats: [{ timeSeconds: 1 }],
    }),
    JSON.stringify({
      ...document(),
      operations: [
        { kind: "offset", milliseconds: 50, analysis: { tempoBpm: 120 } },
      ],
    }),
  ])("discards corrupt or foreign data", (serialized) => {
    localStorage.setItem(correctionStorageKey(fingerprint), serialized);
    expect(readCorrectionDocument(localStorage, fingerprint)).toEqual({
      document: null,
      status: "discarded",
    });
    expect(localStorage.getItem(correctionStorageKey(fingerprint))).toBeNull();
  });

  it("clears the key for an empty reset document", () => {
    saveCorrectionDocument(localStorage, document());
    expect(
      saveCorrectionDocument(localStorage, {
        ...document(),
        revision: 0,
        operations: [],
      }),
    ).toBe("cleared");
    expect(localStorage.getItem(correctionStorageKey(fingerprint))).toBeNull();
  });

  it("keeps in-memory work possible when storage is unavailable", () => {
    const denied = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      removeItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    } as unknown as Storage;

    expect(readCorrectionDocument(denied, fingerprint).status).toBe(
      "unavailable",
    );
    expect(saveCorrectionDocument(denied, document())).toBe("unavailable");
    expect(readCorrectionDocument(null, fingerprint).status).toBe(
      "unavailable",
    );
  });
});
