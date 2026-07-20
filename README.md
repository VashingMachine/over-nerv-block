# Over Nerv Block

A browser-first rhythm game that will turn user-provided music into a playable one-button chart. Music selection, playback, and automatic beat analysis stay on the user's device by default.

The normative delivery plan is [PROJECT_DELIVERABLES.md](./PROJECT_DELIVERABLES.md). Product progress is recorded under the story directory.

## Local development

Requirement: Node 22.

    npm install
    npm run dev

Open http://127.0.0.1:5173.

## Verification

    npm run verify
    npm audit --audit-level=high
    npx playwright install chromium
    npm run test:e2e

## Deployment

No external deployment is required. `npm run build` creates the production static site in `apps/web/dist`, and `npm run test:e2e` serves that build on loopback for browser verification.

GitHub CI packages the exact static build and automatically captures the story evidence from the loopback production preview. GitHub Pages remains an optional future publication target; no cloud account, server, upload bucket, or music-processing service is required.
