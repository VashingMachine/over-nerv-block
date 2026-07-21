# Sprint 06 Decisive Candidate — Black-box Product Re-review

## Verdict

**PASS** — no unresolved P0, P1, or P2 product findings.

This report supersedes all earlier Sprint 06 Product Reviews. It is a self-contained assessment of only decisive candidate `3cd1387fc32d36025a4f703bed2e52feca755667`.

Review date: 2026-07-21

## Candidate reviewed

- Candidate build: `3cd1387fc32d36025a4f703bed2e52feca755667`
- CI run: `29799023098`
- Artifact: `8483094202`
- Supplied artifact digest: `sha256:7b3ff2ffd569d8e49cd938818247f22f4fa126bd76e28470f6e9103158a7d7a4`
- Designated production preview: `http://127.0.0.1:4173`
- Preview model: loopback-only static production build; no external deployment required

The supplied archive digest is recorded above but was not independently recomputed because the original archive was not part of the permitted review surface. I independently hashed every final evidence file. Each declared artifact hash and byte count matched the manifest:

| Evidence                           | Independent SHA-256                                                | Observation                                |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| `desktop-easy.png`                 | `c48d43f395d09afa6b253cd4e36fcc19a1e6e7c923e3dc8c273a1b385fe9a1f9` | 523,892 bytes; Easy selected               |
| `desktop-medium.png`               | `d3d724dcbd6f3a8a9cb6e17526e693ec5b15bd08d884017d1690deefa072835f` | 523,111 bytes; Medium selected             |
| `desktop-hard.png`                 | `021fad90087efbdd59fc60fa848683eae71a84c3144ceb2a38d4e68ae860c433` | 520,444 bytes; Hard selected               |
| `desktop-hard-playing.png`         | `2d5d259722a4aa422d0bd2ec3832bbb158eda619e44986f2e201a7792270267d` | 20,291 bytes; active one-lane play         |
| `desktop-generated-results.png`    | `61eb8dce0d308c24a4395bd3be2e953751da950f6604f092036e8fbf7c803141` | 18,166 bytes; completed result             |
| `desktop-insufficient-rhythm.png`  | `416d5f57baeedbaa384f53a3962beea95d4f533d72e9d81d007d2dd195f44c49` | 258,592 bytes; safe refusal                |
| `generated-difficulties-loop.webm` | `05eb745eb029c5c1cd26598e50742ca073bbdb8c35553ecf6bdea74b0ecec693` | 1,525,819 bytes; 19.52 s, 1280×800, 25 fps |
| `mobile-medium.png`                | `cfe7dd0c4851f8b526d7223483c5670593386a47f92961eff46eded569fb7540` | 1,471,756 bytes; 412 px mobile scenario    |

The independently computed manifest hash is `40a67ab7985e51f1062523f55f7a3a00adceb6ccb38f47d10fcbeb3f36ddd64b`. The manifest's full build identifier and the `3cd1387fc32d` prefix visible throughout desktop and mobile evidence agree.

## Acceptance criteria

### 1. Deterministic, versioned generation

**PASS at the visible product boundary.** Easy, Medium, and Hard evidence consistently exposes analyzer `quality-dsp-v1`, generator `difficulty-generator-v1`, seed `0`, selected difficulty, and identical owned-input analysis facts. Exact byte-equivalent replay and schema validation are internal properties and were not inspected under the black-box restriction.

### 2. All difficulties are available, increasingly dense, and nested

**PASS.** The same 8-second, 120 BPM analysis offers Easy with 4 notes, Medium with 7, and Hard with 13. The timelines visibly retain all Easy anchors in Medium and all Medium markers in Hard. Counts increase strictly, each card is selectable, and the visual progression is material rather than cosmetic.

### 3. Playability and chart invariants

**PASS at the visible product boundary.** Every chart is presented as a single ordered lane. Timeline markers are distinct, maintain visible intro/outro room, and show no collision or impossible burst. Displayed values are coherent with the 8-second duration:

- Easy: 4 notes, 30 notes/minute, 0.90-second minimum spacing
- Medium: 7 notes, 53 notes/minute, 0.45-second minimum spacing
- Hard: 13 notes, 98 notes/minute, 0.24-second minimum spacing

The visible patterns are more spacious than their limits and remain readable. Exact schema enforcement and exhaustive invariant validation are internal and were not inspected.

### 4. Difficulty strategy and truthful note-source presentation

**PASS at the visible product boundary.** Easy is described and shown as four bar-start/safe anchors. Medium keeps those four anchors and adds three alternating beats. Hard preserves all seven Medium markers and adds the remaining safe detected beats for 13 total. Anchor colors and added-beat colors remain consistent across timelines. Exact serialized `downbeat`/`beat`/`onset` source fields are internal and were not inspected.

### 5. Conservative handling of unsafe input

**PASS.** The 2.2-second edge input reports four beats, uncertain meter, zero downbeats, and low 57% overall confidence. The product shows `No safe playable chart`, explains that there are not enough safe rhythmic anchors for three difficulties, offers Analyze again/Replace music/Clear selection recovery, and exposes no play action. Weak evidence is not promoted into an unfair chart.

### 6. Readable selected-chart facts on desktop and mobile

**PASS.** Difficulty selection, note count, density, minimum spacing, analyzer version, generator version, guard explanation, seed, and start action are visible in the desktop captures. The 412-pixel Medium capture reflows these into a clear single column with complete cards, timeline, facts, privacy copy, and full-width actions; no clipped control or visible horizontal overflow appears.

### 7. Complete selected-audio gameplay path

**PASS, subject to the P3 audible-timing limitation.** The decisive video shows local analysis, all three difficulty selections, Hard selection, countdown, falling notes, one-button controls, scoring, pause, resume, restart, completion, results, and Retry.

The transport sequence is directly visible:

1. Hard play reaches 0.4 seconds.
2. The stage displays `PAUSED`, the button changes to `Resume`, and progress remains at 0.4 seconds for about 1.2 seconds.
3. Resume returns to moving notes and advancing progress.
4. Restart resets progress to 0.0 seconds and starts a fresh `3–2–1` countdown.
5. The restarted 13-note run completes at 1,000 points with 7.7% accuracy, maximum combo 1, 1 Perfect, 0 Good, and 12 Misses.

The result is internally coherent: 1 Perfect plus 12 Misses accounts for all 13 notes, and one full-credit judgment out of 13 rounds to 7.7%. The video also visibly shows the score reach 1,000 during play.

### 8. Replacement and generated-path teardown

**PASS at the visible product boundary.** After the completed Hard result, the video replaces the selected input and removes the former gameplay/result state before analyzing the new short input. The replacement gets its own analysis and conservative refusal. Replace and Clear controls remain present. Exact buffer, timer, and object-URL cleanup are internal lifecycle properties and were not inspected.

### 9. Loopback, owned evidence, and local-only privacy

**PASS at the visible product boundary.** The manifest identifies a loopback production build using repository-owned synthesized inputs. The interface prominently states that music is decoded only in the tab, is not uploaded, and is not saved. The evidence shows no private filename, object URL, raw sample dump, generated chart file, credential, or personal information. The permitted repository-owned WAV is an 8-second mono PCM fixture and agrees with the evidenced track duration/size after browser decoding. Network-level upload verification is outside the Product Review boundary and was not inspected.

## Product assessment

### Clarity and fairness

Difficulty differences are understandable and fair for the evidenced 120 BPM pulse. Easy gives four structural anchors roughly two seconds apart. Medium adds alternating beats at roughly one-second intervals. Hard uses the full detected beat sequence at roughly half-second intervals. Hard is substantially busier without becoming visually unreadable or creating an impossible burst.

The product exposes note counts, calculated density, minimum spacing, generation versions, timing windows (`Perfect ±50 ms`, `Good ±120 ms`), universal controls (Space, canvas, or Hit), device offset, and calibration. The player can make an informed selection instead of trusting vague labels.

During play, score, combo, misses, progress, Pause/Resume, Restart, and Hit remain visible. The deliberately weak performance still completes normally and reports an honest result instead of trapping the player.

### Responsiveness and mobile presentation

The 25 fps evidence shows continuous countdown, note motion, scoring, the held pause, resumed motion, reset countdown, completion, replacement, and analysis recovery without a visible hang. The mobile view is long because it preserves detailed analysis, but its content and tap targets remain legible in a contained single-column layout. Live keyboard, pointer, and touch feel could not be independently exercised because the review environment exposed no browser.

### Privacy communication

Privacy is explained before analysis and reiterated on the generated-song card: processing occurs in the current tab, nothing is uploaded, and audio is not saved. The refusal state and evidence do not reveal a filename. The promise is plain enough for a normal user to understand.

## Exploratory edge review

The decisive run intentionally records only one successful judgment and misses the other 12 notes. The game remains stable, completes all 13 judgments, calculates a consistent result, and offers Retry. This is a valuable product edge: an inactive or novice player is neither crashed nor blocked by poor performance.

The separate short/uncertain input tests the opposite edge. Rather than manufacturing a chart from a weak rhythmic context, the product refuses generation and offers recovery. Together, the two edges support the fairness and error-handling goals.

## Findings by severity

### P0

None.

### P1

None.

### P2

None.

### P3

1. **Live and audible synchronization could not be independently judged.** Browser discovery returned no available browser for the designated loopback preview, and the WebM contains video but no audio stream. Visual timing, held pause, resume, and restart are coherent, but a future review packet should include permissible owned audio or a functioning live-review surface so beat-to-sound synchronization and keyboard/pointer/touch feel can be assessed directly.
2. **Video framing briefly reduces evidence clarity.** Rapid difficulty-selection and final safe-failure transitions show reduced-scale content with large gray/blank regions. Relevant states remain readable and are backed by exact-candidate static evidence, so no product failure is hidden. A fixed viewport/capture scale would improve future review packets.
3. **Results are held briefly in the video.** The complete result is visible and has a clear exact-candidate screenshot, but retaining it for at least one second would make the video independently easier to inspect.

## Exact evidence/site consistency

All permitted final screenshots, video frames, manifest entries, hashes, byte counts, visible chart facts, result arithmetic, and build prefixes are mutually consistent with `3cd1387fc32d36025a4f703bed2e52feca755667`. The designated preview itself could not be independently cross-checked because no browser was available. I did not substitute DOM automation, devtools, source inspection, or any implementation-facing surface. This is a P3 review limitation rather than a blocking inconsistency because exact-candidate production evidence directly covers all nine product paths and contains no contradictory state.

## No-code-access attestation

I did not inspect source code, tests, DOM, network internals, logs, or code-review material.

I also did not inspect schemas, package/configuration/workflow files, Git history/diff/status, CI internals, quality-review files, `CODE_REVIEW_STATUS.md`, any Code Review, or any earlier `PRODUCT_REVIEW.md`. The review used only the permitted product requirements, Sprint 06 README, decisive evidence directory and media, preview browser availability, and the permitted repository-owned WAV metadata.
