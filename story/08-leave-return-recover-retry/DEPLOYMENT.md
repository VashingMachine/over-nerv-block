# Sprint 08 preview and build

Status: accepted local-only static build. Exact-candidate CI, imported evidence, accepted-artifact smoke, and both isolated reviews passed. External deployment is not required.

## Required preview procedure

1. Build the exact candidate with its full commit SHA as `VITE_BUILD_ID`.
2. Serve only `apps/web/dist` on `127.0.0.1:4173`.
3. Run all production E2E and evidence capture against that immutable loopback build.
4. Package the static build and exact Sprint 08 evidence as the CI candidate artifact.
5. Record the candidate commit, CI run, artifact ID/digest, manifest hash, and both review outcomes before acceptance.

There is no application server, API, upload endpoint, managed database, cloud runtime, or required public URL. IndexedDB is local browser recovery storage only and never contains audio or selection identity.

## Local verification

- Build identifier: `sprint08-local-candidate`.
- Full production E2E: 40/40 pass.
- Evidence capture: exact 12-media inventory plus manifest passed from `127.0.0.1:4173` and was stored under the operating-system temporary directory.
- External application deployment: intentionally not performed.
- Reviewed candidate: `c8e3c7854dcce907367f91742adc283025ef30d0`.
- CI run: `29806028199`, passed.
- Artifact ID: `8485562194`.
- Artifact digest: `sha256:0f13e86ab856e23a1ba9ff346f3bf3a706dd06920a7c1836b9272c2c1ba068ae`.
- Evidence manifest SHA-256: `bae81e7862faed9abae9bfef4b98d5264c0abecfb92b7a9d5eb3914067ffa0b5`.
- Downloaded artifact served on `127.0.0.1:4174`: heartbeat and Sprint 08 critical-path smoke pass 4/4.
- Product Review and Code Review: PASS with no unresolved P0-P2 findings.

## Rollback

Restore the accepted Sprint 07 static artifact or revert the Sprint 08 atomic commit. Delete the local `rhythm-game-recovery` database if recovery checkpoint cleanup is desired. No external resource must be removed.
