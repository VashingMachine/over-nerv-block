import { afterEach, describe, expect, it, vi } from "vitest";

import { WebAudioEngine } from "./audioEngine";

class FakeSource extends EventTarget {
  buffer: AudioBuffer | null = null;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

class FakeAudioContext {
  currentTime = 10;
  state: AudioContextState = "suspended";
  readonly destination = {} as AudioDestinationNode;
  readonly source = new FakeSource();
  readonly resume = vi.fn(async () => {
    this.state = "running";
  });
  readonly suspend = vi.fn(async () => {
    this.state = "suspended";
  });
  readonly decodeAudioData = vi.fn(async () => ({}) as AudioBuffer);
  readonly createBufferSource = vi.fn(
    () => this.source as unknown as AudioBufferSourceNode,
  );
  readonly close = vi.fn(async () => {
    this.state = "closed";
  });
}

function installAudioContext(context: FakeAudioContext) {
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return context;
      }
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Web Audio song clock", () => {
  it("schedules from AudioContext.currentTime and exposes that origin", async () => {
    const context = new FakeAudioContext();
    installAudioContext(context);
    vi.spyOn(performance, "now").mockReturnValue(5_000);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))),
    );
    const engine = new WebAudioEngine();

    await engine.start({
      audioUrl: "audio/demo.wav",
      countdownSeconds: 1.5,
      onEnded: vi.fn(),
    });

    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.source.start).toHaveBeenCalledWith(11.5);
    expect(engine.songTimeSeconds()).toBe(-1.5);
    context.currentTime = 11.75;
    expect(engine.songTimeSeconds()).toBe(0.25);
    expect(engine.songTimeForEvent(6_750)).toBe(0.25);
  });

  it("closes and disconnects immediately after natural completion", async () => {
    const context = new FakeAudioContext();
    installAudioContext(context);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("audio")));
    const onEnded = vi.fn();
    const engine = new WebAudioEngine();
    await engine.start({
      audioUrl: "audio/demo.wav",
      countdownSeconds: 1.5,
      onEnded,
    });

    context.source.dispatchEvent(new Event("ended"));

    expect(onEnded).toHaveBeenCalledOnce();
    expect(context.source.disconnect).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(engine.status).toBe("disposed");
    expect(engine.songTimeSeconds()).toBe(-Infinity);
  });

  it("freezes the audio clock while paused and resumes the same source", async () => {
    const context = new FakeAudioContext();
    installAudioContext(context);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("audio")));
    const engine = new WebAudioEngine();
    await engine.start({
      audioUrl: "audio/demo.wav",
      countdownSeconds: 1.5,
      onEnded: vi.fn(),
    });
    context.currentTime = 12;

    await expect(engine.pause()).resolves.toBe(true);
    const pausedTime = engine.songTimeSeconds();
    expect(context.suspend).toHaveBeenCalledOnce();
    expect(engine.status).toBe("paused");

    await expect(engine.resume()).resolves.toBe(true);
    expect(engine.status).toBe("scheduled");
    expect(engine.songTimeSeconds()).toBe(pausedTime);
    expect(context.source.start).toHaveBeenCalledOnce();
  });

  it("reports transport no-ops after disposal", async () => {
    const context = new FakeAudioContext();
    installAudioContext(context);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("audio")));
    const engine = new WebAudioEngine();
    await engine.start({
      audioUrl: "audio/demo.wav",
      countdownSeconds: 1.5,
      onEnded: vi.fn(),
    });

    engine.dispose();

    await expect(engine.pause()).resolves.toBe(false);
    await expect(engine.resume()).resolves.toBe(false);
  });

  it("makes disposal terminal while loading and aborts pending work", async () => {
    const context = new FakeAudioContext();
    installAudioContext(context);
    let resolveFetch: ((response: Response) => void) | undefined;
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        });
      }),
    );
    const engine = new WebAudioEngine();
    const startPromise = engine.start({
      audioUrl: "audio/demo.wav",
      countdownSeconds: 1.5,
      onEnded: vi.fn(),
    });
    await vi.waitFor(() => expect(requestSignal).toBeDefined());

    engine.dispose();
    engine.dispose();
    expect(requestSignal?.aborted).toBe(true);
    resolveFetch?.(new Response("audio"));

    await expect(startPromise).rejects.toThrow("Audio start was cancelled");
    expect(engine.status).toBe("disposed");
    expect(context.createBufferSource).not.toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledOnce();
  });
});
