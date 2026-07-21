# Sprint 05 test evidence

Status: accepted after local and exact-candidate CI verification plus independent Product and Code re-reviews.

## Local verification

Run on 2026-07-21 against the production build:

- `npm run verify`: pass, including formatting, lint, typecheck, secret scan, dependency-license policy, reproducible-fixture check, unit/component tests, and production build.
- Unit/contract/component tests: 165 pass across 15 files — 28 shared-schema and 137 web tests.
- `npm run test:e2e`: 22 pass across desktop Chromium and 412-pixel mobile Chromium.
- Focused real-worker local-audio E2E: 12 pass across both configured viewports.
- Automated loopback evidence dry run: pass; the Delivery Agent checked file presence only and did not open the generated screenshots, video, or served UI.
- Production build: pass; only the pre-existing Phaser chunk-size advisory remains.

## Quality and performance verification

- The accepted baseline and `quality-dsp-v1` run on the same deterministic samples. Quality preserves the exact accepted beat timing, so per-track quality beat F1 cannot be lower than baseline beat F1.
- Owned accented 3/4 at 108 BPM and 4/4 at 132 BPM fixtures each identify the correct meter and meet downbeat F1 ≥ 0.85 at 90 ms tolerance.
- The repository-owned 8-second WAV reports 115–125 BPM, meter 4/4, 13 beats, four downbeats, `quality-dsp-v1`, explicit 100% baseline beat agreement, no fallback, and no low-overall-confidence warning.
- Flat, near-flat, contradictory 3/4-versus-4/4, and the Code Review's exact non-periodic isolated-peak sequence all produce `meter: null` and downbeat confidence below 0.55. Integrated flat, contradictory, and non-periodic pulse cases emit zero downbeats/bar positions, a `meter_uncertain` warning, and explicit baseline timing fallback.
- Pure threshold tests cover half-tempo ambiguity, all-warning stable order, conservative meter inference, deterministic replay, quality-specific progress, and cancellation before metrical inference.
- Two complete runs of the deterministic 60-second quality case are deeply equal and each completes below the 5-second unit-test budget.
- Worker protocol v2 tests accept current analyze/cancel messages and reject v1 requests and responses; malformed current input is also rejected. The worker name now reflects the quality-rhythm contract.
- Existing worker tests continue to cover the 24,000,000 decoded-channel-sample pre-copy ceiling, consuming ownership, transfers, cancellation, stale/malformed messages, stable failures, listener removal, and termination.
- Production E2E requires at least three 25 ms main-thread heartbeat ticks while real worker analysis is visibly active.

## Contract verification

Shared-schema tests accept confident and honestly uncertain results and reject duplicate, missing, or non-canonically ordered warnings; mismatched tempo candidates and relation labels; broken bar cycles; non-position-one downbeats; fallback without uncertainty; and unreported half/double ambiguity. The schema also bounds every confidence component, tempo score, time, duration, and result collection from one shared quality-contract configuration.

## Acceptance mapping

| Criterion | Automated verification                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1         | Pure analyzer, protocol/adapter, component, and real-module-worker production tests cover the versioned local quality action and progress/cancel/recovery behavior.      |
| 2         | Owned-WAV unit and desktop/mobile production E2E assert 115–125 BPM, 4/4, 13 beats, four downbeats, quality version, and baseline agreement.                             |
| 3         | Same-sample 3/4 and 4/4 metric cases assert no beat-F1 regression, correct meter, and downbeat F1 ≥ 0.85.                                                                |
| 4         | Pure classifier and component tests assert ranked half/double alternatives and visible ambiguity guidance.                                                               |
| 5         | Flat-accent unit, component, and desktop/mobile production journeys assert uncertain meter, low downbeat confidence, zero invented downbeats, and fallback guidance.     |
| 6         | Shared-schema positive/negative matrix enforces confidence, warning, candidate, beat, downbeat, bar-position, meter, and fallback invariants.                            |
| 7         | Analyzer/worker tests preserve stable baseline failures and exact beat agreement; visible production output names baseline agreement or fallback.                        |
| 8         | Component semantics, desktop/mobile containment E2E, and passing black-box Product Review cover non-color-only labels and readable result guidance.                      |
| 9         | Determinism/performance, worker cleanup/cancellation, heartbeat, and unchanged decoded-sample budget regressions pass.                                                   |
| 10        | License/model inventory, lockfile/license checks, owned-fixture provenance, and capture/E2E network, filename, storage, cache, database, and service-worker guards pass. |

## Remediated candidate CI

- Candidate commit: `8dd0de8532eaef4bf2c7d18ce78fe96988976180`.
- GitHub Actions: [Verify run 29794551355](https://github.com/VashingMachine/over-nerv-block/actions/runs/29794551355) — passed.
- Candidate artifact: `8481556819`.
- Artifact SHA-256: `aaa26b56900c100441742df3252c90e1e18fe3251147ba875fd4b7fd666c43b9`.
- Exact CI steps passed: repository verification, high-severity dependency audit, all 22 production E2E scenarios without retry, loopback evidence capture, artifact upload, and identity summary.

The imported replacement-evidence manifest identifies this exact candidate and all six media hashes match. The Delivery Agent imported and hash-checked it without opening the screenshots, video, or served UI. Product Review alone receives the story records and exact visible artifacts; Code Review receives source/tests/diff and CI identity metadata without product artifacts, site, Product Review, or browser output.

The superseding Product Review independently matched all replacement-media hashes and found no P0–P2 product defect. The isolated Code re-review confirmed all three initial P2 remediations plus the schema/threshold/determinism hardening, with no P0–P2 code defect remaining. Review isolation was maintained throughout.

Nonblocking P3s remain documented in the independent reports: late-video canvas blank space and unavailable live browser interaction on the product side; dwell-masked real-worker timing and a broader-than-protocol runtime error whitelist on the code side.

## Initial candidate CI — superseded

- Candidate commit: `4d4818b7009744c2779d31f68b7575b93aede5a2`.
- GitHub Actions: [Verify run 29793591482](https://github.com/VashingMachine/over-nerv-block/actions/runs/29793591482) — passed.
- Candidate artifact: `8481216054`.
- Artifact SHA-256: `5fcf9c211c8fbf15f1bd1da8e16477467cab16443c308b31e9fca1e8b915edef`.
- Exact CI steps passed: repository verification, high-severity dependency audit, production E2E, loopback evidence capture, artifact upload, and identity summary.
- CI annotated one retry in the pre-existing bundled-demo keyboard/pointer journey; the retried job concluded successfully with 21 direct passes plus the recovered flaky scenario. The complete local production suite passed all 22 without a retry.

The initial candidate was withheld after separate review. Its evidence is not an acceptance input. The accepted remediated candidate above replaces it and passed both isolated re-reviews.

No external deployment is required. CI serves the immutable production build only on `127.0.0.1` for browser verification and capture.
