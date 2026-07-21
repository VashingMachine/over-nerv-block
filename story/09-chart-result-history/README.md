---
story_id: "09"
title: "Returning player can review chart-only history"
status: accepted
sprint: 9
implementation_commit: self
preview_url: "http://127.0.0.1:4173"
staging_url: not_applicable
automated_tests: pass
product_review: pass
code_review: pass
deployed: false
---

# Sprint 09 — Results and chart-only history

## User story

As a returning player, I can see recent charts and results without the application retaining my music.

## Delivered outcome

Completing a generated local chart adds one validated, audio-free chart/result entry to a bounded browser-local history. On a later visit the player can review chart facts, score, accuracy, generator/analyzer versions, and the exact note chart, then deliberately reselect and analyze the local song before playback becomes available. The player can delete one entry or clear all history. No server or external deployment is required.

## Scope

### In scope

- A strict version-one chart/result history contract and deterministic record identity.
- IndexedDB database `rhythm-game-history`, version 1, store `chart-results`, singleton key `recent`.
- Up to 20 most-recent generated local chart/result entries, newest first.
- Full generated chart notes and validated game result timing/summary, with analysis/generator/correction versions and filename-free rhythm metadata.
- Version-zero envelope migration, strict read validation, corruption rejection/deletion, and nonfatal denied-storage behavior.
- Visible retention/privacy explanation, empty/loading/migrated/discarded/unavailable states, entry deletion, and clear-all behavior.
- An explicit `Select and analyze local song again` action when history has no audio.
- Desktop and 412-pixel mobile production E2E, privacy assertions, exact evidence, CI artifact packaging, and isolated reviews.

### Out of scope

- Audio, `File`, filename, path, MIME type, file size, object/blob URL, decoded samples, worker buffers, or local selection identity in history.
- Public sharing, accounts, cross-device synchronization, cloud backups, or server APIs.
- Playing a historical chart against a newly selected file without re-analysis; deterministic regeneration must reproduce the chart before play.
- More than 20 entries, folders, tags, search, long-term archive promises, or export/import UI; a reproducibility/export plan is finalized in Sprint 13.
- PWA installation/accessibility settings, resource hardening, native packaging, and public release work from later sprints.

## Frozen history contract

### Record shape and identity

1. `chartHistoryStorageVersion` and each `entryVersion` are `1`. The current envelope kind is `chart_result_history` and each entry kind is `chart_result_history_entry`.
2. Each entry contains only: version/kind, deterministic `id`, `savedAtEpochMs`, filename-free `tempoBpm` and `meter`, one schema-valid `GeneratedRhythmChart`, and one schema-valid `GameResult`.
3. Entry ID is derived only from generated chart ID and result `playedAt`. Result `songId` and `chartId` must equal the stored chart ID. Judgments must cover every chart note exactly once, in index/time order, and the stored summary must equal the summary derived from those judgments.
4. Unknown fields at any envelope, entry, chart, note, generation/correction metadata, result, judgment, or summary depth are rejected rather than silently stripped.
5. History never contains audio or selection identity. The generated chart itself is safe deterministic metadata: notes, difficulty, duration, analyzer/generator versions, seed, generation rules, and optional correction provenance.

### Storage, retention, and migration

1. One IndexedDB document is atomically replaced under `chart-results/recent`; it contains at most 20 entries sorted by descending `savedAtEpochMs`, then ID.
2. Saving upserts by deterministic entry ID. On the 21st distinct entry the oldest entry is removed. There is no age-based expiry; data remains until the player deletes it, clears site data, or the browser evicts local storage.
3. A documented version-zero envelope containing otherwise valid filename-free entry fields migrates once by deriving version-one entry kind/ID fields and replacing the record atomically.
4. Unknown versions, malformed JSON-like values, semantic chart/result mismatch, foreign IDs, duplicate IDs, noncanonical ordering, or unknown nested fields are never rendered. The invalid singleton record is deleted when possible and reported as discarded.
5. Missing IndexedDB is the normal empty state. Open/read/write/delete denial is nonfatal and truthfully reported. A failed delete or clear does not optimistically hide data; the visible entries remain retryable.
6. `Delete entry` removes only one exact ID. `Clear chart history` removes only the singleton chart/result document. Neither action deletes the separate completed-grid checkpoint, corrections, calibration, current-tab audio, or bundled-demo latest result.

### Audio-absent return flow

1. History is visibly labeled `Chart-only history` and states that audio and filenames were never saved.
2. Each entry shows played time, difficulty, note count, BPM/meter, score, accuracy, combo, analyzer/generator versions, and correction revision when present.
3. No Start/play action is rendered from history alone. `Select and analyze local song again` opens the existing private file chooser. The selected file is not matched by filename or metadata.
4. Only a completed local re-analysis that deterministically regenerates a playable chart can enable the existing game flow; history does not bind arbitrary audio to old notes.
5. The history view remains useful and deletable if file selection, decoding, analysis, or storage fails.

## Acceptance criteria

1. **Given** a completed generated local-chart run, **when** its result is accepted, **then** one strict version-one entry is atomically added with the exact chart, deterministically coherent result, filename-free rhythm/version metadata, and no audio/selection data.
2. **Given** repeated or more than 20 valid completions, **when** history is saved, **then** deterministic upsert/order/retention rules keep at most 20 newest distinct entries without duplicate IDs.
3. **Given** valid history and no selected file, **when** the production app reloads, **then** recent chart/result facts remain reviewable, audio absence and retention are explained, and no historical Start/play action is available.
4. **Given** an audio-absent history entry, **when** the player chooses its reselect action, **then** the private local-file chooser opens and playback becomes available only after successful analysis/regeneration, never by filename matching.
5. **Given** one or several entries, **when** the player deletes one or clears all, **then** only the requested history data disappears after durable success; current checkpoint, corrections, calibration, and current-tab audio are unchanged; denied deletion remains visible and retryable.
6. **Given** version-zero history, **when** startup reads it, **then** it migrates deterministically once; given corrupt, unknown-version, foreign, incoherent, duplicate, unsorted, or unknown-field state, it is never rendered and is deleted when possible with a truthful notice.
7. **Given** missing or denied IndexedDB, **when** history reads or writes, **then** the game remains usable, current results remain visible, and the UI truthfully explains whether local history was saved.
8. **Given** desktop or 412-pixel mobile layout, **when** the player reviews several entries, reselects, deletes, and clears, **then** controls, result facts, retention/privacy copy, and next actions remain semantic, contained, and understandable without code knowledge.
9. **Given** CI/evidence capture, **when** Sprint 09 is evaluated, **then** a loopback static production build uses repository-owned audio to demonstrate completion-to-history, reload without audio, reselect/reanalysis-to-play, migration/corruption recovery, delete/clear, responsive states, and privacy; both isolated reviews pass.

## Layer coverage

| Layer          | Planned coverage                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend       | Chart-only history panel, retention/privacy explanation, result facts, reselect, delete, clear, and truthful storage states.              |
| Domain         | Deterministic entry identity, chart/result semantic validation, stable ordering/upsert, 20-entry retention, migration.                    |
| Contract       | Strict versioned history envelope and entry schemas embedding generated chart/result contracts.                                           |
| Storage        | One atomic IndexedDB singleton document with validated read/write/delete/clear and no audio identity.                                     |
| Infrastructure | Static Vite production build on loopback only; no application server, cloud database, API, or external deployment.                        |
| CI/CD          | Unit/contract/component tests, desktop/mobile production E2E, exact evidence/artifact identity, isolated Product and Code Review.         |
| Privacy        | Owned fixtures; network, UI/log, IndexedDB field, Cache Storage, service-worker, filename, audio, blob/object URL, and correction guards. |

## Test mapping

| Criterion | Planned verification                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1         | Shared schema plus store creation/read tests and generated-game completion component test with exact field allowlist/privacy guards. |
| 2         | Pure deterministic ID/upsert/order/20-entry retention and duplicate replacement tests.                                               |
| 3         | Store hydration/component tests and production reload E2E with score/chart facts and no play control.                                |
| 4         | File-chooser component assertion and production reselect/reanalysis-to-play E2E.                                                     |
| 5         | Store and UI success/denial tests proving targeted mutation and isolation from other records.                                        |
| 6         | Version-zero golden migration plus corrupt/version/identity/semantic/order/unknown-nested-field rejection/deletion tables.           |
| 7         | Open/read/write/delete denial unit/component paths and production storage-unavailable visible state.                                 |
| 8         | Semantic assertions and 1280×800 / 412×915 containment E2E/evidence.                                                                 |
| 9         | Full CI, exact build/hash manifest, owned-input privacy scan, Product Review, and Code Review.                                       |

## Accepted evidence

The accepted exact-candidate packet contains 11 hashed media artifacts plus its manifest, produced with repository-owned synthesized audio. It demonstrates a completed result saved to chart-only history, reload with no audio or historical play action, explicit reselect before analysis, re-analysis restoring the normal play path, version-zero migration, targeted delete, clear-all, unknown nested-state discard, unavailable-storage fallback, and a contained 412-pixel mobile history. The short video connects completion → return → reselect/re-analysis → migration/delete/clear/corruption recovery. The Delivery Agent verified only inventory, hashes, byte sizes, build identity, automated assertions, and video stream metadata. The isolated Product Reviewer independently inspected all media and passed all nine criteria.

## Preview/build

- Required preview: exact static production build at `http://127.0.0.1:4173`.
- External deployment: not required and not an acceptance gate.
- Reviewed candidate: `bf7151ea94c9f2ef3decc6638382256e45c57b30`.
- Exact CI run: `29811994171`, passed.
- Artifact ID/name: `8487880383` / `sprint-09-candidate-bf7151ea94c9f2ef3decc6638382256e45c57b30`.
- Artifact digest: `sha256:8e18c67d1ff728002b0013381687811ac76ad9d82b7eb2cc0e07ac8657037f55`.
- Evidence manifest SHA-256: `a89bbcc3ea55e3e8a04c397a37b7affc9532571b55b375f0a287486652d21737`.
- Downloaded exact-artifact smoke: 4/4 pass on loopback.

## Rollback

Revert the atomic Sprint 09 commit to restore Sprint 08. Delete IndexedDB database `rhythm-game-history` or `chart-results/recent` if history cleanup is desired. No server, upload, remote database, cloud resource, or public deployment requires rollback.

## Review status

- Automated verification: PASS; 302 unit/contract/component tests, zero-vulnerability audit, and 44 desktop/mobile production E2E scenarios.
- Product Review: PASS for exact candidate `bf7151ea94c9f2ef3decc6638382256e45c57b30`; all nine criteria pass with no P0-P2 finding.
- Code Review: PASS after both preliminary P2 findings and the locale-ordering P3 were resolved; no P0-P2 finding remains.

## Known limitations

- History contains at most 20 generated local chart/result entries and makes no indefinite-retention promise.
- Historical playback always requires local file selection and deterministic re-analysis; the application cannot prove song identity from a filename and will not try.
- Browser automation remains Chromium desktop/mobile until Sprint 10 browser/accessibility hardening.
