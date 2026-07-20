import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const manifest = {
  status: "ready",
  app: "over-nerv-block",
  environment: "test",
  version: "0.1.0",
  buildIdentifier: "abc123456789",
  schemaVersion: 1,
  processing: "browser-local",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("system heartbeat", () => {
  it("shows the production build as online when its manifest is valid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(manifest), { status: 200 }),
    );

    render(<App />);

    expect(screen.getByText("Checking production build")).toBeInTheDocument();
    expect(await screen.findByText("System online")).toBeInTheDocument();
    expect(screen.getByText("test")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("recovers after retrying an unavailable build manifest", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(manifest), { status: 200 }),
      );

    render(<App />);

    expect(await screen.findByText("System unavailable")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "Try again" });
    expect(retryButton).toBeInTheDocument();
    expect(screen.getByText("Network unavailable")).toBeInTheDocument();

    fireEvent.click(retryButton);

    expect(screen.getByText("Checking production build")).toBeInTheDocument();
    expect(await screen.findByText("System online")).toBeInTheDocument();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  });

  it("reports an invalid build manifest without exposing parser details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "unknown" }), { status: 200 }),
    );

    render(<App />);

    expect(await screen.findByText("System unavailable")).toBeInTheDocument();
    expect(screen.getByText("Build manifest is invalid")).toBeInTheDocument();
  });
});
