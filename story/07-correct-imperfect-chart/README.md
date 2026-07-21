---
story_id: "07"
title: "Player can correct an imperfect automatic chart"
status: accepted
sprint: 7
implementation_commit: self
preview_url: "http://127.0.0.1:4173"
staging_url: not_applicable
automated_tests: pass
product_review: pass
code_review: pass
deployed: false
---

# Sprint 07 — Correct an imperfect chart

## User story

As a player, I can correct common automatic-analysis errors without understanding the analyzer, then regenerate and play every difficulty from the corrected rhythm.

## Delivered outcome

After local analysis, the player can open a correction workspace, compare the original and working grids, apply safe musical corrections, undo or reset them, and immediately regenerate Easy, Medium, and Hard. Corrections survive a reload only after the same song is privately selected and analyzed again. The original analyzer result remains immutable. Only a compact versioned correction document is stored; audio, filename, object URL, samples, model output, generated charts, and results are not stored by this story. No server or external deployment is required.

## Scope

### In scope

- Global beat-grid offset in explicit millisecond increments.
- Half-tempo and double-tempo reinterpretation with bounds and visible before/after BPM.
- Explicit 3/4 or 4/4 meter selection and a selected beat as the first downbeat.
- Tap tempo/phase from three to sixteen monotonically increasing taps against the local preview clock.
- Add a beat at an explicit local-song time and remove a selected beat while retaining at least two beats.
- One-step undo for every committed correction, complete reset to the immutable analyzer result, and an operation history.
- A versioned correction document containing only source-analysis fingerprint, editor/contract versions, revision, and bounded operations.
- Deterministic migration of the documented legacy version-zero correction envelope.
- Automatic save/load by analysis fingerprint, truthful recovery messaging, and corruption/storage-denial fallback.
- Regeneration and full play/results flow for all three difficulties from the corrected grid.
- Desktop and 412-pixel mobile UI, production-preview E2E, privacy guards, exact evidence, and isolated reviews.

### Out of scope

- Persisting audio, filenames, object URLs, decoded samples, original analysis, corrected grids, generated charts, or results.
- Resuming without reselecting the local song; explicit checkpoint/recovery UX belongs to Sprint 08.
- Chart/result history (Sprint 09), multiple lanes, freeform off-grid chart-note editing, waveform editing, server analysis, uploads, cloud services, and external hosting.

## Frozen correction contract

### Identity and storage

1. `correction-editor-v1` and correction contract version `1` are immutable identifiers.
2. The source fingerprint is a deterministic filename-free hash of the complete schema-valid `quality-dsp-v1` analysis. Equal parsed analyses have equal fingerprints; any beat, meter, tempo, confidence, or duration change changes the fingerprint.
3. The persisted document contains `storageVersion: 1`, kind, editor/contract versions, source fingerprint, original analyzer version, revision, and operations only. It never embeds the original or corrected analysis.
4. Revision equals operation count. Operations are ordered, deterministic, schema bounded, and capped at 256.
5. Storage uses one namespaced key per source fingerprint. Invalid, foreign, or corrupt data is discarded without blocking correction. Storage denial keeps the in-memory correction usable and shows a nonfatal message.
6. A documented version-zero envelope with the same bounded operation vocabulary migrates once to version one; unknown versions are rejected and removed.

### Operations and projection

1. `offset` adds an integer -1000…1000 milliseconds to every current beat. The operation is rejected if any beat would leave `[0, duration]`.
2. `tempo_scale` accepts only `0.5` or `2`. Half tempo keeps deterministic alternating anchors; double tempo inserts one midpoint between each adjacent beat. Resulting BPM must remain 40…240 and at least two beats must remain.
3. `set_meter` accepts only 3 or 4. `first_downbeat` references an existing beat time. Metered positions are recalculated cyclically and the chosen beat is position one.
4. `tap_grid` contains 3…16 strictly increasing preview times. Median adjacent interval determines tempo and the first tap determines phase. A complete in-bounds grid is projected across the track; when meter is known the first tap is the downbeat anchor.
5. `add_beat` inserts one finite in-bounds time at least 10 milliseconds from an existing beat. `remove_beat` references an existing beat time and cannot reduce the grid below two beats.
6. Every projection is deterministic, strictly ordered, duplicate-free, duration-bounded, and schema-valid. Added/tapped/interpolated beats use explicit safe salience; untouched detected strengths remain unchanged.
7. Meter labels are recalculated after structural edits. The original analysis object is never mutated.
8. Invalid operations return a stable recoverable reason and do not change revision, history, storage, or generated charts.

### Undo, reset, reload, and generation

1. Undo removes exactly the newest operation and recomputes from the immutable original analysis; it never inversely mutates the current grid.
2. Reset removes all operations and persisted correction data and restores byte-equivalent original rhythm data.
3. Reload without a selected file explains that music must be selected again. Reselecting and reanalyzing the same deterministic owned input restores the matching correction by fingerprint.
4. A different analysis fingerprint cannot receive another song's corrections.
5. Every accepted revision regenerates all three difficulty charts. Generated identity includes the corrected projection and records correction editor/contract/fingerprint/revision provenance.
6. Starting a corrected difficulty uses the accepted single playback owner, audio clock, keyboard/click/tap controls, pause/resume/restart, scoring, and results path.

## Acceptance criteria

1. **Given** a valid quality analysis, **when** the editor opens, **then** the original result remains unchanged and the working grid initially matches it byte for byte while editor, contract, fingerprint, revision, persistence status, tempo, meter, beat count, and correction count are visible.
2. **Given** a working grid, **when** valid global offset, half/double tempo, meter, first-downbeat, tap-grid, add-beat, or remove-beat operations are committed, **then** each produces the frozen deterministic projection, increments revision once, appears in history, persists only the correction document, and regenerates all difficulties.
3. **Given** an invalid offset, tempo bound, tap set, duplicate add, missing removal/downbeat, or fewer-than-two-beat result, **when** the player submits it, **then** a stable actionable error appears and grid/revision/history/storage remain unchanged.
4. **Given** multiple corrections, **when** Undo is selected repeatedly, **then** exactly one newest operation is removed per action and every intermediate grid/chart identity is reproduced; Reset returns to the original and deletes stored corrections.
5. **Given** a saved correction, **when** the app reloads, **then** it retains no audio and asks for re-selection; reselecting/reanalyzing the same owned song restores the correction, while a different analysis does not. Version-zero data migrates; corrupt/foreign data is safely discarded; denied storage is nonfatal.
6. **Given** a corrected grid, **when** the player compares Easy, Medium, and Hard, **then** all three reflect the corrected timing, remain nested/playable, expose correction provenance, and receive identities distinct from the uncorrected charts.
7. **Given** a selected corrected difficulty, **when** the player starts it, **then** the same private local audio completes through countdown, one-button input, pause/resume/restart, scoring, results, retry, and exclusive playback ownership.
8. **Given** the correction workspace on desktop or 412-pixel mobile, **when** the player edits a deliberately wrong fixture, **then** controls, validation, original-versus-working facts, timeline, history, save state, and play action remain understandable and contained.
9. **Given** CI/evidence capture, **when** Sprint 07 is evaluated, **then** the production build is loopback-only; owned audio demonstrates wrong-grid → correction → regenerated play/results → reload/reselect restore; no private filename/audio/content/model result/chart/result is persisted or transmitted; and exact artifacts pass isolated Product and Code Review.

## Layer coverage

| Layer          | Delivered coverage                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Frontend       | Correction workspace, controls, validation, comparison, history, persistence status, corrected difficulty picker/game.            |
| Domain         | Pure fingerprint, operation validation, deterministic replay/projection, undo/reset, tap-grid, meter relabeling, provenance.      |
| Contract       | Versioned correction document/operations, corrected-analysis projection, generated-chart correction provenance, invariants.       |
| Storage        | Namespaced local correction documents only; migration, isolation, corrupt/foreign/denied cleanup; no audio or analysis snapshots. |
| Infrastructure | Static Vite production build on `127.0.0.1`; no server, database, cloud runtime, or required external host.                       |
| CI/CD          | 244 unit/contract/component tests, 36 production E2E scenarios, exact loopback evidence/artifact, and isolated reviews.           |
| Privacy        | Owned fixture in CI; network, filename, storage, cache, IndexedDB, service-worker, and artifact-content guards.                   |

## Test mapping

| Criterion | Delivered verification                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1         | Immutability/fingerprint golden tests plus initial component facts and storage-empty case.                              |
| 2         | Table-driven operation golden tests, schema round trips, component interactions, and chart regeneration assertions.     |
| 3         | Negative domain/schema table plus component no-change/no-write assertions.                                              |
| 4         | Replay/undo/reset sequences, byte-equivalent restoration, storage deletion, and chart-ID history assertions.            |
| 5         | Current/legacy/corrupt/foreign/denied store tests and production reload/reselect/different-input E2E.                   |
| 6         | Generated contract cases plus exact corrected counts/times/nesting/identity component and production E2E checks.        |
| 7         | Generic game regressions and corrected select-to-results production E2E including exclusive playback.                   |
| 8         | Semantic component tests, 1280×800 and 412×915 containment E2E/screenshots, deliberately wrong fixture Product Review.  |
| 9         | Request/storage/log privacy guards, exact manifest hashes/build ID, CI artifact identity, and both independent reviews. |

## Evidence mapping

The accepted exact-candidate packet contains 26 hashed media artifacts plus its manifest. It demonstrates repository-owned input only: original grid state; representative invalid offset/tap/duplicate/tempo/minimum-beat states with unchanged revision; a known 20 ms fixture correction; half-tempo, meter/downbeat/add-remove/tap revisions; repeated undo and reset; corrected Easy/Medium/Hard; corrected pause/resume/restart and results; mobile workspace; reload with no audio; same-input restore; two simultaneously isolated per-fingerprint documents plus return-to-original restore; and migrated/corrupt/foreign/denied-storage recovery. The Delivery Agent verified names, byte sizes, manifest identity, and hashes programmatically without viewing media or the visible site. The isolated Product Reviewer inspected the packet and passed all nine criteria.

## Preview/build

- Required preview: production build at `http://127.0.0.1:4173`.
- External deployment: not required and not planned.
- Local production-preview dry run: pass with build identifier `sprint07-local-candidate`.
- Expanded black-box evidence dry run: pass with build identifier `sprint07-remediation-local`.
- Accepted reviewed candidate: `bd23829fe1f1831e97d19c6f87cee4e59afb0f52`.
- CI run: `29802543942`, passed.
- CI artifact: `8484302524`, digest `sha256:69ff94b6bf3b157ed56c3c49bd49ac7dbc4a9be370ad4f023474c4142ccf78ac`.
- Evidence manifest SHA-256: `771775f7aa9542629b2f2cebfdeebdb05a540efec270f495708044eb0e13698f`.

## Known limitations

- Corrections are beat-grid operations, not freeform note-chart authoring.
- Reload restoration requires the user to reselect and reanalyze the local file; no music is retained.
- Tap accuracy depends on the user's device/audio latency; Sprint 07 records raw preview-clock taps and does not add a second latency model.
- Browser automation remains Chromium-based until later cross-browser/device hardening.
- In React Strict Mode development, render-time storage migration/cleanup can suppress a one-time migrated/discarded status on a second render; the stored correction and production build remain correct.
- The complete mobile analysis/editor/chart page is vertically long, though the accepted 412-pixel layout remains contained and usable.

## Review status

- Automated verification: pass locally and in exact-candidate CI.
- Product Review: PASS for `bd23829fe1f1831e97d19c6f87cee4e59afb0f52`; all nine criteria pass and no P0-P2 finding remains.
- Code Review: PASS for `bd23829fe1f1831e97d19c6f87cee4e59afb0f52`; no unresolved P0-P2 finding remains.

## Rollback

Revert the Sprint 07 atomic commit. Sprint 06 automatic difficulties remain available. Remove only the namespaced correction-document keys; there is no server, remote data, audio cache, or external deployment to clean up.

## Follow-up

- Sprint 08 adds durable analysis checkpoints and explicit refresh/recovery workflow.
