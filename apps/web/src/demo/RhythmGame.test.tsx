import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rhythmChartSchema, schemaVersion } from "@rhythm-game/chart-schema";

import type { AudioEngine } from "./audioEngine";
import { RhythmGame, type RhythmGameExperience } from "./DemoGame";
import { resultStorageKeys } from "./resultStore";

vi.mock("./RhythmGameCanvas", () => ({
  RhythmGameCanvas: () => <div data-testid="mock-rhythm-canvas" />,
}));

vi.mock("./phaserRuntime", () => ({
  loadPhaser: vi.fn().mockResolvedValue({}),
}));

function experience(
  overrides: Partial<RhythmGameExperience> = {},
): RhythmGameExperience {
  const base: RhythmGameExperience = {
    songId: "generated-owned-easy",
    title: "Your local song · Easy",
    artist: "Generated privately",
    durationSeconds: 3,
    bpm: 120,
    audioUrl: "blob:owned-fixture",
    chart: rhythmChartSchema.parse({
      schemaVersion,
      id: "generated-owned-easy",
      title: "Generated Easy chart",
      durationSeconds: 3,
      notes: [1, 2].map((timeSeconds) => ({
        timeSeconds,
        lane: 0,
        source: "beat",
      })),
    }),
    sectionLabel: "Easy generated chart · one lane",
    startLabel: "Start Easy chart",
  };
  return { ...base, ...overrides };
}

describe("generated rhythm-game experience", () => {
  beforeEach(() => localStorage.clear());

  it("plays the supplied local URL and chart without persisting the result", async () => {
    let endTrack: () => void = () => undefined;
    const start = vi.fn(
      async ({ onEnded }: Parameters<AudioEngine["start"]>[0]) => {
        endTrack = onEnded;
      },
    );
    const engine: AudioEngine = {
      status: "idle",
      start,
      pause: vi.fn().mockResolvedValue(true),
      resume: vi.fn().mockResolvedValue(true),
      songTimeForEvent: () => 1,
      songTimeSeconds: () => 1,
      dispose: vi.fn(),
    };

    render(
      <RhythmGame
        experience={experience()}
        createAudioEngine={() => engine}
        now={() => "2026-07-21T02:00:00.000Z"}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start Easy chart" }));
    await waitFor(() => expect(start).toHaveBeenCalledOnce());
    expect(start.mock.calls[0]![0]).toMatchObject({
      audioUrl: "blob:owned-fixture",
      countdownSeconds: 1.5,
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled(),
    );
    fireEvent.keyDown(window, { code: "Space" });
    expect(await screen.findByText("Perfect +0 ms")).toBeVisible();

    act(() => endTrack());
    expect(await screen.findByLabelText("Track results")).toHaveTextContent(
      "Miss1",
    );
    expect(localStorage.getItem(resultStorageKeys.latestResult)).toBeNull();
  });

  it("disposes local playback when the generated experience unmounts", async () => {
    const engine: AudioEngine = {
      status: "idle",
      start: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(true),
      resume: vi.fn().mockResolvedValue(true),
      songTimeForEvent: () => 0,
      songTimeSeconds: () => 0,
      dispose: vi.fn(),
    };
    const view = render(
      <RhythmGame experience={experience()} createAudioEngine={() => engine} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start Easy chart" }));
    await waitFor(() => expect(engine.start).toHaveBeenCalledOnce());

    view.unmount();
    expect(engine.dispose).toHaveBeenCalledOnce();
  });

  it("prevents Space only while active gameplay consumes it", async () => {
    const engine: AudioEngine = {
      status: "idle",
      start: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(true),
      resume: vi.fn().mockResolvedValue(true),
      songTimeForEvent: () => 1,
      songTimeSeconds: () => 1,
      dispose: vi.fn(),
    };
    const view = render(
      <RhythmGame experience={experience()} createAudioEngine={() => engine} />,
    );

    expect(fireEvent.keyDown(window, { code: "Space" })).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Start Easy chart" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled(),
    );
    expect(fireEvent.keyDown(window, { code: "Space" })).toBe(false);

    view.unmount();
    expect(fireEvent.keyDown(window, { code: "Space" })).toBe(true);
  });

  it("stops the previous game so only the active owner consumes Space", async () => {
    const firstEngine: AudioEngine = {
      status: "idle",
      start: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn().mockResolvedValue(true),
      resume: vi.fn().mockResolvedValue(true),
      songTimeForEvent: () => 1,
      songTimeSeconds: () => 1,
      dispose: vi.fn(),
    };
    const secondEngine: AudioEngine = {
      ...firstEngine,
      start: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    };
    const secondChart = {
      ...experience().chart,
      id: "generated-owned-second",
    };
    render(
      <>
        <RhythmGame
          experience={experience({
            title: "First generated track",
            startLabel: "Start first chart",
          })}
          createAudioEngine={() => firstEngine}
        />
        <RhythmGame
          experience={experience({
            songId: "generated-owned-second",
            title: "Second generated track",
            chart: secondChart,
            startLabel: "Start second chart",
          })}
          createAudioEngine={() => secondEngine}
        />
      </>,
    );
    const first = screen.getByRole("region", {
      name: "First generated track",
    });
    const second = screen.getByRole("region", {
      name: "Second generated track",
    });

    fireEvent.click(
      within(first).getByRole("button", { name: "Start first chart" }),
    );
    await waitFor(() =>
      expect(
        within(first).getByRole("button", { name: "Pause" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      within(second).getByRole("button", { name: "Start second chart" }),
    );

    await waitFor(() => expect(firstEngine.dispose).toHaveBeenCalledOnce());
    expect(within(first).queryByTestId("scoreboard")).toBeNull();
    expect(within(first).getByRole("alert")).toHaveTextContent(
      "Playback stopped because another track started.",
    );
    await waitFor(() =>
      expect(
        within(second).getByRole("button", { name: "Pause" }),
      ).toBeEnabled(),
    );
    fireEvent.keyDown(window, { code: "Space" });
    expect(within(second).getByTestId("scoreboard")).toHaveTextContent(
      "Score 1,000",
    );
    expect(within(first).queryByTestId("scoreboard")).toBeNull();
  });
});
