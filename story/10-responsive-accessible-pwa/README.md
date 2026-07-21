---
story_id: "10"
title: "Responsive, accessible, locally accepted PWA"
status: in_progress
sprint: 10
implementation_commit: pending
preview_url: "http://127.0.0.1:4173"
staging_url: not_applicable
automated_tests: pending
product_review: pending
code_review: pending
deployed: false
---

# Sprint 10 — Responsive, accessible PWA

## User story

As a desktop or mobile-web player, I can install and operate the game with understandable controls and accessibility settings, including using my long local MP3 without surrendering it to a server.

## Intended outcome

The immutable static build is an installable PWA on supported browsers, remains useful offline with the bundled demo, explains capability and update state truthfully, and stays operable at desktop and 412-pixel mobile widths. Keyboard and pointer controls remain semantic, focus is visible, reduced motion is selectable, and the primary hit key can be remapped. The user-supplied `salt.mp3` passes a private local select → decode → analyze → generated-chart-start acceptance path without entering Git, CI, browser persistence, logs, network traffic, or product evidence.

## Scope

### In scope

- A same-origin web manifest with name/short name, 192- and 512-pixel PNG icons, start URL, scope, standalone display, description, theme/background colors, and explicit landscape/portrait support.
- A versioned service worker that precaches the immutable app shell, hashed assets, analysis worker, icons, and repository-owned demo; navigation has a cached shell fallback.
- A safe update lifecycle: a newly installed worker waits, the UI announces it, and activation/reload occurs only after the player chooses `Apply update`.
- Truthful install, online/offline, cache, browser-support, and update messaging. The bundled demo is the only offline guarantee; local analysis is described as available offline only when this exact build's assets are ready.
- Responsive file selection, correction editor, game, results, and chart-history layouts at 1280×800 and 412×915.
- A persisted accessibility settings panel: system/reduced/full motion preference and a remappable primary hit key from an explicit safe allowlist.
- Visible focus, semantic non-canvas controls, text plus visual judgment feedback, sufficient contrast, polite status announcements, labels, and accessible names.
- Memory-bounded asynchronous preprocessing for long decoded tracks before worker transfer, with cancellation and event-loop yielding.
- A generic opt-in private-audio production E2E harness, run locally with `salt.mp3`; owned media remains the only CI/evidence input.
- Desktop/mobile production E2E, automated WCAG A/AA scan, exact local artifact/evidence, and isolated Product and Code Reviews.

### Out of scope

- Any application server, cloud runtime, GCP resource, hosted analyzer, upload API, remote database, public URL, or required GitHub Pages deployment.
- Caching or persisting selected audio, filenames, paths, file identity, decoded samples, artwork, or worker buffers.
- Guaranteeing offline decode/analysis before the exact build cache is complete.
- Automatic service-worker takeover, forced reload during play, background sync, push notifications, telemetry, accounts, or public sharing.
- Native iOS/Android packaging; Sprint 12 owns that work.
- A claim of physical-device validation when only the defined mobile Chromium viewport is available. Any later physical-device observation must be recorded separately and truthfully.

## Frozen PWA and offline contract

1. The PWA is accepted from `http://127.0.0.1:4173`, which browsers treat as an eligible local install origin. External publication is neither performed nor required.
2. `manifest.webmanifest` and every declared icon resolve from the production build. The manifest declares `name`, `short_name`, `id`, `start_url`, `scope`, `display: standalone`, colors, description, and PNG icons at 192×192 and 512×512, including a maskable purpose.
3. The build-specific service worker precaches only repository-owned static resources. Its cache name includes the exact build identifier. Activation removes older caches with this application's prefix but never foreign-origin or unrelated caches.
4. The bundled demo loads and can begin a game after the browser is placed offline and the accepted build has completed its cache-readiness handshake. User-selected media is never added to Cache Storage.
5. A waiting worker does not call `skipWaiting()` on its own. `Apply update` explicitly requests activation; `controllerchange` triggers at most one safe reload. No update is applied while the player is unaware.
6. Unsupported manifest/service-worker/browser-audio capabilities degrade to an ordinary online web app with visible explanation. Installation is offered only when the browser supplies an install prompt; otherwise the UI gives browser-menu guidance without claiming installability.
7. Capability copy distinguishes network state from verified cache state. It guarantees offline bundled demo only after this build reports its precache complete and never promises offline local analysis without that state.

## Frozen accessibility and responsive contract

1. All file, analysis, editor, game, result, history, install, update, and settings actions have native semantic controls and accessible names. Canvas is supplementary and does not contain the only operable hit control or essential status.
2. Every keyboard-operable control has a visible `:focus-visible` indicator with at least a two-pixel outline/offset. Focus order follows document order and no keyboard trap is introduced.
3. Motion preference has `Follow device`, `Reduce motion`, and `Full motion` values. `Reduce motion` suppresses nonessential transitions/animations regardless of OS; `Follow device` respects `prefers-reduced-motion`. The small versioned preference contains no user/media identity.
4. The primary game hit key can be remapped among `Space`, `Enter`, `A`, `F`, `J`, and `K`. Remapping never captures keystrokes while focus is in an input/select/textarea/contenteditable control, and the on-screen hit button remains available.
5. Hit judgments are communicated by text and shape/position as well as color. Current key, motion setting, score, progress, result, errors, and recovery actions remain understandable without relying on color alone.
6. At 1280×800 and 412×915, no required action or fact escapes the viewport horizontally; controls have practical touch targets; the game, editor, result, and history remain reachable by vertical scrolling.
7. Automated accessibility checks target WCAG 2 A/AA rules on representative home, selected/analyzed, active-game, editor, result, and history states. Automated scans supplement rather than replace black-box Product Review.

## Frozen long private-track contract

1. `salt.mp3` remains untracked and is named explicitly in `.gitignore`. It is never copied into `public`, `dist`, a fixture folder, story evidence, or CI.
2. Local acceptance identifies it only by its path supplied through `PRIVATE_AUDIO_PATH`, byte size, duration/channel/sample-rate metadata, and SHA-256 in the Delivery record. No reviewer or evidence consumer receives the file or its artwork/audio.
3. The current 25 MB / 10 minute input policy remains. A decoded track too large for direct multi-channel worker transfer is downmixed and resampled asynchronously to the analyzer's 11,025 Hz mono representation before transfer.
4. Preprocessing is deterministic, bounded by the analyzer sample budget, yields to the event loop, honors cancellation, reports truthful preparation state, and releases references on success/failure/cancel.
5. The opt-in production E2E must select the supplied file, reach `Ready`, display approximately 277.6 seconds / MP3 / two channels / 48 kHz, complete analysis, expose generated difficulties, start one generated chart, and observe advancing gameplay. It does not need to finish the 4:37 song.
6. That E2E also asserts the private basename/audio/path is absent from visible text, console output, same-origin/external requests, local/session storage, IndexedDB, Cache Storage, and service-worker resource URLs.

## Acceptance criteria

1. **Given** the accepted production build on loopback, **when** PWA resources are inspected through public browser behavior, **then** its manifest/icons/service worker are valid, same-origin, build-specific, and install-capable without any external deployment.
2. **Given** one completed online load, **when** the browser goes offline and reloads, **then** the repository-owned demo shell loads and a demo game starts; cache inventory contains only allowed owned build resources.
3. **Given** a newer waiting worker, **when** the player has not acted, **then** the current build remains active with an understandable update notice; when `Apply update` is chosen, takeover/reload happens once.
4. **Given** supported or unsupported install/audio/service-worker states, **when** the app opens or connectivity changes, **then** copy and enabled actions describe actual capability without promising cloud, upload, or unavailable offline behavior.
5. **Given** keyboard, pointer, reduced-motion, high-contrast, 1280×800, or 412×915 use, **when** the player traverses selection, analysis, correction, game, result, and history, **then** required controls/facts remain semantic, focused, contained, non-color-only, and operable.
6. **Given** any allowed remapped hit key, **when** gameplay is active, **then** it produces the same hit path as the on-screen control, while focused form fields are not intercepted and the setting survives reload.
7. **Given** `salt.mp3` through the private harness, **when** the local production flow runs, **then** select/decode/analyze/generated-chart-start succeeds within budgets and the event loop remains responsive.
8. **Given** private local audio, **when** tests, caches, storage, requests, logs, evidence, artifacts, and Git are inspected, **then** no audio, artwork, basename, path, selected-media identity, or decoded/worker samples have escaped.
9. **Given** exact-candidate CI/evidence, **when** Sprint 10 is reviewed, **then** owned fixtures demonstrate desktop/mobile/PWA/offline/accessibility/update behavior, the private harness is recorded only as automated nonvisual acceptance, and both isolated reviews pass without P0–P2 findings.

## Layer coverage

| Layer          | Planned coverage                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Frontend       | Install/update/connectivity panel, accessibility settings, remapped game input, responsive/accessibility refinements. |
| Domain/worker  | Bounded long-track downmix/resample preparation, cancellation, yielding, deterministic transfer contract.             |
| Contract       | Manifest, service-worker cache/update messages, versioned preferences, private harness privacy assertions.            |
| Infrastructure | Immutable Vite build served only on loopback; no server application or external deployment.                           |
| CI/CD          | Unit/component/contract tests, desktop/mobile production E2E, WCAG scan, PWA/offline checks, exact artifact smoke.    |
| Privacy        | Owned evidence media; `salt.mp3` ignored and locally supplied only; cache/storage/network/log/artifact guards.        |

## Test mapping

| Criterion | Planned verification                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| 1         | Manifest schema/resource tests plus production browser registration/installability assertions.                  |
| 2         | Service-worker/cache unit tests and controlled offline production reload/demo-start E2E.                        |
| 3         | Worker lifecycle unit/component tests and deterministic waiting-worker browser simulation.                      |
| 4         | Capability-state tables and connectivity/install component plus production E2E.                                 |
| 5         | Component semantics, axe WCAG A/AA scans, keyboard tests, and desktop/mobile containment E2E/evidence.          |
| 6         | Preference contract/storage tests and game key/input interception component/E2E tests.                          |
| 7         | Preprocessor numerical/boundary/cancel/yield tests and opt-in private production E2E with `PRIVATE_AUDIO_PATH`. |
| 8         | Git/artifact inventory plus UI/console/request/storage/IndexedDB/cache/service-worker private-value assertions. |
| 9         | Full CI, exact build/hash manifest, owned evidence capture, artifact smoke, Product Review, and Code Review.    |

## Evidence plan

Product evidence will use only the repository-owned bundled demo and synthesized fixtures. It will show desktop and 412-pixel mobile home/settings, focus/key/motion state, offline-ready demo, update notice/application, active game, editor/result/history containment, and unsupported capability messaging. The Delivery Agent will validate only automated assertions, inventory/hashes/build identity, and video stream metadata. `salt.mp3` is excluded from every image/video/artifact and from Product Reviewer access.

The implemented design follows the current MDN installability contract: a manifest with required identity/start/display/icons and an eligible `localhost` or `127.0.0.1` origin. Its update flow uses `skipWaiting()` only in response to the player's explicit action, because that method forces the waiting worker to become active. See [Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) and [ServiceWorkerGlobalScope.skipWaiting()](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting).

## Preview and deployment

- Required preview: exact static production build at `http://127.0.0.1:4173`.
- Required external deployment: none.
- GitHub Pages: not requested and not part of this sprint.
- Application server/API: none.

## Rollback

Revert the atomic Sprint 10 commit and restore the accepted Sprint 09 artifact. Unregister this application's service worker and delete only caches bearing its documented prefix if local cleanup is needed. Accessibility preferences may be removed from their exact local-storage key. No server, cloud resource, upload, public site, or private-audio copy exists to roll back.

## Review status

- Automated verification: pending.
- Product Review: pending; black-box owned-media packet and visible loopback site only.
- Code Review: pending; implementation sources/tests/config/diff only, without site or product artifacts.

## Known limitations

- A browser-provided install prompt cannot be forced; the app can only surface it when supplied and otherwise explain the browser menu path.
- Physical-device validation cannot be claimed without an available device. The required automated mobile surface is 412×915 Chromium; any actual-device result is recorded separately.
- Offline local-song analysis is conditional on this exact build's worker/assets having completed cache verification; bundled-demo offline play is the guaranteed path.
