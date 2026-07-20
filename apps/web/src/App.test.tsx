import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const health = {
  status: "ok",
  service: "api",
  environment: "test",
  version: "0.1.0",
  commit: "abc123456789",
};

const version = {
  name: "over-nerv-block-api",
  version: "0.1.0",
  environment: "test",
  commit: "abc123456789",
  schemaVersion: 1,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("system heartbeat", () => {
  it("shows the web and API as online when both contracts are valid", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(health), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(version), { status: 200 }),
      );

    render(<App />);

    expect(screen.getByText("Contacting rhythm services")).toBeInTheDocument();
    expect(await screen.findByText("System online")).toBeInTheDocument();
    expect(screen.getByText("test")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("recovers after retrying an unavailable API", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(health), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(version), { status: 200 }),
      );

    render(<App />);

    expect(await screen.findByText("System unavailable")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "Try again" });
    expect(retryButton).toBeInTheDocument();
    expect(screen.getByText("Network unavailable")).toBeInTheDocument();

    fireEvent.click(retryButton);

    expect(screen.getByText("Contacting rhythm services")).toBeInTheDocument();
    expect(await screen.findByText("System online")).toBeInTheDocument();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(4));
  });
});
