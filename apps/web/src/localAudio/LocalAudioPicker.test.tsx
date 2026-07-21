import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  baselineAnalyzerVersion,
  qualityAnalyzerVersion,
  schemaVersion,
  type QualityRhythmAnalysis,
} from "@rhythm-game/chart-schema";

import type { AnalyzeDecodedAudioOptions } from "../analysis/workerBeatAnalyzer";
import { BeatAnalysisBoundaryError } from "../analysis/workerBeatAnalyzer";
import { playbackCoordinator } from "../demo/playbackCoordinator";
import { correctionStorageKey } from "../correction/correctionStore";
import { createCorrectionDocument } from "../correction/rhythmCorrection";
import {
  createBeatGridCheckpoint,
  type BeatGridRecoveryStore,
  type RecoveryReadResult,
} from "../recovery/beatGridRecoveryStore";

import { LocalAudioPicker } from "./LocalAudioPicker";
import { LocalAudioError } from "./filePolicy";
import type {
  DecodeLocalAudioOptions,
  DisposableDecodedAudio,
} from "./localAudioDecoder";

function selectedFile(
  name = "do-not-display-this.wav",
  type = "audio/wav",
  body = "audio",
) {
  return new File([body], name, { type });
}

function decodedAudio(durationSeconds = 8) {
  const release = vi.fn();
  const buffer = {
    duration: durationSeconds,
    length: 4,
    numberOfChannels: 2,
    sampleRate: 48_000,
  } as AudioBuffer;
  const decoded: DisposableDecodedAudio = {
    durationSeconds,
    numberOfChannels: 2,
    sampleRate: 48_000,
    getAudioBuffer: vi.fn(() => buffer),
    release,
  };
  return { decoded, release };
}

function validGrid(): QualityRhythmAnalysis {
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
      beat: 0.8,
      downbeat: 0.82,
      agreement: 1,
      overall: 0.86,
    },
    tempoCandidates: [{ bpm: 120, score: 1, relation: "selected" }],
    warnings: [],
    baselineComparison: {
      analyzerVersion: baselineAnalyzerVersion,
      tempoDeltaBpm: 0,
      beatAgreement: 1,
      fallbackUsed: false,
    },
    beats: [
      { timeSeconds: 1, strength: 1, isDownbeat: true, positionInBar: 1 },
      {
        timeSeconds: 1.5,
        strength: 0.8,
        isDownbeat: false,
        positionInBar: 2,
      },
      {
        timeSeconds: 2,
        strength: 0.9,
        isDownbeat: false,
        positionInBar: 3,
      },
    ],
  };
}

function playableGrid(): QualityRhythmAnalysis {
  const grid = validGrid();
  return {
    ...grid,
    beats: Array.from({ length: 13 }, (_, index) => ({
      timeSeconds: 1 + index * 0.5,
      strength: index % 4 === 0 ? 1 : 0.7,
      isDownbeat: index % 4 === 0,
      positionInBar: (index % 4) + 1,
    })),
  };
}

function uncertainGrid(): QualityRhythmAnalysis {
  const grid = validGrid();
  return {
    ...grid,
    meter: null,
    confidence: { ...grid.confidence, downbeat: 0.2, overall: 0.58 },
    warnings: ["low_confidence", "meter_uncertain"],
    baselineComparison: {
      ...grid.baselineComparison,
      fallbackUsed: true,
    },
    beats: grid.beats.map((beat) => ({
      ...beat,
      isDownbeat: false,
      positionInBar: null,
    })),
  };
}

function ambiguousGrid(): QualityRhythmAnalysis {
  const grid = validGrid();
  return {
    ...grid,
    tempoCandidates: [
      ...grid.tempoCandidates,
      { bpm: 60, score: 0.74, relation: "half" },
    ],
    warnings: ["half_double_ambiguous"],
  };
}

function pickerProps() {
  return {
    capabilityAvailable: true,
    createObjectURL: vi.fn(() => "blob:private-preview"),
    minimumAnalysisMilliseconds: 0,
    minimumProgressMilliseconds: 0,
    revokeObjectURL: vi.fn(),
    workerAvailable: true,
  };
}

function recoveryStore(result: RecoveryReadResult) {
  const readLatest = vi.fn<() => Promise<RecoveryReadResult>>(
    async () => result,
  );
  const saveLatest = vi.fn<BeatGridRecoveryStore["saveLatest"]>(
    async () => "saved",
  );
  const deleteLatest = vi.fn<BeatGridRecoveryStore["deleteLatest"]>(
    async () => "cleared",
  );
  return {
    store: {
      readLatest,
      saveLatest,
      deleteLatest,
    } satisfies BeatGridRecoveryStore,
    readLatest,
    saveLatest,
    deleteLatest,
  };
}

function select(file: File) {
  fireEvent.change(screen.getByLabelText("Choose local music file"), {
    target: { files: [file] },
  });
}

describe("private local-audio picker", () => {
  it("explains privacy and input limits before selection", () => {
    render(<LocalAudioPicker {...pickerProps()} />);

    expect(
      screen.getByText(
        "Decoded only in this tab. Nothing is uploaded. Audio is not saved.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/up to 25 MB and 10 minutes/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choose music file" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("Choose local music file")).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("shows local progress then a filename-free ready summary", async () => {
    const props = pickerProps();
    const handle = decodedAudio(8.25);
    const decodeAudio = vi.fn(
      async (_file: File, options: DecodeLocalAudioOptions) => {
        options.onProgress({ stage: "reading", percent: 48 });
        options.onProgress({ stage: "decoding", percent: 80 });
        return handle.decoded;
      },
    );
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile());

    expect(
      await screen.findByRole("heading", { name: "Ready for analysis" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ready_for_analysis")).toBeInTheDocument();
    expect(screen.getByText("8.3 seconds")).toBeInTheDocument();
    expect(screen.getByText("WAV")).toBeInTheDocument();
    expect(screen.getByText("2 channels · 48000 Hz")).toBeInTheDocument();
    expect(
      screen.queryByText("do-not-display-this.wav"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Local audio preview")).toHaveAttribute(
      "src",
      "blob:private-preview",
    );
    expect(props.createObjectURL).toHaveBeenCalledOnce();
  });

  it("hands preview playback to and from the shared page owner", async () => {
    const props = pickerProps();
    const handle = decodedAudio();
    render(
      <LocalAudioPicker
        {...props}
        decodeAudio={vi.fn().mockResolvedValue(handle.decoded)}
      />,
    );
    select(selectedFile());
    const preview = await screen.findByLabelText("Local audio preview");
    const previousOwner = Symbol("previous-game");
    const stopPrevious = vi.fn();
    playbackCoordinator.claim(previousOwner, stopPrevious);

    fireEvent.play(preview);
    expect(stopPrevious).toHaveBeenCalledOnce();

    const pausePreview = vi
      .spyOn(preview as HTMLAudioElement, "pause")
      .mockImplementation(() => undefined);
    const nextOwner = Symbol("next-game");
    playbackCoordinator.claim(nextOwner, vi.fn());
    expect(pausePreview).toHaveBeenCalledOnce();
    playbackCoordinator.release(nextOwner);
  });

  it("rejects invalid input before decode without exposing its name", () => {
    const props = pickerProps();
    const decodeAudio = vi.fn();
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile("private-identity.txt", "audio/wav"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose a WAV, MP3, M4A, AAC, OGG, Opus, FLAC, or WebM audio file.",
    );
    expect(screen.queryByText("private-identity.txt")).not.toBeInTheDocument();
    expect(decodeAudio).not.toHaveBeenCalled();
    expect(props.createObjectURL).not.toHaveBeenCalled();
  });

  it("cancels active work and releases a late stale result", async () => {
    const props = pickerProps();
    const handle = decodedAudio();
    let resolveDecode: ((value: DisposableDecodedAudio) => void) | undefined;
    let options: DecodeLocalAudioOptions | undefined;
    const decodeAudio = vi.fn(
      (_file: File, receivedOptions: DecodeLocalAudioOptions) => {
        options = receivedOptions;
        return new Promise<DisposableDecodedAudio>((resolve) => {
          resolveDecode = resolve;
        });
      },
    );
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile());
    expect(
      screen.getByRole("progressbar", {
        name: "Local audio preparation progress",
      }),
    ).toHaveValue(5);
    act(() => options?.onProgress({ stage: "decoding", percent: 77 }));
    expect(screen.getByText("77% · no upload in progress")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel preparation" }));
    expect(options?.signal.aborted).toBe(true);
    expect(
      screen.getByText("Selection cancelled. No audio was retained."),
    ).toBeInTheDocument();

    await act(async () => resolveDecode?.(handle.decoded));
    await waitFor(() => expect(handle.release).toHaveBeenCalledOnce());
    expect(props.createObjectURL).not.toHaveBeenCalled();
  });

  it("releases decoded samples when cancelled during visible progress", async () => {
    const props = pickerProps();
    props.minimumProgressMilliseconds = 10_000;
    const handle = decodedAudio();
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile());
    await waitFor(() => expect(decodeAudio).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Cancel preparation" }));

    await waitFor(() => expect(handle.release).toHaveBeenCalledOnce());
    expect(props.createObjectURL).not.toHaveBeenCalled();
    expect(
      screen.getByText("Selection cancelled. No audio was retained."),
    ).toBeInTheDocument();
  });

  it("releases decoded samples if a preview URL cannot be created", async () => {
    const props = pickerProps();
    props.createObjectURL.mockImplementation(() => {
      throw new Error("private platform detail");
    });
    const handle = decodedAudio();
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This audio could not be prepared. Choose another file.",
    );
    expect(handle.release).toHaveBeenCalledOnce();
    expect(
      screen.queryByText("private platform detail"),
    ).not.toBeInTheDocument();
  });

  it("releases each selection exactly once on replace and clear", async () => {
    const props = pickerProps();
    props.createObjectURL
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const first = decodedAudio(5);
    const second = decodedAudio(6);
    const decodeAudio = vi
      .fn()
      .mockResolvedValueOnce(first.decoded)
      .mockResolvedValueOnce(second.decoded);
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile("first-private.wav"));
    await screen.findByText("5.0 seconds");
    fireEvent.click(screen.getByRole("button", { name: "Replace music" }));
    select(selectedFile("second-private.wav"));
    await screen.findByText("6.0 seconds");

    expect(first.release).toHaveBeenCalledOnce();
    expect(props.revokeObjectURL).toHaveBeenCalledWith("blob:first");
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(second.release).toHaveBeenCalledOnce();
    expect(props.revokeObjectURL).toHaveBeenCalledWith("blob:second");
    expect(props.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText("Selection cleared. No audio was retained."),
    ).toBeInTheDocument();
  });

  it("shows stable decoder errors and allows retry", async () => {
    const props = pickerProps();
    const recovered = decodedAudio();
    const decodeAudio = vi
      .fn()
      .mockRejectedValueOnce(new LocalAudioError("decode_failed"))
      .mockResolvedValueOnce(recovered.decoded);
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile("secret-corrupt.wav"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This audio could not be decoded by this browser. Choose another file.",
    );
    expect(screen.queryByText("secret-corrupt.wav")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Choose another file" }),
    );
    select(selectedFile("secret-recovered.wav"));
    expect(
      await screen.findByRole("heading", { name: "Ready for analysis" }),
    ).toBeInTheDocument();
  });

  it("analyzes decoded samples and previews a versioned beat grid", async () => {
    const props = pickerProps();
    const handle = decodedAudio();
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    const analyzeBeats = vi.fn(
      async (
        decoded: DisposableDecodedAudio,
        options: AnalyzeDecodedAudioOptions,
      ) => {
        decoded.release();
        options.onProgress({ stage: "tempo", percent: 72 });
        options.onProgress({ stage: "beat_tracking", percent: 86 });
        return validGrid();
      },
    );
    render(
      <LocalAudioPicker
        {...props}
        decodeAudio={decodeAudio}
        analyzeBeats={analyzeBeats}
      />,
    );

    select(selectedFile());
    await screen.findByText("Ready for analysis");
    expect(screen.getByText(/runs off the main thread/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analyze beats" }));

    expect(
      await screen.findByText("Quality beat and downbeat grid"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("120.0 BPM")).toHaveLength(2);
    expect(screen.getByText("3", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("quality-dsp-v1")).toBeInTheDocument();
    expect(screen.getByText("4/4")).toBeInTheDocument();
    expect(screen.getByText("Downbeat 1 · bar position 1")).toBeInTheDocument();
    expect(screen.getByText("1.00 s")).toBeInTheDocument();
    expect(screen.getByText("1.50 s")).toBeInTheDocument();
    expect(screen.getByLabelText("Local audio preview")).toHaveAttribute(
      "src",
      "blob:private-preview",
    );
    expect(handle.release).toHaveBeenCalledOnce();
  });

  it("cancels analysis and ignores a late worker result", async () => {
    const props = pickerProps();
    const handle = decodedAudio();
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    let resolveAnalysis: ((grid: QualityRhythmAnalysis) => void) | undefined;
    let analysisOptions: AnalyzeDecodedAudioOptions | undefined;
    const analyzeBeats = vi.fn(
      (
        decoded: DisposableDecodedAudio,
        options: AnalyzeDecodedAudioOptions,
      ) => {
        decoded.release();
        analysisOptions = options;
        return new Promise<QualityRhythmAnalysis>((resolve) => {
          resolveAnalysis = resolve;
        });
      },
    );
    render(
      <LocalAudioPicker
        {...props}
        decodeAudio={decodeAudio}
        analyzeBeats={analyzeBeats}
      />,
    );

    select(selectedFile());
    await screen.findByText("Ready for analysis");
    fireEvent.click(screen.getByRole("button", { name: "Analyze beats" }));
    act(() =>
      analysisOptions?.onProgress({ stage: "onset_envelope", percent: 60 }),
    );
    expect(screen.getByText("Finding rhythmic onsets")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel analysis" }));

    expect(analysisOptions?.signal.aborted).toBe(true);
    expect(handle.release).toHaveBeenCalledOnce();
    expect(
      screen.getByText(
        "Beat analysis cancelled. The local preview is still ready.",
      ),
    ).toBeInTheDocument();
    await act(async () => resolveAnalysis?.(validGrid()));
    expect(
      screen.queryByText("Quality beat and downbeat grid"),
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      "uncertain meter",
      uncertainGrid,
      "Meter and downbeats are uncertain. The detected beat timing may still be usable.",
      "Baseline beat timing retained; meter and downbeats were not asserted.",
    ],
    [
      "half-tempo ambiguity",
      ambiguousGrid,
      "The musical pulse may be half or double this tempo. Compare the alternatives.",
      "60.0 BPM",
    ],
  ])("renders honest %s guidance", async (_case, result, warning, detail) => {
    const props = pickerProps();
    const handle = decodedAudio();
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    const analyzeBeats = vi.fn(async (decoded: DisposableDecodedAudio) => {
      decoded.release();
      return result();
    });
    render(
      <LocalAudioPicker
        {...props}
        decodeAudio={decodeAudio}
        analyzeBeats={analyzeBeats}
      />,
    );

    select(selectedFile());
    await screen.findByText("Ready for analysis");
    fireEvent.click(screen.getByRole("button", { name: "Analyze beats" }));

    expect(await screen.findByText(warning)).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
    expect(handle.release).toHaveBeenCalledOnce();
  });

  it("re-decodes the active local selection when analysis is retried", async () => {
    const props = pickerProps();
    const first = decodedAudio();
    const retry = decodedAudio();
    const decodeAudio = vi
      .fn()
      .mockResolvedValueOnce(first.decoded)
      .mockResolvedValueOnce(retry.decoded);
    const analyzeBeats = vi
      .fn()
      .mockImplementationOnce(async (decoded: DisposableDecodedAudio) => {
        decoded.release();
        throw new BeatAnalysisBoundaryError("worker_failed");
      })
      .mockImplementationOnce(async (decoded: DisposableDecodedAudio) => {
        decoded.release();
        return validGrid();
      });
    render(
      <LocalAudioPicker
        {...props}
        decodeAudio={decodeAudio}
        analyzeBeats={analyzeBeats}
      />,
    );

    select(selectedFile("private-retry.wav"));
    await screen.findByText("Ready for analysis");
    fireEvent.click(screen.getByRole("button", { name: "Analyze beats" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Local beat analysis stopped unexpectedly. Try again.",
    );
    expect(screen.queryByText("private-retry.wav")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry analysis" }));

    expect(
      await screen.findByText("Quality beat and downbeat grid"),
    ).toBeInTheDocument();
    expect(decodeAudio).toHaveBeenCalledTimes(2);
    expect(analyzeBeats).toHaveBeenCalledTimes(2);
    expect(first.release).toHaveBeenCalledOnce();
    expect(retry.release).toHaveBeenCalledOnce();
    expect(props.createObjectURL).toHaveBeenCalledOnce();
  });

  it("recovers safely when decoded audio exceeds the analysis budget", async () => {
    const props = pickerProps();
    const handle = decodedAudio(300);
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    const analyzeBeats = vi.fn(async (decoded: DisposableDecodedAudio) => {
      decoded.release();
      throw new BeatAnalysisBoundaryError("analysis_too_large");
    });
    render(
      <LocalAudioPicker
        {...props}
        decodeAudio={decodeAudio}
        analyzeBeats={analyzeBeats}
      />,
    );

    select(selectedFile("private-large.wav"));
    await screen.findByText("Ready for analysis");
    fireEvent.click(screen.getByRole("button", { name: "Analyze beats" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This track is too large for safe local beat analysis. Choose a shorter or lower-channel file.",
    );
    expect(
      screen.getByRole("button", { name: "Choose different music" }),
    ).toBeEnabled();
    expect(screen.queryByText("private-large.wav")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Local audio preview")).toBeInTheDocument();
    expect(handle.release).toHaveBeenCalledOnce();
  });

  it("aborts active analysis when a replacement is selected", async () => {
    const props = pickerProps();
    props.createObjectURL
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const first = decodedAudio(8);
    const second = decodedAudio(6);
    const decodeAudio = vi
      .fn()
      .mockResolvedValueOnce(first.decoded)
      .mockResolvedValueOnce(second.decoded);
    let resolveAnalysis: ((grid: QualityRhythmAnalysis) => void) | undefined;
    let analysisOptions: AnalyzeDecodedAudioOptions | undefined;
    const analyzeBeats = vi.fn(
      (
        decoded: DisposableDecodedAudio,
        options: AnalyzeDecodedAudioOptions,
      ) => {
        decoded.release();
        analysisOptions = options;
        return new Promise<QualityRhythmAnalysis>((resolve) => {
          resolveAnalysis = resolve;
        });
      },
    );
    render(
      <LocalAudioPicker
        {...props}
        decodeAudio={decodeAudio}
        analyzeBeats={analyzeBeats}
      />,
    );

    select(selectedFile("first-private.wav"));
    await screen.findByText("8.0 seconds");
    fireEvent.click(screen.getByRole("button", { name: "Analyze beats" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace music" }));
    select(selectedFile("second-private.wav"));

    expect(await screen.findByText("6.0 seconds")).toBeInTheDocument();
    expect(analysisOptions?.signal.aborted).toBe(true);
    expect(props.revokeObjectURL).toHaveBeenCalledWith("blob:first");
    await act(async () => resolveAnalysis?.(validGrid()));
    expect(
      screen.queryByText("Quality beat and downbeat grid"),
    ).not.toBeInTheDocument();
  });

  it("aborts active analysis on unmount", async () => {
    const props = pickerProps();
    const handle = decodedAudio();
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    let analysisOptions: AnalyzeDecodedAudioOptions | undefined;
    const analyzeBeats = vi.fn(
      (
        decoded: DisposableDecodedAudio,
        options: AnalyzeDecodedAudioOptions,
      ) => {
        decoded.release();
        analysisOptions = options;
        return new Promise<QualityRhythmAnalysis>(() => undefined);
      },
    );
    const { unmount } = render(
      <LocalAudioPicker
        {...props}
        decodeAudio={decodeAudio}
        analyzeBeats={analyzeBeats}
      />,
    );

    select(selectedFile());
    await screen.findByText("Ready for analysis");
    fireEvent.click(screen.getByRole("button", { name: "Analyze beats" }));
    unmount();

    expect(analysisOptions?.signal.aborted).toBe(true);
    expect(handle.release).toHaveBeenCalledOnce();
    expect(props.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("keeps preview available but omits analysis control without worker support", async () => {
    const props = pickerProps();
    const handle = decodedAudio();
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    render(
      <LocalAudioPicker
        {...props}
        workerAvailable={false}
        decodeAudio={decodeAudio}
      />,
    );

    select(selectedFile());
    await screen.findByText("Ready for analysis");

    expect(
      screen.getByText("Local beat analysis needs Web Worker support."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Analyze beats" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Local audio preview")).toBeInTheDocument();
  });

  it("releases a ready selection once when the page closes", async () => {
    const props = pickerProps();
    const handle = decodedAudio();
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    const { unmount } = render(
      <LocalAudioPicker {...props} decodeAudio={decodeAudio} />,
    );

    select(selectedFile());
    await screen.findByText("Ready for analysis");
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    expect(handle.release).toHaveBeenCalledOnce();
    expect(props.revokeObjectURL).toHaveBeenCalledOnce();

    unmount();
    expect(handle.release).toHaveBeenCalledOnce();
    expect(props.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("returns a released ready selection to idle after BFCache restoration", async () => {
    const props = pickerProps();
    const handle = decodedAudio();
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile());
    await screen.findByText("Ready for analysis");
    act(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      );
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });

    expect(handle.release).toHaveBeenCalledOnce();
    expect(props.revokeObjectURL).toHaveBeenCalledOnce();
    expect(screen.queryByText("Ready for analysis")).not.toBeInTheDocument();
    expect(
      screen.getByText("Page restored. Choose the local audio file again."),
    ).toBeInTheDocument();
  });

  it("returns cancelled work to idle after BFCache restoration", async () => {
    const props = pickerProps();
    const handle = decodedAudio();
    let resolveDecode: ((value: DisposableDecodedAudio) => void) | undefined;
    let options: DecodeLocalAudioOptions | undefined;
    const decodeAudio = vi.fn(
      (_file: File, receivedOptions: DecodeLocalAudioOptions) => {
        options = receivedOptions;
        return new Promise<DisposableDecodedAudio>((resolve) => {
          resolveDecode = resolve;
        });
      },
    );
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile());
    expect(screen.getByText("Reading audio in this tab")).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      );
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });

    expect(options?.signal.aborted).toBe(true);
    expect(
      screen.getByText("Page restored. Choose the local audio file again."),
    ).toBeInTheDocument();
    await act(async () => resolveDecode?.(handle.decoded));
    await waitFor(() => expect(handle.release).toHaveBeenCalledOnce());
    expect(props.createObjectURL).not.toHaveBeenCalled();
  });

  it("hydrates a completed grid without audio, preview taps, or a play action", async () => {
    const recovery = recoveryStore({
      status: "loaded",
      checkpoint: createBeatGridCheckpoint(playableGrid(), () => 1234),
    });
    render(
      <LocalAudioPicker {...pickerProps()} recoveryStore={recovery.store} />,
    );

    expect(
      await screen.findByRole("heading", { name: "Recovered beat grid" }),
    ).toBeVisible();
    expect(screen.getByTestId("recovered-grid")).toHaveTextContent(
      "Recovered from this device",
    );
    expect(screen.getAllByText(/Audio was never saved/).length).toBeGreaterThan(
      1,
    );
    expect(screen.getByRole("button", { name: "Tap beat" })).toBeDisabled();
    expect(screen.queryByLabelText("Local audio preview")).toBeNull();
    expect(screen.queryByRole("button", { name: /Start .* chart/ })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Choose your difficulty" }),
    ).toBeVisible();
    expect(recovery.readLatest).toHaveBeenCalledOnce();
  });

  it("checkpoints only completion and returns it after current audio is cleared", async () => {
    const recovery = recoveryStore({ status: "empty" });
    const props = pickerProps();
    const handle = decodedAudio();
    const analyzeBeats = vi.fn(async (decoded: DisposableDecodedAudio) => {
      decoded.release();
      return validGrid();
    });
    render(
      <LocalAudioPicker
        {...props}
        recoveryStore={recovery.store}
        decodeAudio={vi.fn().mockResolvedValue(handle.decoded)}
        analyzeBeats={analyzeBeats}
      />,
    );

    select(selectedFile());
    await screen.findByText("Ready for analysis");
    fireEvent.click(screen.getByRole("button", { name: "Analyze beats" }));
    await screen.findByText("Quality beat and downbeat grid");
    await waitFor(() =>
      expect(recovery.saveLatest).toHaveBeenCalledWith(validGrid()),
    );
    expect(screen.getByText(/Completed beat grid saved/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(
      screen.getByRole("heading", { name: "Recovered beat grid" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("Local audio preview")).toBeNull();
    expect(recovery.deleteLatest).not.toHaveBeenCalled();
  });

  it("retains the last recovered grid through replacement analysis cancellation", async () => {
    const recovery = recoveryStore({
      status: "loaded",
      checkpoint: createBeatGridCheckpoint(validGrid()),
    });
    const props = pickerProps();
    const handle = decodedAudio();
    let options: AnalyzeDecodedAudioOptions | undefined;
    const analyzeBeats = vi.fn(
      (
        decoded: DisposableDecodedAudio,
        received: AnalyzeDecodedAudioOptions,
      ) => {
        decoded.release();
        options = received;
        return new Promise<QualityRhythmAnalysis>(() => undefined);
      },
    );
    render(
      <LocalAudioPicker
        {...props}
        recoveryStore={recovery.store}
        decodeAudio={vi.fn().mockResolvedValue(handle.decoded)}
        analyzeBeats={analyzeBeats}
      />,
    );

    await screen.findByRole("heading", { name: "Recovered beat grid" });
    select(selectedFile());
    await screen.findByText("Ready for analysis");
    expect(
      screen.getByRole("heading", { name: "Recovered beat grid" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Analyze beats" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel analysis" }));

    expect(options?.signal.aborted).toBe(true);
    expect(
      screen.getByRole("heading", { name: "Recovered beat grid" }),
    ).toBeVisible();
    expect(recovery.saveLatest).not.toHaveBeenCalled();
  });

  it("shows the bounded fresh-worker attempt in progress", async () => {
    const recovery = recoveryStore({ status: "empty" });
    const props = pickerProps();
    const handle = decodedAudio();
    let finish: ((grid: QualityRhythmAnalysis) => void) | undefined;
    const analyzeBeats = vi.fn(
      (
        decoded: DisposableDecodedAudio,
        options: AnalyzeDecodedAudioOptions,
      ) => {
        decoded.release();
        options.onStateChange?.({
          phase: "retrying",
          attempt: 2,
          maximumAttempts: 2,
          cause: "worker_failed",
        });
        options.onStateChange?.({
          phase: "running",
          attempt: 2,
          maximumAttempts: 2,
          requestId: "attempt-2",
        });
        return new Promise<QualityRhythmAnalysis>((resolve) => {
          finish = resolve;
        });
      },
    );
    render(
      <LocalAudioPicker
        {...props}
        recoveryStore={recovery.store}
        decodeAudio={vi.fn().mockResolvedValue(handle.decoded)}
        analyzeBeats={analyzeBeats}
      />,
    );

    select(selectedFile());
    await screen.findByText("Ready for analysis");
    fireEvent.click(screen.getByRole("button", { name: "Analyze beats" }));
    expect(await screen.findByText(/attempt 2 of 2/)).toBeVisible();
    await act(async () => finish?.(validGrid()));
    expect(
      await screen.findByText("Quality beat and downbeat grid"),
    ).toBeVisible();
  });

  it("forgets only the recovery checkpoint", async () => {
    const recovery = recoveryStore({
      status: "loaded",
      checkpoint: createBeatGridCheckpoint(validGrid()),
    });
    render(
      <LocalAudioPicker {...pickerProps()} recoveryStore={recovery.store} />,
    );

    await screen.findByRole("heading", { name: "Recovered beat grid" });
    fireEvent.click(
      screen.getByRole("button", { name: "Forget recovered grid" }),
    );
    await waitFor(() => expect(recovery.deleteLatest).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("heading", { name: "Recovered beat grid" }),
    ).toBeNull();
    expect(
      screen.getByText(/Separate corrections were not changed/),
    ).toBeVisible();
  });

  it("keeps a checkpoint visible and retryable when forgetting is denied", async () => {
    const recovery = recoveryStore({
      status: "loaded",
      checkpoint: createBeatGridCheckpoint(validGrid()),
    });
    const correction = createCorrectionDocument(validGrid());
    const correctionKey = correctionStorageKey(correction.sourceFingerprint);
    const serializedCorrection = JSON.stringify({
      ...correction,
      revision: 1,
      operations: [{ kind: "offset", milliseconds: 50 }],
    });
    localStorage.setItem(correctionKey, serializedCorrection);
    recovery.deleteLatest.mockResolvedValueOnce("unavailable");
    render(
      <LocalAudioPicker {...pickerProps()} recoveryStore={recovery.store} />,
    );

    await screen.findByRole("heading", { name: "Recovered beat grid" });
    fireEvent.click(
      screen.getByRole("button", { name: "Forget recovered grid" }),
    );

    expect(await screen.findByText(/Could not forget/)).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Recovered beat grid" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Forget recovered grid" }),
    ).toBeEnabled();
    expect(
      screen.getByText(/Separate corrections were not changed/),
    ).toBeVisible();
    expect(localStorage.getItem(correctionKey)).toBe(serializedCorrection);

    fireEvent.click(
      screen.getByRole("button", { name: "Forget recovered grid" }),
    );
    await waitFor(() => expect(recovery.deleteLatest).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole("heading", { name: "Recovered beat grid" }),
    ).toBeNull();
    expect(localStorage.getItem(correctionKey)).toBe(serializedCorrection);
    localStorage.removeItem(correctionKey);
  });

  it("disables selection when required browser APIs are unavailable", () => {
    const props = pickerProps();
    render(<LocalAudioPicker {...props} capabilityAvailable={false} />);

    expect(
      screen.getByText("Local audio needs Web Audio support."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Choose music file" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Choose local music file"),
    ).not.toBeInTheDocument();
  });
});
