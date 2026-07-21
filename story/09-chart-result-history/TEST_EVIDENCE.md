# Sprint 09 test evidence

Status: accepted. Local verification, remediated exact-candidate CI, imported evidence, accepted-artifact smoke, and both isolated re-reviews passed. The acceptance matrix in `README.md` was frozen before implementation.

## Required gates

- Strict shared history schemas and exact nested-shape validation.
- Deterministic identity, result/chart coherence, ordering, upsert, cap, migration, corrupt cleanup, denied storage, targeted delete, and clear tests.
- Component tests for async history states, completion save status, audio-absent return, file chooser, delete/clear success and denial, retention copy, and isolation.
- Production E2E for completion → history → reload → reselect/reanalyze/play plus migration/corruption/delete/clear on desktop and 412-pixel mobile Chromium.
- Privacy assertions excluding audio, filename, MIME/path/size, object/blob URL, decoded/worker buffers, checkpoints, corrections, and private console/UI/network content from history.
- Full `npm run verify`, audit, exact evidence capture/artifact, accepted-artifact smoke, Product Review, and Code Review.

## Candidate identity

- Reviewed candidate: `bf7151ea94c9f2ef3decc6638382256e45c57b30`.
- Exact CI run: `29811994171`, passed.
- Artifact ID/name: `8487880383` / `sprint-09-candidate-bf7151ea94c9f2ef3decc6638382256e45c57b30`.
- Artifact digest: `sha256:8e18c67d1ff728002b0013381687811ac76ad9d82b7eb2cc0e07ac8657037f55`.
- Imported evidence: all 11 media byte sizes and SHA-256 hashes match the manifest; manifest SHA-256 is `a89bbcc3ea55e3e8a04c397a37b7affc9532571b55b375f0a287486652d21737`.
- Video: VP8, 1280×800, 18.56 seconds, video-only stream.
- Downloaded exact-artifact smoke: 4/4 pass for heartbeat/retry and the two Sprint 09 critical history paths.
- Product re-review: PASS for all nine criteria; no P0-P2 finding.
- Code re-review: PASS after both preliminary P2 findings and the locale-ordering P3 were resolved; no P0-P2 finding.

## Local verification

- `npm run verify`: pass, including formatting, lint, typecheck, secret scan, dependency-license policy, reproducible owned audio, all tests, and production build.
- Shared schema: 47 tests pass.
- Web domain/component/integration: 255 tests across 24 files pass.
- Total unit/contract/component: 302 tests across 25 files pass.
- `npm audit --audit-level=high`: pass with zero vulnerabilities.
- `npm run test:e2e`: 44 production-preview scenarios pass across desktop and 412-pixel mobile Chromium with no retry.
- Sprint 09 focused E2E: four scenarios pass across both viewports. They cover completion/save, reload with chart/result but no audio/play action, explicit reselect followed by re-analysis, strict version-zero migration, targeted delete, clear-all, unknown nested-field cleanup, storage denial, privacy, and responsive containment.
- Local evidence dry run: pass; exact 11-media inventory plus manifest produced from build `sprint09-local-dry` under the operating-system temporary directory. Inventory, byte sizes, SHA-256 hashes, build ID, assertions, privacy, and video metadata were verified without visual inspection. The WebM is VP8 at 1280×800, 16 seconds, with no audio stream.

## Preliminary-review remediation

- Preliminary candidate `2a61e4a2edabf37a98e2500f813bcfca27573db9` passed Product Review and exact CI but failed Code Review on two P2 findings.
- The exported history contract is now recursively strict through chart, note, generation/correction metadata, result, judgment, and summary depths. It directly enforces deterministic IDs, exact chart-note judgment coverage/order/times, derived summaries, unique IDs, and canonical ordering.
- One store-level operation queue now serializes reads, saves, targeted deletes, and clear-all calls. Deferred-promise regressions cover save/save, delete/delete, save/delete, and delete/clear ordering, and the panel disables every destructive control while one mutation is pending.
- The locale-dependent ID tie-break was also replaced by direct code-point ordering.
- Full local verification after remediation: 302 tests and all 44 production E2E scenarios pass. Exact candidate `bf7151e…`, its immutable artifact, accepted-artifact smoke, Product re-review, and Code re-review all pass.

## Release-coordinator finalization

After both re-reviews passed, finalization changed only story records, isolated review reports, and the imported immutable evidence packet. It did not change application, schema, test, workflow, or capture behavior, so the exact-candidate reviews remain valid. The final atomic commit must pass branch CI and accepted-artifact smoke again before fast-forward promotion.
