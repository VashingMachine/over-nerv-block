import { LocalAudioError, validateDecodedDuration } from "./filePolicy";

export interface LocalAudioProgress {
  readonly stage: "reading" | "decoding";
  readonly percent: number;
}

export interface DisposableDecodedAudio {
  readonly durationSeconds: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  getAudioBuffer(): AudioBuffer | null;
  release(): void;
}

export interface DecodeLocalAudioOptions {
  readonly signal: AbortSignal;
  readonly onProgress: (progress: LocalAudioProgress) => void;
  readonly createAudioContext?: () => AudioContext;
}

function cancellationError(): DOMException {
  return new DOMException(
    "Local audio preparation was cancelled",
    "AbortError",
  );
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw cancellationError();
  }
}

async function readFileBytes(
  file: File,
  signal: AbortSignal,
  onProgress: DecodeLocalAudioOptions["onProgress"],
): Promise<ArrayBuffer> {
  assertActive(signal);
  if (typeof file.stream !== "function") {
    const bytes = await file.arrayBuffer();
    assertActive(signal);
    onProgress({ stage: "reading", percent: 65 });
    return bytes;
  }

  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  const cancelReader = () => {
    void reader.cancel(cancellationError()).catch(() => undefined);
  };
  signal.addEventListener("abort", cancelReader, { once: true });
  try {
    while (true) {
      assertActive(signal);
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      bytesRead += value.byteLength;
      onProgress({
        stage: "reading",
        percent: Math.min(65, 5 + (bytesRead / file.size) * 60),
      });
    }
    assertActive(signal);
  } finally {
    signal.removeEventListener("abort", cancelReader);
    reader.releaseLock();
  }

  const joined = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined.buffer;
}

function disposableAudio(buffer: AudioBuffer): DisposableDecodedAudio {
  let retainedBuffer: AudioBuffer | null = buffer;
  let released = false;
  return {
    durationSeconds: buffer.duration,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
    getAudioBuffer: () => retainedBuffer,
    release: () => {
      if (!released) {
        retainedBuffer = null;
        released = true;
      }
    },
  };
}

export async function decodeLocalAudio(
  file: File,
  {
    signal,
    onProgress,
    createAudioContext = () => new AudioContext(),
  }: DecodeLocalAudioOptions,
): Promise<DisposableDecodedAudio> {
  let context: AudioContext | null = null;
  let closePromise: Promise<void> | null = null;
  let cancelDecode: (() => void) | null = null;

  const closeContextOnce = (): Promise<void> => {
    if (!context) {
      return Promise.resolve();
    }
    if (!closePromise) {
      try {
        closePromise = context.close().catch(() => undefined);
      } catch {
        closePromise = Promise.resolve();
      }
    }
    return closePromise;
  };

  try {
    const bytes = await readFileBytes(file, signal, onProgress);
    assertActive(signal);
    onProgress({ stage: "decoding", percent: 75 });
    context = createAudioContext();
    const cancellation = new Promise<never>((_resolve, reject) => {
      cancelDecode = () => {
        void closeContextOnce();
        reject(cancellationError());
      };
      signal.addEventListener("abort", cancelDecode, { once: true });
    });
    assertActive(signal);
    const buffer = await Promise.race([
      context.decodeAudioData(bytes),
      cancellation,
    ]);
    assertActive(signal);
    validateDecodedDuration(buffer.duration);
    onProgress({ stage: "decoding", percent: 100 });
    return disposableAudio(buffer);
  } catch (error) {
    if (
      error instanceof LocalAudioError ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw error;
    }
    throw new LocalAudioError("decode_failed");
  } finally {
    if (cancelDecode) {
      signal.removeEventListener("abort", cancelDecode);
    }
    await closeContextOnce();
  }
}
