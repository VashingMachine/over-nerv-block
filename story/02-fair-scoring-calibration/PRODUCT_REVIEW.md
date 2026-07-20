# Sprint 02 Product Review

## Decision

**PASS**

- Review date: 2026-07-21
- Preview: `http://127.0.0.1:4173`
- Reviewed candidate: `ca49be416bb60e32c2451eb1755fff4dc29f53e3`
- Fresh visible Chrome identity: `ENVIRONMENT candidate`, `BUILD ca49be416bb6`
- Blocking findings: none

## Acceptance review

| #   | Criterion                             | Result | Black-box observation                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Device timing calibration             | PASS   | The calibration view visibly explains that positive offset is subtracted once. I saved the normal integer value `-10 ms`; the landing card still showed `DEVICE OFFSET -10 ms` after a full reload, and a complete scored run used that setting without disrupting judgment or completion.                     |
| 2   | Fair timing judgments and score       | PASS   | After five misses, a live input produced `GOOD +81 MS`, increased score from 0 to 500, and started combo 1 exactly once. Candidate evidence also shows Perfect scoring; the exact-candidate record covers the stated ±50 ms and ±120 ms boundaries.                                                            |
| 3   | Automatic misses and current feedback | PASS   | With no input, the visible Miss counter advanced during play and feedback became `MISS`. A no-input run completed as score 0, accuracy 0.0%, combo 0, and 13 misses. The next hit after accumulated misses immediately replaced `MISS` with the current `GOOD +81 MS` judgment.                                |
| 4   | Session transport                     | PASS   | Pause froze the song at 2.905333 seconds for more than 1.3 seconds with Hit disabled. Resume continued to 4.473333 seconds. The exact-candidate retry capture returns score, combo, misses, and progress to zero during a fresh countdown.                                                                     |
| 5   | Results, retry, and arithmetic        | PASS   | The calibrated live run completed with 500 points, one Good, 12 misses, 3.8% accuracy, and max combo 1; these values are internally consistent for 13 notes. A separate no-input run produced the expected zero result. Candidate result/retry evidence shows derived mixed judgments and a clean new session. |
| 6   | Interruption and recoverability       | PASS   | Paused gameplay remained safely frozen and resumed from the same position. Exact-candidate evidence shows a concise audio-unavailable message with the 503 reason and `Retry demo`, followed by a recovered countdown; the candidate test record covers visibility-loss pausing.                               |
| 7   | Desktop and mobile presentation       | PASS   | The live narrow Chrome window kept calibration, scoring, transport, feedback, and results readable and operable. Exact-candidate desktop and 412 px mobile captures show controls at the natural horizontal origin without clipping or overlap.                                                                |

## Regression disposition

The prior Miss-feedback P2 remains resolved on this exact candidate:

- no-input expiration increments the visible Miss counter and publishes live `MISS`;
- a later hit replaces that feedback with the current hit judgment and updates score/combo.

Normal saved integer calibration also remains healthy through save, reload, live scoring, and completion.

## Evidence consistency

- The active story README, test evidence, deployment record, manifest, visible preview, and screenshots all identify candidate `ca49be416bb60e32c2451eb1755fff4dc29f53e3`.
- The visible prefix `ca49be416bb6` matches the leading characters of the full candidate.
- All nine media artifacts matched the sizes and SHA-256 values declared in the manifest.
- The evidence packet reports 62 unit/contract/component checks and 10 production-browser scenarios passing for this candidate.

## Findings

No P0, P1, P2, or P3 product defects were found.

## Review limits

- Manual smoke testing used visible Chrome UI on macOS; desktop and exact 412 px conclusions also use the supplied exact-candidate captures.
- Exact timing-boundary assertions, visibility-loss handling, and forced audio failure/recovery use the permitted exact-candidate evidence and test record in addition to manually exercised representative flows.
- Fractional or tampered legacy calibration has no visible product entry path, so it was not injected during this isolated black-box review; the permitted exact-candidate record reports rejection coverage. Normal integer save/reload/scoring/completion was exercised directly.
- This review does not certify physical speaker, display, Bluetooth, or assistive-technology latency.

## Isolation attestation

I reviewed only the permitted product requirements, current story documents, current candidate evidence, and visible production-preview UI. I did not inspect source code, tests, DOM, network internals, logs, or code-review material.
