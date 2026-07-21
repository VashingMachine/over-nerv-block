---
story_id: "05"
title: "Player receives downbeats and honest analysis confidence"
status: accepted
sprint: 5
implementation_commit: self
preview_url: "http://127.0.0.1:4173"
staging_url: not_applicable
automated_tests: pass
product_review: pass
code_review: pass
deployed: false
---

# Sprint 05 — High-quality beats, downbeats, and confidence

## User story

As a player, I receive a better interpreted beat grid with downbeats and an honest warning when analysis is uncertain.

## Delivered outcome

The accepted production web build preserves Sprint 04's beat timing while adding deterministic beat-synchronous accent and conservative meter inference, downbeats, bounded confidence components, ranked tempo alternatives, explicit uncertainty warnings, and baseline/fallback disclosure through the schema-validated `quality-dsp-v1` contract. Flat, near-flat, contradictory, and non-periodic metrical evidence produces an honest uncertain result with no invented downbeats. The remediated exact candidate passed CI plus isolated Product and Code re-reviews.

## Scope

### In scope

- A small pure `quality-dsp-v1` analysis interface behind the existing worker boundary.
- Worker wire protocol v2 for the breaking quality-result and metrical-progress contract, with old-version rejection.
- Agreement and explicit fallback comparison with `baseline-dsp-v1`.
- Beat-synchronous accent features, 3/4 versus 4/4 meter/phase scoring, and deterministic downbeat inference.
- Bounded tempo, beat, downbeat, agreement, and overall confidence components.
- Explicit warnings for low confidence, uncertain meter, half/double-tempo ambiguity, and baseline disagreement.
- A versioned high-quality rhythm-analysis schema with ordered beats, coherent bar positions/downbeats, ranked alternatives, warnings, and comparison metadata.
- Visible beat/downbeat distinction, meter, confidence guidance, tempo alternatives, fallback disclosure, and responsive desktop/mobile presentation.
- Same-corpus beat regression, owned 3/4 and 4/4 downbeat metrics, ambiguous/uncertain fixtures, determinism, performance, worker, component, E2E, privacy, and exact-candidate evidence.
- A dated model/runtime/license inventory explaining what was benchmark-eligible and why no external model is selected without browser evidence.

### Out of scope

- Playable chart/difficulty generation (Sprint 06), manual correction (Sprint 07), and persistence (Sprint 08).
- 2/4, 5/4, 6/8, changing meter, expressive-tempo transcription, or a claim of universal downbeat accuracy.
- Essentia.js, madmom model files, PyTorch, ONNX Runtime Web, downloaded checkpoints, server inference, upload, or external hosting.

## Acceptance criteria

1. **Given** a prepared local song, **when** the analysis action is viewed and started, **then** it truthfully describes local off-main-thread quality analysis, preserves Sprint 04 progress/cancel/recovery, and returns a schema-validated `quality-dsp-v1` result through the pure worker-facing interface.
2. **Given** the repository-owned 8-second 120 BPM 4/4 fixture, **when** quality analysis completes, **then** it reports 115–125 BPM, meter 4/4, 13 ordered beats, downbeats aligned at 1/5/9/13 beat positions, and explicit baseline agreement without fallback or a low-confidence warning.
3. **Given** the owned deterministic 3/4 and 4/4 accented synthetic corpus, **when** baseline and quality variants are benchmarked, **then** quality beat F1 is not lower than baseline beat F1 at 70 ms tolerance, downbeat F1 is at least 0.85 for each accented track, and meter is correct.
4. **Given** a half/double-tempo ambiguous candidate set or fixture, **when** the result is classified, **then** the selected tempo and ranked alternatives remain visible and a concise half/double ambiguity warning is present instead of silent certainty.
5. **Given** an accent-flat or contradictory-meter fixture, **when** downbeat evidence is weak, **then** meter is reported as uncertain, no invented downbeats/bar positions are emitted, downbeat confidence is low, and the UI explains that beat timing may still be usable.
6. **Given** any result, **when** it is validated, **then** every confidence component is finite and bounded 0–1, warnings are unique and consistent with thresholds, tempo alternatives are ranked, beat times are strictly ordered/in range, and downbeat/bar-position invariants match the declared meter.
7. **Given** quality inference agrees, is uncertain, or cannot add a meter interpretation, **when** it completes, **then** comparison metadata names the accepted baseline version, quantifies tempo/beat agreement, and truthfully identifies whether baseline timing was retained as fallback; stable baseline failure classification is preserved.
8. **Given** desktop or 412-pixel mobile output, **when** confident, ambiguous, and meter-uncertain results are viewed, **then** beats and downbeats are distinguishable without color alone; meter, confidence, alternatives, warnings, and fallback text remain readable without horizontal escape.
9. **Given** the committed 60-second quality fixture and analysis memory ceiling, **when** CI runs, **then** output is deterministic, analysis completes within 5 seconds, worker cancellation/cleanup behavior remains intact, and input above 24,000,000 decoded channel samples is still rejected before copying.
10. **Given** model/runtime candidates and any selected local song, **when** Sprint 05 ships, **then** every candidate has a recorded code/weights/data/browser/bundle decision, no unapproved dependency/model is bundled, and no audio identity/content or rhythm result is uploaded, logged, persisted, or placed in evidence.

## Selected algorithm and fallback

1. Run the accepted `baseline-dsp-v1` beat tracker through the pure analysis interface.
2. Compute deterministic beat-synchronous transient/accent energy directly from the decoded channels using bounded windows.
3. Score every phase for 3-beat and 4-beat meters from accent contrast, consistency, and separation from competing phase/meter hypotheses.
4. Accept meter/downbeats only when absolute evidence, winning margin, raw contrast, at least three complete bars, and within-bar stability exceed the frozen versioned thresholds; otherwise emit no downbeats and mark meter uncertain.
5. Classify half/double ambiguity from normalized baseline tempo alternatives near 0.5× or 2× the selected tempo.
6. Derive bounded confidence components and warnings from explicit thresholds.
7. Retain accepted baseline beat timing in this story. `fallbackUsed` means quality inference could not safely add a metrical interpretation; it never means a hidden server/model path.

This improves the user-visible rhythmic interpretation while keeping beat timing regression-measurable. Sprint 06 consumes only the versioned quality contract, never DSP internals.

## Quality contract

- Beat metric: one-to-one F1 at 70 ms tolerance, compared with the exact baseline on the same samples.
- Downbeat metric: one-to-one F1 at 90 ms tolerance.
- Accented 3/4 and 4/4 per-track downbeat floor: 0.85.
- Per-track beat rule: quality F1 must be greater than or equal to baseline F1.
- Meter rule: correct on every accented owned fixture; `null` on flat, near-flat, contradictory, and non-periodic negative fixtures.
- Tempo rule: existing 90/120/150 BPM error remains ≤ 3 BPM.
- Performance: deterministic 60 seconds below 5 seconds in the unit environment.
- Memory: the accepted 24,000,000 decoded channel-sample pre-copy ceiling remains authoritative.

## Confidence and warning contract

- Components: `tempo`, `beat`, `downbeat`, `agreement`, and `overall`, each 0–1.
- `meter_uncertain`: meter is `null`, there are no downbeats/bar positions, and downbeat confidence is below 0.55.
- `half_double_ambiguous`: a candidate near half/double tempo has normalized score at least 0.72.
- `baseline_disagreement`: tempo differs by more than 3 BPM or beat agreement falls below 0.85.
- `low_confidence`: overall confidence is below 0.6.
- Warning order is stable and duplicates are forbidden.
- All warning, relation, confidence, comparison, and meter-acceptance thresholds live in quality contract version 1 shared by the schema and analyzer.

## Layer coverage

| Layer           | Delivered coverage                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend        | Downbeat/beat legend, meter, confidence, alternatives, warnings, comparison/fallback, replace/retry, desktop/mobile containment.     |
| Domain          | Pure quality interface, accent extraction, meter/phase hypotheses, ambiguity/confidence classification, baseline comparison.         |
| Worker boundary | Protocol-v2 quality result/progress, cancellation, schema validation, consuming ownership, stale/malformed cleanup.                  |
| Contract        | Strict high-quality schema with confidence/warning/downbeat/meter/comparison invariants.                                             |
| CI/CD           | Same-corpus metrics, synthetic downbeat corpus, performance/determinism, unit/component/worker tests, production E2E/evidence.       |
| Privacy/license | No new runtime/model, documented candidate decisions, owned synthesized fixtures, no upload/log/storage/evidence of private content. |

## Test mapping

| Criterion | Verification                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1         | Pure-interface and worker protocol tests; component and real-worker production happy path.                                   |
| 2         | Owned-WAV analyzer regression and desktop/mobile production E2E with exact meter/downbeat/agreement assertions.              |
| 3         | Table-driven 3/4 and 4/4 baseline-versus-quality beat/downbeat metric suite.                                                 |
| 4         | Pure ambiguity classifier threshold tests plus an owned ambiguous fixture in component/production output.                    |
| 5         | Accent-flat and contradictory fixture tests, schema negative cases, component warning and production uncertainty journey.    |
| 6         | Shared-schema boundary/invariant matrix and deterministic warning-order tests.                                               |
| 7         | Agreement/fallback unit cases, stable baseline failures, and visible comparison assertions.                                  |
| 8         | Component semantics, desktop/mobile containment E2E, exact screenshots/video, and independent Product Review.                |
| 9         | 60-second performance/determinism, existing budget boundary regressions, cancellation/cleanup worker suite, full production. |
| 10        | Model inventory, lockfile/license checks, owned-fixture provenance, and network/storage/log/evidence guards.                 |

## Evidence mapping

Exact-candidate CI captured the ready state, visible progress/cancel path, confident 4/4 result, named downbeats, confidence/alternatives, honest uncertain-meter fallback, video journey, and 412-pixel result. The Delivery Agent imported and hash-checked the evidence without visual inspection. Product Review alone inspected all media, matched every hash, and passed the candidate. Evidence uses only repository-owned synthesized inputs and excludes selected filenames, object URLs, raw samples, and serialized rhythm results.

## Preview/build

- Designated preview: `http://127.0.0.1:4173` while the exact production build is served.
- External host: not required.
- Rejected initial candidate: `4d4818b7009744c2779d31f68b7575b93aede5a2`; CI passed, Product Review passed, separate Code Review failed.
- Remediated review candidate: `8dd0de8532eaef4bf2c7d18ce78fe96988976180`.
- Remediated CI: [Verify run 29794551355](https://github.com/VashingMachine/over-nerv-block/actions/runs/29794551355) — passed all 22 production E2E scenarios without retry.
- Remediated artifact: `8481556819`, SHA-256 `aaa26b56900c100441742df3252c90e1e18fe3251147ba875fd4b7fd666c43b9`.

## Known limitations

- Downbeat inference is limited to stable 3/4 and 4/4 accent structure; an uncertain answer is intentional for unsupported/weak evidence.
- Beat timing remains the accepted Sprint 04 DSP output in this vertical slice; quality improvement is measured through metrical interpretation, warnings, and no beat-F1 regression.
- A permissive runtime license does not make a checkpoint safe: training-data and weight rights remain separate gates.
- Browser automation remains Chromium-only until later cross-engine/real-device acceptance.

## Review status

- Remediation local automated verification: pass.
- Remediated exact-candidate CI: pass.
- Product re-review: pass; no P0–P2 findings.
- Code re-review: pass; no P0–P2 findings.

## Rollback

Revert the Sprint 05 commit. Sprint 04's accepted baseline grid remains available; there is no migration, server, model download, uploaded audio, or persisted analysis to clean up.

## Follow-up

- Sprint 06 converts only accepted quality-analysis contracts into deterministic Easy/Medium/Hard playable charts.
