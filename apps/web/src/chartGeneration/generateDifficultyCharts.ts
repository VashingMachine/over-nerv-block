import {
  chartDifficulties,
  chartGenerationContractVersion,
  chartGenerationRules,
  chartGeneratorVersion,
  generatedRhythmChartSchema,
  qualityAnalyzerVersion,
  qualityRhythmAnalysisSchema,
  schemaVersion,
  type ChartDifficulty,
  type GeneratedRhythmChart,
  type QualityBeatPoint,
  type QualityRhythmAnalysis,
} from "@rhythm-game/chart-schema";

export type ChartGenerationErrorCode = "insufficient_safe_beats";

export class ChartGenerationError extends Error {
  constructor(
    readonly code: ChartGenerationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ChartGenerationError";
  }
}

export type DifficultyCharts = Readonly<
  Record<ChartDifficulty, GeneratedRhythmChart>
>;

interface IndexedBeat {
  readonly index: number;
  readonly beat: QualityBeatPoint;
}

function isPatternCandidate(
  candidate: IndexedBeat,
  difficulty: ChartDifficulty,
  meter: QualityRhythmAnalysis["meter"],
): boolean {
  if (difficulty === "hard") {
    return true;
  }
  if (difficulty === "easy") {
    return meter === null
      ? candidate.index % 4 === 0
      : candidate.beat.isDownbeat;
  }
  return (
    candidate.beat.isDownbeat ||
    (candidate.beat.positionInBar === null
      ? candidate.index % 2 === 0
      : candidate.beat.positionInBar % 2 === 1)
  );
}

function isFarEnough(
  candidate: IndexedBeat,
  selected: readonly IndexedBeat[],
  minimumSpacingSeconds: number,
): boolean {
  return selected.every(
    (existing) =>
      Math.abs(existing.beat.timeSeconds - candidate.beat.timeSeconds) >=
      minimumSpacingSeconds - 0.000_001,
  );
}

function beatIdentity(candidate: IndexedBeat): string {
  return `${candidate.index}:${candidate.beat.timeSeconds}`;
}

function strongestInTemporalBucket(
  candidates: readonly IndexedBeat[],
  startIndex: number,
  endIndex: number,
): IndexedBeat {
  return candidates
    .slice(startIndex, endIndex + 1)
    .sort(
      (left, right) =>
        right.beat.strength - left.beat.strength || left.index - right.index,
    )[0]!;
}

function thinAcrossTimeline(
  candidates: readonly IndexedBeat[],
  maximumCount: number,
): IndexedBeat[] {
  if (maximumCount >= candidates.length) {
    return [...candidates];
  }
  if (maximumCount <= 0) {
    return [];
  }
  if (maximumCount === 1) {
    return [strongestInTemporalBucket(candidates, 0, candidates.length - 1)];
  }

  const selected = [candidates[0]!];
  for (let slot = 1; slot < maximumCount - 1; slot += 1) {
    const startIndex = Math.max(
      1,
      Math.floor((slot * candidates.length) / maximumCount),
    );
    const endIndex = Math.min(
      candidates.length - 2,
      Math.floor(((slot + 1) * candidates.length) / maximumCount) - 1,
    );
    selected.push(strongestInTemporalBucket(candidates, startIndex, endIndex));
  }
  selected.push(candidates.at(-1)!);
  return selected;
}

function selectDifficulty(
  analysis: QualityRhythmAnalysis,
  difficulty: ChartDifficulty,
  required: readonly IndexedBeat[],
): { selected: IndexedBeat[]; eligibleCount: number } {
  const rules = chartGenerationRules.difficulties[difficulty];
  const lowConfidence =
    analysis.confidence.overall < chartGenerationRules.lowConfidenceThreshold;
  const minimumStrength = lowConfidence
    ? rules.lowConfidenceMinimumStrength
    : rules.minimumStrength;
  const boundedCandidates = analysis.beats
    .map((beat, index) => ({ beat, index }))
    .filter(
      ({ beat }) =>
        beat.timeSeconds >= chartGenerationRules.introGuardSeconds &&
        beat.timeSeconds <=
          analysis.durationSeconds - chartGenerationRules.outroGuardSeconds,
    );
  const candidates = boundedCandidates.filter(
    (candidate) =>
      candidate.beat.strength >= minimumStrength &&
      isPatternCandidate(candidate, difficulty, analysis.meter),
  );
  const eligibleByIdentity = new Map(
    [...required, ...candidates].map((candidate) => [
      beatIdentity(candidate),
      candidate,
    ]),
  );
  const requiredIdentities = new Set(required.map(beatIdentity));
  const maximumCount = Math.floor(
    (analysis.durationSeconds / 60) * rules.maximumNotesPerMinute + 0.000_001,
  );
  const maximumOptionalSequence: IndexedBeat[] = [];
  [...eligibleByIdentity.values()]
    .filter(
      (candidate) =>
        !requiredIdentities.has(beatIdentity(candidate)) &&
        isFarEnough(candidate, required, rules.minimumSpacingSeconds),
    )
    .sort((left, right) => left.beat.timeSeconds - right.beat.timeSeconds)
    .forEach((candidate) => {
      if (
        isFarEnough(
          candidate,
          maximumOptionalSequence,
          rules.minimumSpacingSeconds,
        )
      ) {
        maximumOptionalSequence.push(candidate);
      }
    });
  const optionalSlots = Math.max(0, maximumCount - required.length);
  const selected = [
    ...required,
    ...thinAcrossTimeline(maximumOptionalSequence, optionalSlots),
  ];

  return {
    selected: selected.sort(
      (left, right) => left.beat.timeSeconds - right.beat.timeSeconds,
    ),
    eligibleCount: eligibleByIdentity.size,
  };
}

function generatedChartFingerprint(
  analysis: QualityRhythmAnalysis,
  difficulty: ChartDifficulty,
  selected: readonly IndexedBeat[],
  seed: number,
): string {
  const input = JSON.stringify({
    generatorVersion: chartGeneratorVersion,
    generatorContractVersion: chartGenerationContractVersion,
    rules: chartGenerationRules,
    seed,
    difficulty,
    analysis,
    notes: selected.map(({ beat }) => ({
      timeSeconds: beat.timeSeconds,
      source: noteSource(beat),
    })),
  });
  let hash = 14_695_981_039_346_656_037n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1_099_511_628_211n);
  }
  return hash.toString(36);
}

function noteSource(beat: QualityBeatPoint): "beat" | "downbeat" | "onset" {
  if (beat.isDownbeat) {
    return "downbeat";
  }
  return beat.strength >= 0.65 ? "onset" : "beat";
}

export function generateDifficultyCharts(
  input: QualityRhythmAnalysis,
  seed = 0,
): DifficultyCharts {
  const analysis = qualityRhythmAnalysisSchema.parse(input);
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new RangeError(
      "Chart generation seed must be a non-negative integer",
    );
  }

  const charts = {} as Record<ChartDifficulty, GeneratedRhythmChart>;
  let required: readonly IndexedBeat[] = [];

  for (const difficulty of chartDifficulties) {
    const { selected, eligibleCount } = selectDifficulty(
      analysis,
      difficulty,
      required,
    );
    if (selected.length < chartGenerationRules.minimumNotes) {
      throw new ChartGenerationError(
        "insufficient_safe_beats",
        "This analysis does not contain enough safe rhythmic anchors for all three difficulties.",
      );
    }
    const rules = chartGenerationRules.difficulties[difficulty];
    const fingerprint = generatedChartFingerprint(
      analysis,
      difficulty,
      selected,
      seed,
    );
    charts[difficulty] = generatedRhythmChartSchema.parse({
      schemaVersion,
      kind: "generated_rhythm_chart",
      id: `generated-${fingerprint}-${difficulty}`,
      title: `Generated ${difficulty[0]!.toUpperCase()}${difficulty.slice(1)} chart`,
      durationSeconds: analysis.durationSeconds,
      analyzerVersion: qualityAnalyzerVersion,
      generatorVersion: chartGeneratorVersion,
      generatorContractVersion: chartGenerationContractVersion,
      difficulty,
      seed,
      generation: {
        inputBeatCount: analysis.beats.length,
        eligibleBeatCount: eligibleCount,
        selectedNoteCount: selected.length,
        minimumSpacingSeconds: rules.minimumSpacingSeconds,
        maximumNotesPerMinute: rules.maximumNotesPerMinute,
        lowConfidenceGuardApplied:
          analysis.confidence.overall <
          chartGenerationRules.lowConfidenceThreshold,
      },
      notes: selected.map(({ beat }) => ({
        timeSeconds: beat.timeSeconds,
        lane: 0,
        source: noteSource(beat),
      })),
    });
    required = selected;
  }

  return charts;
}
