# Sprint 01 preview and build

Status: accepted production static build verified on loopback; external deployment is not required.

The story uses the production static build served on `127.0.0.1:4173`. It has no API, cloud service, database, credentials, or upload path. CI rebuilds the same static files with a commit-specific visible build identifier, exercises them in desktop/mobile Chromium, captures Product Review evidence, and packages build plus evidence as a retained artifact.

The generated audio and every asset URL are relative, so the artifact remains compatible with an optional subdirectory static host without making hosting part of acceptance.

Candidate record:

- Build: `3d57f4ab0d3355ada097e57d7ea51b7317815573`
- CI run: `29781666671`
- Artifact: `8476876330`
- Artifact SHA-256: `155dfac4db3c96fcd27d44803d5117074e22d774595561b9f97168e34bb906a1`
- Expiry: 2026-08-19; the final story commit retains the Product Review evidence permanently.

## Rollback

Restore the Sprint 00 artifact or revert the Sprint 01 commit. No server, migration, or persistent user data is involved.
