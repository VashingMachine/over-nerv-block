import { useCallback, useEffect, useState } from "react";

import { getSystemSnapshot, type SystemSnapshot } from "../api/system";

type SnapshotState =
  | { status: "loading" }
  | { status: "online"; snapshot: SystemSnapshot }
  | { status: "offline"; message: string };

export function useSystemSnapshot(): SnapshotState & { retry: () => void } {
  const [state, setState] = useState<SnapshotState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void getSystemSnapshot(controller.signal)
      .then((snapshot) => setState({ status: "online", snapshot }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "System check failed";
        setState({ status: "offline", message });
      });

    return () => controller.abort();
  }, [attempt]);

  return { ...state, retry };
}
