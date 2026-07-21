# Sprint 07 preview and build

Status: accepted loopback production preview and exact-candidate artifact verified. External deployment is not required.

## Required preview procedure

1. Build the static application with the exact candidate SHA as `VITE_BUILD_ID`.
2. Serve `apps/web/dist` only on `127.0.0.1:4173`.
3. Run production E2E and evidence capture against that loopback build.
4. Package the immutable static build and exact product evidence as a CI artifact.

There is no application server, API, cloud runtime, upload endpoint, database, or required public URL. Correction documents use browser storage and contain no audio or original/corrected analysis snapshot.

## Candidate identity

- Local dry-run build identifier: `sprint07-local-candidate`.
- Full production E2E: 36/36 pass.
- Evidence dry run: exact 12-media inventory plus manifest captured to an operating-system temporary directory and checked programmatically without visual inspection.
- Superseded candidate: `d40ea4a693a83b5024743f81cdac15dc16fff7a6`, CI run `29801154173`, artifact `8483829886`, digest `sha256:d9965f33b3b8700af21226985c1420c1804f35981461aa943f11ef58f43f7bf2`; automation and Code Review passed, but Product Review rejected four missing black-box evidence branches.
- Expanded evidence dry run: exact 25-media inventory plus manifest, including invalid/no-mutation, repeated undo, recovery variants, and corrected transport remediation; pass.
- Superseded remediation candidate: `dfa8d78299a2c9be37d5ab633da8599ec8da8bb1`, CI run `29801989862`, artifact `8484110304`, digest `sha256:8429cdc4fa154d90a012f1774405f73c6dc74e9e7bfb5b78a0a184e76bfbba49`; Code Re-review found that its different-analysis setup had already discarded the original correction.
- Final evidence remediation preserves the original per-fingerprint document, creates a coexisting second document, returns to the original unchanged revision, and asserts no-mutation on the minimum-beats rejection; exact 26-media dry run passed.
- Accepted reviewed candidate: `bd23829fe1f1831e97d19c6f87cee4e59afb0f52`.
- Accepted CI run: `29802543942`, pass.
- Accepted artifact: `8484302524`, digest `sha256:69ff94b6bf3b157ed56c3c49bd49ac7dbc4a9be370ad4f023474c4142ccf78ac`.
- Exact evidence manifest SHA-256: `771775f7aa9542629b2f2cebfdeebdb05a540efec270f495708044eb0e13698f`.
- External application deployment: intentionally not performed.

## Rollback

Restore the accepted Sprint 06 static artifact or revert the Sprint 07 atomic commit. Remove only Sprint 07 namespaced correction-document keys if rollback cleanup is desired.
