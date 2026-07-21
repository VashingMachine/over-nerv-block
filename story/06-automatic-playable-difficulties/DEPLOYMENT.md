# Sprint 06 preview and build

Status: accepted loopback production preview and exact-candidate artifact verified. External deployment is not required.

## Required preview procedure

1. Run `npm run build`.
2. Run `npm run preview --workspace @rhythm-game/web -- --host 127.0.0.1 --port 4173`.
3. Run production E2E, smoke, and evidence capture against `http://127.0.0.1:4173`.

The deliverable is a static browser application. It has no server/API, upload endpoint, cloud runtime, database, or required public URL. CI may retain the immutable static build and evidence as downloadable artifacts; that is traceability, not application hosting.

## Local production verification

- Preview: `http://127.0.0.1:4173`.
- Dry-run build identifier: `sprint06-local`.
- Full production E2E: 30/30 pass.
- Evidence capture: pass to an operating-system temporary directory; filenames and byte sizes checked without visual inspection.
- Superseded CI candidate: `65eb17e3a83686790612b939ddadca163b4fd5d7`, run `29797638693`, artifact `8482591968`, digest `sha256:9dd981a22b7d285c7d2df3efb388d9aab2e774e95cdb95a1c0a325867c951d2d`; it passed CI and Product Review but failed Code Review on keyboard readiness.
- Superseded CI candidate: `49c5c27028a2b5b7f404ddd0661d1ba4db8adda9`, run `29798426202`, artifact `8482884665`, digest `sha256:a8f6fc7f0da9613445b31f705fcb2187ec1a1dc5c45fdede3791282c35d9d016`; it passed CI and Product Review but failed Code Review on page-wide Space cancellation.
- Accepted reviewed candidate: `3cd1387fc32d36025a4f703bed2e52feca755667`.
- Accepted CI run: `29799023098`, pass.
- Accepted artifact: `8483094202`, digest `sha256:7b3ff2ffd569d8e49cd938818247f22f4fa126bd76e28470f6e9103158a7d7a4`.
- Exact evidence manifest SHA-256: `40a67ab7985e51f1062523f55f7a3a00adceb6ccb38f47d10fcbeb3f36ddd64b`.
- External application deployment: intentionally not performed.

## Rollback

Restore the accepted Sprint 05 static artifact or revert the Sprint 06 atomic commit. Generated charts and selected audio are tab-memory only in this story.
