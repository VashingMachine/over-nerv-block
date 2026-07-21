import { describe, expect, it } from "vitest";

import {
  BeatAnalysisStateError,
  createBeatAnalysisJobState,
  maximumBeatAnalysisAttempts,
  transitionBeatAnalysisJob,
} from "./beatAnalysisStateMachine";

describe("beat-analysis job state machine", () => {
  it("follows the successful first-attempt path", () => {
    const preparing = createBeatAnalysisJobState();
    const running = transitionBeatAnalysisJob(preparing, {
      type: "begin_attempt",
      requestId: "job-1-attempt-1",
    });
    const succeeded = transitionBeatAnalysisJob(running, { type: "succeed" });

    expect(preparing).toEqual({
      phase: "preparing",
      attempt: 0,
      maximumAttempts: maximumBeatAnalysisAttempts,
    });
    expect(running).toMatchObject({ phase: "running", attempt: 1 });
    expect(succeeded).toEqual({
      phase: "succeeded",
      attempt: 1,
      maximumAttempts: maximumBeatAnalysisAttempts,
    });
  });

  it.each(["worker_failed", "analysis_timeout"] as const)(
    "allows one fresh retry after %s and no third attempt",
    (cause) => {
      const first = transitionBeatAnalysisJob(createBeatAnalysisJobState(), {
        type: "begin_attempt",
        requestId: "attempt-1",
      });
      const retrying = transitionBeatAnalysisJob(first, {
        type: "retry",
        cause,
      });
      const second = transitionBeatAnalysisJob(retrying, {
        type: "begin_attempt",
        requestId: "attempt-2",
      });
      const failed = transitionBeatAnalysisJob(second, {
        type: "fail",
        cause,
      });

      expect(retrying).toMatchObject({ phase: "retrying", attempt: 2, cause });
      expect(second).toMatchObject({ phase: "running", attempt: 2 });
      expect(failed).toMatchObject({
        phase: cause === "analysis_timeout" ? "timed_out" : "failed",
        attempt: 2,
        cause,
      });
      expect(() =>
        transitionBeatAnalysisJob(second, { type: "retry", cause }),
      ).toThrow(BeatAnalysisStateError);
    },
  );

  it("does not permit automatic retry for a declared analysis error", () => {
    const running = transitionBeatAnalysisJob(createBeatAnalysisJobState(), {
      type: "begin_attempt",
      requestId: "attempt-1",
    });
    expect(() =>
      transitionBeatAnalysisJob(running, {
        type: "retry",
        // @ts-expect-error Only crash and timeout are retryable.
        cause: "no_beats",
      }),
    ).toThrow(BeatAnalysisStateError);
  });

  it.each(["preparing", "running", "retrying"] as const)(
    "cancels from %s and makes later events inert",
    (phase) => {
      const preparing = createBeatAnalysisJobState();
      const running = transitionBeatAnalysisJob(preparing, {
        type: "begin_attempt",
        requestId: "attempt-1",
      });
      const state =
        phase === "preparing"
          ? preparing
          : phase === "running"
            ? running
            : transitionBeatAnalysisJob(running, {
                type: "retry",
                cause: "worker_failed",
              });
      const cancelled = transitionBeatAnalysisJob(state, { type: "cancel" });

      expect(cancelled.phase).toBe("cancelled");
      expect(
        transitionBeatAnalysisJob(cancelled, {
          type: "begin_attempt",
          requestId: "late",
        }),
      ).toBe(cancelled);
      expect(transitionBeatAnalysisJob(cancelled, { type: "succeed" })).toBe(
        cancelled,
      );
    },
  );
});
