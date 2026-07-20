# Sprint 01 test evidence

Status: remediated local and exact-candidate remote verification passed; independent Product and Code Reviews pass.

Candidate: `3d57f4ab0d3355ada097e57d7ea51b7317815573`

GitHub Actions: [Verify run 29781666671](https://github.com/VashingMachine/over-nerv-block/actions/runs/29781666671) — passed

## Automated coverage

| Layer                     | Command or test                                                     | Current result                  |
| ------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| Formatting                | `npm run format:check`                                              | Passed locally and remotely     |
| JavaScript/TypeScript     | ESLint and TypeScript project builds                                | Passed locally and remotely     |
| Secret/license/dependency | Repository scanners, locked-license policy, and high-severity audit | Passed; 272 locked packages     |
| Demo asset                | `npm run check:demo-audio`                                          | Byte-for-byte reproducible      |
| Contracts/domain          | Schema, clock/lifecycle, timing, and WAV/chart Vitest suites        | 10 passed locally and remotely  |
| Components                | Heartbeat plus demo lifecycle/failure/retry Vitest suites           | 6 passed locally and remotely   |
| Production build          | Shared schema and Vite static build                                 | Passed locally and remotely     |
| Browser E2E               | Desktop/mobile happy path, active containment, retry, and heartbeat | 8 passed against production     |
| Product evidence          | Desktop/mobile/video/failure/recovery capture                       | Captured; Product Review passed |
| Static artifact           | Build and evidence upload with SHA-256 digest                       | Artifact `8476876330`           |

## Acceptance mapping

1. Track details/start: schema, component, and desktop/mobile idle assertions pass.
2. Countdown/audio-clock notes: pure clock-position tests and real production-preview playback pass.
3. Three input paths: keyboard, visible button, and Phaser canvas pointer actions pass on desktop/mobile.
4. Completion/replay: both browser projects complete the real eight-second audio asset and expose replay.
5. Failure/retry: component engine rejection and routed production audio 503 recover successfully.
6. Responsive use: desktop/mobile browser runs include an explicit horizontal-overflow assertion.

Only the production build served on loopback may produce acceptance artifacts. The development server and component-test DOM are diagnostics, not Product Review evidence.

Finalization adds only story evidence and the two isolated review reports. The final atomic commit's Verify run must repeat static/policy/audit checks, all 16 unit/contract/component tests, eight production-browser scenarios, evidence capture, and artifact hashing before the story is fast-forwarded to `main`.
