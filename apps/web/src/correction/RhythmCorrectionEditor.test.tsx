import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  baselineAnalyzerVersion,
  qualityAnalyzerVersion,
  schemaVersion,
  type QualityRhythmAnalysis,
} from "@rhythm-game/chart-schema";

import { correctionStorageKey } from "./correctionStore";
import {
  appendCorrectionOperation,
  createCorrectionDocument,
} from "./rhythmCorrection";
import { RhythmCorrectionEditor } from "./RhythmCorrectionEditor";

vi.mock("../demo/RhythmGameCanvas", () => ({
  RhythmGameCanvas: () => <div data-testid="mock-rhythm-canvas" />,
}));

vi.mock("../demo/phaserRuntime", () => ({
  loadPhaser: vi.fn().mockResolvedValue({}),
}));

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
    tempoCandidates: [
      { bpm: 120, score: 1, relation: "selected" },
      { bpm: 60, score: 0.4, relation: "half" },
    ],
    warnings: [],
    baselineComparison: {
      analyzerVersion: baselineAnalyzerVersion,
      tempoDeltaBpm: 0,
      beatAgreement: 1,
      fallbackUsed: false,
    },
    beats: Array.from({ length: 15 }, (_, index) => ({
      timeSeconds: 0.5 + index * 0.5,
      strength: index % 4 === 0 ? 1 : 0.7,
      isDownbeat: index % 4 === 0,
      positionInBar: (index % 4) + 1,
    })),
  };
}

function renderEditor(
  options: {
    getPreviewTime?: () => number;
    storage?: Storage | null;
  } = {},
) {
  return render(
    <RhythmCorrectionEditor
      analysis={analysis()}
      audioUrl="blob:owned"
      getPreviewTime={options.getPreviewTime ?? (() => 0)}
      storage={options.storage === undefined ? localStorage : options.storage}
    />,
  );
}

function revision(): HTMLElement {
  return screen.getByText("Correction revision").parentElement!;
}

describe("rhythm correction workspace", () => {
  beforeEach(() => localStorage.clear());

  it("starts from the immutable original with visible contract and difficulties", () => {
    renderEditor();

    expect(
      screen.getByRole("heading", { name: "Correct the detected rhythm" }),
    ).toBeVisible();
    expect(screen.getByText("Original").parentElement).toHaveTextContent(
      "120.0 BPM · 15 beats · 4/4",
    );
    expect(screen.getByText("Working").parentElement).toHaveTextContent(
      "120.0 BPM · 15 beats · 4/4",
    );
    expect(revision()).toHaveTextContent("0");
    expect(screen.getByText(/correction-editor-v1 · v1/)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No correction is saved",
    );
    expect(
      screen.getByRole("heading", { name: "Choose your difficulty" }),
    ).toBeVisible();
    expect(screen.queryByText(/revision 1/)).toBeNull();
  });

  it("applies, persists, undoes, and resets deterministic offset corrections", () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("Offset in milliseconds"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply offset" }));

    expect(revision()).toHaveTextContent("1");
    expect(screen.getByText("Offset +100 ms")).toBeVisible();
    expect(screen.getByText(/revision 1 · correction-editor-v1/)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Corrections saved locally",
    );
    const key = correctionStorageKey(
      createCorrectionDocument(analysis()).sourceFingerprint,
    );
    const serialized = localStorage.getItem(key)!;
    expect(serialized).toContain('"milliseconds":100');
    expect(serialized).not.toContain('"beats"');

    fireEvent.click(
      screen.getByRole("button", { name: "Undo last correction" }),
    );
    expect(revision()).toHaveTextContent("0");
    expect(localStorage.getItem(key)).toBeNull();

    fireEvent.change(screen.getByLabelText("Offset in milliseconds"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply offset" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Reset all corrections" }),
    );
    expect(screen.getByText("Working").parentElement).toHaveTextContent(
      "120.0 BPM · 15 beats · 4/4",
    );
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("supports tempo, meter, first-downbeat, add, and remove controls", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Use half tempo" }));
    expect(screen.getByText("Working").parentElement).toHaveTextContent(
      "60.0 BPM · 8 beats",
    );
    fireEvent.click(screen.getByRole("button", { name: "Use double tempo" }));
    expect(screen.getByText("Working").parentElement).toHaveTextContent(
      "120.0 BPM · 15 beats",
    );

    fireEvent.click(screen.getByRole("button", { name: "Use 3/4" }));
    expect(screen.getByText("Working").parentElement).toHaveTextContent("3/4");
    fireEvent.change(screen.getByLabelText("Selected beat"), {
      target: { value: "2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Set as first downbeat" }),
    );
    expect(screen.getByText("Set first downbeat at 2.00 s")).toBeVisible();

    fireEvent.change(screen.getByLabelText("New beat time in seconds"), {
      target: { value: "0.75" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add beat" }));
    expect(screen.getByText("Working").parentElement).toHaveTextContent(
      "16 beats",
    );
    fireEvent.change(screen.getByLabelText("Selected beat"), {
      target: { value: "0.75" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove selected beat" }),
    );
    expect(screen.getByText("Working").parentElement).toHaveTextContent(
      "15 beats",
    );
  });

  it("records preview-clock taps and applies a full tap grid", () => {
    const getPreviewTime = vi
      .fn()
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(1.5)
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(2.5);
    renderEditor({ getPreviewTime });

    const tap = screen.getByRole("button", { name: "Tap beat" });
    fireEvent.click(tap);
    fireEvent.click(tap);
    fireEvent.click(tap);
    fireEvent.click(tap);
    expect(screen.getByText("4").parentElement).toHaveTextContent(
      "4 taps recorded",
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply tap grid" }));
    expect(revision()).toHaveTextContent("1");
    expect(screen.getByText("Tap tempo and phase from 4 taps")).toBeVisible();
  });

  it("retains recorded taps when their implied tempo is rejected", () => {
    const getPreviewTime = vi
      .fn()
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(1.1)
      .mockReturnValueOnce(1.2);
    renderEditor({ getPreviewTime });

    const tap = screen.getByRole("button", { name: "Tap beat" });
    fireEvent.click(tap);
    fireEvent.click(tap);
    fireEvent.click(tap);
    fireEvent.click(screen.getByRole("button", { name: "Apply tap grid" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "outside the supported 40–240 BPM range",
    );
    expect(screen.getByText("3").parentElement).toHaveTextContent(
      "3 taps recorded",
    );
    expect(revision()).toHaveTextContent("0");
  });

  it("keeps revision and storage unchanged for invalid edits", () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText("New beat time in seconds"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add beat" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "A beat already exists within 10 milliseconds",
    );
    expect(revision()).toHaveTextContent("0");
    expect(localStorage).toHaveLength(0);
  });

  it("restores a matching saved correction on a new mount", () => {
    const original = analysis();
    const saved = appendCorrectionOperation(
      original,
      createCorrectionDocument(original),
      { kind: "offset", milliseconds: 100 },
    ).document;
    localStorage.setItem(
      correctionStorageKey(saved.sourceFingerprint),
      JSON.stringify(saved),
    );

    renderEditor();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Saved corrections restored",
    );
    expect(revision()).toHaveTextContent("1");
    expect(screen.getByText("Offset +100 ms")).toBeVisible();
  });

  it("keeps editing usable without storage", () => {
    renderEditor({ storage: null });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Browser storage is unavailable",
    );
    fireEvent.change(screen.getByLabelText("Offset in milliseconds"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply offset" }));
    expect(revision()).toHaveTextContent("1");
    expect(screen.getByRole("status")).toHaveTextContent(
      "will not survive reload",
    );
  });
});
