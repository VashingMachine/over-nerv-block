# Sprint 02 test evidence

Status: final calibration-safe local and exact-candidate CI passed; independent Product and Code Reviews pass.

Candidate: `ca49be416bb60e32c2451eb1755fff4dc29f53e3`

GitHub Actions: [Verify run 29786997949](https://github.com/VashingMachine/over-nerv-block/actions/runs/29786997949) — passed

## Local automated coverage

| Layer                     | Command or test                                                     | Current result                            |
| ------------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| Formatting                | `npm run format:check`                                              | Passed                                    |
| JavaScript/TypeScript     | ESLint and TypeScript project builds                                | Passed                                    |
| Secret/license/dependency | Repository scanners, locked-license policy                          | Passed; 272 locked packages               |
| Demo asset                | `npm run check:demo-audio`                                          | Byte-for-byte reproducible                |
| Contracts/domain          | Schema, timing boundaries, scoring, result storage, and audio clock | 62 unit/contract/component tests passed   |
| Production build          | Shared schema and Vite static build                                 | Passed                                    |
| Browser E2E               | Desktop/mobile score, transport, calibration, retry, and heartbeat  | 10 scenarios passed                       |
| Evidence capture          | Final exact-candidate production loopback capture                   | Passed; eight images, video, and manifest |

The candidate build plus evidence is retained as GitHub artifact `8478854090` with SHA-256 `e3c68b0882be88bc9233c6c6e6f44c39704d2c068d56a4c4a57a70557bc7d3d6` until 2026-08-19. The evidence manifest identifies the same full candidate SHA and hashes every visual artifact.

Product Review exercised the exact candidate through visible Chrome and passed all seven criteria. Code Review independently confirmed every prior P2/P3 remediation and found no current P0-P3. Their reports are retained in `PRODUCT_REVIEW.md` and `quality/code-reviews/02.md` under their required isolation rules.

## Acceptance mapping

1. Calibration adapter and component remount tests prove bounded persistence; production E2E reloads the saved value.
2. Table-driven domain tests cover immediately before, exactly at, and immediately after every judgment boundary; production input visibly updates score.
3. Pure dropped-frame collection tests prove every expired note is marked once; a completed browser run contains automatic misses.
4. Fake AudioContext and component tests cover frozen pause/resume and clean restart; production E2E observes the frozen progress value.
5. Storage tests reject corrupt/tampered records and re-derive summaries; production E2E completes and retries with zero score.
6. Component tests cover visibility-loss pause and recoverable resume/start failures; production audio failure retries successfully.
7. Both browser projects assert active horizontal containment; capture repeats the 412-pixel natural-origin check.

Only the final calibration-safe production build served on loopback may produce committed acceptance artifacts. The active evidence was imported verbatim from its successful CI artifact. Superseded-candidate evidence is not Product Review input.
