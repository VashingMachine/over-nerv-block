import { ANALYSIS_SAMPLE_RATE } from "./beatAnalyzer";

export const maximumDecodedAnalysisChannelSamples = 24_000_000;
export const maximumPreparedAnalysisSamples = 6_700_000;
export const defaultPreparationChunkSamples = 65_536;

export interface PreparedAnalysisInput {
  readonly channels: readonly Float32Array[];
  readonly sampleRate: number;
}

export interface PrepareAnalysisInputOptions {
  readonly signal: AbortSignal;
  readonly yieldControl?: () => Promise<void>;
  readonly chunkSamples?: number;
  /** Test seam; production always uses the exported safety ceiling. */
  readonly directTransferMaximumSamples?: number;
}

export type AnalysisPreparationErrorCode =
  "missing_samples" | "analysis_too_large";

export class AnalysisPreparationError extends Error {
  constructor(readonly code: AnalysisPreparationErrorCode) {
    super(code);
    this.name = "AnalysisPreparationError";
  }
}

function cancellationError(): DOMException {
  return new DOMException("Beat analysis was cancelled", "AbortError");
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw cancellationError();
  }
}

const yieldToBrowser = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export function decodedAnalysisFitsBudget(
  buffer: Pick<AudioBuffer, "length" | "numberOfChannels">,
  maximumSamples = maximumDecodedAnalysisChannelSamples,
): boolean {
  const channelSamples = buffer.length * buffer.numberOfChannels;
  return (
    Number.isSafeInteger(channelSamples) &&
    channelSamples > 0 &&
    channelSamples <= maximumSamples
  );
}

export function copyDirectAnalysisInput(
  buffer: AudioBuffer,
): PreparedAnalysisInput {
  const channels: Float32Array[] = [];
  for (
    let channelIndex = 0;
    channelIndex < buffer.numberOfChannels;
    channelIndex += 1
  ) {
    const channel = new Float32Array(buffer.length);
    buffer.copyFromChannel(channel, channelIndex);
    channels.push(channel);
  }
  return { channels, sampleRate: buffer.sampleRate };
}

function preparedLength(buffer: AudioBuffer): number {
  if (
    !Number.isSafeInteger(buffer.length) ||
    buffer.length < 2 ||
    !Number.isSafeInteger(buffer.numberOfChannels) ||
    buffer.numberOfChannels < 1 ||
    !Number.isFinite(buffer.sampleRate) ||
    buffer.sampleRate <= 0
  ) {
    throw new AnalysisPreparationError("missing_samples");
  }
  return Math.max(
    2,
    Math.round((buffer.length * ANALYSIS_SAMPLE_RATE) / buffer.sampleRate),
  );
}

/**
 * Keeps ordinary tracks unchanged. Tracks above the direct transfer ceiling
 * are downmixed and linearly resampled in one bounded pass, matching the
 * analyzer's downmix-then-resample math without allocating full channel copies.
 */
export async function prepareAnalysisInput(
  buffer: AudioBuffer,
  {
    signal,
    yieldControl = yieldToBrowser,
    chunkSamples = defaultPreparationChunkSamples,
    directTransferMaximumSamples = maximumDecodedAnalysisChannelSamples,
  }: PrepareAnalysisInputOptions,
): Promise<PreparedAnalysisInput> {
  assertActive(signal);
  if (decodedAnalysisFitsBudget(buffer, directTransferMaximumSamples)) {
    try {
      return copyDirectAnalysisInput(buffer);
    } catch {
      throw new AnalysisPreparationError("missing_samples");
    }
  }

  const outputLength = preparedLength(buffer);
  if (
    outputLength > maximumPreparedAnalysisSamples ||
    !Number.isSafeInteger(chunkSamples) ||
    chunkSamples < 1
  ) {
    throw new AnalysisPreparationError("analysis_too_large");
  }

  let sources: Float32Array[];
  try {
    sources = Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
      buffer.getChannelData(channel),
    );
  } catch {
    throw new AnalysisPreparationError("missing_samples");
  }
  if (sources.some((channel) => channel.length < buffer.length)) {
    throw new AnalysisPreparationError("missing_samples");
  }

  const mono = new Float32Array(outputLength);
  const sourceScale = (buffer.length - 1) / (outputLength - 1);
  for (
    let chunkStart = 0;
    chunkStart < outputLength;
    chunkStart += chunkSamples
  ) {
    assertActive(signal);
    const chunkEnd = Math.min(outputLength, chunkStart + chunkSamples);
    for (let index = chunkStart; index < chunkEnd; index += 1) {
      const sourcePosition = index * sourceScale;
      const before = Math.floor(sourcePosition);
      const after = Math.min(buffer.length - 1, before + 1);
      const fraction = sourcePosition - before;
      let sum = 0;
      for (const source of sources) {
        const beforeSample = source[before] ?? 0;
        const afterSample = source[after] ?? 0;
        sum +=
          (Number.isFinite(beforeSample) ? beforeSample : 0) * (1 - fraction) +
          (Number.isFinite(afterSample) ? afterSample : 0) * fraction;
      }
      mono[index] = sum / sources.length;
    }
    if (chunkEnd < outputLength) {
      await yieldControl();
    }
  }
  assertActive(signal);
  return { channels: [mono], sampleRate: ANALYSIS_SAMPLE_RATE };
}
