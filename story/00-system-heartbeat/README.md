---
story_id: "00"
title: "Stakeholder can verify the deployed system heartbeat"
status: in_progress
sprint: 0
implementation_commit: self
preview_url: pending
staging_url: pending
automated_tests: in_progress
product_review: pending
code_review: pending
deployed: false
---

# Sprint 00 — Deployed system heartbeat

## User story

As a stakeholder, I can open a deployed preview and see that the web app and API are healthy, so every later story has a verified delivery path.

## Delivered outcome

In progress. The candidate provides a responsive system screen backed by real FastAPI health/version endpoints and a shared versioned contract.

## Scope

### In scope

- Monorepo foundations and lockfiles.
- Responsive web status screen.
- API /api/health and /api/version endpoints.
- Shared chart/system schema package.
- Production builds and containers.
- CI verification and deployed-style Playwright E2E.
- Immutable preview/staging deployment and evidence.

### Out of scope

- Game mechanics, music playback, uploads, and analysis.

## Acceptance criteria

1. **Given** the preview is deployed, **when** a stakeholder opens it on desktop, **then** the page visibly reports “System online” using real API data.
2. **Given** the same preview, **when** it is opened at a mobile viewport, **then** status and version information remain readable without horizontal scrolling.
3. **Given** the API is unavailable or invalid, **when** the page checks status, **then** it shows an unavailable state and retry action.
4. **Given** the candidate, **when** CI runs, **then** formatting, linting, types, unit, API, contract, production build, container build, and E2E checks pass.
5. **Given** an accepted candidate, **when** it is promoted, **then** staging serves the same immutable build and passes a heartbeat smoke test.

## Layer coverage

| Layer            | Coverage                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| Frontend         | React status, loading, online, unavailable, retry, responsive styling.                            |
| Backend          | FastAPI health/version endpoints and restricted CORS.                                             |
| Contract         | Shared Zod system/chart schema v1 and Pydantic responses.                                         |
| Infrastructure   | Production containers, local composition, GitHub CI; cloud publication pending provider identity. |
| CI/CD            | Static checks, tests, builds, E2E, container builds.                                              |
| E2E              | Desktop/mobile Chromium against production builds and real API.                                   |
| Security/privacy | No user data; no public API docs; non-root API container; response validation.                    |

## Test mapping

| Criterion | Evidence                                                         |
| --------- | ---------------------------------------------------------------- |
| 1         | tests/e2e/system-heartbeat.spec.ts desktop project.              |
| 2         | Same E2E scenario under mobile Chromium.                         |
| 3         | apps/web/src/App.test.tsx unavailable/retry test.                |
| 4         | Root verification, API Ruff, Playwright, and container-build CI. |
| 5         | Pending staging deployment and smoke result.                     |

## Evidence mapping

Pending immutable preview. Artifacts MUST NOT be accepted from localhost.

## Deployment

- Preview: pending cloud provider credentials/configuration.
- Staging: pending acceptance.

## Known limitations

- Cloud provider/budget were open in the delivery contract. No cloud identity is configured in the repository.
- Safari/Firefox real-device review begins when gameplay timing is introduced; Sprint 00 automation uses Chromium.

## Review status

- Product Review: pending deployed preview and evidence.
- Code Review: pending completed candidate.

## Rollback

Revert the Sprint 00 commit or point hosting at the previous immutable image. No persistent data or migration exists.

## Follow-up

- Sprint 01 adds the bundled playable song only after this delivery runway is accepted.
