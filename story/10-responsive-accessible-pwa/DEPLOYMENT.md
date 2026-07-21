# Sprint 10 preview and build

Status: local implementation and evidence dry run pass; exact candidate CI/artifact and reviews pending. Acceptance is local-only; no external deployment is required or planned.

## Required procedure

1. Build with the exact candidate SHA as `VITE_BUILD_ID`.
2. Serve only `apps/web/dist` on `127.0.0.1:4173`.
3. Confirm the manifest, icons, build-specific service worker, cache-readiness handshake, offline owned demo, and safe update lifecycle on that origin.
4. Run production E2E and capture owned Sprint 10 evidence against the immutable build.
5. Package the build and owned evidence as one CI artifact; download it and repeat critical smoke on loopback.
6. Run the separate opt-in private-audio harness locally. Never put that file or its output media in the packaged artifact.

There is no server/API, cloud runtime, GCP account, remote database, hosted analyzer, required GitHub Pages site, or public URL. `deployed` remains `false`; a passing loopback production artifact is the acceptance target.

## Local verification

- Immutable dry-run build: `sprint10-local-dry` at `http://127.0.0.1:4173`.
- Manifest, 192/512 PNG icons, build-specific service worker, owned-cache readiness, offline reload/demo, explicit waiting-worker activation, and selected-audio cache exclusion pass.
- Full production browser suite: 57 pass, one intentional duplicate-scan skip.
- Owned evidence capture: 12 hashed media files plus manifest; VP8 1280×800 video, 14.48 seconds, no audio stream.
- External application deployment: intentionally not performed.

## Rollback

Restore the accepted Sprint 09 artifact. Unregister only this application's service worker and remove only its named cache prefix if cleanup is required.
