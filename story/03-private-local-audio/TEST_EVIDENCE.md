# Sprint 03 test evidence

Status: local and exact-candidate CI pass; independent Product and Code Reviews pass.

## Local verification

Run on 2026-07-21 against the production build:

- `npm run verify`: pass.
- Unit/component tests: 95 pass across 11 files.
- `npm run test:e2e`: 16 pass across desktop Chromium and 412-pixel mobile Chromium.
- Automated loopback evidence dry run: pass without visually inspecting the generated media.

## Acceptance mapping

| Criterion | Automated verification                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Component copy checks and production-browser privacy/limit assertions on both configured viewports.                                                                          |
| 2         | Table-driven empty, boundary, oversized, extension, and MIME policy tests plus production E2E for unsupported, empty, and 25 MiB + 1 byte files.                             |
| 3         | Component progress/cancel tests, isolated decoder progress tests, and valid synthesized-WAV production E2E through `ready_for_analysis`.                                     |
| 4         | Decoder duration/corruption tests, component retry tests, and corrupt-WAV production retry E2E.                                                                              |
| 5         | Exactly-once release/revoke tests for late completion, progress dwell, URL failure, replace, clear, page close, BFCache restoration, pre-abort, and prompt mid-decode abort. |
| 6         | Production E2E and evidence-capture guards for write requests, filename logs/UI, Local Storage, IndexedDB, Cache Storage, and service workers.                               |
| 7         | Explicit DOM-bound containment checks on desktop and 412-pixel mobile production runs.                                                                                       |

## Accepted candidate CI

- Candidate commit: `e580cf56f147dce014356630beba3115d4c9ee79`.
- GitHub Actions: [Verify run 29789371401](https://github.com/VashingMachine/over-nerv-block/actions/runs/29789371401) — passed.
- Candidate artifact: `8479684433`.
- Artifact SHA-256: `1dba7a025517760a69b0d133df1de9dff021e103b421d9d8a507d0efa787d951`.
- Exact CI results: repository verification, dependency audit, 16 production E2E scenarios, evidence capture, and artifact upload passed.

The evidence manifest identifies the same full candidate and hashes five screenshots plus one video. The exact CI evidence was imported into this story without Delivery Agent visual inspection. Product Review found no P0–P2 product defect; Code Review confirmed all lifecycle/accessibility remediation and found no P0–P2 code defect.

Review isolation was maintained: Product Review used only permitted story records and exact-candidate visible artifacts; Code Review used source/tests/diff/metadata and permitted checks without product artifacts, site, Product Review, or browser output.
