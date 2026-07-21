import {
  baselineAnalyzerVersion,
  qualityAnalysisThresholds,
  qualityAnalyzerVersion,
  qualityRhythmAnalysisSchema,
  qualityTempoRelation,
  rhythmAnalysisWarningOrder,
  schemaVersion,
  type BeatGrid,
  type QualityRhythmAnalysis,
  type QualityTempoCandidate,
  type RhythmAnalysisWarning,
} from "@rhythm-game/chart-schema";

import {
  analyzeBeatGrid,
  type BeatAnalysisInput,
  type BeatAnalysisOptions,
} from "./beatAnalyzer";

export interface MeterInference {
  readonly meter: 3 | 4 | null;
  readonly phase: number | null;
  readonly confidence: number;
}

interface MeterHypothesis {
  readonly meter: 3 | 4;
  readonly phase: number;
  readonly score: number;
  readonly completeBars: number;
  readonly strongBarRatio: number;
  readonly rawContrastRatio: number;
}

const noProgress = () => undefined;
const neverCancelled = () => false;
const resolvedYield = () => Promise.resolve();

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundConfidence(value: number): number {
  return Math.round(clamp01(value) * 1_000_000) / 1_000_000;
}

function cancellationError(): DOMException {
  return new DOMException("Beat analysis was cancelled", "AbortError");
}

function assertActive(isCancelled: () => boolean): void {
  if (isCancelled()) {
    throw cancellationError();
  }
}

function monoSampleAt(
  channels: readonly Float32Array[],
  index: number,
): number {
  let sum = 0;
  for (const channel of channels) {
    const sample = channel[index] ?? 0;
    sum += Number.isFinite(sample) ? sample : 0;
  }
  return sum / channels.length;
}

export function beatSynchronousAccents(
  input: BeatAnalysisInput,
  baseline: BeatGrid,
): readonly number[] {
  const preSamples = Math.round(input.sampleRate * 0.02);
  const postSamples = Math.round(input.sampleRate * 0.15);
  const channelLength = Math.min(
    ...input.channels.map((channel) => channel.length),
  );
  return baseline.beats.map((beat) => {
    const center = Math.round(beat.timeSeconds * input.sampleRate);
    const from = Math.max(1, center - preSamples);
    const to = Math.min(channelLength - 1, center + postSamples);
    let energy = 0;
    let transient = 0;
    let count = 0;
    let previous = monoSampleAt(input.channels, from - 1);
    for (let index = from; index <= to; index += 1) {
      const sample = monoSampleAt(input.channels, index);
      energy += sample * sample;
      transient += Math.abs(sample - previous);
      previous = sample;
      count += 1;
    }
    if (count === 0) {
      return 0;
    }
    return Math.sqrt(energy / count) * 0.72 + (transient / count) * 0.28;
  });
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function inferMeterFromAccents(
  accents: readonly number[],
): MeterInference {
  if (
    accents.length < 6 ||
    accents.some((accent) => !Number.isFinite(accent))
  ) {
    return { meter: null, phase: null, confidence: 0 };
  }
  const minimum = Math.min(...accents);
  const maximum = Math.max(...accents);
  const relativeRange = (maximum - minimum) / Math.max(maximum, 1e-9);
  if (relativeRange < qualityAnalysisThresholds.meterMinimumRelativeRange) {
    return { meter: null, phase: null, confidence: 0.15 };
  }
  const normalized = accents.map(
    (accent) => (accent - minimum) / Math.max(1e-9, maximum - minimum),
  );
  const hypotheses: MeterHypothesis[] = [];
  for (const meter of [3, 4] as const) {
    for (let phase = 0; phase < meter; phase += 1) {
      const downbeats = normalized.filter(
        (_accent, index) => index % meter === phase,
      );
      const otherBeats = normalized.filter(
        (_accent, index) => index % meter !== phase,
      );
      if (downbeats.length < 2 || otherBeats.length < 2) {
        continue;
      }
      const downbeatMean = mean(downbeats);
      const otherMean = mean(otherBeats);
      const contrast = clamp01(downbeatMean - otherMean);
      const consistency =
        downbeats.filter((accent) => accent > otherMean + 0.08).length /
        downbeats.length;
      const barContrasts: number[] = [];
      for (
        let barStart = phase;
        barStart + meter <= normalized.length;
        barStart += meter
      ) {
        const bar = normalized.slice(barStart, barStart + meter);
        barContrasts.push(bar[0]! - Math.max(...bar.slice(1)));
      }
      const rawDownbeatMean = mean(
        accents.filter((_accent, index) => index % meter === phase),
      );
      const rawOtherMean = mean(
        accents.filter((_accent, index) => index % meter !== phase),
      );
      hypotheses.push({
        meter,
        phase,
        score: contrast * 0.75 + consistency * 0.25,
        completeBars: barContrasts.length,
        strongBarRatio:
          barContrasts.filter(
            (barContrast) =>
              barContrast >= qualityAnalysisThresholds.meterMinimumBarContrast,
          ).length / Math.max(1, barContrasts.length),
        rawContrastRatio:
          (rawDownbeatMean - rawOtherMean) /
          Math.max(Math.abs(mean(accents)), 1e-9),
      });
    }
  }
  hypotheses.sort((left, right) => right.score - left.score);
  const best = hypotheses[0];
  const second = hypotheses[1];
  if (!best) {
    return { meter: null, phase: null, confidence: 0 };
  }
  const margin = best.score - (second?.score ?? 0);
  const confidence = roundConfidence(
    best.score * 0.7 + clamp01(margin * 2) * 0.3,
  );
  if (
    best.score < qualityAnalysisThresholds.meterMinimumHypothesisScore ||
    margin < qualityAnalysisThresholds.meterMinimumWinningMargin ||
    confidence < qualityAnalysisThresholds.maximumUncertainDownbeatConfidence ||
    best.completeBars < qualityAnalysisThresholds.meterMinimumCompleteBars ||
    best.strongBarRatio <
      qualityAnalysisThresholds.meterMinimumStrongBarRatio ||
    best.rawContrastRatio <
      qualityAnalysisThresholds.meterMinimumRawContrastRatio
  ) {
    return {
      meter: null,
      phase: null,
      confidence: Math.min(
        qualityAnalysisThresholds.maximumUncertainDownbeatConfidence - 0.01,
        confidence,
      ),
    };
  }
  return { meter: best.meter, phase: best.phase, confidence };
}

export function classifyTempoCandidates(
  baseline: BeatGrid,
): QualityTempoCandidate[] {
  return baseline.tempoCandidates.map((candidate) => ({
    ...candidate,
    relation: qualityTempoRelation(candidate.bpm, baseline.tempoBpm),
  }));
}

export function qualityWarnings(
  analysis: Pick<
    QualityRhythmAnalysis,
    "meter" | "confidence" | "tempoCandidates" | "baselineComparison"
  >,
): RhythmAnalysisWarning[] {
  return rhythmAnalysisWarningOrder.filter((warning) => {
    if (warning === "low_confidence") {
      return (
        analysis.confidence.overall <
        qualityAnalysisThresholds.lowOverallConfidence
      );
    }
    if (warning === "meter_uncertain") {
      return analysis.meter === null;
    }
    if (warning === "half_double_ambiguous") {
      return analysis.tempoCandidates.some(
        (candidate) =>
          (candidate.relation === "half" || candidate.relation === "double") &&
          candidate.score >= qualityAnalysisThresholds.halfDoubleAmbiguityScore,
      );
    }
    return (
      analysis.baselineComparison.tempoDeltaBpm >
        qualityAnalysisThresholds.baselineTempoDisagreementBpm ||
      analysis.baselineComparison.beatAgreement <
        qualityAnalysisThresholds.minimumBaselineBeatAgreement
    );
  });
}

export async function analyzeQualityRhythm(
  input: BeatAnalysisInput,
  {
    onProgress = noProgress,
    isCancelled = neverCancelled,
    yieldControl = resolvedYield,
  }: BeatAnalysisOptions = {},
): Promise<QualityRhythmAnalysis> {
  const baseline = await analyzeBeatGrid(input, {
    isCancelled,
    yieldControl,
    onProgress: (progress) => {
      onProgress({
        stage:
          progress.stage === "finalizing" ? "beat_tracking" : progress.stage,
        percent: Math.min(82, Math.round(progress.percent * 0.82)),
      });
    },
  });
  assertActive(isCancelled);
  onProgress({ stage: "metrical_analysis", percent: 88 });
  await yieldControl();
  assertActive(isCancelled);

  const accents = beatSynchronousAccents(input, baseline);
  const meter = inferMeterFromAccents(accents);
  const tempoCandidates = classifyTempoCandidates(baseline);
  const fallbackUsed = meter.meter === null;
  const beatConfidence = roundConfidence(baseline.confidence);
  const tempoConfidence = roundConfidence(
    1 - (tempoCandidates[1]?.score ?? 0) * 0.45,
  );
  const agreementConfidence = 1;
  const overall = roundConfidence(
    beatConfidence * 0.35 +
      tempoConfidence * 0.2 +
      meter.confidence * 0.3 +
      agreementConfidence * 0.15,
  );
  const confidence = {
    tempo: tempoConfidence,
    beat: beatConfidence,
    downbeat: meter.confidence,
    agreement: agreementConfidence,
    overall,
  };
  const baselineComparison = {
    analyzerVersion: baselineAnalyzerVersion,
    tempoDeltaBpm: 0,
    beatAgreement: 1,
    fallbackUsed,
  } as const;
  const partial = {
    meter: meter.meter,
    confidence,
    tempoCandidates,
    baselineComparison,
  };
  const warnings = qualityWarnings(partial);
  const beats = baseline.beats.map((beat, index) => {
    if (meter.meter === null || meter.phase === null) {
      return { ...beat, isDownbeat: false, positionInBar: null };
    }
    const zeroBasedPosition =
      (((index - meter.phase) % meter.meter) + meter.meter) % meter.meter;
    return {
      ...beat,
      isDownbeat: zeroBasedPosition === 0,
      positionInBar: zeroBasedPosition + 1,
    };
  });

  onProgress({ stage: "finalizing", percent: 97 });
  await yieldControl();
  assertActive(isCancelled);
  return qualityRhythmAnalysisSchema.parse({
    schemaVersion,
    kind: "quality_rhythm_analysis",
    analyzerVersion: qualityAnalyzerVersion,
    durationSeconds: baseline.durationSeconds,
    analysisSampleRate: baseline.analysisSampleRate,
    tempoBpm: baseline.tempoBpm,
    ...partial,
    warnings,
    beats,
  });
}
