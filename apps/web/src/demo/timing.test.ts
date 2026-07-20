import { describe, expect, it } from "vitest";

import {
  APPROACH_PIXELS_PER_SECOND,
  noteYForSongTime,
  TARGET_Y,
} from "./timing";

describe("audio-clock note positioning", () => {
  it("places a note on the target at its chart time", () => {
    expect(noteYForSongTime(2, 2)).toBe(TARGET_Y);
  });

  it("moves by elapsed song time rather than rendered frame count", () => {
    expect(noteYForSongTime(2, 1)).toBe(TARGET_Y - APPROACH_PIXELS_PER_SECOND);
    expect(noteYForSongTime(2, 1.5)).toBe(
      TARGET_Y - APPROACH_PIXELS_PER_SECOND / 2,
    );
  });
});
