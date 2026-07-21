# Sprint 08 test evidence

Status: accepted. Local verification, exact-candidate CI, imported evidence, accepted-artifact smoke, and both isolated reviews passed. The acceptance matrix in `README.md` was frozen before implementation.

## Required automated gates

- Worker state-machine transition, attempt bound, timeout, crash, constructor/post/callback failure, cancellation, duplicate/stale response, and exact cleanup tests.
- Checkpoint schema and IndexedDB adapter read/write/replace/delete, invalid-state cleanup, denied-storage, singleton, fingerprint, and field-allowlist tests.
- Component tests for loading/missing/unavailable recovery, completion/save, reload recovery, absent-audio truth, retained checkpoint through failure/cancel, re-analysis binding, correction isolation, and forget behavior.
- Production build E2E for starting, cancelling, retrying, completing, reloading, recovering, reselecting/reanalyzing, and playing an owned fixture on desktop and 412-pixel mobile Chromium.
- Privacy assertions: no filename in UI/logs/artifacts or checkpoint; no write/external network; no audio/blob/object URL/sample/generated-chart/correction/result fields in IndexedDB; no cache or service worker.
- `npm run verify`, `npm audit --audit-level=high`, exact evidence capture, immutable artifact packaging, Product Review, and Code Review.

## Evidence inventory plan

Final evidence will live under `story/08-leave-return-recover-retry/evidence/` and include a machine-readable manifest with build identifier, loopback preview identity, privacy assertions, scenario assertions, byte sizes, and SHA-256 hashes. Media will use repository-owned synthesized audio only. The Delivery Agent must not open the site or media; it may verify them only through automated assertions, names, sizes, hashes, and inventory. Only the isolated Product Reviewer may inspect media or the visible production preview.

## Local verification

- `npm run verify`: pass, including formatting, lint, typecheck, secret scan, dependency-license policy, reproducible owned audio, tests, and production build.
- Shared schema: 46 tests pass.
- Web domain/component/integration: 230 tests across 22 files pass.
- Total unit/contract/component: 276 tests across 23 files pass.
- `npm audit --audit-level=high`: pass with zero vulnerabilities.
- `npm run test:e2e`: 40 production-preview scenarios pass across desktop and 412-pixel mobile Chromium with no retry.
- Sprint 08 focused E2E: four scenarios pass across both viewports for completed-grid reload/recovery/re-analysis-to-play and checkpoint retention through failure/cancellation followed by forget.
- Local evidence dry run: pass; exact 12-media inventory plus manifest produced under the operating-system temporary directory and verified by name, byte size, SHA-256, build ID, scenario assertions, privacy assertions, and containment without visual inspection.
- Exact-candidate CI: run `29806028199` passed for `c8e3c7854dcce907367f91742adc283025ef30d0`, including 276 unit/contract/component tests, zero-vulnerability audit, 40 production E2E scenarios, evidence capture, and immutable artifact publication.
- Downloaded accepted-artifact smoke: 4/4 pass against the exact packaged static build on loopback, covering heartbeat and both Sprint 08 critical recovery paths.

## Worker, storage, and privacy verification

- Pure state-machine and boundary tests cover legal/illegal transitions, exactly two attempts, crash and timeout retry, second terminal failure, cancellation from every active phase, constructor/post/progress failures, malformed and stale identity, duplicate terminal messages, timer/listener/worker/sample cleanup, and stable errors.
- Checkpoint contract/store tests cover strict fields, deterministic fingerprint coherence, singleton round trip/replacement/delete, unknown version, corrupt/foreign/unexpected data cleanup, cleanup denial, unavailable read/write/delete, and forbidden-field absence.
- Component tests cover hydration without audio, disabled play/tap, deterministic non-audio correction, save/clear-to-recovery, retention through cancellation, visible attempt 2, forget, and storage-unavailable fallback while preserving all prior behavior.
- Production privacy checks allow only database `rhythm-game-recovery`, store `completed-analysis`, key `latest`, and the five checkpoint fields. They reject filename/audio/blob/object URL/MIME/generated-chart/correction/result data, write/external requests, caches, service workers, and private console/UI text.

## Candidate identity

- Reviewed candidate: `c8e3c7854dcce907367f91742adc283025ef30d0`.
- CI run: `29806028199`, passed.
- Artifact ID/name: `8485562194` / `sprint-08-candidate-c8e3c7854dcce907367f91742adc283025ef30d0`.
- Artifact digest: `sha256:0f13e86ab856e23a1ba9ff346f3bf3a706dd06920a7c1836b9272c2c1ba068ae`.
- Imported evidence: 12/12 media byte sizes and SHA-256 hashes match the manifest; manifest SHA-256 is `bae81e7862faed9abae9bfef4b98d5264c0abecfb92b7a9d5eb3914067ffa0b5`; the WebM contains a VP8 video stream and no audio stream.
- Product Review: PASS for all nine acceptance criteria, with no P0-P2 finding.
- Code Review: PASS after all three preliminary P2 findings were fixed, with no unresolved P0-P2 finding.

## Release-coordinator finalization

After both reviews passed, finalization changed only the story records, independent review reports, and imported immutable evidence packet. It did not change application, test, schema, workflow, or build behavior, so the exact-candidate Product Review remains valid. Final-commit branch CI and accepted-artifact smoke are required again before promotion.
