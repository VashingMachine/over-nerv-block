import { describe, expect, it, vi } from "vitest";

import {
  decodedAnalysisFitsBudget,
  maximumDecodedAnalysisChannelSamples,
  maximumPreparedAnalysisSamples,
  prepareAnalysisInput,
} from "./prepareAnalysisInput";

function audioBuffer(
  channels: readonly Float32Array[],
  sampleRate: number,
  declaredLength = channels[0]!.length,
): AudioBuffer {
  return {
    length: declaredLength,
    duration: declaredLength / sampleRate,
    numberOfChannels: channels.length,
    sampleRate,
    copyFromChannel: (destination: Float32Array, channel: number) =>
      destination.set(channels[channel]!),
    getChannelData: (channel: number) => channels[channel]!,
  } as unknown as AudioBuffer;
}

describe("analysis input preparation", () => {
  it("keeps the direct-transfer ceiling exact", () => {
    expect(
      decodedAnalysisFitsBudget({
        length: maximumDecodedAnalysisChannelSamples / 2,
        numberOfChannels: 2,
      }),
    ).toBe(true);
    expect(
      decodedAnalysisFitsBudget({
        length: maximumDecodedAnalysisChannelSamples / 2 + 1,
        numberOfChannels: 2,
      }),
    ).toBe(false);
  });

  it("copies ordinary tracks without changing channels or sample rate", async () => {
    const left = new Float32Array([0, 0.5, 1]);
    const right = new Float32Array([1, 0.5, 0]);
    const result = await prepareAnalysisInput(
      audioBuffer([left, right], 48_000),
      {
        signal: new AbortController().signal,
      },
    );

    expect(result.sampleRate).toBe(48_000);
    expect(result.channels).toHaveLength(2);
    expect(Array.from(result.channels[0]!)).toEqual(Array.from(left));
    expect(result.channels[0]).not.toBe(left);
  });

  it("downmixes and resamples an oversized stereo track in one deterministic pass", async () => {
    const left = new Float32Array([0, 1, 0, -1, 0]);
    const right = new Float32Array([0, 0, 1, 0, -1]);
    const yields = vi.fn().mockResolvedValue(undefined);
    const result = await prepareAnalysisInput(
      audioBuffer([left, right], 22_050),
      {
        signal: new AbortController().signal,
        chunkSamples: 2,
        yieldControl: yields,
        directTransferMaximumSamples: 4,
      },
    );
    expect(result.sampleRate).toBe(11_025);
    expect(result.channels).toHaveLength(1);
    expect(Array.from(result.channels[0]!)).toEqual([0, 0.5, -0.5]);
    expect(yields).toHaveBeenCalled();
  });

  it("yields between chunks and cancels before allocating worker input", async () => {
    const controller = new AbortController();
    const yieldControl = vi.fn(async () => controller.abort());
    const source = new Float32Array([0, 1, 0, -1, 0]);

    await expect(
      prepareAnalysisInput(audioBuffer([source, source], 22_050), {
        signal: controller.signal,
        chunkSamples: 2,
        yieldControl,
        directTransferMaximumSamples: 4,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(yieldControl).toHaveBeenCalledOnce();
  });

  it("rejects a prepared representation beyond the ten-minute analyzer budget", async () => {
    const sourceLength = maximumDecodedAnalysisChannelSamples / 2 + 1;
    const tinySource = new Float32Array(2);
    const oversized = audioBuffer([tinySource, tinySource], 1, sourceLength);
    await expect(
      prepareAnalysisInput(oversized, {
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "analysis_too_large" });
    expect(maximumPreparedAnalysisSamples).toBe(6_700_000);
  });
});
