export type AudioEngineStatus = "idle" | "scheduled" | "disposed";

export interface AudioEngine {
  readonly status: AudioEngineStatus;
  start(options: {
    audioUrl: string;
    countdownSeconds: number;
    beforeSchedule?: () => Promise<unknown>;
    onEnded: () => void;
  }): Promise<void>;
  songTimeSeconds(): number;
  dispose(): void;
}

export type AudioEngineFactory = () => AudioEngine;

export class WebAudioEngine implements AudioEngine {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private endedHandler: (() => void) | null = null;
  private abortController: AbortController | null = null;
  private scheduledStartSeconds: number | null = null;
  private currentStatus: AudioEngineStatus = "idle";

  get status(): AudioEngineStatus {
    return this.currentStatus;
  }

  async start({
    audioUrl,
    beforeSchedule,
    countdownSeconds,
    onEnded,
  }: {
    audioUrl: string;
    beforeSchedule?: () => Promise<unknown>;
    countdownSeconds: number;
    onEnded: () => void;
  }): Promise<void> {
    if (this.currentStatus !== "idle") {
      throw new Error("Audio engine has already been started");
    }

    const context = new AudioContext();
    const abortController = new AbortController();
    this.context = context;
    this.abortController = abortController;
    await context.resume();
    this.assertStartIsActive(context);
    if (context.state !== "running") {
      throw new Error("Audio is paused by the browser. Allow audio and retry.");
    }

    const response = await fetch(audioUrl, { signal: abortController.signal });
    this.assertStartIsActive(context);
    if (!response.ok) {
      throw new Error(`Demo audio could not be loaded (${response.status})`);
    }

    const audioBuffer = await context.decodeAudioData(
      await response.arrayBuffer(),
    );
    this.assertStartIsActive(context);
    await beforeSchedule?.();
    this.assertStartIsActive(context);
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    const handleEnded = () => {
      if (this.currentStatus !== "scheduled" || this.source !== source) {
        return;
      }
      this.finalizeEndedSource(source, context);
      onEnded();
    };
    this.endedHandler = handleEnded;
    source.addEventListener("ended", handleEnded, { once: true });

    this.source = source;
    this.scheduledStartSeconds = context.currentTime + countdownSeconds;
    this.currentStatus = "scheduled";
    source.start(this.scheduledStartSeconds);
  }

  private assertStartIsActive(context: AudioContext): void {
    if (this.currentStatus === "disposed" || this.context !== context) {
      throw new Error("Audio start was cancelled");
    }
  }

  private finalizeEndedSource(
    source: AudioBufferSourceNode,
    context: AudioContext,
  ): void {
    if (this.endedHandler) {
      source.removeEventListener("ended", this.endedHandler);
    }
    source.disconnect();
    this.source = null;
    this.endedHandler = null;
    this.abortController = null;
    this.scheduledStartSeconds = null;
    this.context = null;
    this.currentStatus = "disposed";
    void context.close();
  }

  songTimeSeconds(): number {
    if (!this.context || this.scheduledStartSeconds === null) {
      return -Infinity;
    }

    return this.context.currentTime - this.scheduledStartSeconds;
  }

  dispose(): void {
    if (this.currentStatus === "disposed") {
      return;
    }

    this.currentStatus = "disposed";
    this.abortController?.abort();
    if (this.source) {
      if (this.endedHandler) {
        this.source.removeEventListener("ended", this.endedHandler);
      }
      try {
        this.source.stop();
      } catch {
        // A source that already ended cannot be stopped again.
      }
      this.source.disconnect();
    }
    void this.context?.close();
    this.source = null;
    this.endedHandler = null;
    this.abortController = null;
    this.scheduledStartSeconds = null;
    this.context = null;
  }
}

export const createWebAudioEngine: AudioEngineFactory = () =>
  new WebAudioEngine();
