# Sprint 09 preview and build

Status: accepted local-only static build. Exact-candidate CI, imported evidence, accepted-artifact smoke, and both isolated re-reviews passed. External deployment is not required.

## Required procedure

1. Build with the exact candidate SHA as `VITE_BUILD_ID`.
2. Serve only `apps/web/dist` on `127.0.0.1:4173`.
3. Run production E2E and capture Sprint 09 evidence against that immutable build.
4. Package the build and evidence as one CI artifact.
5. Record exact candidate, CI, artifact digest, manifest hash, accepted-artifact smoke, and both reviews.

There is no server/API, remote database, cloud runtime, or required public URL. IndexedDB history remains only in the player's browser and contains no audio or selection identity.

## Local verification

- Build identifier: `sprint09-local-dry`.
- Loopback production E2E: 44/44 pass across desktop and mobile Chromium.
- Evidence capture: exact 11-media inventory plus manifest passed from `127.0.0.1:4173` under the operating-system temporary directory.
- Video metadata: VP8, 1280×800, 16 seconds, no audio stream.
- External application deployment: intentionally not performed.
- Reviewed candidate: `bf7151ea94c9f2ef3decc6638382256e45c57b30`.
- CI run: `29811994171`, passed.
- Artifact ID: `8487880383`.
- Artifact digest: `sha256:8e18c67d1ff728002b0013381687811ac76ad9d82b7eb2cc0e07ac8657037f55`.
- Imported evidence manifest SHA-256: `a89bbcc3ea55e3e8a04c397a37b7affc9532571b55b375f0a287486652d21737`.
- Downloaded exact artifact served on `127.0.0.1:4174`: heartbeat/retry and Sprint 09 critical-path smoke pass 4/4.
- Product re-review and Code re-review: PASS with no unresolved P0-P2 findings.

## Rollback

Restore the accepted Sprint 08 artifact or revert Sprint 09. Remove only local database `rhythm-game-history` if history cleanup is desired.
