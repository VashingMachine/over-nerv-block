import { describe, expect, it, vi } from "vitest";

import type { LocalAudioError } from "./filePolicy";
import { decodeLocalAudio } from "./localAudioDecoder";

function audioBuffer(duration = 8): AudioBuffer {
  return {
    duration,
    numberOfChannels: 2,
    sampleRate: 48_000,
  } as AudioBuffer;
}

function contextFor(result: AudioBuffer | Error) {
  return {
    decodeAudioData: vi.fn(async () => {
      if (result instanceof Error) {
        throw result;
      }
      return result;
    }),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioContext;
}

describe("isolated local-audio decoder", () => {
  it("reports local progress and returns a disposable sample handle", async () => {
    const context = contextFor(audioBuffer());
    const onProgress = vi.fn();
    const decoded = await decodeLocalAudio(
      new File([new Uint8Array([1, 2, 3])], "private.wav"),
      {
        signal: new AbortController().signal,
        onProgress,
        createAudioContext: () => context,
      },
    );

    expect(onProgress).toHaveBeenCalledWith({
      stage: "decoding",
      percent: 100,
    });
    expect(decoded.getAudioBuffer()).not.toBeNull();
    decoded.release();
    decoded.release();
    expect(decoded.getAudioBuffer()).toBeNull();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("closes the context and hides decoder details after corrupt input", async () => {
    const context = contextFor(new Error("private-track.wav codec internals"));
    await expect(
      decodeLocalAudio(new File(["broken"], "private-track.wav"), {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        createAudioContext: () => context,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<LocalAudioError>>({
        code: "decode_failed",
        message:
          "This audio could not be decoded by this browser. Choose another file.",
      }),
    );
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("rejects excessive decoded duration and closes its context", async () => {
    const context = contextFor(audioBuffer(601));
    await expect(
      decodeLocalAudio(new File(["audio"], "private.wav"), {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        createAudioContext: () => context,
      }),
    ).rejects.toMatchObject({ code: "too_long" });
    expect(context.close).toHaveBeenCalledOnce();
  });

  it("honors cancellation before acquiring a decode context", async () => {
    const controller = new AbortController();
    controller.abort();
    const createAudioContext = vi.fn();
    await expect(
      decodeLocalAudio(new File(["audio"], "private.wav"), {
        signal: controller.signal,
        onProgress: vi.fn(),
        createAudioContext,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(createAudioContext).not.toHaveBeenCalled();
  });

  it("closes an acquired context immediately when cancellation wins during decode", async () => {
    let resolveDecode: ((buffer: AudioBuffer) => void) | undefined;
    const context = {
      decodeAudioData: vi.fn(
        () =>
          new Promise<AudioBuffer>((resolve) => {
            resolveDecode = resolve;
          }),
      ),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as AudioContext;
    const controller = new AbortController();
    const preparing = decodeLocalAudio(
      new File([new Uint8Array([1, 2, 3])], "private.wav"),
      {
        signal: controller.signal,
        onProgress: vi.fn(),
        createAudioContext: () => context,
      },
    );

    await vi.waitFor(() =>
      expect(context.decodeAudioData).toHaveBeenCalledOnce(),
    );
    controller.abort();

    await vi.waitFor(() => expect(context.close).toHaveBeenCalledOnce());
    await expect(preparing).rejects.toMatchObject({ name: "AbortError" });
    expect(context.close).toHaveBeenCalledOnce();

    resolveDecode?.(audioBuffer());
    expect(context.close).toHaveBeenCalledOnce();
  });
});
