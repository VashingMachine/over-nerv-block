# Sprint 07 test evidence

Status: accepted; local automation, exact-candidate CI, Product Review, and Code Review passed.

The verification matrix is defined in `README.md` before implementation. Exact evidence will use only repository-owned synthesized audio and deterministic fixtures. No selected user audio may enter tests or artifacts.

## Local verification

- `npm run verify`: pass, including format, lint, typecheck, secret scan, dependency-license policy, reproducible owned audio, unit/component/contract tests, and production build.
- Shared schema: 45 tests pass.
- Web domain/component/integration: 199 tests across 20 files pass.
- Total unit/contract/component: 244 tests across 21 files pass.
- `npm audit --audit-level=high`: pass with zero vulnerabilities.
- `npm run test:e2e`: 36 production-preview scenarios pass across desktop and 412-pixel mobile Chromium with no retry.
- Sprint 07 focused E2E: six scenarios pass across both viewports: all correction families through corrected play/results, reload/reanalysis restore and different-input isolation, plus tap validation/undo/reset.
- Initial loopback evidence dry run: pass, but independent Product Review correctly rejected four missing visible acceptance branches.
- First expanded loopback evidence dry run: pass mechanically, but Code Re-review correctly rejected its different-analysis setup because the prior correction had already been discarded.
- Final expanded evidence dry run: pass; 27 files produced, including 26 hashed media artifacts plus manifest. It preserves the original correction, proves the different fingerprint starts empty, creates a second coexisting document, returns to the original unchanged revision, and retains the earlier invalid/no-mutation, repeated undo, corrected transport, migration/corruption/foreign/denied-storage, and success states.

## Correction, storage, and privacy verification

- Pure replay tests cover filename-free full-analysis fingerprints, source immutability, offset, half/double tempo, 3/4 and 4/4 relabeling, chosen downbeat, tap-grid tempo/phase matrices, add/remove, invalid-operation stability, foreign source rejection, and regenerated chart identity/provenance.
- Contract tests reject invalid operations, mismatched revisions, broken order/meter/downbeat invariants, and embedded-source assumptions.
- Storage tests cover compact current documents, version-zero migration, corrupt/foreign/unknown data cleanup, reset deletion, and storage denial/null fallback.
- Component tests cover visible original-versus-working facts, persistence, every control, invalid edits, rejected-tap retention, undo/reset, matching restore, and no-storage operation.
- Production tests use the real owned WAV/worker/build and assert no write request, external request, private filename output, analysis/chart/result persistence, IndexedDB database, cache, or service worker.

## Exact accepted candidate

The first candidate `d40ea4a693a83b5024743f81cdac15dc16fff7a6` passed CI run `29801154173` but failed Product Review on evidence completeness; no product defect or P0/P1 was observed. Candidate `dfa8d78299a2c9be37d5ab633da8599ec8da8bb1` passed CI run `29801989862`, but Code Re-review rejected a false different-analysis evidence setup before Product Re-review completed. Both artifacts are superseded.

- Accepted candidate: `bd23829fe1f1831e97d19c6f87cee4e59afb0f52`.
- GitHub Verify run `29802543942`: pass, including 244 unit/contract/component tests, zero-vulnerability high-severity audit, 36 production E2E scenarios, loopback evidence capture, and artifact packaging.
- Artifact `8484302524`: digest `sha256:69ff94b6bf3b157ed56c3c49bd49ac7dbc4a9be370ad4f023474c4142ccf78ac`.
- Imported evidence: 26 media files; all byte counts and SHA-256 hashes match the manifest. Manifest SHA-256: `771775f7aa9542629b2f2cebfdeebdb05a540efec270f495708044eb0e13698f`.
- Independent Product Review: PASS on all nine criteria, no unresolved P0-P2.
- Independent Code Review: PASS, no unresolved P0-P2.

No external deployment is required. Acceptance runs against a static production build on `127.0.0.1`.
