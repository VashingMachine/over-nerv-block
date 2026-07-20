export const MAX_LOCAL_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_LOCAL_AUDIO_DURATION_SECONDS = 10 * 60;

const supportedExtensions = new Set([
  "wav",
  "mp3",
  "m4a",
  "aac",
  "ogg",
  "opus",
  "flac",
  "webm",
]);

export type LocalAudioErrorCode =
  | "empty"
  | "too_large"
  | "unsupported"
  | "decode_failed"
  | "too_long"
  | "invalid_duration";

const errorMessages: Record<LocalAudioErrorCode, string> = {
  empty: "This file is empty. Choose an audio file with content.",
  too_large: "This file is larger than 25 MB. Choose a smaller audio file.",
  unsupported:
    "Choose a WAV, MP3, M4A, AAC, OGG, Opus, FLAC, or WebM audio file.",
  decode_failed:
    "This audio could not be decoded by this browser. Choose another file.",
  too_long: "This audio is longer than 10 minutes. Choose a shorter track.",
  invalid_duration:
    "This audio has no playable duration. Choose another audio file.",
};

export class LocalAudioError extends Error {
  constructor(readonly code: LocalAudioErrorCode) {
    super(errorMessages[code]);
    this.name = "LocalAudioError";
  }
}

export interface ValidatedLocalAudioFile {
  readonly bytes: number;
  readonly format: string;
  readonly mimeType: string;
}

export function validateLocalAudioFile(file: File): ValidatedLocalAudioFile {
  if (file.size === 0) {
    throw new LocalAudioError("empty");
  }
  if (file.size > MAX_LOCAL_AUDIO_BYTES) {
    throw new LocalAudioError("too_large");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = file.type.trim().toLowerCase();
  const audioMime =
    mimeType === "" ||
    mimeType.startsWith("audio/") ||
    mimeType === "application/ogg" ||
    mimeType === "video/webm";
  if (!supportedExtensions.has(extension) || !audioMime) {
    throw new LocalAudioError("unsupported");
  }

  return {
    bytes: file.size,
    format: extension.toUpperCase(),
    mimeType: mimeType || "audio/unknown",
  };
}

export function validateDecodedDuration(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new LocalAudioError("invalid_duration");
  }
  if (durationSeconds > MAX_LOCAL_AUDIO_DURATION_SECONDS) {
    throw new LocalAudioError("too_long");
  }
  return durationSeconds;
}
