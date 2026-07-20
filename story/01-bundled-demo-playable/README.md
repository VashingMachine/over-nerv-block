---
story_id: "01"
title: "Player can complete the bundled demo song"
status: accepted
sprint: 1
implementation_commit: self
preview_url: "http://127.0.0.1:4173"
staging_url: not_applicable
automated_tests: passed
product_review: passed
code_review: passed
deployed: false
---

# Sprint 01 — Bundled demo song is playable

## User story

As a player, I can start a bundled, owned demo song and press one button when notes reach the target.

## Delivered outcome

The production build now provides the first complete start-to-finish rhythm loop using an original generated pulse track, a hand-authored chart, Web Audio timing, and a Phaser note highway. Desktop and mobile players can start, follow the countdown and notes, use all three input paths, finish, replay, and recover from an audio-load failure.

## Scope

### In scope

- Original generated eight-second demo audio with documented provenance.
- Versioned song metadata and hand-authored one-lane chart.
- User-gesture audio start, three-beat countdown, note highway, target, and finish state.
- Space, canvas pointer/touch, and visible hit-button controls.
- Note positions derived only from the Web Audio clock.
- Loading/error/retry UI, production-preview E2E, and desktop/mobile evidence.

### Out of scope

- Perfect/Good/Miss judgment, score, combo, calibration, pause, and restart; Sprint 02 owns those rules.
- Local user-file selection and automatic analysis.
- External hosting or any server.

## Acceptance criteria

1. **Given** the production preview, **when** it loads, **then** the player sees the bundled demo title, provenance, controls, duration, and a clear “Start demo” action.
2. **Given** the player activates “Start demo,” **when** the audio is ready, **then** a visible three-beat countdown leads into audible playback and notes move toward the target from the audio clock.
3. **Given** gameplay is active, **when** the player presses Space, clicks/taps the canvas, or uses the hit button, **then** the target provides immediate visible feedback without adding extra lanes or scoring rules.
4. **Given** the demo runs to its end, **when** playback completes, **then** the page shows “Track complete” and offers replay.
5. **Given** audio loading/decoding fails, **when** the attempt ends, **then** the player receives a concise error and can retry.
6. **Given** desktop and mobile-width viewports, **when** the full loop is exercised, **then** the controls and highway remain readable with no horizontal scrolling.

## Layer coverage

| Layer            | Delivered coverage                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Frontend         | React demo states/controls and Phaser canvas integration.                                           |
| Worker/domain    | Audio-clock boundary and pure note-position calculations; no analysis worker yet.                   |
| Contract         | Versioned song metadata and hand-authored chart validation.                                         |
| Infrastructure   | Bundled relative static assets in the production Vite build; loopback preview only.                 |
| CI/CD            | Existing checks plus demo asset/contract tests, start-to-finish E2E, evidence, and artifact upload. |
| E2E              | Desktop/mobile start, input feedback, completion, replay, and audio-failure recovery.               |
| Security/privacy | Original repository-owned audio only; no file access, upload, telemetry, storage, or external call. |

## Test mapping

| Criterion | Verification                                                                  |
| --------- | ----------------------------------------------------------------------------- |
| 1         | Song/chart contract tests plus desktop/mobile Playwright idle assertions.     |
| 2         | Direct Web Audio clock/lifecycle tests and production countdown/playback E2E. |
| 3         | Component input tests plus keyboard/pointer/mobile production E2E actions.    |
| 4         | Production-preview start-to-finish E2E and complete-loop video.               |
| 5         | Component engine-failure/retry test and browser failed-audio recovery E2E.    |
| 6         | Desktop/mobile Playwright with horizontal-overflow assertion; Product Review. |

## Evidence mapping

Automated capture from remediated candidate `3d57f4ab0d3355ada097e57d7ea51b7317815573` served as the designated loopback production build includes desktop idle/active/completion screenshots, a complete-loop video, mobile active gameplay, and audio failure/recovery states. Product Review is intentionally the only role allowed to inspect those files.

| Criterion | Product evidence                                                      |
| --------- | --------------------------------------------------------------------- |
| 1         | `evidence/desktop-idle.png`                                           |
| 2–3       | `evidence/desktop-playing.png` and `evidence/mobile-playing.png`      |
| 4         | `evidence/desktop-complete.png` and `evidence/complete-loop.webm`     |
| 5         | `evidence/audio-unavailable.png` and `evidence/audio-recovered.png`   |
| 6         | Desktop/mobile evidence plus Product Review narrow-width use.         |
| All       | `evidence/manifest.json`, CI run `29781666671`, artifact `8476876330` |

## Preview/build

- Designated preview: `http://127.0.0.1:4173` while the production build is served for review.
- External host: not required.
- Candidate CI artifact: `sprint-01-candidate-3d57f4ab0d3355ada097e57d7ea51b7317815573` (`8476876330`), SHA-256 `155dfac4…906a1`, retained through 2026-08-19.

## Test data and provenance

The demo is generated deterministically by `scripts/generate-demo-audio.mjs` from synthesized percussion. It contains no sampled or third-party music and is dedicated to the project under CC0-1.0. The chart is hand-authored for that generated pulse.

## Known limitations

- Sprint 01 shows input feedback but intentionally does not judge timing or calculate score.
- Headless E2E verifies lifecycle and clock-driven rendering boundaries, not physical speaker/display latency.

## Review status

- Product Review: PASS in `PRODUCT_REVIEW.md`; remediated desktop/mobile and failure/recovery evidence passed all six criteria without implementation access.
- Code Review: PASS in `quality/code-reviews/01.md`; all first-review P2/P3 findings are resolved and no P0–P3 finding remains.

Finalization adds only candidate-specific story records, independent reports, and Product Review evidence to the reviewed implementation. The final atomic commit's Verify run repeats all checks with its own visible build identifier.

## Rollback

Revert the Sprint 01 commit. The accepted Sprint 00 heartbeat remains the previous complete artifact; no persistent data or migration is introduced.

## Follow-up

- Sprint 02 adds timing judgments, score, results, pause/resume/restart, and calibration.
