import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { demoChart, demoSong } from "./demoContent";

describe("bundled demo contract", () => {
  it("keeps WAV duration, metadata, tempo grid, and chart bounds aligned", async () => {
    const audioPath = path.resolve(process.cwd(), "public", demoSong.audioPath);
    const wav = await readFile(audioPath);

    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    const byteRate = wav.readUInt32LE(28);
    const dataBytes = wav.readUInt32LE(40);
    const wavDurationSeconds = dataBytes / byteRate;
    expect(wavDurationSeconds).toBeCloseTo(demoSong.durationSeconds, 4);
    expect(demoChart.durationSeconds).toBe(demoSong.durationSeconds);

    const noteTimes = demoChart.notes.map((note) => note.timeSeconds);
    expect(noteTimes).toEqual(
      [...noteTimes].sort((left, right) => left - right),
    );
    expect(noteTimes.every((time) => time <= demoSong.durationSeconds)).toBe(
      true,
    );
    expect(
      noteTimes.every((time) => Number.isInteger(time / (60 / demoSong.bpm))),
    ).toBe(true);
  });
});
