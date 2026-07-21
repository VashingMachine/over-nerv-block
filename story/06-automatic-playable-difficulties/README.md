---
story_id: "06"
title: "Player can choose and play an automatically generated difficulty"
status: accepted
sprint: 6
implementation_commit: self
preview_url: "http://127.0.0.1:4173"
staging_url: not_applicable
automated_tests: pass
product_review: pass
code_review: pass
deployed: false
---

# Sprint 06 — Automatic playable difficulties

## User story

As a player, I can choose Easy, Medium, or Hard and play an automatically generated one-button chart for my selected song.

## Delivered outcome

After privately choosing and analyzing a local song, the player sees three deterministic difficulty cards, selects one, and starts the same audio through the accepted audio-clock gameplay path. The owned 8-second fixture produces 4-note Easy, 7-note Medium, and 13-note Hard charts. Every chart records the analyzer and generator versions and is generated entirely in the browser. Unsafe short input produces a clear recoverable state with no play action. No server or external deployment is part of this story.

## Scope

### In scope

- A pure, deterministic `difficulty-generator-v1` that consumes only the accepted `quality-dsp-v1` contract.
- Versioned generated-chart contracts containing difficulty, seed, analyzer version, generator version, and generation statistics.
- Easy, Medium, and Hard selection using beat/downbeat position plus onset salience.
- Nested difficulty output: every Easy note also appears in Medium, and every Medium note also appears in Hard.
- Guards for intro/outro, quiet beats, minimum spacing, maximum density, confidence, duplicates, ordering, and duration bounds.
- A recoverable visible state when fewer than two safe notes can be generated.
- A responsive difficulty picker and full local-file → analysis → difficulty → audio-clock gameplay → results path.
- Unit, contract, component, real-worker production-preview E2E, privacy, and evidence coverage for all three difficulties.

### Out of scope

- Manual correction (Sprint 07), recovery checkpoints (Sprint 08), chart history (Sprint 09), PWA/mobile packaging, multiple lanes, arbitrary off-grid notes, server analysis, uploads, cloud services, and external hosting.

## Frozen generation rules

1. The input is a schema-valid `quality-dsp-v1` analysis; DSP internals and raw audio are not visible to the generator.
2. The fixed seed is recorded. Version 1 uses no randomness, so equal input, generator version, and seed produce byte-equivalent charts.
3. Candidate beats must be finite, inside the song, at least 0.50 seconds after its start, at least 0.25 seconds before its end, and strong enough for the selected tier. This suppresses intro/outro and quiet-region floods.
4. Easy prefers accepted downbeats; when meter is uncertain it uses every fourth beat. Medium adds alternating beats. Hard considers every beat. Onset strength controls whether each candidate is safe and records non-downbeat salient selections as `onset` sources.
5. Easy, Medium, and Hard enforce respective minimum spacing of 0.90, 0.45, and 0.24 seconds. Their maximum densities are 48, 96, and 180 notes per minute. The tighter of spacing and density wins.
6. Low overall confidence increases salience thresholds and prevents weak-beat promotion. Accepted notes remain nested across difficulties.
7. Notes are one-lane, strictly ordered, unique, within duration, and valid under the same base chart schema and scoring rules as the bundled demo.
8. If any difficulty cannot contain at least two safe notes, generation fails as `insufficient_safe_beats`; the UI explains that another song or a corrected analysis is needed and does not offer a broken play action.

## Acceptance criteria

1. **Given** a schema-valid quality analysis, **when** charts are generated twice with the same fixed seed, **then** all three outputs are deeply equal and record `quality-dsp-v1`, `difficulty-generator-v1`, the seed, schema version, and selected difficulty.
2. **Given** the owned 8-second 120 BPM 4/4 track, **when** generation completes, **then** Easy, Medium, and Hard are all available, have strictly increasing note counts, and preserve Easy ⊆ Medium ⊆ Hard.
3. **Given** any generated chart, **when** it is validated, **then** notes are one-lane, ordered, unique, inside duration, outside intro/outro guards, no closer than the tier spacing, no denser than the tier limit, and accepted by the shared playable-chart schema.
4. **Given** downbeats, beat positions, and varied onset strength, **when** each tier is generated, **then** Easy favors safe downbeats, Medium adds safe alternating beats, Hard adds safe remaining beats, and note sources truthfully identify downbeat, beat, or onset selection.
5. **Given** low-confidence, quiet, short, or sparse input, **when** generation runs, **then** weak candidates are not promoted; either conservative valid charts result or a stable recoverable `insufficient_safe_beats` error is shown.
6. **Given** a prepared local song with completed analysis, **when** the player selects any difficulty, **then** its selected state, note count, density, spacing, analyzer version, and generator version are visible and readable on desktop and 412-pixel mobile layouts.
7. **Given** a selected generated difficulty, **when** the player starts it, **then** the selected local audio, selected chart, countdown, one-button controls, audio-clock timing, pause/resume/restart, scoring, and results complete through the production path.
8. **Given** the player replaces, clears, cancels, or leaves the selected audio, **when** the generated path is torn down, **then** gameplay stops and the decoded samples/object URL remain subject to the accepted private local-audio lifecycle.
9. **Given** production CI and evidence capture, **when** Sprint 06 is evaluated, **then** the built app is served only on loopback, all three difficulties are evidenced with repository-owned audio, no private filename/content/result is leaked, and no application-controlled upload occurs.

## Layer coverage

| Layer          | Delivered coverage                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Frontend       | Responsive difficulty cards, selected-chart facts/timeline, safe-generation error, and local generated gameplay/results. |
| Domain         | Pure deterministic nested chart generator with salience, confidence, spacing, density, and boundary guards.              |
| Worker         | Reuses the accepted real `quality-dsp-v1` worker result; the generator has no access to raw audio.                       |
| Contract       | Generated-chart schema plus analyzer/generator identity, seed, difficulty, rules, and cross-field invariants.            |
| Infrastructure | Static Vite production build served on `127.0.0.1`; no server and no required external host.                             |
| CI/CD          | Static checks, 200 unit/contract/component tests, 30 production E2E scenarios, and loopback evidence capture.            |
| Privacy        | Repository-owned WAV only in CI; no selected filename, samples, object URL, chart/result persistence, or upload.         |

## Test mapping

| Criterion | Planned verification                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------- |
| 1         | Golden fixture, deterministic replay, schema identity positive/negative tests.                          |
| 2         | Owned analysis golden test plus component and production E2E count/containment assertions.              |
| 3         | Table/property-style invariant tests across tempos, meters, durations, strengths, and every difficulty. |
| 4         | Hand-authored accent/downbeat fixtures and exact source-selection assertions.                           |
| 5         | Low-confidence, quiet, boundary, sparse, and explicit failure unit/component/E2E cases.                 |
| 6         | Component semantics, desktop/mobile production E2E, screenshots, and black-box Product Review.          |
| 7         | Generic gameplay component tests and production local-file select-to-results E2E using the owned WAV.   |
| 8         | Component teardown/resource tests and existing private-audio lifecycle regressions.                     |
| 9         | Network/storage/log guards, evidence manifest hashes, CI production build, and isolated Product Review. |

## Evidence mapping

The exact-candidate capture contains desktop Easy, Medium, Hard, active-play, results, and insufficient-rhythm images; a mobile Medium image; and a local-file-to-results video that exercises pause, resume, and restart. It was imported from CI by hash without Delivery Agent visual inspection. Only the Product Reviewer inspected final evidence.

## Preview/build

- Required preview: production build served at `http://127.0.0.1:4173`.
- External deployment: not required and not planned.
- Local production-preview dry run: pass with build identifier `sprint06-local`.
- Accepted reviewed candidate: `3cd1387fc32d36025a4f703bed2e52feca755667`.
- CI run: `29799023098`, passed.
- CI artifact: `8483094202`, digest `sha256:7b3ff2ffd569d8e49cd938818247f22f4fa126bd76e28470f6e9103158a7d7a4`.
- Evidence manifest SHA-256: `40a67ab7985e51f1062523f55f7a3a00adceb6ccb38f47d10fcbeb3f36ddd64b`.

## Known limitations

- Version 1 places notes only on accepted detected beats; arbitrary syncopated off-grid onset notes are not introduced.
- Musical usefulness is automatable only in part and requires isolated black-box Product Review.
- Browser automation remains Chromium-based until later cross-browser and device hardening stories.

## Review status

- Automated verification: pass locally and in exact-candidate CI.
- Product Review: PASS for `3cd1387fc32d36025a4f703bed2e52feca755667`; no unresolved P0-P2 findings.
- Code Review: PASS for `3cd1387fc32d36025a4f703bed2e52feca755667`; all earlier findings are resolved and no unresolved P0-P2 finding remains.

## Rollback

Revert the Sprint 06 atomic commit. The accepted Sprint 05 analysis view and bundled demo remain available; there is no server, remote data, or persisted generated chart to clean up.

## Follow-up

- Sprint 07 corrects accepted beat/downbeat grids before generation.
