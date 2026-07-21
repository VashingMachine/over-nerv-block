# Sprint 04 test evidence

Status: local and exact-candidate CI pass; independent Product and Code Reviews pass.

## Local verification

Run on 2026-07-21 against the production build:

- `npm run verify`: pass, including formatting, lint, typecheck, secret scan, dependency-license policy, reproducible fixture check, unit/component tests, and production build.
- Unit/contract/component tests: 134 pass across 13 files — 17 shared-schema and 117 web tests.
- `npm run test:e2e`: 20 pass across desktop Chromium and 412-pixel mobile Chromium.
- Focused real-worker local-audio E2E: 10 pass across both configured viewports.
- Automated loopback evidence dry run: pass without Delivery Agent inspection of the generated media or served UI.
- Production build: pass; only the pre-existing Phaser chunk-size advisory remains.

## Quality and performance verification

- The committed deterministic pulse corpus at 90, 120, and 150 BPM meets tempo error ≤ 3 BPM and beat F1 ≥ 0.85 at 70 ms tolerance for every track.
- The repository-owned 8-second synthesized WAV reports 115–125 BPM and meets the same beat-F1 floor.
- Identical input produces deeply equal `baseline-dsp-v1` output.
- The 60-second deterministic performance case completes below the 4-second test budget.
- Worker tests cover copied/transferred channel data, single-owner decoded-handle release, pre-copy decoded-sample budgeting, progress, cancellation, stale messages, missing/invalid protocol identity, malformed progress/results, stable failures, unavailable workers, post failures, listener removal, and termination.
- Production E2E requires at least three 25 ms main-thread heartbeat ticks while real worker analysis is visibly active.

## Acceptance mapping

| Criterion | Automated verification                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1         | Component copy/action checks plus production E2E from a real browser-decoded repository-owned WAV.                                                                             |
| 2         | Protocol/adapter progress-cancel tests and a production 25 ms main-thread heartbeat during the visible worker operation.                                                       |
| 3         | Shared-schema invariants, pure analyzer owned-fixture test, and real module-worker production E2E with the 115–125 BPM assertion.                                              |
| 4         | Component preview assertions plus explicit desktop/mobile production containment checks; visual readability remains for Product Review.                                        |
| 5         | Adapter/component malformed, error, cancel, retry, stale, replace, and unmount tests plus real-worker cancel/retry and no-onsets/retry production journeys.                    |
| 6         | Release/terminate/listener spies cover complete, error, cancellation, replacement, unmount, unavailable worker, post failure, and stale completion.                            |
| 7         | Per-track deterministic corpus thresholds, deterministic replay, and a bounded 60-second performance regression test.                                                          |
| 8         | Production E2E and capture guards cover write/external requests, filename output/logs, Local Storage, IndexedDB, Cache Storage, and service workers using owned fixtures only. |

## Accepted candidate CI

- Candidate commit: `eb95113ed383d1c72c08c1ddbd39a25f644e5a1b`.
- GitHub Actions: [Verify run 29791985706](https://github.com/VashingMachine/over-nerv-block/actions/runs/29791985706) — passed.
- Candidate artifact: `8480642300`.
- Artifact SHA-256: `ded305963b345d88afbdb263e9cd9db5e766c3505411a6b2f19a0a6305b6c582`.
- Exact CI results: repository verification, dependency audit, 20 production E2E scenarios, evidence capture, and artifact upload passed.

The exact evidence manifest identifies the same candidate and hashes five screenshots plus one video. CI evidence was imported without Delivery Agent visual inspection. Product Review independently matched all media hashes and found no P0–P2 product defect. Code Review confirmed both prior P2 remediations and the decoded-handle ownership correction, with no P0–P2 code defect remaining.

Review isolation was maintained: Product Review used only permitted story records and exact-candidate visible artifacts; Code Review used source/tests/diff/metadata and non-browser checks without product artifacts, site, Product Review, or browser output.

No external deployment is required; CI serves the immutable production build only on loopback.
