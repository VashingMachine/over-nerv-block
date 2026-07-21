# Sprint 04 preview and build

Status: accepted static production build verified on loopback; external deployment is not required.

This remains a static browser-only production build served on loopback. The beat analyzer is a module worker bundled with the site, not a server process. External deployment is not required. Analysis creates no API, upload route, cloud account, credential, database, or persistent raw-audio/beat-grid record.

## Preview procedure

1. Run `npm run build`.
2. Run `npm run preview --workspace @rhythm-game/web -- --host 127.0.0.1 --port 4173`.
3. Open `http://127.0.0.1:4173`.

CI uses the same static production build and loopback address for E2E and exact-candidate evidence capture. The build and evidence are uploaded as a GitHub Actions artifact for traceability only; the application is not hosted externally.

## Accepted candidate record

- Build: `eb95113ed383d1c72c08c1ddbd39a25f644e5a1b`
- CI run: `29791985706`
- Artifact: `8480642300`
- Artifact SHA-256: `ded305963b345d88afbdb263e9cd9db5e766c3505411a6b2f19a0a6305b6c582`
- Preview type: loopback production build
- External URL: not applicable

The committed evidence was imported verbatim from that successful CI artifact. The rejected pre-remediation candidate and artifact are not acceptance inputs.

## Rollback

Restore the Sprint 03 artifact or revert Sprint 04. Terminating the tab/worker releases in-memory analysis resources; there is no remote or persistent analysis data to remove.
