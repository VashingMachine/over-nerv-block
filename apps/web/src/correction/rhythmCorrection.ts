import {
  correctedRhythmAnalysisSchema,
  correctionContractVersion,
  correctionEditorVersion,
  correctionStorageVersion,
  qualityAnalyzerVersion,
  qualityRhythmAnalysisSchema,
  rhythmCorrectionDocumentSchema,
  rhythmCorrectionOperationSchema,
  schemaVersion,
  type CorrectedRhythmAnalysis,
  type QualityBeatPoint,
  type QualityRhythmAnalysis,
  type RhythmCorrectionDocument,
  type RhythmCorrectionOperation,
} from "@rhythm-game/chart-schema";

export type RhythmCorrectionErrorCode =
  | "source_mismatch"
  | "offset_out_of_bounds"
  | "tempo_out_of_bounds"
  | "meter_required"
  | "beat_not_found"
  | "tap_out_of_bounds"
  | "tap_tempo_out_of_bounds"
  | "duplicate_beat"
  | "minimum_beats"
  | "too_many_beats";

const maximumCorrectedBeats = 5_000;
const beatMatchToleranceSeconds = 0.005;
const minimumAddedBeatSpacingSeconds = 0.01;

const correctionMessages: Record<RhythmCorrectionErrorCode, string> = {
  source_mismatch:
    "These saved corrections belong to a different analysis and were not applied.",
  offset_out_of_bounds:
    "That offset would move a beat outside the song. Choose a smaller offset.",
  tempo_out_of_bounds:
    "That tempo change would leave the supported 40–240 BPM range.",
  meter_required: "Choose 3/4 or 4/4 before setting the first downbeat.",
  beat_not_found: "That beat is no longer in the working grid. Choose another.",
  tap_out_of_bounds: "Every tap must fall inside the local song duration.",
  tap_tempo_out_of_bounds:
    "Those taps imply a tempo outside the supported 40–240 BPM range.",
  duplicate_beat: "A beat already exists within 10 milliseconds of that time.",
  minimum_beats: "A corrected rhythm must retain at least two beats.",
  too_many_beats:
    "That correction would create too many beats for safe browser editing.",
};

export class RhythmCorrectionError extends Error {
  constructor(readonly code: RhythmCorrectionErrorCode) {
    super(correctionMessages[code]);
    this.name = "RhythmCorrectionError";
  }
}

interface WorkingRhythm {
  tempoBpm: number;
  meter: 3 | 4 | null;
  beats: QualityBeatPoint[];
  downbeatAnchorSeconds: number | null;
}

function stableFingerprint(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 14_695_981_039_346_656_037n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1_099_511_628_211n);
  }
  return hash.toString(36);
}

function roundTime(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function nearestBeatIndex(
  beats: readonly QualityBeatPoint[],
  timeSeconds: number,
): number {
  let nearest = 0;
  for (let index = 1; index < beats.length; index += 1) {
    if (
      Math.abs(beats[index]!.timeSeconds - timeSeconds) <
      Math.abs(beats[nearest]!.timeSeconds - timeSeconds)
    ) {
      nearest = index;
    }
  }
  return nearest;
}

function matchingBeatIndex(
  beats: readonly QualityBeatPoint[],
  timeSeconds: number,
): number {
  return beats.findIndex(
    (beat) =>
      Math.abs(beat.timeSeconds - timeSeconds) <= beatMatchToleranceSeconds,
  );
}

function relabelMeter(working: WorkingRhythm): WorkingRhythm {
  if (working.meter === null) {
    return {
      ...working,
      downbeatAnchorSeconds: null,
      beats: working.beats.map((beat) => ({
        ...beat,
        isDownbeat: false,
        positionInBar: null,
      })),
    };
  }

  const anchorSeconds =
    working.downbeatAnchorSeconds ?? working.beats[0]!.timeSeconds;
  const anchorIndex = nearestBeatIndex(working.beats, anchorSeconds);
  return {
    ...working,
    downbeatAnchorSeconds: working.beats[anchorIndex]!.timeSeconds,
    beats: working.beats.map((beat, index) => {
      const zeroBasedPosition =
        (((index - anchorIndex) % working.meter!) + working.meter!) %
        working.meter!;
      const positionInBar = zeroBasedPosition + 1;
      return {
        ...beat,
        isDownbeat: positionInBar === 1,
        positionInBar,
      };
    }),
  };
}

function applyOffset(
  working: WorkingRhythm,
  milliseconds: number,
  durationSeconds: number,
): WorkingRhythm {
  const deltaSeconds = milliseconds / 1_000;
  const beats = working.beats.map((beat) => ({
    ...beat,
    timeSeconds: roundTime(beat.timeSeconds + deltaSeconds),
  }));
  if (
    beats.some(
      (beat) => beat.timeSeconds < 0 || beat.timeSeconds > durationSeconds,
    )
  ) {
    throw new RhythmCorrectionError("offset_out_of_bounds");
  }
  return relabelMeter({
    ...working,
    beats,
    downbeatAnchorSeconds:
      working.downbeatAnchorSeconds === null
        ? null
        : roundTime(working.downbeatAnchorSeconds + deltaSeconds),
  });
}

function applyTempoScale(
  working: WorkingRhythm,
  factor: 0.5 | 2,
): WorkingRhythm {
  const tempoBpm = working.tempoBpm * factor;
  if (tempoBpm < 40 || tempoBpm > 240) {
    throw new RhythmCorrectionError("tempo_out_of_bounds");
  }
  let beats: QualityBeatPoint[];
  if (factor === 0.5) {
    beats = working.beats.filter((_, index) => index % 2 === 0);
    if (beats.length < 2) {
      throw new RhythmCorrectionError("minimum_beats");
    }
  } else {
    beats = working.beats.flatMap((beat, index) => {
      const next = working.beats[index + 1];
      if (!next) {
        return [beat];
      }
      return [
        beat,
        {
          timeSeconds: roundTime(
            beat.timeSeconds + (next.timeSeconds - beat.timeSeconds) / 2,
          ),
          strength: Math.max(0.8, (beat.strength + next.strength) / 2),
          isDownbeat: false,
          positionInBar: null,
        },
      ];
    });
    if (beats.length > maximumCorrectedBeats) {
      throw new RhythmCorrectionError("too_many_beats");
    }
  }
  return relabelMeter({ ...working, tempoBpm, beats });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function applyTapGrid(
  working: WorkingRhythm,
  tapTimesSeconds: readonly number[],
  durationSeconds: number,
): WorkingRhythm {
  if (tapTimesSeconds.some((time) => time > durationSeconds)) {
    throw new RhythmCorrectionError("tap_out_of_bounds");
  }
  const intervalSeconds = median(
    tapTimesSeconds
      .slice(1)
      .map((time, index) => time - tapTimesSeconds[index]!),
  );
  const tempoBpm = 60 / intervalSeconds;
  if (tempoBpm < 40 || tempoBpm > 240) {
    throw new RhythmCorrectionError("tap_tempo_out_of_bounds");
  }

  const phaseSeconds = tapTimesSeconds[0]!;
  let first = phaseSeconds;
  while (first - intervalSeconds >= 0) {
    first -= intervalSeconds;
  }
  const beats: QualityBeatPoint[] = [];
  for (
    let time = first;
    time <= durationSeconds + 0.000_001;
    time += intervalSeconds
  ) {
    const timeSeconds = roundTime(time);
    if (timeSeconds > durationSeconds) {
      break;
    }
    if (beats.at(-1)?.timeSeconds === timeSeconds) {
      continue;
    }
    beats.push({
      timeSeconds,
      strength: 0.85,
      isDownbeat: false,
      positionInBar: null,
    });
  }
  if (beats.length < 2) {
    throw new RhythmCorrectionError("minimum_beats");
  }
  if (beats.length > maximumCorrectedBeats) {
    throw new RhythmCorrectionError("too_many_beats");
  }
  return relabelMeter({
    ...working,
    tempoBpm,
    beats,
    downbeatAnchorSeconds: working.meter === null ? null : phaseSeconds,
  });
}

function applyOperation(
  working: WorkingRhythm,
  operation: RhythmCorrectionOperation,
  durationSeconds: number,
): WorkingRhythm {
  switch (operation.kind) {
    case "offset":
      return applyOffset(working, operation.milliseconds, durationSeconds);
    case "tempo_scale":
      return applyTempoScale(working, operation.factor);
    case "set_meter":
      return relabelMeter({
        ...working,
        meter: operation.meter,
        downbeatAnchorSeconds:
          working.downbeatAnchorSeconds ?? working.beats[0]!.timeSeconds,
      });
    case "first_downbeat": {
      if (working.meter === null) {
        throw new RhythmCorrectionError("meter_required");
      }
      const index = matchingBeatIndex(working.beats, operation.timeSeconds);
      if (index < 0) {
        throw new RhythmCorrectionError("beat_not_found");
      }
      return relabelMeter({
        ...working,
        downbeatAnchorSeconds: working.beats[index]!.timeSeconds,
      });
    }
    case "tap_grid":
      return applyTapGrid(working, operation.tapTimesSeconds, durationSeconds);
    case "add_beat": {
      if (operation.timeSeconds > durationSeconds) {
        throw new RhythmCorrectionError("tap_out_of_bounds");
      }
      if (
        working.beats.some(
          (beat) =>
            Math.abs(beat.timeSeconds - operation.timeSeconds) <
            minimumAddedBeatSpacingSeconds,
        )
      ) {
        throw new RhythmCorrectionError("duplicate_beat");
      }
      if (working.beats.length >= maximumCorrectedBeats) {
        throw new RhythmCorrectionError("too_many_beats");
      }
      return relabelMeter({
        ...working,
        beats: [
          ...working.beats,
          {
            timeSeconds: roundTime(operation.timeSeconds),
            strength: 1,
            isDownbeat: false,
            positionInBar: null,
          },
        ].sort((left, right) => left.timeSeconds - right.timeSeconds),
      });
    }
    case "remove_beat": {
      const index = matchingBeatIndex(working.beats, operation.timeSeconds);
      if (index < 0) {
        throw new RhythmCorrectionError("beat_not_found");
      }
      if (working.beats.length <= 2) {
        throw new RhythmCorrectionError("minimum_beats");
      }
      return relabelMeter({
        ...working,
        beats: working.beats.filter((_, beatIndex) => beatIndex !== index),
      });
    }
  }
}

export function correctionSourceFingerprint(
  input: QualityRhythmAnalysis,
): string {
  return stableFingerprint(qualityRhythmAnalysisSchema.parse(input));
}

export function createCorrectionDocument(
  input: QualityRhythmAnalysis,
): RhythmCorrectionDocument {
  return rhythmCorrectionDocumentSchema.parse({
    storageVersion: correctionStorageVersion,
    kind: "rhythm_correction_document",
    editorVersion: correctionEditorVersion,
    correctionContractVersion,
    sourceFingerprint: correctionSourceFingerprint(input),
    originalAnalyzerVersion: qualityAnalyzerVersion,
    revision: 0,
    operations: [],
  });
}

export function projectCorrections(
  input: QualityRhythmAnalysis,
  correctionInput: RhythmCorrectionDocument,
): CorrectedRhythmAnalysis {
  const original = qualityRhythmAnalysisSchema.parse(input);
  const document = rhythmCorrectionDocumentSchema.parse(correctionInput);
  const sourceFingerprint = correctionSourceFingerprint(original);
  if (document.sourceFingerprint !== sourceFingerprint) {
    throw new RhythmCorrectionError("source_mismatch");
  }

  let working: WorkingRhythm = {
    tempoBpm: original.tempoBpm,
    meter: original.meter,
    beats: original.beats.map((beat) => ({ ...beat })),
    downbeatAnchorSeconds:
      original.beats.find((beat) => beat.isDownbeat)?.timeSeconds ?? null,
  };
  for (const operation of document.operations) {
    working = applyOperation(
      working,
      rhythmCorrectionOperationSchema.parse(operation),
      original.durationSeconds,
    );
  }

  return correctedRhythmAnalysisSchema.parse({
    schemaVersion,
    kind: "corrected_rhythm_analysis",
    analyzerVersion: original.analyzerVersion,
    editorVersion: document.editorVersion,
    correctionContractVersion: document.correctionContractVersion,
    sourceFingerprint,
    revision: document.revision,
    durationSeconds: original.durationSeconds,
    analysisSampleRate: original.analysisSampleRate,
    tempoBpm: working.tempoBpm,
    meter: working.meter,
    confidence: original.confidence,
    beats: working.beats,
  });
}

export function appendCorrectionOperation(
  input: QualityRhythmAnalysis,
  correctionInput: RhythmCorrectionDocument,
  operationInput: RhythmCorrectionOperation,
): {
  document: RhythmCorrectionDocument;
  analysis: CorrectedRhythmAnalysis;
} {
  const current = rhythmCorrectionDocumentSchema.parse(correctionInput);
  const operation = rhythmCorrectionOperationSchema.parse(operationInput);
  const document = rhythmCorrectionDocumentSchema.parse({
    ...current,
    revision: current.revision + 1,
    operations: [...current.operations, operation],
  });
  return { document, analysis: projectCorrections(input, document) };
}

export function correctionOperationLabel(
  operation: RhythmCorrectionOperation,
): string {
  switch (operation.kind) {
    case "offset":
      return `Offset ${operation.milliseconds >= 0 ? "+" : ""}${operation.milliseconds} ms`;
    case "tempo_scale":
      return operation.factor === 0.5 ? "Use half tempo" : "Use double tempo";
    case "set_meter":
      return `Set meter to ${operation.meter}/4`;
    case "first_downbeat":
      return `Set first downbeat at ${operation.timeSeconds.toFixed(2)} s`;
    case "tap_grid":
      return `Tap tempo and phase from ${operation.tapTimesSeconds.length} taps`;
    case "add_beat":
      return `Add beat at ${operation.timeSeconds.toFixed(2)} s`;
    case "remove_beat":
      return `Remove beat at ${operation.timeSeconds.toFixed(2)} s`;
  }
}
