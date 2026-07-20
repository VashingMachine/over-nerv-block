import { useCallback, useEffect, useState } from "react";
import type { BuildManifest } from "@rhythm-game/chart-schema";

import { readBuildManifest } from "../build/readBuildManifest";

type ManifestState =
  | { status: "loading" }
  | { status: "online"; manifest: BuildManifest }
  | { status: "offline"; message: string };

export function useBuildManifest(): ManifestState & { retry: () => void } {
  const [state, setState] = useState<ManifestState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void readBuildManifest(controller.signal)
      .then((manifest) => setState({ status: "online", manifest }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Build check failed";
        setState({ status: "offline", message });
      });

    return () => controller.abort();
  }, [attempt]);

  return { ...state, retry };
}
