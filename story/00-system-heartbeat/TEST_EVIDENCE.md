# Sprint 00 test evidence

Status: local candidate verification passed; remote CI, deployed E2E, and staging smoke are pending.

## Automated coverage

| Layer                      | Command or test                                             | Current result                                  |
| -------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Formatting                 | `npm run format:check`                                      | Passed locally                                  |
| JavaScript/TypeScript lint | `eslint apps packages scripts tests`                        | Passed locally                                  |
| Python lint                | Ruff over API, tests, and scripts                           | Passed locally                                  |
| Type safety                | TypeScript project builds and strict mypy                   | Passed locally                                  |
| Secret policy              | `npm run check:secrets`                                     | Passed locally                                  |
| License policy             | `npm run check:licenses`                                    | Passed locally                                  |
| Node vulnerabilities       | `npm audit --audit-level=high`                              | No vulnerabilities                              |
| Python vulnerabilities     | pinned pip-audit 2.10.1 against the locked environment      | No known vulnerabilities after upgrading pytest |
| Contract unit              | chart-schema Vitest suite                                   | 2 passed                                        |
| Web component              | loading, online, failure, retry, and recovery               | 2 passed                                        |
| API integration            | health, version, and hidden documentation                   | 3 passed                                        |
| Production build           | schema and Vite builds                                      | Passed                                          |
| Browser E2E                | desktop and mobile healthy path plus failure/retry recovery | 4 passed against local production composition   |
| Container build            | API and nginx web images                                    | Passed for Compose and Cloud Run sidecar layouts |
| Container vulnerability    | pinned Trivy action                                         | Pending remote CI                               |
| Deployed E2E               | Playwright with external preview URL                        | Pending preview                                 |
| Post-deploy smoke          | preview/staging `/api/health`                               | Pending deployment                              |

## Acceptance mapping

1. Healthy desktop state: component contract test and desktop Playwright project; deployed run pending.
2. Mobile readability: mobile Chromium Playwright project; deployed run and Product Review pending.
3. Unavailable and retry recovery: component test and browser route-failure recovery scenario.
4. Full CI: workflow is configured; remote run pending candidate push.
5. Exact-artifact staging: deployment workflow promotes candidate image digests without rebuilding; execution pending reviews.

Local checks are engineering diagnostics only. They are not product evidence and do not satisfy the deployed-preview acceptance boundary.
