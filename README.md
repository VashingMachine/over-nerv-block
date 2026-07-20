# Over Nerv Block

A web-first rhythm game that will turn user-provided music into a playable one-button chart.

The normative delivery plan is [PROJECT_DELIVERABLES.md](./PROJECT_DELIVERABLES.md). Product progress is recorded under the story directory.

## Local development

Requirements: Node 22, Python 3.13, uv, and Docker.

    npm install
    uv sync --project services/api
    npm run dev

Open http://127.0.0.1:5173.

## Verification

    npm run verify
    npm audit --audit-level=high
    uvx pip-audit==2.10.1 --path services/api/.venv/lib/python3.13/site-packages
    npx playwright install chromium
    npm run test:e2e
    docker compose up --build

The local container stack is available at http://127.0.0.1:8080. If that port is occupied, use `WEB_PORT=18080 docker compose up --build`.

## Deployment

The GitHub **Deploy** workflow publishes immutable images and deploys a same-origin nginx/FastAPI service to Cloud Run. One-time setup and required repository variables are documented in [infra/gcp/README.md](./infra/gcp/README.md).
