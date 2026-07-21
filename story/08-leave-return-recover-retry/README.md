---
story_id: "08"
title: "Player can leave, return, recover, and retry local analysis"
status: accepted
sprint: 8
implementation_commit: self
preview_url: "http://127.0.0.1:4173"
staging_url: not_applicable
automated_tests: pass
product_review: pass
code_review: pass
deployed: false
---

# Sprint 08 — Leave, return, recover, and retry

## User story

As a player, I can cancel or recover from local analysis failure and understand when a local file must be selected again.

## Delivered outcome

A local analysis job has one explicit, bounded lifecycle instead of being coordinated by incidental component state. A worker crash or timeout receives at most one automatic fresh-worker attempt; cancellation is immediate and final for that job; stale or duplicate worker messages cannot alter the accepted result. After a valid analysis completes, its filename-free beat grid is stored as the single latest recovery checkpoint in IndexedDB. Reloading restores the chart, corrections, and generated difficulty summaries without restoring any audio. Playback truthfully remains unavailable until a local file is selected and analyzed again. No server or external deployment is required.

## Scope

### In scope

- An explicit worker-job state machine with stable states, events, error codes, and legal transitions.
- A maximum of two worker attempts per analysis job and a 90-second timeout per attempt.
- One automatic fresh-worker retry only for a worker crash or attempt timeout.
- Immediate cancellation, worker/listener/timer/sample cleanup, stale-request rejection, and duplicate-terminal-message idempotence.
- A strict version-one IndexedDB record containing the single latest completed quality beat grid and filename-free recovery metadata.
- Asynchronous checkpoint load/write/delete with schema and fingerprint validation and nonfatal unavailable/corrupt-storage recovery.
- Restored beat-grid, correction, and generated-difficulty review without audio after refresh/reopen.
- Explicit UI explaining that audio was never saved and local selection plus analysis is required before play.
- Retaining the last valid recovered grid while a replacement selection is prepared, cancelled, or fails; replacing it only after a new valid completion.
- A user action to forget the recovery checkpoint without affecting browser-held audio or correction documents.
- Desktop and 412-pixel mobile production-preview E2E, exact evidence, privacy checks, CI artifact packaging, and isolated reviews.

### Out of scope

- Persisting a `File`, filename, MIME metadata, audio bytes, decoded samples, object/blob URL, in-progress input, worker payload, generated chart, or score/result.
- Multiple saved charts or results, retention policy/history browsing, export/import, or history migrations; these belong to Sprint 09.
- Background analysis after page exit, resumable partial DSP work, remote/server analysis, uploads, cloud services, or external hosting.
- PWA/offline lifecycle, broad browser/device support, resource profiling, or mobile-native lifecycle; these belong to later sprints.

## Frozen recovery contract

### Worker state machine

1. One user invocation creates one job with a unique job ID and the phases `preparing`, `running`, `retrying`, then exactly one terminal phase: `succeeded`, `failed`, `timed_out`, or `cancelled`.
2. Each worker attempt has a unique request ID derived independently from the job. The initial attempt is 1 of 2. Only `worker_failed` or `analysis_timeout` may transition attempt 1 to `retrying` and then attempt 2. No other error retries automatically.
3. Each attempt has a 90,000-millisecond deadline beginning immediately before its analyze request is posted. Timeout terminates that worker, clears listeners and its timer, and returns the stable `analysis_timeout` reason. Attempt 2 timing out ends the job as `timed_out`.
4. Cancellation is legal during preparation, running, or retrying. It aborts decoding if applicable, sends a best-effort cancel request to an active worker, terminates the worker, clears listeners/timers, releases owned decoded samples, and ends the job as `cancelled`. A cancelled job never retries.
5. Only a schema-valid response with the current protocol version and active request ID may report progress or complete the attempt. Mismatched request IDs are stale and ignored. Malformed active responses fail safely. A terminal response is accepted once; later duplicate, stale, error, or progress messages are inert.
6. Every attempt uses a fresh worker. Attempt-local transferable buffers are not reused after transfer. All completion, failure, timeout, cancellation, constructor failure, callback failure, and post failure paths perform cleanup exactly once.
7. Progress belongs only to the active attempt. Retry visibly resets the attempt label and progress. Component-level operation identity additionally prevents a superseded job from changing UI.
8. A manual `Retry analysis` action starts a new bounded job and re-decodes the still-selected local `File`; it does not extend or mutate the terminal job. There is no unbounded automatic loop.

### Recovery checkpoint

1. IndexedDB database `rhythm-game-recovery`, version 1, contains store `completed-analysis` and singleton key `latest`. It is recovery state, not history.
2. The strict record contains only `checkpointVersion: 1`, kind `completed_beat_grid_checkpoint`, `savedAtEpochMs`, deterministic `sourceFingerprint`, and one schema-valid `QualityRhythmAnalysis` grid. Unknown keys and versions are rejected.
3. `sourceFingerprint` must equal the deterministic fingerprint recomputed from the parsed grid. Invalid, corrupt, foreign, or incoherent records are deleted when possible and never rendered.
4. A validated worker completion is rendered in memory first and checkpointed with one atomic `put`. A save failure is nonfatal and visibly reports that reload recovery is unavailable. A prior valid checkpoint is never overwritten by running, cancelled, failed, timed-out, or stale work.
5. Audio and selection data are never written. The record excludes `File`, filename, path, MIME type, file size, audio/blob bytes, object URL, decoded buffers, worker transfer buffers, generated charts, corrections, and results.
6. Startup reads asynchronously outside render. Missing storage yields the normal empty state. Unavailable storage yields a concise nonfatal notice. The application remains fully usable in the current tab.
7. `Forget recovered grid` deletes only the singleton checkpoint and clears a recovery-only chart from memory. It does not claim to delete separate correction documents or current tab audio.

### Leave, return, and playback truth

1. A recovered grid is marked `Recovered from this device`. Its analysis facts, correction editor, and three generated difficulty summaries are available.
2. Because audio is absent, the recovered view states `Audio was never saved` and `Select and analyze the local song again to play`. Start-game controls are unavailable; the UI does not create an empty/fake audio source.
3. Tap-from-preview correction is unavailable while audio is absent; deterministic non-audio corrections remain usable and continue using Sprint 07's separate correction documents.
4. Selecting a local file never binds it to a recovered grid merely by filename or metadata. The recovered grid remains safely visible during preparation and failure. Only a newly completed schema-valid analysis may replace the checkpoint and bind the current object URL to the resulting chart.
5. Re-analysis with an equal deterministic grid restores matching corrections and enables play with the currently selected local audio. A different valid grid atomically becomes the new latest checkpoint and cannot inherit foreign corrections.
6. `pagehide`, unmount, refresh, replacement, and clear-selection release audio/object URLs and cancel active work. They do not delete an already completed checkpoint. `pageshow` after a cached page explains the same audio re-selection requirement.

## Acceptance criteria

1. **Given** valid decoded samples, **when** analysis starts, **then** one explicit job enters preparation/running with attempt 1 of 2, truthful progress, a 90-second attempt deadline, and exactly one active worker.
2. **Given** attempt 1 crashes or times out, **when** recovery is eligible, **then** its resources are cleaned once and a fresh attempt 2 of 2 begins; a second crash/timeout ends with a stable actionable error and no further automatic retry.
3. **Given** active or superseded work, **when** the player cancels or workers emit duplicate, late, stale-ID, malformed, or out-of-order terminal messages, **then** cancellation is prompt, the accepted terminal result cannot change, no retry follows cancellation, and all workers/listeners/timers/samples are released once.
4. **Given** a valid completed quality grid, **when** checkpoint save succeeds, **then** IndexedDB contains exactly one strict version-one latest record with matching fingerprint and grid, and contains no filename/audio/object URL/selection/generated-chart/correction/result data.
5. **Given** a valid checkpoint and no selected file, **when** the production app reloads or reopens, **then** it restores the grid, matching corrections, and generated difficulty summaries; visibly says audio was never saved; disables play and preview-dependent tapping; and asks for local selection plus analysis.
6. **Given** a recovered grid, **when** preparation, analysis, cancellation, timeout, or failure of a newly selected file occurs, **then** the previous valid checkpoint remains reviewable and unchanged. A newly validated completion replaces it and binds only its current tab audio.
7. **Given** missing, denied, corrupt, unknown-version, or fingerprint-mismatched IndexedDB state, **when** startup or save occurs, **then** the app remains usable, never renders unvalidated data, cleans invalid state when possible, and gives a concise truthful recovery notice.
8. **Given** a recovered desktop or 412-pixel mobile view, **when** the player reviews, forgets, reselects, analyzes, retries, and proceeds to play, **then** controls and state explanations remain semantic, contained, and understandable without code knowledge.
9. **Given** CI/evidence capture, **when** Sprint 08 is evaluated, **then** a loopback static production build uses repository-owned audio to demonstrate start, cancel, bounded retry/failure messaging, completed checkpoint, reload recovery without audio, re-analysis, and playable recovery; privacy/storage assertions and both isolated reviews pass.

## Layer coverage

| Layer          | Delivered coverage                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend       | Attempt/state progress, cancel/retry copy, recovered-grid banner, audio-absent difficulty view, reselect/reanalyze, forget action.    |
| Worker/domain  | Explicit transition reducer/runner, two-attempt bound, timeout, retry eligibility, stale/duplicate rejection, exact cleanup.          |
| Contract       | Strict recovery checkpoint schema and state/error vocabulary with invariants and deterministic source identity.                       |
| Storage        | One versioned IndexedDB latest-grid record; validated async read/put/delete; no in-progress or audio persistence.                     |
| Infrastructure | Static Vite production build served only on `127.0.0.1`; no application server, database service, cloud runtime, or external hosting. |
| CI/CD          | Unit/contract/component tests, production-preview E2E, exact loopback evidence/artifact identity, isolated Product and Code Review.   |
| Privacy        | Owned fixture; network, filename, IndexedDB fields, cache, service-worker, console, and artifact-content guards.                      |

## Test mapping

| Criterion | Delivered verification                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1         | Pure legal-transition table, attempt identity/deadline tests, worker integration start/progress tests, visible component state.            |
| 2         | Fake-timer crash/timeout matrices proving exactly one fresh retry, final code, worker count, and cleanup.                                  |
| 3         | Duplicate/stale/malformed/cancel/post/callback/unmount races with listener/timer/worker/sample accounting plus production cancel E2E.      |
| 4         | Strict schema and real IndexedDB browser assertions for singleton identity, round trip, replacement, field allowlist, and prior retention. |
| 5         | Component recovery hydration and production reload E2E proving chart/correction/difficulties return while audio/play/tap do not.           |
| 6         | Component and production cancellation/failure/retry/reanalysis flows proving prior checkpoint stability and valid-only replacement.        |
| 7         | Store adapter tests for missing/denied/corrupt/version/fingerprint failures and safe cleanup/nonfatal UI.                                  |
| 8         | Semantic component assertions plus 1280×800 and 412×915 containment E2E and Product Review media.                                          |
| 9         | Exact build ID/hash manifest, owned-input privacy scans, full production E2E, CI artifact, black-box review, and code-only review.         |

## Evidence

The accepted exact-candidate packet contains 12 hashed media artifacts plus its manifest, produced with repository-owned synthesized audio and sanitized state labels. It demonstrates initial analysis, active attempt 1 of 2, cancellation, a simulated crash reaching fresh attempt 2 of 2, completed checkpoint status, reload with a recovered chart and no audio/play action, retention during replacement failure/cancellation, re-analysis with playback restored, denied-storage fallback, forget behavior, and contained desktop/mobile views. A short end-to-end video connects completion → reload recovery → local re-analysis → playable chart. The Delivery Agent verified inventory, byte sizes, hashes, build identity, privacy assertions, and the video-only stream automatically without viewing the site or media. The isolated Product Reviewer independently verified all 12 files and passed all nine criteria.

## Preview/build

- Required preview: exact static production build at `http://127.0.0.1:4173`.
- External deployment: not required and will not be used as an acceptance gate.
- CI packages the immutable `apps/web/dist` directory and exact Sprint 08 evidence.
- Local production-preview dry run: pass with build identifier `sprint08-local-candidate`.
- Local evidence dry run: pass with 12 media artifacts plus manifest.
- Accepted reviewed candidate: `c8e3c7854dcce907367f91742adc283025ef30d0`.
- CI run: `29806028199`, passed.
- CI artifact: `8485562194`, digest `sha256:0f13e86ab856e23a1ba9ff346f3bf3a706dd06920a7c1836b9272c2c1ba068ae`.
- Evidence manifest SHA-256: `bae81e7862faed9abae9bfef4b98d5264c0abecfb92b7a9d5eb3914067ffa0b5`.
- Downloaded accepted-artifact smoke: 4/4 pass against `http://127.0.0.1:4174`, covering heartbeat, manifest retry, recovery/re-analysis-to-play, failure/cancellation retention, and forget.

## Rollback plan

Revert the Sprint 08 atomic commit to restore Sprint 07 behavior. Delete database `rhythm-game-recovery` or its `completed-analysis/latest` record if recovery-data cleanup is desired. No server, remote database, uploaded media, cloud resource, or external deployment requires rollback.

## Review status

- Automated verification: pass locally and in exact-candidate CI; 46 shared-contract tests, 230 web tests across 22 files, 276 total unit/contract/component tests, zero audit vulnerabilities, and 40 production E2E scenarios pass.
- Product Review: PASS for `c8e3c7854dcce907367f91742adc283025ef30d0`; all nine criteria pass and no P0-P2 finding remains.
- Code Review: PASS for `c8e3c7854dcce907367f91742adc283025ef30d0`; all three preliminary P2 findings were fixed and no unresolved P0-P2 finding remains.

## Known limitations

- Recovery stores one latest completed grid, not chart/result history; Sprint 09 adds history and retention management.
- A recovered chart can be reviewed and corrected, but playback and preview tapping intentionally require local re-selection and deterministic re-analysis.
- The 90-second attempt deadline is a conservative safety boundary, not a performance claim for every accepted ten-minute input; Sprint 11 adds measured resource budgets and low-end profiling.
- Production automation is Chromium desktop/mobile until the later responsive PWA and browser hardening sprints.
- Full-page product captures still show the inherited Stage 07 label, and the complete recovered mobile workspace is vertically long; both are nonblocking presentation polish findings.
- Worker runtime validation accepts a broader set of stable main-thread error codes than the declared worker protocol, but those out-of-protocol codes are terminal and cannot trigger automatic retry.
- The inherited correction editor may migrate or discard correction storage during render in development Strict Mode; stored corrections and production behavior remain correct.
