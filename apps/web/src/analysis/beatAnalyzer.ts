import {
  baselineAnalyzerVersion,
  beatGridSchema,
  schemaVersion,
  type BeatGrid,
  type BeatPoint,
  type TempoCandidate,
} from "@rhythm-game/chart-schema";

export const ANALYSIS_SAMPLE_RATE = 11_025;
const FFT_SIZE = 1_024;
const HOP_SIZE = 256;
const MIN_BPM = 60;
const MAX_BPM = 200;

export type BeatAnalysisStage =
  | "downmix"
  | "resample"
  | "onset_envelope"
  | "tempo"
  | "beat_tracking"
  | "finalizing";

export interface BeatAnalysisProgress {
  readonly stage: BeatAnalysisStage;
  readonly percent: number;
}

export interface BeatAnalysisInput {
  readonly channels: readonly Float32Array[];
  readonly sampleRate: number;
  readonly durationSeconds: number;
}

export type BeatAnalysisErrorCode =
  | "invalid_input"
  | "insufficient_audio"
  | "no_onsets"
  | "no_tempo"
  | "no_beats";

const analysisErrorMessages: Record<BeatAnalysisErrorCode, string> = {
  invalid_input: "The decoded audio is not valid for analysis.",
  insufficient_audio: "This audio is too short for beat analysis.",
  no_onsets: "No clear rhythmic onsets were found in this audio.",
  no_tempo: "A stable baseline tempo could not be estimated.",
  no_beats: "A stable baseline beat grid could not be tracked.",
};

export class BeatAnalysisError extends Error {
  constructor(readonly code: BeatAnalysisErrorCode) {
    super(analysisErrorMessages[code]);
    this.name = "BeatAnalysisError";
  }
}

export interface BeatAnalysisOptions {
  readonly onProgress?: (progress: BeatAnalysisProgress) => void;
  readonly isCancelled?: () => boolean;
  readonly yieldControl?: () => Promise<void>;
}

interface OnsetPeak {
  readonly timeSeconds: number;
  readonly strength: number;
}

interface TempoEstimate {
  readonly selected: TempoCandidate;
  readonly candidates: readonly TempoCandidate[];
  readonly topMargin: number;
}

const noProgress = () => undefined;
const neverCancelled = () => false;
const resolvedYield = () => Promise.resolve();

function cancellationError(): DOMException {
  return new DOMException("Beat analysis was cancelled", "AbortError");
}

function assertActive(isCancelled: () => boolean): void {
  if (isCancelled()) {
    throw cancellationError();
  }
}

async function reportStage(
  stage: BeatAnalysisStage,
  percent: number,
  onProgress: (progress: BeatAnalysisProgress) => void,
  isCancelled: () => boolean,
  yieldControl: () => Promise<void>,
): Promise<void> {
  assertActive(isCancelled);
  onProgress({ stage, percent });
  await yieldControl();
  assertActive(isCancelled);
}

function validateInput(input: BeatAnalysisInput): number {
  if (
    input.channels.length === 0 ||
    !Number.isFinite(input.sampleRate) ||
    input.sampleRate <= 0 ||
    !Number.isFinite(input.durationSeconds) ||
    input.durationSeconds <= 0
  ) {
    throw new BeatAnalysisError("invalid_input");
  }
  const length = Math.min(...input.channels.map((channel) => channel.length));
  if (length < 2 || !Number.isFinite(length)) {
    throw new BeatAnalysisError("insufficient_audio");
  }
  return length;
}

function downmixChannels(
  channels: readonly Float32Array[],
  length: number,
): Float32Array {
  const mono = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    let sum = 0;
    for (const channel of channels) {
      const sample = channel[index] ?? 0;
      sum += Number.isFinite(sample) ? sample : 0;
    }
    mono[index] = sum / channels.length;
  }
  return mono;
}

function resampleLinear(
  samples: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate === targetRate) {
    return samples;
  }
  const targetLength = Math.max(
    2,
    Math.round((samples.length * targetRate) / sourceRate),
  );
  const result = new Float32Array(targetLength);
  const scale = (samples.length - 1) / (targetLength - 1);
  for (let index = 0; index < targetLength; index += 1) {
    const sourcePosition = index * scale;
    const before = Math.floor(sourcePosition);
    const after = Math.min(samples.length - 1, before + 1);
    const fraction = sourcePosition - before;
    result[index] =
      (samples[before] ?? 0) * (1 - fraction) +
      (samples[after] ?? 0) * fraction;
  }
  return result;
}

function fftInPlace(real: Float64Array, imaginary: Float64Array): void {
  const length = real.length;
  for (let index = 1, reversed = 0; index < length; index += 1) {
    let bit = length >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      const realValue = real[index]!;
      real[index] = real[reversed]!;
      real[reversed] = realValue;
      const imaginaryValue = imaginary[index]!;
      imaginary[index] = imaginary[reversed]!;
      imaginary[reversed] = imaginaryValue;
    }
  }

  for (let size = 2; size <= length; size *= 2) {
    const angle = (-2 * Math.PI) / size;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let offset = 0; offset < length; offset += size) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let index = 0; index < size / 2; index += 1) {
        const even = offset + index;
        const odd = even + size / 2;
        const oddReal =
          real[odd]! * twiddleReal - imaginary[odd]! * twiddleImaginary;
        const oddImaginary =
          real[odd]! * twiddleImaginary + imaginary[odd]! * twiddleReal;
        real[odd] = real[even]! - oddReal;
        imaginary[odd] = imaginary[even]! - oddImaginary;
        real[even] = real[even]! + oddReal;
        imaginary[even] = imaginary[even]! + oddImaginary;
        const nextTwiddleReal =
          twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary =
          twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextTwiddleReal;
      }
    }
  }
}

function bandIndex(frequency: number): 0 | 1 | 2 | -1 {
  if (frequency >= 40 && frequency < 180) {
    return 0;
  }
  if (frequency >= 180 && frequency < 2_000) {
    return 1;
  }
  if (frequency >= 2_000 && frequency <= 5_500) {
    return 2;
  }
  return -1;
}

async function spectralFluxEnvelope(
  samples: Float32Array,
  sampleRate: number,
  onProgress: (progress: BeatAnalysisProgress) => void,
  isCancelled: () => boolean,
  yieldControl: () => Promise<void>,
): Promise<Float64Array> {
  if (samples.length < FFT_SIZE) {
    throw new BeatAnalysisError("insufficient_audio");
  }
  const frameCount = 1 + Math.floor((samples.length - FFT_SIZE) / HOP_SIZE);
  const envelope = new Float64Array(frameCount);
  const real = new Float64Array(FFT_SIZE);
  const imaginary = new Float64Array(FFT_SIZE);
  const previous = new Float64Array(FFT_SIZE / 2 + 1);
  const bandBinCounts = [0, 0, 0];
  for (let bin = 0; bin <= FFT_SIZE / 2; bin += 1) {
    const band = bandIndex((bin * sampleRate) / FFT_SIZE);
    if (band >= 0) {
      bandBinCounts[band] = (bandBinCounts[band] ?? 0) + 1;
    }
  }

  let maximum = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * HOP_SIZE;
    for (let index = 0; index < FFT_SIZE; index += 1) {
      const window =
        0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1));
      real[index] = (samples[start + index] ?? 0) * window;
      imaginary[index] = 0;
    }
    fftInPlace(real, imaginary);

    const bandFlux = [0, 0, 0];
    for (let bin = 0; bin <= FFT_SIZE / 2; bin += 1) {
      const magnitude = Math.log1p(Math.hypot(real[bin]!, imaginary[bin]!));
      const difference = magnitude - previous[bin]!;
      previous[bin] = magnitude;
      const band = bandIndex((bin * sampleRate) / FFT_SIZE);
      if (difference > 0 && band >= 0) {
        bandFlux[band] = (bandFlux[band] ?? 0) + difference;
      }
    }
    const low = (bandFlux[0] ?? 0) / Math.max(1, bandBinCounts[0] ?? 0);
    const mid = (bandFlux[1] ?? 0) / Math.max(1, bandBinCounts[1] ?? 0);
    const high = (bandFlux[2] ?? 0) / Math.max(1, bandBinCounts[2] ?? 0);
    const combined = low * 1.35 + mid + high * 0.65;
    envelope[frame] = combined;
    maximum = Math.max(maximum, combined);

    if (frame > 0 && frame % 128 === 0) {
      assertActive(isCancelled);
      onProgress({
        stage: "onset_envelope",
        percent: Math.round(25 + (frame / frameCount) * 40),
      });
      await yieldControl();
    }
  }

  if (maximum <= Number.EPSILON) {
    throw new BeatAnalysisError("no_onsets");
  }
  for (let index = 0; index < envelope.length; index += 1) {
    envelope[index] = envelope[index]! / maximum;
  }
  return envelope;
}

function adaptivePeaks(
  envelope: Float64Array,
  sampleRate: number,
): readonly OnsetPeak[] {
  const thresholdRadius = 8;
  const localMaximumRadius = 2;
  const minimumGapFrames = Math.max(
    2,
    Math.round((0.09 * sampleRate) / HOP_SIZE),
  );
  const peaks: OnsetPeak[] = [];

  for (let index = thresholdRadius; index < envelope.length; index += 1) {
    const value = envelope[index]!;
    let localSum = 0;
    let localCount = 0;
    const from = Math.max(0, index - thresholdRadius);
    const to = Math.min(envelope.length - 1, index + thresholdRadius);
    for (let neighbor = from; neighbor <= to; neighbor += 1) {
      localSum += envelope[neighbor]!;
      localCount += 1;
    }
    const threshold = (localSum / localCount) * 1.3 + 0.025;
    if (value < threshold || value < 0.06) {
      continue;
    }
    let isMaximum = true;
    for (
      let neighbor = Math.max(0, index - localMaximumRadius);
      neighbor <= Math.min(envelope.length - 1, index + localMaximumRadius);
      neighbor += 1
    ) {
      if (neighbor !== index && envelope[neighbor]! > value) {
        isMaximum = false;
        break;
      }
    }
    if (!isMaximum) {
      continue;
    }

    const last = peaks.at(-1);
    const timeSeconds = (index * HOP_SIZE + FFT_SIZE / 2) / sampleRate;
    if (
      last &&
      timeSeconds - last.timeSeconds <
        (minimumGapFrames * HOP_SIZE) / sampleRate
    ) {
      if (value > last.strength) {
        peaks[peaks.length - 1] = { timeSeconds, strength: value };
      }
      continue;
    }
    peaks.push({ timeSeconds, strength: value });
  }
  return peaks;
}

function autocorrelationTempo(
  envelope: Float64Array,
  sampleRate: number,
): TempoEstimate {
  const secondsPerFrame = HOP_SIZE / sampleRate;
  const maximumLag = 60 / MIN_BPM / secondsPerFrame;
  if (envelope.length <= maximumLag + 2) {
    throw new BeatAnalysisError("no_tempo");
  }

  const tempoScores: Array<{ bpm: number; score: number }> = [];
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.5) {
    const lag = 60 / bpm / secondsPerFrame;
    let cross = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = Math.ceil(lag); index < envelope.length; index += 1) {
      const left = envelope[index]!;
      const rightPosition = index - lag;
      const before = Math.floor(rightPosition);
      const fraction = rightPosition - before;
      const right =
        envelope[before]! * (1 - fraction) +
        envelope[Math.min(envelope.length - 1, before + 1)]! * fraction;
      cross += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const normalized = cross / Math.sqrt(leftEnergy * rightEnergy + 1e-12);
    const metricalPrior = Math.exp(-0.5 * ((bpm - 120) / 70) ** 2);
    tempoScores.push({
      bpm,
      score: normalized * (0.65 + metricalPrior * 0.35),
    });
  }

  const rawCandidates: Array<{ bpm: number; score: number }> = [];
  for (let index = 0; index < tempoScores.length; index += 1) {
    const candidate = tempoScores[index]!;
    if (
      candidate.score < (tempoScores[index - 1]?.score ?? 0) ||
      candidate.score < (tempoScores[index + 1]?.score ?? 0)
    ) {
      continue;
    }
    rawCandidates.push(candidate);
  }
  rawCandidates.sort((left, right) => right.score - left.score);
  if (rawCandidates.length === 0 || rawCandidates[0]!.score <= 0) {
    throw new BeatAnalysisError("no_tempo");
  }

  const distinct: Array<{ bpm: number; score: number }> = [];
  for (const candidate of rawCandidates) {
    if (
      distinct.every((existing) => Math.abs(existing.bpm - candidate.bpm) >= 4)
    ) {
      distinct.push(candidate);
    }
    if (distinct.length === 5) {
      break;
    }
  }
  const maximum = distinct[0]!.score;
  const candidates = distinct.map((candidate) => ({
    bpm: Math.round(candidate.bpm * 100) / 100,
    score: Math.max(0, Math.min(1, candidate.score / maximum)),
  }));
  const secondScore = candidates[1]?.score ?? 0;
  return {
    selected: candidates[0]!,
    candidates,
    topMargin: Math.max(0, 1 - secondScore),
  };
}

function linearBeatFit(
  path: readonly OnsetPeak[],
  approximatePeriod: number,
): {
  readonly first: number;
  readonly period: number;
  readonly lastIndex: number;
} {
  const beatIndexes = [0];
  for (let index = 1; index < path.length; index += 1) {
    const elapsed = path[index]!.timeSeconds - path[index - 1]!.timeSeconds;
    const multiple = Math.max(1, Math.round(elapsed / approximatePeriod));
    beatIndexes.push(beatIndexes[index - 1]! + multiple);
  }

  const count = path.length;
  const meanIndex = beatIndexes.reduce((sum, value) => sum + value, 0) / count;
  const meanTime =
    path.reduce((sum, peak) => sum + peak.timeSeconds, 0) / count;
  let covariance = 0;
  let variance = 0;
  for (let index = 0; index < count; index += 1) {
    const centeredIndex = beatIndexes[index]! - meanIndex;
    covariance += centeredIndex * (path[index]!.timeSeconds - meanTime);
    variance += centeredIndex * centeredIndex;
  }
  const fittedPeriod = variance > 0 ? covariance / variance : approximatePeriod;
  const period =
    fittedPeriod >= approximatePeriod * 0.92 &&
    fittedPeriod <= approximatePeriod * 1.08
      ? fittedPeriod
      : approximatePeriod;
  return {
    first: meanTime - period * meanIndex,
    period,
    lastIndex: beatIndexes.at(-1)!,
  };
}

function trackBeats(
  peaks: readonly OnsetPeak[],
  tempoBpm: number,
  durationSeconds: number,
): { readonly beats: readonly BeatPoint[]; readonly regularity: number } {
  if (peaks.length < 2) {
    throw new BeatAnalysisError("no_beats");
  }
  const period = 60 / tempoBpm;
  const scores = peaks.map((peak) => peak.strength);
  const pathLengths = peaks.map(() => 1);
  const previous = peaks.map(() => -1);

  for (let index = 0; index < peaks.length; index += 1) {
    for (let candidate = 0; candidate < index; candidate += 1) {
      const elapsed = peaks[index]!.timeSeconds - peaks[candidate]!.timeSeconds;
      const multiple = Math.round(elapsed / period);
      if (multiple < 1 || multiple > 4) {
        continue;
      }
      const relativeError = Math.abs(elapsed - multiple * period) / period;
      if (relativeError > 0.28) {
        continue;
      }
      const transition = 1 - relativeError * 2.2 - (multiple - 1) * 0.16;
      const score = scores[candidate]! + peaks[index]!.strength + transition;
      if (score > scores[index]!) {
        scores[index] = score;
        previous[index] = candidate;
        pathLengths[index] = pathLengths[candidate]! + 1;
      }
    }
  }

  let bestIndex = 0;
  for (let index = 1; index < scores.length; index += 1) {
    if (
      scores[index]! > scores[bestIndex]! ||
      (scores[index] === scores[bestIndex] &&
        pathLengths[index]! > pathLengths[bestIndex]!)
    ) {
      bestIndex = index;
    }
  }
  const path: OnsetPeak[] = [];
  for (let index = bestIndex; index >= 0; index = previous[index]!) {
    path.push(peaks[index]!);
    if (previous[index] === -1) {
      break;
    }
  }
  path.reverse();
  if (path.length < 2) {
    throw new BeatAnalysisError("no_beats");
  }

  const fit = linearBeatFit(path, period);
  const beats: BeatPoint[] = [];
  let absoluteError = 0;
  for (let beatIndex = 0; beatIndex <= fit.lastIndex; beatIndex += 1) {
    const timeSeconds = fit.first + beatIndex * fit.period;
    if (timeSeconds < 0 || timeSeconds > durationSeconds) {
      continue;
    }
    let nearest: OnsetPeak | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const peak of peaks) {
      const distance = Math.abs(peak.timeSeconds - timeSeconds);
      if (distance < nearestDistance) {
        nearest = peak;
        nearestDistance = distance;
      }
    }
    absoluteError += Math.min(nearestDistance, fit.period) / fit.period;
    beats.push({
      timeSeconds: Math.round(timeSeconds * 1_000_000) / 1_000_000,
      strength:
        nearest && nearestDistance <= fit.period * 0.28
          ? Math.round(nearest.strength * 1_000_000) / 1_000_000
          : 0,
    });
  }
  if (beats.length < 2) {
    throw new BeatAnalysisError("no_beats");
  }
  return {
    beats,
    regularity: Math.max(0, 1 - absoluteError / beats.length),
  };
}

export async function analyzeBeatGrid(
  input: BeatAnalysisInput,
  {
    onProgress = noProgress,
    isCancelled = neverCancelled,
    yieldControl = resolvedYield,
  }: BeatAnalysisOptions = {},
): Promise<BeatGrid> {
  const length = validateInput(input);
  await reportStage("downmix", 5, onProgress, isCancelled, yieldControl);
  const mono = downmixChannels(input.channels, length);
  await reportStage("resample", 15, onProgress, isCancelled, yieldControl);
  const resampled = resampleLinear(
    mono,
    input.sampleRate,
    ANALYSIS_SAMPLE_RATE,
  );
  await reportStage(
    "onset_envelope",
    25,
    onProgress,
    isCancelled,
    yieldControl,
  );
  const envelope = await spectralFluxEnvelope(
    resampled,
    ANALYSIS_SAMPLE_RATE,
    onProgress,
    isCancelled,
    yieldControl,
  );
  const peaks = adaptivePeaks(envelope, ANALYSIS_SAMPLE_RATE);
  if (peaks.length < 2) {
    throw new BeatAnalysisError("no_onsets");
  }
  await reportStage("tempo", 72, onProgress, isCancelled, yieldControl);
  const tempo = autocorrelationTempo(envelope, ANALYSIS_SAMPLE_RATE);
  await reportStage("beat_tracking", 86, onProgress, isCancelled, yieldControl);
  const tracked = trackBeats(peaks, tempo.selected.bpm, input.durationSeconds);
  await reportStage("finalizing", 97, onProgress, isCancelled, yieldControl);

  const peakCoverage = Math.min(1, tracked.beats.length / peaks.length);
  const confidence = Math.max(
    0,
    Math.min(
      1,
      tracked.regularity * 0.55 + peakCoverage * 0.3 + tempo.topMargin * 0.15,
    ),
  );
  return beatGridSchema.parse({
    schemaVersion,
    kind: "beat_grid",
    analyzerVersion: baselineAnalyzerVersion,
    durationSeconds: input.durationSeconds,
    analysisSampleRate: ANALYSIS_SAMPLE_RATE,
    tempoBpm: Math.round(tempo.selected.bpm * 100) / 100,
    confidence: Math.round(confidence * 1_000_000) / 1_000_000,
    tempoCandidates: tempo.candidates,
    beats: tracked.beats,
  });
}
