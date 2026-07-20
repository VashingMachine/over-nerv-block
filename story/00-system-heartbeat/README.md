---
story_id: "00"
title: "Stakeholder can verify the production-build heartbeat"
status: accepted
sprint: 0
implementation_commit: self
preview_url: "http://127.0.0.1:4173"
staging_url: not_applicable
automated_tests: passed
product_review: passed
code_review: passed
deployed: false
---

# Sprint 00 — Production-build heartbeat

## User story

As a stakeholder, I can open the production preview and see exactly which browser build is ready, so every later story has a verified delivery path without requiring a cloud server.

## Delivered outcome

The candidate provides a responsive status screen backed by a generated, schema-validated `build-info.json`. It states that processing is browser-local and exposes the environment, application version, chart-schema version, and build identifier.

## Scope

### In scope

- Browser-only React/Vite/TypeScript foundation and lockfile.
- Responsive build status with loading, online, unavailable, retry, and recovery states.
- Versioned chart/build contract package.
- Production static build served on loopback.
- CI verification, production-preview Playwright E2E, packaged build, and evidence capture.

### Out of scope

- Game mechanics, music playback, local file selection, and beat analysis.
- FastAPI, uploads, cloud processing, containers, and external hosting.

## Acceptance criteria

1. **Given** the production build is served on loopback, **when** a stakeholder opens it on desktop, **then** the page visibly reports “System online” using its generated build manifest.
2. **Given** the same preview, **when** it is opened at a mobile viewport, **then** status and version information remain readable without horizontal scrolling.
3. **Given** the build manifest is unavailable or invalid, **when** the page checks status, **then** it shows an unavailable state and a retry action that can recover.
4. **Given** the candidate, **when** verification runs, **then** formatting, linting, types, unit, contract, production build, secret/license/dependency checks, and desktop/mobile E2E pass.
5. **Given** an accepted candidate, **when** CI packages it, **then** the static artifact contains the matching build manifest and requires no external server.

## Layer coverage

| Layer            | Coverage                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Frontend         | React status, loading, online, unavailable, retry, recovery, and responsive styling.                      |
| Worker/domain    | Not applicable: Sprint 00 introduces no audio or long-running domain work.                                |
| Contract         | Shared Zod build-manifest and chart-schema v1 contracts.                                                  |
| Infrastructure   | Production Vite build served on loopback; no external deployment is required by user decision.            |
| CI/CD            | Static checks, audits, tests, build, E2E, automated evidence capture, and static-artifact upload.         |
| E2E              | Desktop/mobile healthy path plus manifest failure/retry recovery against the production build.            |
| Security/privacy | No user data or audio; browser-local processing promise; secret and dependency/license checks; no server. |

## Test mapping

| Criterion | Evidence                                                                               |
| --------- | -------------------------------------------------------------------------------------- |
| 1         | Desktop Playwright healthy-path scenario and generated-manifest contract test.         |
| 2         | The same scenario under mobile Chromium plus horizontal-overflow assertion.            |
| 3         | React recovery test and desktop/mobile Playwright manifest-failure/retry scenario.     |
| 4         | Green GitHub Actions run `29777273554` for candidate `68b3429`.                        |
| 5         | CI artifact `8475158268`, SHA-256 `337840de…ba8340d`, with candidate build identifier. |

## Evidence mapping

The following CI-captured files come from candidate `68b3429df95a7eb9ef29ea124e592588e5bf353e` served as a loopback production build. They are intentionally not inspected by the Delivery or Code Review agents.

| Criterion | Product evidence                                                      |
| --------- | --------------------------------------------------------------------- |
| 1         | `evidence/desktop.png`; healthy-load segment in `evidence/demo.webm`  |
| 2         | `evidence/mobile.png`                                                 |
| 3         | `evidence/unavailable.png` and `evidence/recovered.png`               |
| 4–5       | `evidence/manifest.json`, CI run `29777273554`, artifact `8475158268` |

## Preview/build

- Designated preview: production static build at `http://127.0.0.1:4173` while the review server is running.
- External host: not required.
- Candidate CI artifact: `sprint-00-candidate-68b3429df95a7eb9ef29ea124e592588e5bf353e` (`8475158268`), retained through 2026-08-19.
- Accepted-commit CI artifact: produced by the final commit's Verify run using the same workflow; its build identifier changes to that commit while product behavior remains unchanged.

## Known limitations

- This is a delivery/build heartbeat, not a playable game.
- Browser-local beat analysis begins in later stories and must meet the corpus/performance gates in the project contract.
- Sprint 00 automation uses desktop/mobile Chromium; real-device timing review begins with gameplay.

## Review status

- Product Review: PASS in `PRODUCT_REVIEW.md`; live desktop/narrow-width and supplied evidence reviewed without implementation access.
- Code Review: PASS in `quality/code-reviews/00.md`; no unresolved P0–P3 findings and no site/artifact access.

## Rollback

Revert the Sprint 00 commit or restore the previous static artifact. There is no server, persistent user data, or migration.

## Follow-up

- Sprint 01 adds the bundled playable song only after this build runway is accepted.
