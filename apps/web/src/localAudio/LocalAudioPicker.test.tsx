import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LocalAudioPicker } from "./LocalAudioPicker";
import { LocalAudioError } from "./filePolicy";
import type {
  DecodeLocalAudioOptions,
  DisposableDecodedAudio,
} from "./localAudioDecoder";

function selectedFile(
  name = "do-not-display-this.wav",
  type = "audio/wav",
  body = "audio",
) {
  return new File([body], name, { type });
}

function decodedAudio(durationSeconds = 8) {
  const release = vi.fn();
  const decoded: DisposableDecodedAudio = {
    durationSeconds,
    numberOfChannels: 2,
    sampleRate: 48_000,
    getAudioBuffer: vi.fn(() => null),
    release,
  };
  return { decoded, release };
}

function pickerProps() {
  return {
    capabilityAvailable: true,
    createObjectURL: vi.fn(() => "blob:private-preview"),
    minimumProgressMilliseconds: 0,
    revokeObjectURL: vi.fn(),
  };
}

function select(file: File) {
  fireEvent.change(screen.getByLabelText("Choose local music file"), {
    target: { files: [file] },
  });
}

describe("private local-audio picker", () => {
  it("explains privacy and input limits before selection", () => {
    render(<LocalAudioPicker {...pickerProps()} />);

    expect(
      screen.getByText(
        "Decoded only in this tab. Nothing is uploaded. Audio is not saved.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/up to 25 MB and 10 minutes/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choose music file" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("Choose local music file")).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("shows local progress then a filename-free ready summary", async () => {
    const props = pickerProps();
    const handle = decodedAudio(8.25);
    const decodeAudio = vi.fn(
      async (_file: File, options: DecodeLocalAudioOptions) => {
        options.onProgress({ stage: "reading", percent: 48 });
        options.onProgress({ stage: "decoding", percent: 80 });
        return handle.decoded;
      },
    );
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile());

    expect(
      await screen.findByRole("heading", { name: "Ready for analysis" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ready_for_analysis")).toBeInTheDocument();
    expect(screen.getByText("8.3 seconds")).toBeInTheDocument();
    expect(screen.getByText("WAV")).toBeInTheDocument();
    expect(screen.getByText("2 channels · 48000 Hz")).toBeInTheDocument();
    expect(
      screen.queryByText("do-not-display-this.wav"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Local audio preview")).toHaveAttribute(
      "src",
      "blob:private-preview",
    );
    expect(props.createObjectURL).toHaveBeenCalledOnce();
  });

  it("rejects invalid input before decode without exposing its name", () => {
    const props = pickerProps();
    const decodeAudio = vi.fn();
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile("private-identity.txt", "audio/wav"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose a WAV, MP3, M4A, AAC, OGG, Opus, FLAC, or WebM audio file.",
    );
    expect(screen.queryByText("private-identity.txt")).not.toBeInTheDocument();
    expect(decodeAudio).not.toHaveBeenCalled();
    expect(props.createObjectURL).not.toHaveBeenCalled();
  });

  it("cancels active work and releases a late stale result", async () => {
    const props = pickerProps();
    const handle = decodedAudio();
    let resolveDecode: ((value: DisposableDecodedAudio) => void) | undefined;
    let options: DecodeLocalAudioOptions | undefined;
    const decodeAudio = vi.fn(
      (_file: File, receivedOptions: DecodeLocalAudioOptions) => {
        options = receivedOptions;
        return new Promise<DisposableDecodedAudio>((resolve) => {
          resolveDecode = resolve;
        });
      },
    );
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile());
    expect(
      screen.getByRole("progressbar", {
        name: "Local audio preparation progress",
      }),
    ).toHaveValue(5);
    act(() => options?.onProgress({ stage: "decoding", percent: 77 }));
    expect(screen.getByText("77% · no upload in progress")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel preparation" }));
    expect(options?.signal.aborted).toBe(true);
    expect(
      screen.getByText("Selection cancelled. No audio was retained."),
    ).toBeInTheDocument();

    await act(async () => resolveDecode?.(handle.decoded));
    await waitFor(() => expect(handle.release).toHaveBeenCalledOnce());
    expect(props.createObjectURL).not.toHaveBeenCalled();
  });

  it("releases decoded samples when cancelled during visible progress", async () => {
    const props = pickerProps();
    props.minimumProgressMilliseconds = 10_000;
    const handle = decodedAudio();
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile());
    await waitFor(() => expect(decodeAudio).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Cancel preparation" }));

    await waitFor(() => expect(handle.release).toHaveBeenCalledOnce());
    expect(props.createObjectURL).not.toHaveBeenCalled();
    expect(
      screen.getByText("Selection cancelled. No audio was retained."),
    ).toBeInTheDocument();
  });

  it("releases decoded samples if a preview URL cannot be created", async () => {
    const props = pickerProps();
    props.createObjectURL.mockImplementation(() => {
      throw new Error("private platform detail");
    });
    const handle = decodedAudio();
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This audio could not be prepared. Choose another file.",
    );
    expect(handle.release).toHaveBeenCalledOnce();
    expect(
      screen.queryByText("private platform detail"),
    ).not.toBeInTheDocument();
  });

  it("releases each selection exactly once on replace and clear", async () => {
    const props = pickerProps();
    props.createObjectURL
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const first = decodedAudio(5);
    const second = decodedAudio(6);
    const decodeAudio = vi
      .fn()
      .mockResolvedValueOnce(first.decoded)
      .mockResolvedValueOnce(second.decoded);
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile("first-private.wav"));
    await screen.findByText("5.0 seconds");
    fireEvent.click(screen.getByRole("button", { name: "Replace music" }));
    select(selectedFile("second-private.wav"));
    await screen.findByText("6.0 seconds");

    expect(first.release).toHaveBeenCalledOnce();
    expect(props.revokeObjectURL).toHaveBeenCalledWith("blob:first");
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(second.release).toHaveBeenCalledOnce();
    expect(props.revokeObjectURL).toHaveBeenCalledWith("blob:second");
    expect(props.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText("Selection cleared. No audio was retained."),
    ).toBeInTheDocument();
  });

  it("shows stable decoder errors and allows retry", async () => {
    const props = pickerProps();
    const recovered = decodedAudio();
    const decodeAudio = vi
      .fn()
      .mockRejectedValueOnce(new LocalAudioError("decode_failed"))
      .mockResolvedValueOnce(recovered.decoded);
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile("secret-corrupt.wav"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This audio could not be decoded by this browser. Choose another file.",
    );
    expect(screen.queryByText("secret-corrupt.wav")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Choose another file" }),
    );
    select(selectedFile("secret-recovered.wav"));
    expect(
      await screen.findByRole("heading", { name: "Ready for analysis" }),
    ).toBeInTheDocument();
  });

  it("releases a ready selection once when the page closes", async () => {
    const props = pickerProps();
    const handle = decodedAudio();
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    const { unmount } = render(
      <LocalAudioPicker {...props} decodeAudio={decodeAudio} />,
    );

    select(selectedFile());
    await screen.findByText("Ready for analysis");
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    expect(handle.release).toHaveBeenCalledOnce();
    expect(props.revokeObjectURL).toHaveBeenCalledOnce();

    unmount();
    expect(handle.release).toHaveBeenCalledOnce();
    expect(props.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("returns a released ready selection to idle after BFCache restoration", async () => {
    const props = pickerProps();
    const handle = decodedAudio();
    const decodeAudio = vi.fn().mockResolvedValue(handle.decoded);
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile());
    await screen.findByText("Ready for analysis");
    act(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      );
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });

    expect(handle.release).toHaveBeenCalledOnce();
    expect(props.revokeObjectURL).toHaveBeenCalledOnce();
    expect(screen.queryByText("Ready for analysis")).not.toBeInTheDocument();
    expect(
      screen.getByText("Page restored. Choose the local audio file again."),
    ).toBeInTheDocument();
  });

  it("returns cancelled work to idle after BFCache restoration", async () => {
    const props = pickerProps();
    const handle = decodedAudio();
    let resolveDecode: ((value: DisposableDecodedAudio) => void) | undefined;
    let options: DecodeLocalAudioOptions | undefined;
    const decodeAudio = vi.fn(
      (_file: File, receivedOptions: DecodeLocalAudioOptions) => {
        options = receivedOptions;
        return new Promise<DisposableDecodedAudio>((resolve) => {
          resolveDecode = resolve;
        });
      },
    );
    render(<LocalAudioPicker {...props} decodeAudio={decodeAudio} />);

    select(selectedFile());
    expect(screen.getByText("Reading audio in this tab")).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      );
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });

    expect(options?.signal.aborted).toBe(true);
    expect(
      screen.getByText("Page restored. Choose the local audio file again."),
    ).toBeInTheDocument();
    await act(async () => resolveDecode?.(handle.decoded));
    await waitFor(() => expect(handle.release).toHaveBeenCalledOnce());
    expect(props.createObjectURL).not.toHaveBeenCalled();
  });

  it("disables selection when required browser APIs are unavailable", () => {
    const props = pickerProps();
    render(<LocalAudioPicker {...props} capabilityAvailable={false} />);

    expect(
      screen.getByText("Local audio needs Web Audio support."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Choose music file" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Choose local music file"),
    ).not.toBeInTheDocument();
  });
});
