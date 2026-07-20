---
story_id: "03"
title: "Player privately prepares a local song"
status: accepted
sprint: 3
implementation_commit: self
preview_url: "http://127.0.0.1:4173"
staging_url: not_applicable
automated_tests: pass
product_review: pass
code_review: pass
deployed: false
---

# Sprint 03 — Private local audio selection

## User story

As a player, I can select a supported music file, understand validation errors, and prepare it for analysis without uploading it.

## Delivered outcome

The production web build now provides an isolated browser-local selection and decode path that ends at `ready_for_analysis`; it does not detect beats yet. Validation, progress, cancellation, corrupt-audio recovery, preview, replacement, clear, and deterministic resource release are included without a server or raw-audio persistence.

## Scope

### In scope

- A discoverable local-audio picker with format, 25 MB, and 10-minute guidance.
- Browser capability checks and an isolated Web Audio decode boundary.
- Visible validation, local-read/decode progress, cancellation, failure, retry, replacement, and clear states.
- A ready summary and local preview without displaying or logging the private filename.
- Deterministic cleanup of object URLs and decoded sample buffers on replace, cancel, clear, unmount, and stale completion.
- Production desktop/mobile tests proving valid, corrupt, unsupported, empty, and oversized behavior without upload or persistence.

### Out of scope

- Beat detection, Web Workers, beat-grid persistence, chart generation, selected-audio persistence, upload, accounts, sharing, or external hosting.
- Guaranteed support for every codec: the browser's `decodeAudioData` result is authoritative after safe pre-validation.

## Acceptance criteria

1. **Given** the local-music panel, **when** it is viewed, **then** supported-format guidance, the 25 MB/10-minute limits, and a clear browser-local/no-upload/no-save explanation are visible before selection.
2. **Given** an empty, oversized, unsupported-extension, or non-audio file, **when** it is selected, **then** it is rejected before decode with a concise recoverable message that does not expose its filename.
3. **Given** a supported valid file, **when** it is selected, **then** local read/decode progress is visible, cancellation is available, and success reaches `ready_for_analysis` with duration/size/audio facts and a local preview.
4. **Given** corrupt audio or decoded duration beyond 10 minutes, **when** decoding/validation fails, **then** the user sees a stable error and can choose another file without reloading.
5. **Given** an active or ready selection, **when** it is cancelled, replaced, cleared, superseded by stale work, or the component closes, **then** its reader/context work, object URL, and decoded sample buffer are released exactly once as applicable.
6. **Given** any selected file, **when** the flow completes or fails, **then** no audio bytes, filename, object URL, or file handle are uploaded, persisted, logged, or included in story evidence.
7. **Given** desktop and 412-pixel mobile viewports, **when** idle, progress, error, and ready states are used, **then** all private-audio controls remain readable and operable at the natural horizontal origin.

## Data and privacy rules

- Maximum input size: `25 MiB` (`26,214,400` bytes).
- Maximum decoded duration: `600 seconds`.
- Pre-validated extensions: WAV, MP3, M4A, AAC, OGG, Opus, FLAC, and WebM; actual codec support remains browser-dependent.
- Raw bytes and decoded samples remain in the current tab's memory only while the current selection is active.
- No application-controlled request may transmit selected bytes.
- No localStorage, IndexedDB, Cache Storage, service worker, telemetry, or application log may receive selected-audio identity or content.

## Layer coverage

| Layer            | Planned coverage                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Frontend         | Picker, privacy/limit guidance, progress/cancel, error/retry, ready preview, replace, and clear.     |
| Domain           | File extension/MIME/size/empty policy and decoded-duration validation.                               |
| Browser boundary | Abort-aware local stream read, isolated AudioContext decode, disposable decoded-audio handle.        |
| Contract/state   | Explicit idle/reading/decoding/ready/error outcome; no raw-audio persistence contract is introduced. |
| CI/CD            | Unit/component tests, production E2E for five file classes, evidence capture, and artifact upload.   |
| Security/privacy | Filename-free UI/errors, no upload/write requests, no persistence, deterministic URL/buffer cleanup. |

## Test mapping

| Criterion | Planned verification                                                                                |
| --------- | --------------------------------------------------------------------------------------------------- |
| 1         | Component copy assertions plus desktop/mobile production idle checks.                               |
| 2         | Table-driven policy tests and production E2E for unsupported, empty, and oversized files.           |
| 3         | Decode-boundary/component progress/cancel tests and production valid-WAV ready flow.                |
| 4         | Injected corrupt/excessive-duration tests and production corrupt-WAV retry flow.                    |
| 5         | Deferred/stale component tests with release/revoke spies plus clear/replace production flow.        |
| 6         | Storage/log/network guards in unit and production E2E; evidence script uses only the owned fixture. |
| 7         | Explicit containment checks in desktop/mobile E2E and independent Product Review.                   |

## Evidence mapping

The CI candidate capture records idle privacy guidance, local progress/cancel, validation error/retry, ready preview/clear, and mobile containment. Product Review alone will inspect those artifacts and the loopback preview. Capture uses only the repository-owned synthesized WAV and generic filenames; automated guards reject visible/logged names, write requests, or browser persistence.

## Preview/build

- Designated preview: `http://127.0.0.1:4173` while the exact production build is served.
- External host: not required.
- Accepted candidate: `e580cf56f147dce014356630beba3115d4c9ee79`.
- CI/artifact: run `29789371401`, artifact `8479684433`, SHA-256 `1dba7a025517760a69b0d133df1de9dff021e103b421d9d8a507d0efa787d951`.
- External publication: not performed or required.

## Known limitations

- Browser codec support varies; safe pre-validation cannot promise the browser will decode a nominally supported container.
- Automated production-browser coverage currently targets desktop and 412-pixel mobile Chromium. Cross-engine and physical-device acceptance remain required before public mobile/browser-support claims.
- The product-evidence video's later frames contain a gray right half; exact-candidate full-width stills remain the authoritative static visual evidence.
- The 25 MB/10-minute defaults are intentionally conservative and may be revised only from later memory/performance evidence.
- Successful preparation does not imply beat quality; analysis begins in Sprint 04.

## Review status

- Product Review: PASS; no P0–P2 findings, one nonblocking evidence-video P3.
- Code Review: PASS; no P0–P2 findings, one nonblocking Chromium-only coverage P3.

## Rollback

Revert the Sprint 03 commit. Sprint 02 scoring remains accepted; no migration, server, database, uploaded audio, or persistent raw data requires cleanup.

## Follow-up

- Sprint 04 consumes the disposable decoded-audio handle in a Web Worker and produces a versioned baseline beat grid.
