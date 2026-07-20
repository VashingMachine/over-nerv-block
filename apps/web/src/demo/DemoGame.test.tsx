import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AudioEngine } from "./audioEngine";
import { DemoGame } from "./DemoGame";
import { resultStorageKeys } from "./resultStore";

vi.mock("./RhythmGameCanvas", () => ({
  RhythmGameCanvas: () => <div data-testid="mock-rhythm-canvas" />,
}));

vi.mock("./phaserRuntime", () => ({
  loadPhaser: vi.fn().mockResolvedValue({}),
}));

function mockEngine(
  start: AudioEngine["start"],
  songTimeSeconds = () => -1,
): AudioEngine {
  return {
    status: "idle",
    start,
    pause: vi.fn().mockResolvedValue(true),
    resume: vi.fn().mockResolvedValue(true),
    songTimeForEvent: songTimeSeconds,
    songTimeSeconds,
    dispose: vi.fn(),
  };
}

describe("bundled demo lifecycle", () => {
  beforeEach(() => localStorage.clear());

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

  it("scores from the audio clock, derives results, and offers replay", async () => {
    let endTrack = () => undefined;
    const engine = mockEngine(
      vi.fn(async ({ onEnded }) => {
        endTrack = onEnded;
      }),
      () => 1,
    );

    render(
      <DemoGame
        createAudioEngine={() => engine}
        now={() => "2026-07-20T20:00:00.000Z"}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));

    expect(await screen.findByText("Get ready")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled(),
    );
    fireEvent.keyDown(window, { code: "Space", repeat: true });
    expect(screen.getByLabelText("Current score")).toHaveTextContent("Score 0");
    fireEvent.keyDown(window, { code: "Space" });
    expect(await screen.findByText("Perfect +0 ms")).toBeVisible();
    expect(screen.getByLabelText("Current score")).toHaveTextContent("1,000");

    act(() => endTrack());

    expect(await screen.findByText("Track complete")).toBeVisible();
    expect(screen.getByLabelText("Track results")).toHaveTextContent("12");
    expect(screen.getByRole("button", { name: "Play again" })).toBeEnabled();
  });

  it("announces the current hit when the same input also collects old misses", async () => {
    const engine = mockEngine(vi.fn().mockResolvedValue(undefined), () => 0);
    engine.songTimeForEvent = () => 2;
    render(<DemoGame createAudioEngine={() => engine} />);
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled(),
    );

    fireEvent.keyDown(window, { code: "Space" });

    expect(await screen.findByText("Perfect +0 ms")).toBeVisible();
    expect(screen.getByLabelText("Current score")).toHaveTextContent("1,000");
    expect(screen.getByLabelText("Current score")).toHaveTextContent("Miss 2");
  });

  it("announces an unattended note when it expires as a miss", async () => {
    let songTime = 0;
    const engine = mockEngine(
      vi.fn().mockResolvedValue(undefined),
      () => songTime,
    );
    render(<DemoGame createAudioEngine={() => engine} />);
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled(),
    );

    songTime = 1.121;

    await waitFor(() =>
      expect(screen.getByTestId("input-feedback")).toHaveTextContent("Miss"),
    );
    expect(screen.getByLabelText("Current score")).toHaveTextContent("Miss 1");
  });

  it("persists a bounded calibration offset across remounts", () => {
    const first = render(<DemoGame />);
    fireEvent.click(screen.getByRole("button", { name: "Calibrate device" }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "Save calibration" }));
    expect(screen.getByText("+80 ms")).toBeVisible();

    first.unmount();
    render(<DemoGame />);
    expect(screen.getByText("+80 ms")).toBeVisible();
  });

  it("safely completes after rejecting fractional stored calibration", async () => {
    localStorage.setItem(resultStorageKeys.calibration, "42.4");
    let endTrack = () => undefined;
    const engine = mockEngine(
      vi.fn(async ({ onEnded }) => {
        endTrack = onEnded;
      }),
      () => 1,
    );
    render(<DemoGame createAudioEngine={() => engine} />);
    expect(screen.getByText("+0 ms", { exact: true })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled(),
    );

    act(() => endTrack());

    expect(await screen.findByText("Track complete")).toBeVisible();
  });

  it("pauses, resumes, and restarts with a fresh zero-score session", async () => {
    const engine = mockEngine(vi.fn().mockResolvedValue(undefined), () => 1);
    render(<DemoGame createAudioEngine={() => engine} />);
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(await screen.findByText("Paused")).toBeVisible();
    expect(engine.pause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(engine.resume).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    await waitFor(() => expect(engine.start).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Current score")).toHaveTextContent("Score 0");
  });

  it("ignores a stale pause completion after restart", async () => {
    let resolvePause: (paused: boolean) => void = () => {};
    const firstEngine = mockEngine(
      vi.fn().mockResolvedValue(undefined),
      () => 1,
    );
    vi.mocked(firstEngine.pause).mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolvePause = resolve;
        }),
    );
    const secondEngine = mockEngine(vi.fn().mockResolvedValue(undefined));
    const createAudioEngine = vi
      .fn()
      .mockReturnValueOnce(firstEngine)
      .mockReturnValueOnce(secondEngine);
    render(<DemoGame createAudioEngine={createAudioEngine} />);
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(await screen.findByText("Get ready")).toBeVisible();
    await act(async () => resolvePause(true));

    await waitFor(() => expect(firstEngine.pause).toHaveBeenCalledOnce());
    expect(screen.queryByText("Paused")).not.toBeInTheDocument();
    expect(screen.getByTestId("scoreboard")).toHaveTextContent("Score 0");
  });

  it("ignores a stale resume completion after restart", async () => {
    let resolveResume: (resumed: boolean) => void = () => {};
    const firstEngine = mockEngine(
      vi.fn().mockResolvedValue(undefined),
      () => 1,
    );
    vi.mocked(firstEngine.resume).mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveResume = resolve;
        }),
    );
    const secondEngine = mockEngine(vi.fn().mockResolvedValue(undefined));
    const createAudioEngine = vi
      .fn()
      .mockReturnValueOnce(firstEngine)
      .mockReturnValueOnce(secondEngine);
    render(<DemoGame createAudioEngine={createAudioEngine} />);
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(await screen.findByText("Get ready")).toBeVisible();
    await act(async () => resolveResume(true));

    await waitFor(() => expect(firstEngine.resume).toHaveBeenCalledOnce());
    expect(screen.queryByText("Paused")).not.toBeInTheDocument();
    expect(screen.getByText("Get ready")).toBeVisible();
  });

  it("keeps a failed audio resume paused with a recoverable message", async () => {
    const engine = mockEngine(vi.fn().mockResolvedValue(undefined), () => 1);
    vi.mocked(engine.resume).mockRejectedValueOnce(
      new Error("Audio could not resume. Allow audio and try again."),
    );
    render(<DemoGame createAudioEngine={() => engine} />);
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Audio could not resume",
    );
    expect(screen.getByText("Paused")).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume" })).toBeEnabled();
  });

  it("pauses automatically when the page becomes hidden", async () => {
    const engine = mockEngine(vi.fn().mockResolvedValue(undefined), () => 1);
    const originalHidden = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "hidden",
    );
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });

    try {
      render(<DemoGame createAudioEngine={() => engine} />);
      fireEvent.click(screen.getByRole("button", { name: "Start demo" }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled(),
      );

      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      fireEvent(document, new Event("visibilitychange"));

      await waitFor(() => expect(engine.pause).toHaveBeenCalledOnce());
      expect(await screen.findByText("Paused")).toBeVisible();
    } finally {
      Reflect.deleteProperty(document, "hidden");
      if (originalHidden) {
        Object.defineProperty(Document.prototype, "hidden", originalHidden);
      }
    }
  });

  it("pauses when the page is hidden during the scheduled countdown", async () => {
    const engine = mockEngine(vi.fn().mockResolvedValue(undefined));
    const originalHidden = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "hidden",
    );
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });

    try {
      render(<DemoGame createAudioEngine={() => engine} />);
      fireEvent.click(screen.getByRole("button", { name: "Start demo" }));
      expect(await screen.findByText("Get ready")).toBeVisible();

      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      fireEvent(document, new Event("visibilitychange"));

      await waitFor(() => expect(engine.pause).toHaveBeenCalledOnce());
      expect(await screen.findByText("Paused")).toBeVisible();

      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      fireEvent.click(screen.getByRole("button", { name: "Resume" }));
      expect(await screen.findByText("Get ready")).toBeVisible();
    } finally {
      Reflect.deleteProperty(document, "hidden");
      if (originalHidden) {
        Object.defineProperty(Document.prototype, "hidden", originalHidden);
      }
    }
  });

  it("renders with a safe fallback when browser storage access is denied", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("denied", "SecurityError");
      },
    });

    try {
      render(<DemoGame />);
      expect(screen.getByRole("button", { name: "Start demo" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Calibrate device" }));
      fireEvent.click(screen.getByRole("button", { name: "Save calibration" }));
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Calibration could not be saved",
      );
    } finally {
      if (descriptor) {
        Object.defineProperty(window, "localStorage", descriptor);
      }
    }
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
