import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AudioEngine } from "./audioEngine";
import { DemoGame } from "./DemoGame";

vi.mock("./RhythmGameCanvas", () => ({
  RhythmGameCanvas: () => <div data-testid="mock-rhythm-canvas" />,
}));

vi.mock("./phaserRuntime", () => ({
  loadPhaser: vi.fn().mockResolvedValue({}),
}));

function mockEngine(start: AudioEngine["start"]): AudioEngine {
  return {
    status: "idle",
    start,
    songTimeSeconds: () => -1,
    dispose: vi.fn(),
  };
}

describe("bundled demo lifecycle", () => {
  it("presents the track, its controls, and provenance before play", () => {
    render(<DemoGame />);

    expect(
      screen.getByRole("heading", { name: "Circuit Pulse" }),
    ).toBeVisible();
    expect(screen.getByText("8 seconds")).toBeVisible();
    expect(screen.getByText("Space, canvas, or Hit")).toBeVisible();
    expect(screen.getByText("CC0-1.0")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start demo" })).toBeEnabled();
  });

  it("moves from countdown to completion and offers replay", async () => {
    let endTrack = () => undefined;
    const engine = mockEngine(
      vi.fn(async ({ onEnded }) => {
        endTrack = onEnded;
      }),
    );

    render(<DemoGame createAudioEngine={() => engine} />);
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));

    expect(await screen.findByText("Get ready")).toBeVisible();
    await waitFor(() => {
      fireEvent.keyDown(window, { code: "Space" });
      expect(screen.getByText("Input 1 received")).toBeVisible();
    });

    endTrack();

    expect(await screen.findByText("Track complete")).toBeVisible();
    expect(screen.getByRole("button", { name: "Play again" })).toBeEnabled();
  });

  it("explains an audio failure and retries with a fresh engine", async () => {
    const failedEngine = mockEngine(
      vi
        .fn()
        .mockRejectedValue(new Error("Demo audio could not be loaded (503)")),
    );
    const recoveredEngine = mockEngine(vi.fn().mockResolvedValue(undefined));
    const createAudioEngine = vi
      .fn()
      .mockReturnValueOnce(failedEngine)
      .mockReturnValueOnce(recoveredEngine);

    render(<DemoGame createAudioEngine={createAudioEngine} />);
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Demo audio could not be loaded (503)",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry demo" }));

    await waitFor(() => expect(recoveredEngine.start).toHaveBeenCalledOnce());
    expect(await screen.findByText("Get ready")).toBeVisible();
    expect(createAudioEngine).toHaveBeenCalledTimes(2);
  });
});
