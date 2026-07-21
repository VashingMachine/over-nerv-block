---
story_id: "04"
title: "Player previews a baseline automatic beat grid"
status: accepted
sprint: 4
implementation_commit: self
preview_url: "http://127.0.0.1:4173"
staging_url: not_applicable
automated_tests: pass
product_review: pass
code_review: pass
deployed: false
---

# Sprint 04 — Baseline beat grid

## User story

As a player, I can have a locally selected song analyzed and preview an automatically detected beat grid.

## Delivered outcome

The production web build now turns Sprint 03's disposable decoded audio into a deterministic, versioned baseline beat grid inside a dedicated browser worker. Players get staged progress, cancellation/retry, a retained local preview, and a readable desktop/mobile beat timeline without upload, persistence, or a server. It does not generate a playable chart yet.

## Scope

### In scope

- An explicit Analyze beats action for a successfully prepared local song.
- A dedicated module worker with versioned analyze/cancel/progress/complete/error messages.
- Channel downmixing, bounded resampling, multi-band spectral-flux onset extraction, adaptive peak picking, autocorrelation tempo candidates, and dynamic-programming beat tracking.
- Visible staged progress, cancellation, stable failure, retry from the active local selection, and stale-result rejection.
- A visual beat timeline with estimated tempo, beat count, analyzer version, and representative beat times.
- Immediate release of decoded samples after they are copied/transferred to the worker; local preview continues from the object URL.
- A pre-allocation ceiling of 24,000,000 decoded channel samples, with a stable replace-file recovery path for larger decoded inputs.
- Deterministic synthetic-corpus quality metrics, worker-boundary tests, a performance budget, a main-thread responsiveness guard, production E2E, and exact-candidate evidence.

### Out of scope

- Downbeats, meter, high-quality/model comparison, half/double-tempo warnings, and calibrated confidence UX (Sprint 05).
- Difficulty generation or playing the detected grid (Sprint 06).
- Editing, persistence, history, server processing, upload, external hosting, or raw-audio retention after worker handoff.

## Acceptance criteria

1. **Given** a song in `ready_for_analysis`, **when** the ready state is viewed, **then** an understandable Analyze beats action explains that the baseline runs locally off the main thread and keeps the preview available.
2. **Given** analysis is started, **when** the worker advances, **then** visible named progress stages and percentage are shown, cancellation is available, and a 25 ms main-thread heartbeat continues while the analysis state remains active.
3. **Given** the owned 8-second 120 BPM fixture, **when** analysis completes, **then** a schema-validated `baseline-dsp-v1` grid reports 115–125 BPM, an ordered in-range beat sequence, and no empty/duplicate/non-finite beat entries.
4. **Given** a completed result, **when** it is previewed on desktop or 412-pixel mobile, **then** tempo, beat count, analyzer version, a bounded timeline, and representative beat times are readable without horizontal escape.
5. **Given** analysis is cancelled, a worker/platform error occurs, a malformed worker result arrives, or decoded input exceeds the safe analysis budget, **when** the operation ends, **then** the UI returns to a truthful recoverable state; retryable failures can re-decode the current in-memory local selection without reload or upload, while over-budget input asks for different music and retains the preview.
6. **Given** analysis starts, completes, fails, is cancelled, is superseded, or the page closes, **when** ownership changes, **then** decoded handles, copied main-thread channel arrays, worker listeners, and worker instances are released exactly once as applicable, and stale messages cannot replace the current state.
7. **Given** the committed synthetic pulse corpus at 90, 120, and 150 BPM, **when** the deterministic analyzer runs, **then** each case reaches beat F1 ≥ 0.85 at 70 ms tolerance and tempo error ≤ 3 BPM; a 60-second case completes within 4 seconds in CI and produces identical results on replay.
8. **Given** any selected audio or beat result, **when** analysis completes or fails, **then** no raw samples, filename, object URL, file handle, or beat grid is uploaded, logged, persisted, or placed in evidence; only repository-owned synthesized input is used by CI/evidence.

## Algorithm baseline

1. Average finite channel samples to mono.
2. Resample to a bounded analysis rate with deterministic linear interpolation.
3. Compute Hann-window FFT magnitudes and positive spectral flux in low, mid, and high frequency bands.
4. Normalize the combined onset envelope and select peaks above a local adaptive threshold with minimum spacing.
5. Score tempo lags from 60–200 BPM with autocorrelation and metrical priors; retain ranked alternatives in the result contract.
6. Use dynamic programming over onset peaks to reward regular inter-beat transitions, tolerate skipped beats, choose phase, and emit an ordered grid.

The algorithm is deliberately transparent and dependency-light. Sprint 05 must compare improvements against this frozen baseline instead of silently replacing its quality definition.

## Quality and performance contract

- Beat metric: one-to-one F1 with 70 ms tolerance.
- Synthetic corpus: deterministic pulses with non-zero phase at 90, 120, and 150 BPM.
- Per-track floor: F1 0.85 and tempo error 3 BPM.
- Performance guard: 60 seconds analyzed in less than 4 seconds in the unit-test environment.
- Determinism: repeated identical input produces deeply equal versioned output.
- Browser responsiveness: at least three 25 ms main-thread heartbeat ticks while the visible analysis operation is active in production E2E.
- Memory ceiling: reject before copying when `AudioBuffer.length × numberOfChannels` exceeds 24,000,000 channel samples (about 96 MB of Float32 transfer buffers), while retaining the local preview for replacement.

## Worker protocol and ownership

- Protocol version: `1`.
- Request messages: `analyze`, `cancel` with a unique request ID.
- Response messages: `progress`, `complete`, `cancelled`, `error` with the same request ID.
- Progress stages: downmix, resample, onset envelope, tempo, beat tracking, finalization.
- The main thread validates completed results against the shared beat-grid schema before display.
- A message without a valid protocol identity is a terminal invalid result; only a well-formed response for another request is ignored as stale.
- Cancellation sends the protocol message and terminates the dedicated worker; late or wrong-request messages are ignored.
- The worker adapter is the consuming owner of the decoded handle: it checks the channel-sample budget, copies/transfers accepted channels, and releases exactly once on every path. The preview remains backed by the local object URL.

## Layer coverage

| Layer           | Delivered coverage                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| Frontend        | Analyze action, named progress/cancel, error/retry, tempo/grid preview, replace/clear integration.                 |
| Domain          | FFT/onset/tempo/tracking pipeline, deterministic corpus, metrics, duration/performance guard.                      |
| Worker boundary | Versioned messages, transferable arrays, validation, abort/terminate, stale-message filtering.                     |
| Contract        | Shared versioned beat-grid schema and invariants for ordered finite in-range beats/candidates.                     |
| CI/CD           | Unit/contract/component tests, real-worker production E2E, responsiveness check, atomic evidence capture.          |
| Privacy         | Immediate decoded-handle release, transferred arrays, no storage/network/log/evidence of private identity/content. |

## Test mapping

| Criterion | Verification                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| 1         | Component discoverability/copy assertions and production ready-state E2E.                                        |
| 2         | Protocol/adapter progress-cancel tests plus production heartbeat E2E during visible analysis.                    |
| 3         | Shared-schema tests, pure analyzer owned-fixture test, and real-worker production completion E2E.                |
| 4         | Component preview assertions plus desktop/mobile containment E2E and independent Product Review.                 |
| 5         | Identity/malformed/error/cancel/stale/budget adapter and component tests plus production cancel/retry recovery.  |
| 6         | Release/terminate/listener spies across complete/error/cancel/budget/replace/clear/unmount and stale completion. |
| 7         | Synthetic corpus F1/tempo table, deterministic replay, and bounded 60-second performance test.                   |
| 8         | Source boundary, network/storage/log guards, owned-fixture capture, and evidence-manifest checks.                |

## Evidence mapping

The exact-candidate capture records the visible ready-to-analyze state, worker progress/cancel, completed grid, stable no-onsets recovery, a full loop video, and the 412-pixel result. It verifies build identity, main-thread heartbeat, tempo range, containment, no external/write requests, no browser persistence, and no visible/logged fixture filename. Product Review alone inspected the media; Delivery imported it without opening it and Code Review remained isolated. No raw samples, object URLs, selected filenames, or beat-grid data files are evidence artifacts.

## Preview/build

- Designated preview: `http://127.0.0.1:4173` while the exact production build is served.
- External host: not required.
- Accepted candidate: `eb95113ed383d1c72c08c1ddbd39a25f644e5a1b`.
- CI/artifact: run `29791985706`, artifact `8480642300`, SHA-256 `ded305963b345d88afbdb263e9cd9db5e766c3505411a6b2f19a0a6305b6c582`.
- External publication: not performed or required.

## Known limitations

- This first baseline is optimized for clear percussive pulse structure and may choose half/double tempo or drift on expressive music; Sprint 05 measures and improves those cases.
- No downbeat or meter claim is made.
- Preparation accepts up to 10 minutes, but baseline analysis separately rejects decoded inputs above 24,000,000 channel samples before channel copying. At 48 kHz stereo that is about 4 minutes 10 seconds; lower-rate/mono tracks can be longer.
- Production automation remains desktop/mobile Chromium until later cross-engine and real-device acceptance.
- The 25 ms heartbeat and cancel E2E run during the visible analysis state; the 500 ms minimum dwell means they do not isolate active DSP time from post-worker display time.
- Runtime worker-error validation accepts the broader stable boundary-code map, although the typed worker emits only protocol-declared codes.
- The evidence set has no dedicated over-budget screenshot, and the video's final second scales the page left with gray space on the right; the full-width stills remain authoritative.

## Review status

- Product Review: PASS; no P0–P2 findings, three evidence/interaction P3 limitations.
- Code Review: PASS after remediation; no P0–P2 findings, two nonblocking P3 observations.

## Rollback

Revert the Sprint 04 commit. Sprint 03 local preparation remains accepted; no migration, server, uploaded audio, or persisted beat data requires cleanup.

## Follow-up

- Sprint 05 benchmarks higher-quality beat/downbeat variants and adds honest uncertainty/metrical-level UX against this baseline.
