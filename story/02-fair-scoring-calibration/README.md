---
story_id: "02"
title: "Player receives fair timing judgments and can calibrate"
status: accepted
sprint: 2
implementation_commit: self
preview_url: "http://127.0.0.1:4173"
staging_url: not_applicable
automated_tests: passed_candidate
product_review: passed
code_review: passed
deployed: false
---

# Sprint 02 — Fair scoring and device calibration

## User story

As a player, I receive fair Perfect/Good/Miss judgments and can calibrate my device.

## Delivered outcome

Accepted. The bundled demo is now a complete scored session with deterministic timing rules, transport controls, calibration, derived results, and validated local result metadata.

## Scope

### In scope

- One source of truth for Perfect, Good, and Miss windows.
- Score, current/max combo, note judgments, and deterministic result summary.
- Device-offset calibration saved locally and applied exactly once to input time.
- Pause, resume, restart, finish, and clean retry lifecycle.
- Visibility-loss safety and user-visible recovery when audio resume fails.
- Latest result metadata persisted from immutable judgment records, never UI counters.
- Desktop/mobile production E2E and evidence for calibration, good play, misses, pause, results, and retry.

### Out of scope

- User-selected music, automatic beat analysis, multiple lanes, accounts, leaderboards, telemetry, or external hosting.
- Physical latency certification across real devices; Product Review records the device/browser paths actually exercised.

## Acceptance criteria

1. **Given** the settings control, **when** a player sets and saves a device offset, **then** the value survives reload, is visibly explained, and is applied exactly once to later judgments.
2. **Given** an active chart, **when** input lands immediately before, at, or after each timing boundary, **then** the deterministic domain assigns the specified Perfect/Good/Miss result and updates score/combo once.
3. **Given** a note receives no input, **when** its Good window expires, **then** it becomes Miss; delayed or dropped render frames do not change the result.
4. **Given** gameplay is active, **when** the player pauses, resumes, or restarts, **then** pause freezes the song clock, resume continues from the same position, and restart creates a clean zero-score session.
5. **Given** the song completes, **when** results appear, **then** counts, score, accuracy, and max combo are re-derived from judgment records, the latest result metadata is validated before local persistence, and retry begins cleanly.
6. **Given** the page becomes hidden or audio cannot resume, **when** gameplay would otherwise continue unsafely, **then** play pauses or a concise recoverable error is shown.
7. **Given** desktop and 412-pixel mobile viewports, **when** calibration, active scoring, pause, and results are used, **then** all controls remain readable at the natural horizontal origin.

## Scoring rules

- Perfect: absolute calibrated offset `<= 50 ms`; `1000` points.
- Good: absolute calibrated offset `> 50 ms` and `<= 120 ms`; `500` points.
- Miss: no input before `120 ms` after the note; `0` points.
- Perfect/Good increments combo; Miss resets it.
- Inputs outside every open window do not mutate judgment records or score.
- Positive calibration offset means the observed device input is late; it is subtracted once from the raw audio-clock input time.

## Layer coverage

| Layer            | Delivered coverage                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Frontend         | Judgment feedback, score/combo, transport controls, calibration dialog, results, previous-result hint. |
| Domain           | Pure boundary judgment, miss collection, combo/score/accuracy summary, calibration application.        |
| Audio boundary   | Pause/resume semantics, frozen song time, disposal/restart, resume error.                              |
| Contract/storage | Versioned judgment/result schemas and validated calibration/latest-result local-storage adapters.      |
| CI/CD            | Existing checks plus scoring/audio/storage tests, production E2E, evidence, and artifact upload.       |
| Security/privacy | Only numeric offset and chart/result metadata persist; no audio, filename, object URL, or telemetry.   |

## Test mapping

| Criterion | Verification                                                                                |
| --------- | ------------------------------------------------------------------------------------------- |
| 1         | Calibration adapter/component reload tests and production reload E2E.                       |
| 2         | Table-driven boundary tests plus observable production input scenario.                      |
| 3         | Fake audio-clock/dropped-frame miss tests and browser completion with misses.               |
| 4         | Fake AudioContext pause/resume tests, component restart test, and production transport E2E. |
| 5         | Summary/property tests, persistence validation tests, completion/retry E2E.                 |
| 6         | Visibility component test and injected audio-resume failure/recovery test.                  |
| 7         | Active desktop/mobile containment checks plus Product Review.                               |

## Evidence mapping

Final calibration-safe CI produced calibration, active judgment, live Miss feedback, paused, results, retry, mobile, failure/recovery, and complete-loop artifacts. Product Review alone inspects those visual artifacts.

## Preview/build

- Designated preview: `http://127.0.0.1:4173` while the production build is served for review.
- External host: not required.
- Candidate build: `ca49be416bb60e32c2451eb1755fff4dc29f53e3`.
- Candidate CI: [Verify run 29786997949](https://github.com/VashingMachine/over-nerv-block/actions/runs/29786997949) — passed.
- Candidate artifact: `8478854090`, SHA-256 `e3c68b0882be88bc9233c6c6e6f44c39704d2c068d56a4c4a57a70557bc7d3d6`.

## Test data and provenance

Sprint 02 continues to use the original deterministic `Circuit Pulse` WAV and hand-authored one-lane chart from Sprint 01. No third-party or selected user music is introduced.

## Known limitations

- Automated timing proves audio-clock math and browser event handling, not speaker/display/Bluetooth latency.
- Calibration is a transparent manual device-offset control in this sprint; guided tap estimation can be added only if Product Review shows it is needed.

## Review status

- Product Review: PASS on `ca49be416bb60e32c2451eb1755fff4dc29f53e3`; no P0-P3 product findings.
- Code Review: PASS on the same candidate; all prior findings resolved and no P0-P3 remains.

## Rollback

Revert the Sprint 02 commit. Sprint 01 remains a playable unscored demo, and versioned Sprint 02 local records can be ignored safely.

## Follow-up

- Sprint 03 adds private local audio selection without uploading or persisting the file.
