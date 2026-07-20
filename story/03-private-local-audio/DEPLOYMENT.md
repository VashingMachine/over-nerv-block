# Sprint 03 preview and build

Status: accepted static production build verified on loopback; external deployment is not required.

This remains a static browser-only production build served on loopback. External deployment is not required. Local selection and decoding create no server/API, upload route, cloud account, credential, database, or persistent raw-audio record.

## Preview procedure

1. Run `npm run build`.
2. Run `npm run preview --workspace @rhythm-game/web -- --host 127.0.0.1 --port 4173`.
3. Open `http://127.0.0.1:4173`.

CI uses the same static production build and loopback address to run E2E and capture review evidence. The build and evidence are uploaded as a GitHub Actions artifact for traceability only; the application is not hosted externally.

## Accepted candidate record

- Build: `e580cf56f147dce014356630beba3115d4c9ee79`
- CI run: `29789371401`
- Artifact: `8479684433`
- Artifact SHA-256: `1dba7a025517760a69b0d133df1de9dff021e103b421d9d8a507d0efa787d951`
- Preview type: loopback production build
- External URL: not applicable

The committed evidence was imported verbatim from that successful CI artifact. The rejected pre-remediation candidate and artifact are not acceptance inputs.

## Rollback

Restore the Sprint 02 artifact or revert Sprint 03. Any active object URL, decode context, and sample handle are tab-memory resources released when the page closes; there is no remote or persistent audio to remove.
