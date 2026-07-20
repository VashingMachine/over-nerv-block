# Sprint 00 preview and build

Status: accepted production static build; loopback preview verified locally, in CI, and by black-box Product Review. External deployment is not required.

## Verification stages

| Stage             | Resource                                               | State                        |
| ----------------- | ------------------------------------------------------ | ---------------------------- |
| Development       | Vite development server on port 5173                   | Available                    |
| Candidate preview | `apps/web/dist` served on `127.0.0.1:4173`             | Verified locally and in CI   |
| Accepted artifact | GitHub Actions artifact for the atomic accepted commit | Produced by final Verify run |
| External hosting  | GitHub Pages or another static host                    | Not required                 |

The production build contains relative asset URLs, so the same files can be served from loopback, a subdirectory, or an optional static host. `build-info.json` records the build identifier, environment, app/schema versions, and `browser-local` processing mode.

CI builds the static files, runs Playwright against the production preview, captures review evidence from that same preview, and uploads both the build and evidence as one retained candidate artifact.

Candidate record:

- Build: `68b3429df95a7eb9ef29ea124e592588e5bf353e`
- CI run: `29777273554`
- Artifact: `8475158268`
- Artifact SHA-256: `337840de6120c7645605504877ec6e51fd96988111f54b339547de2e8ba8340d`
- Expiry: 2026-08-19; the final story commit retains the review evidence permanently.

The final atomic commit contains only documentation/review/evidence additions beyond this reviewed candidate. CI rebuilds with the final commit as its visible build identifier and repeats the production-preview E2E/evidence capture. This identifier-only change does not alter application logic, layout, wording, styling, or interaction behavior, so the candidate Product Review remains valid under the documentation-only finalization rule.

## External configuration

None. No cloud account, credentials, server, object storage, queue, database, or container registry is used.

## Rollback

Restore the previous accepted static artifact or revert the story commit. No persistent service or migration needs rollback.
