# Sprint 05 preview and build

Status: remediated exact-candidate production build verified on loopback; external deployment is not required.

This remains a static browser-only production build served on loopback. Quality analysis runs inside the bundled module worker. External deployment is not required. No server/API, cloud account, credential, database, model download, upload route, or persistent rhythm-analysis record is introduced.

## Preview procedure

1. Run `npm run build`.
2. Run `npm run preview --workspace @rhythm-game/web -- --host 127.0.0.1 --port 4173`.
3. Open `http://127.0.0.1:4173`.

CI uses the same static production build and loopback address for E2E and exact-candidate evidence capture. The build and evidence are uploaded as a GitHub Actions artifact for traceability only; the application is not hosted externally.

## Rejected initial candidate record

- Build: `4d4818b7009744c2779d31f68b7575b93aede5a2`.
- CI run: `29793591482`.
- Artifact: `8481216054`.
- Artifact SHA-256: `5fcf9c211c8fbf15f1bd1da8e16477467cab16443c308b31e9fca1e8b915edef`.
- Preview type: loopback production build.
- External URL: not applicable.

This build and its evidence were rejected after Code Review found three P2 blockers. The artifact remains traceability input only and is not a hosted application. The accepted remediated record below supersedes it.

## Remediated candidate record

- Build: `8dd0de8532eaef4bf2c7d18ce78fe96988976180`.
- CI run: `29794551355`.
- Artifact: `8481556819`.
- Artifact SHA-256: `aaa26b56900c100441742df3252c90e1e18fe3251147ba875fd4b7fd666c43b9`.
- Preview type: loopback production build.
- External URL: not applicable.

The imported replacement evidence identifies this exact build. It is a review artifact, not an externally hosted application.

## Rollback

Restore the Sprint 04 artifact or revert Sprint 05. Worker/sample resources are tab-memory only; there is no remote or persisted analysis data to remove.
