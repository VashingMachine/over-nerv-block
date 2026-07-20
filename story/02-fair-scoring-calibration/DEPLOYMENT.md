# Sprint 02 preview and build

Status: accepted calibration-safe static build verified on loopback; external deployment is not required.

The story remains a static browser-only production build served on loopback. External deployment is not required. Persisted state is limited to validated numeric calibration and latest-result chart metadata in the browser profile.

CI will stamp the exact commit as the visible build identifier, run the production-preview browser suite, capture Product Review evidence from `127.0.0.1:4173`, and retain the build plus evidence as one hashed artifact. No server, cloud account, database, credentials, or upload path is introduced.

Candidate record:

- Build: `ca49be416bb60e32c2451eb1755fff4dc29f53e3`
- CI run: `29786997949`
- Artifact: `8478854090`
- Artifact SHA-256: `e3c68b0882be88bc9233c6c6e6f44c39704d2c068d56a4c4a57a70557bc7d3d6`
- Expiry: 2026-08-19; the final story commit will retain Product Review evidence permanently.

Superseded candidates remain recoverable as artifacts `8477774081`, `8478210601`, and `8478498541` until the same date but are not eligible for acceptance.

## Rollback

Restore the Sprint 01 artifact or revert Sprint 02. No server, migration, account, or audio persistence is involved.
