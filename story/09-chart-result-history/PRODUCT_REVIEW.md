# Sprint 09 Product Re-review

## Verdict

**PASS**

This isolated Product re-review applies only to exact remediated candidate `bf7151ea94c9f2ef3decc6638382256e45c57b30`. All nine frozen acceptance criteria pass. There are no unresolved P0, P1, or P2 product findings.

## Exact candidate and evidence identity

- Review date: 2026-07-21
- Candidate: `bf7151ea94c9f2ef3decc6638382256e45c57b30`
- Supplied CI run: `29811994171` — SUCCESS
- Supplied artifact ID: `8487880383`
- Supplied artifact name: `sprint-09-candidate-bf7151ea94c9f2ef3decc6638382256e45c57b30`
- Supplied artifact digest: `sha256:8e18c67d1ff728002b0013381687811ac76ad9d82b7eb2cc0e07ac8657037f55`
- Supplied exact-artifact smoke: 4/4
- Evidence captured at: `2026-07-21T07:54:53.458Z`
- Evidence production preview: `http://127.0.0.1:4173/`
- Supplied review-session build: `http://127.0.0.1:4174/`
- Independently calculated manifest SHA-256: `a89bbcc3ea55e3e8a04c397a37b7affc9532571b55b375f0a287486652d21737`

The manifest identifies the exact full candidate. The visible full-page evidence shows the matching `bf7151ea94c9` build prefix and Stage 09 label. The manifest declares 11 media artifacts and exactly 11 are present. I independently recalculated every declared byte count and SHA-256; all match. The video is an 18.56-second, 1280×800, 25 fps VP8 capture with one video stream and no audio stream.

No browser backend was available in this review environment, so the supplied loopback site could not be operated live. I did not substitute DOM inspection, developer tools, another automation backend, or source inspection. The exact integrity-checked visible packet and supplied exact-candidate CI/artifact/smoke identity are therefore the black-box review basis.

## Acceptance-criterion matrix

| #   | Result | Black-box product observations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | PASS   | `desktop-result-saved.png` shows the completed generated Easy chart, exact four-note timeline, result summary, analyzer/generator versions, and confirmation that chart/result history was saved while audio and filename were not. The exact manifest identifies version-one completion saving and a strictly audio/selection-free history scope.                                                                                                                                                                                                                                                                  |
| 2   | PASS   | The history explains its 20-entry maximum and browser-eviction boundary; the exact manifest asserts `maximumEntries: 20`. The migrated view shows two newest-first entries without a duplicate display artifact, and targeted deletion leaves exactly one. The exact candidate's successful CI and 4/4 artifact smoke cover the deterministic retention/upsert acceptance boundary without any contradictory visible state.                                                                                                                                                                                         |
| 3   | PASS   | `desktop-history-no-audio.png` restores played time, difficulty, score, accuracy, combo, note count, BPM/meter, analyzer, generator, and exact note timeline after return. It prominently says audio and filenames were never saved, explains retention, and offers reselect/delete/clear without any historical Start/play action.                                                                                                                                                                                                                                                                                 |
| 4   | PASS   | `desktop-history-reselect-ready.png` shows a deliberately reselected private local song in `Ready for analysis`, while recovered and history views remain audio-needed and expose no historical play action. `desktop-history-reanalysis-playable.png` shows `Start Easy chart` only after successful analysis/regeneration. The video connects the return, explicit reselect, analysis, and regenerated playable chart.                                                                                                                                                                                            |
| 5   | PASS   | `desktop-history-migrated.png`, `desktop-history-one-deleted.png`, and `desktop-history-cleared.png` visibly demonstrate an ordered targeted deletion followed by clear-all. Success notices explicitly state that music, recovery, corrections, and calibration were unchanged. The storage-denied state is truthful and nonfatal rather than claiming durability; the remediated exact candidate's supplied successful verification covers mutation ordering/control locking and retryable failure behavior.                                                                                                      |
| 6   | PASS   | `desktop-history-migrated.png` truthfully reports migration and renders two valid entries. `desktop-history-corrupt-discarded.png` reports invalid history discarded, renders no invalid entry, and states current music/recovery were unchanged. The exact manifest confirms version-zero migration and unknown-nested-field discard. The representative outward discard state, remediated exact-candidate verification, and absence of contradictory rendering support the broader invalid-record family.                                                                                                         |
| 7   | PASS   | `desktop-history-storage-denied.png` keeps file selection and the repository-owned bundled demo usable, reports recovery and chart-history storage as unavailable, says new results may not survive reload, and shows a truthful empty-history state. Nothing falsely claims persistence.                                                                                                                                                                                                                                                                                                                           |
| 8   | PASS   | Desktop entries use direct headings, readable result facts, timelines, privacy/retention guidance, and unambiguous reselect/delete/clear controls. `mobile-chart-history.png` keeps two entries, all facts, audio warning, timelines, reselect/delete actions, and clear-all in a contained single column with large touch targets and no observed horizontal clipping.                                                                                                                                                                                                                                             |
| 9   | PASS   | The exact manifest identifies a loopback static production build using repository-owned synthesized input with no external deployment requirement. The packet/video cover completion/save, audio-absent return, explicit reselect/reanalysis-to-play, migration, delete, clear, corruption recovery, storage denial, and mobile containment. No filename/private audio appears, and the video has no audio stream. Exact hashes, supplied CI success, artifact identity, and 4/4 artifact smoke agree. This report supplies the isolated Product Review; Code Review remains a separate gate and was not inspected. |

## Findings by severity

- P0: None.
- P1: None.
- P2: None.
- P3-1 — Review environment: no browser backend was available and the evidence video is silent. Live file-chooser feel, audible reanalysis/playback, physical input timing, and unscripted exploratory interaction could not be directly judged.
- P3-2 — Standalone evidence breadth: the 20-entry boundary, repeated-ID upsert, each corrupt-record subtype, and denied delete/clear with transient control locking do not each have their own visible capture. The representative visible states, exact manifest, remediated candidate identity, successful CI, and exact-artifact smoke are sufficient for this re-review, but future packets would be more independently auditable with dedicated captures for those edges.
- P3-3 — Entry differentiation: two results completed within the same displayed minute can show the same played-time label and very similar facts. Displaying seconds or an explicit newest/older label would make targeted deletion clearer.
- P3-4 — Mobile efficiency: the mobile view is contained and understandable, but multiple fully expanded entries require a long vertical review. Collapsible entry detail would make larger histories faster to scan.

## Isolation attestation

I used only the frozen Sprint 09 README, the exact supplied evidence packet, the supplied plain-text candidate/CI/artifact/smoke identity, and temporary derivative frames/contact sheets made solely to inspect that permitted media. I attempted to operate only the permitted loopback URL through the in-app browser workflow, but no browser backend was available.

I did not inspect application source code, tests, schemas, packages, configuration, workflow files, Git status/diffs/history, DOM or accessibility trees, developer tools, console or network internals, logs, CI logs or CI internals, `quality/**`, `CODE_REVIEW_STATUS`, or any Code Reviewer material.

I did not inspect source code, tests, DOM, network internals, logs, or code-review material.
