# Sprint 10 test evidence

Status: implementation verified locally; exact candidate CI/artifact and isolated reviews pending. The acceptance matrix in `README.md` was frozen before implementation.

## Required gates

- Manifest/icon/service-worker contract and build-resource inventory tests.
- Cache readiness, offline bundled-demo, waiting update, explicit activation, and one-reload tests.
- Responsive desktop/mobile and representative-state WCAG A/AA scans.
- Focus, semantic control, reduced-motion, remapped-key, form-field exclusion, preference persistence, and non-color-only tests.
- Long-track preprocessing numerical, memory-boundary, yielding, cancellation, and cleanup tests.
- Opt-in production private-audio E2E with `PRIVATE_AUDIO_PATH=/Users/dkwiatkowski/projects/over-nerv-block/salt.mp3`.
- UI/log/request/local storage/session storage/IndexedDB/Cache Storage/service-worker/Git/artifact privacy scans.
- Full `npm run verify`, audit, production E2E, exact owned evidence, accepted-artifact smoke, Product Review, and Code Review.

## Private local acceptance input

The opt-in no-media production harness passed with the user-supplied `salt.mp3`:

- SHA-256: `3ed284496281eb644f5770f00eaecef9c7b2216717175d523849a615b116c8ae`.
- Size: 6,684,447 bytes; decoded duration: 277.559979 seconds.
- MPEG Layer III, 48,000 Hz, stereo; the container's attached artwork is not used by the game.
- Visible acceptance facts: 277.6 seconds, MP3, two channels, 48,000 Hz.
- Select/decode, bounded preprocessing, analysis, generated Easy chart, playback start, advancing progress, and pause all passed in 4.6 seconds.
- A 25 ms browser heartbeat advanced throughout preparation/analysis.
- UI, console, GET/HEAD request URLs, non-GET requests, local/session storage, all IndexedDB records, Cache Storage, and service-worker registrations/URLs were scanned; basename/path/blob identity was absent and no write/external request occurred.
- The file is ignored by exact `.gitignore` rule, is not tracked, and is absent from `public`, `dist`, story evidence, and normal CI inputs.

## Local verification

- `npm run verify`: pass, including formatting, lint, typecheck, secret scan, dependency-license policy, reproducible owned demo, 310 unit/contract/component tests across 27 files, and production build.
- Shared schema: 47 tests pass. Web domain/component/integration: 263 tests across 26 files pass.
- `npm audit --audit-level=high`: pass with zero vulnerabilities.
- `npm run test:e2e`: 57 production-preview scenarios pass across desktop/mobile Chromium; one intentional mobile skip avoids duplicating the dynamic-state axe scan that runs on desktop. No retry was needed locally.
- PWA/browser coverage includes manifest/icons, exact owned cache, offline reload/demo start, browser-provided install prompt, waiting update with explicit activation, remapped key, reduced motion, desktop/mobile containment, and home/dynamic-state WCAG A/AA scans.
- Axe scans report zero WCAG A/AA violations for home, selected, analyzed/editor, active generated game, completed result, and history states.
- Local evidence dry run: pass from build `sprint10-local-dry`; exact 12-media inventory plus manifest, owned synthesized audio only, and no private input. Manifest SHA-256: `c2a0665e3d2aa76f39244ebd83f0ed0311e24ba5f240e0cf4f1d788c8ab9c4ad`.
- Evidence video metadata: VP8, 1280×800, 14.48 seconds, video-only stream. The Delivery Agent checked inventory, hashes, build identity, assertions, and stream metadata without visual inspection.

## Candidate identity

- Reviewed candidate: pending.
- Exact CI run: pending.
- Artifact ID/digest: pending.
- Evidence manifest SHA-256: pending.
- Accepted-artifact smoke: pending.
