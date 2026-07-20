# Sprint 00 test evidence

Status: browser-only candidate passes local and remote automated verification; independent Product and Code Reviews pass.

Candidate: `68b3429df95a7eb9ef29ea124e592588e5bf353e`

GitHub Actions: [Verify run 29777273554](https://github.com/VashingMachine/over-nerv-block/actions/runs/29777273554) — passed

## Automated coverage

| Layer                      | Command or test                                                  | Current result                         |
| -------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| Formatting                 | `npm run format:check`                                           | Passed locally and remotely            |
| JavaScript/TypeScript lint | `eslint apps packages scripts tests`                             | Passed locally and remotely            |
| Type safety                | TypeScript project builds                                        | Passed locally and remotely            |
| Secret policy              | `npm run check:secrets`                                          | Passed locally and remotely            |
| License policy             | `npm run check:licenses`                                         | Passed for 270 locked Node packages    |
| Node vulnerabilities       | `npm audit --audit-level=high`                                   | No vulnerabilities locally or remotely |
| Contract unit              | chart-schema Vitest suite                                        | 2 passed locally and remotely          |
| Web component              | loading, online, invalid, failure, retry, and recovery           | 3 passed locally and remotely          |
| Production build           | schema and Vite builds including `build-info.json`               | Passed locally and remotely            |
| Browser E2E                | desktop/mobile healthy path plus manifest failure/retry recovery | 4 passed locally and remotely          |
| Static artifact            | CI upload with matching build identifier and SHA-256 digest      | Passed; artifact `8475158268`          |
| Product evidence           | desktop/mobile/video/failure/recovery capture                    | Captured; review pending               |

## Acceptance mapping

1. Healthy desktop state: component contract and desktop Playwright scenario pass.
2. Mobile readability: mobile Chromium scenario and live narrow-width Product Review pass.
3. Unavailable and retry recovery: component and desktop/mobile browser recovery scenarios pass.
4. Full CI: GitHub Actions run `29777273554` passed for the exact candidate.
5. Static artifact: candidate artifact `8475158268` was hashed and retained; exact final artifact follows the accepted commit.

Only the production build served on loopback may produce acceptance artifacts. The Vite development server and component-test DOM are engineering diagnostics and do not satisfy the preview boundary.

Finalization adds only story evidence and the two independent review reports. The final atomic commit's Verify run must repeat formatting, linting, type checks, policy/audit checks, unit/contract tests, production build, four Playwright scenarios, evidence capture, and artifact hashing before handoff.
