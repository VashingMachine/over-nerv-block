import { describe, expect, it } from "vitest";

import {
  LocalAudioError,
  MAX_LOCAL_AUDIO_BYTES,
  validateDecodedDuration,
  validateLocalAudioFile,
} from "./filePolicy";

function fileOf(bytes: number, name = "private-track.wav", type = "audio/wav") {
  return { name, type, size: bytes } as File;
}

describe("private local-audio policy", () => {
  it.each([
    ["WAV", "wav", "audio/wav"],
    ["MP3", "mp3", "audio/mpeg"],
    ["M4A", "m4a", "audio/mp4"],
    ["AAC", "aac", "audio/aac"],
    ["OGG", "ogg", "application/ogg"],
    ["OPUS", "opus", "audio/opus"],
    ["FLAC", "flac", "audio/flac"],
    ["WEBM", "webm", "video/webm"],
  ])("accepts %s without retaining its filename", (format, extension, type) => {
    expect(
      validateLocalAudioFile(fileOf(8, `private-track.${extension}`, type)),
    ).toEqual({
      bytes: 8,
      format,
      mimeType: type,
    });
  });

  it("accepts the exact size boundary", () => {
    expect(validateLocalAudioFile(fileOf(MAX_LOCAL_AUDIO_BYTES)).bytes).toBe(
      MAX_LOCAL_AUDIO_BYTES,
    );
  });

  it.each([
    ["empty", fileOf(0), "empty"],
    ["oversized", fileOf(MAX_LOCAL_AUDIO_BYTES + 1), "too_large"],
    [
      "unsupported extension",
      fileOf(8, "private.txt", "audio/wav"),
      "unsupported",
    ],
    [
      "non-audio payload",
      fileOf(8, "private.wav", "application/zip"),
      "unsupported",
    ],
  ])("rejects %s input before decode", (_case, file, code) => {
    try {
      validateLocalAudioFile(file);
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(LocalAudioError);
      expect((error as LocalAudioError).code).toBe(code);
      expect((error as Error).message).not.toContain(file.name);
    }
  });

  it.each([
    [0, "invalid_duration"],
    [Number.NaN, "invalid_duration"],
    [600.001, "too_long"],
  ])("rejects decoded duration %s", (duration, code) => {
    expect(() => validateDecodedDuration(duration)).toThrowError(
      expect.objectContaining({ code }),
    );
  });
});
