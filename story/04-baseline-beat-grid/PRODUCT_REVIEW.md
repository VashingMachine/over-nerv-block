# Sprint 04 Product Re-review — Superseding report

Status: **PASS**

Exact candidate: `eb95113ed383d1c72c08c1ddbd39a25f644e5a1b`

CI run: `29791985706`

Artifact: `8480642300`

Artifact SHA-256: `ded305963b345d88afbdb263e9cd9db5e766c3505411a6b2f19a0a6305b6c582`

No P0–P2 black-box product finding remains.

## Acceptance assessment

| Criterion | Result                   | Product-review evidence                                                                                                                                                                                                                                                                              |
| --------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | PASS                     | The ready state clearly offers **Analyze beats**, explains local dedicated-worker/off-main-thread analysis, and retains the playable local preview.                                                                                                                                                  |
| 2         | PASS                     | Exact-candidate evidence shows named progress stages, percentages, “main thread stays available,” and **Cancel analysis**. The manifest records 33 heartbeat ticks at 25 ms against a minimum of three.                                                                                              |
| 3         | PASS at product boundary | The owned eight-second result visibly reports **120.0 BPM**, **13 beats**, and **baseline-dsp-v1**. Displayed beat times are finite, unique, ordered, and within duration. Full-sequence schema validation is reported by the permitted test summary and is not independently visible.               |
| 4         | PASS                     | Desktop and 412-pixel mobile evidence clearly presents tempo, count, analyzer version, bounded timeline, representative times, preview, and controls without visible horizontal escape.                                                                                                              |
| 5         | PASS at product boundary | The ready state truthfully warns that very long or multichannel tracks may be declined. Preview and replacement remain visible. The journey demonstrates cancellation and successful retry; separate evidence shows a stable no-onsets failure and retry. The over-budget wording is summary-backed. |
| 6         | UNVERIFIED by design     | Exact-once handle/array/listener/worker release is implementation-internal. No stale result replacing the current state appears in the visible journey.                                                                                                                                              |
| 7         | UNVERIFIED by design     | Corpus F1, tempo error, deterministic replay, and 60-second performance are not product-visible; the permitted test summary records them as passing.                                                                                                                                                 |
| 8         | PASS at product boundary | Exact evidence contains only the approved manifest and media. No filename, object URL, raw samples, file handle, or beat-grid data file appears. The manifest identifies repository-owned synthesized input. Hidden network/log/storage behavior is summary-backed.                                  |

Criteria 6–7 are intentionally outside a code-blind Product Reviewer's observability. Their technical acceptance comes from the isolated Code Review and automated results, not an invented visual claim.

## Findings

### P0–P2

None.

### P3 — over-budget evidence coverage

The preventive memory guidance is visibly verified, but no dedicated screenshot/video shows the actual over-budget rejection message and retained-preview replacement journey.

### P3 — video capture defect

During approximately the final second, the recorded page is scaled into the left portion of the 1280×800 video with gray space on the right. The complete failure state remains readable and is also covered by a valid full-width still.

### P3 — live interaction limitation

No browser backend was available in the reviewer session, so live clicking could not be repeated independently. The reviewer used the exact-candidate stills and frame-by-frame video inspection.

## Exact identity checks

- Manifest build identifier: exact candidate match.
- Visible build prefix: `eb95113ed383`.
- All six media SHA-256 hashes independently match `manifest.json`.
- Manifest SHA-256: `18488d59cea7400515762638a4b5a8f8b45c11d1b5e01b15d7228cdb9954ccf3`.
- The reviewer could not recompute the GitHub artifact digest because the original archive was not supplied, only the extracted directory.

## Isolation attestation

The reviewer inspected only the current Sprint 04 `README.md`, `TEST_EVIDENCE.md`, `DEPLOYMENT.md`, and exact-candidate manifest/screenshots/video. The reviewer did not inspect source, tests, DOM, accessibility tree, developer tools, logs, network/storage panels, diffs, Git data, configuration, CI internals/output, Code Review material, automation selectors, or implementation structure.

## Verdict

**PASS** — no P0–P2 black-box product finding remains.
