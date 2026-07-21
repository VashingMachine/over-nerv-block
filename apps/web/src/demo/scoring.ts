import type { NoteJudgment, RhythmChart } from "@rhythm-game/chart-schema";
import {
  goodWindowMilliseconds,
  perfectWindowMilliseconds,
} from "@rhythm-game/chart-schema";

export { deriveResultSummary } from "@rhythm-game/chart-schema";

export const PERFECT_WINDOW_MILLISECONDS = perfectWindowMilliseconds;
export const GOOD_WINDOW_MILLISECONDS = goodWindowMilliseconds;

function timingOffsetMilliseconds(
  inputTimeSeconds: number,
  noteTimeSeconds: number,
): number {
  return (
    Math.round((inputTimeSeconds - noteTimeSeconds) * 1_000_000_000) / 1_000_000
  );
}

export function calibratedSongTime(
  rawSongTimeSeconds: number,
  calibrationOffsetMilliseconds: number,
): number {
  return rawSongTimeSeconds - calibrationOffsetMilliseconds / 1_000;
}

export function judgmentForOffset(
  offsetMilliseconds: number,
): NoteJudgment["judgment"] {
  const distance = Math.abs(offsetMilliseconds);
  if (distance <= PERFECT_WINDOW_MILLISECONDS) {
    return "perfect";
  }
  if (distance <= GOOD_WINDOW_MILLISECONDS) {
    return "good";
  }
  return "miss";
}

export function collectExpiredMisses(
  chart: RhythmChart,
  judgments: readonly NoteJudgment[],
  rawSongTimeSeconds: number,
  calibrationOffsetMilliseconds: number,
): NoteJudgment[] {
  const judged = new Set(judgments.map((record) => record.noteIndex));
  const judgmentTime = calibratedSongTime(
    rawSongTimeSeconds,
    calibrationOffsetMilliseconds,
  );
  const additions = chart.notes.flatMap((note, noteIndex) => {
    const offsetMilliseconds = timingOffsetMilliseconds(
      judgmentTime,
      note.timeSeconds,
    );
    if (
      judged.has(noteIndex) ||
      offsetMilliseconds <= GOOD_WINDOW_MILLISECONDS
    ) {
      return [];
    }
    return [
      {
        noteIndex,
        noteTimeSeconds: note.timeSeconds,
        inputTimeSeconds: null,
        offsetMilliseconds: null,
        judgment: "miss" as const,
      },
    ];
  });
  return [...judgments, ...additions].sort(
    (left, right) => left.noteIndex - right.noteIndex,
  );
}

export function recordInput(
  chart: RhythmChart,
  judgments: readonly NoteJudgment[],
  rawSongTimeSeconds: number,
  calibrationOffsetMilliseconds: number,
): NoteJudgment[] {
  const withMisses = collectExpiredMisses(
    chart,
    judgments,
    rawSongTimeSeconds,
    calibrationOffsetMilliseconds,
  );
  const judged = new Set(withMisses.map((record) => record.noteIndex));
  const inputTimeSeconds = calibratedSongTime(
    rawSongTimeSeconds,
    calibrationOffsetMilliseconds,
  );

  const candidate = chart.notes
    .map((note, noteIndex) => ({
      note,
      noteIndex,
      offsetMilliseconds: timingOffsetMilliseconds(
        inputTimeSeconds,
        note.timeSeconds,
      ),
    }))
    .filter(
      ({ noteIndex, offsetMilliseconds }) =>
        !judged.has(noteIndex) &&
        Math.abs(offsetMilliseconds) <= GOOD_WINDOW_MILLISECONDS,
    )
    .sort(
      (left, right) =>
        Math.abs(left.offsetMilliseconds) -
          Math.abs(right.offsetMilliseconds) ||
        left.noteIndex - right.noteIndex,
    )[0];

  if (!candidate) {
    return withMisses;
  }

  return [
    ...withMisses,
    {
      noteIndex: candidate.noteIndex,
      noteTimeSeconds: candidate.note.timeSeconds,
      inputTimeSeconds,
      offsetMilliseconds: candidate.offsetMilliseconds,
      judgment: judgmentForOffset(candidate.offsetMilliseconds),
    },
  ].sort((left, right) => left.noteIndex - right.noteIndex);
}

export function completeJudgments(
  chart: RhythmChart,
  judgments: readonly NoteJudgment[],
): NoteJudgment[] {
  const judged = new Set(judgments.map((record) => record.noteIndex));
  return [
    ...judgments,
    ...chart.notes.flatMap((note, noteIndex) =>
      judged.has(noteIndex)
        ? []
        : [
            {
              noteIndex,
              noteTimeSeconds: note.timeSeconds,
              inputTimeSeconds: null,
              offsetMilliseconds: null,
              judgment: "miss" as const,
            },
          ],
    ),
  ].sort((left, right) => left.noteIndex - right.noteIndex);
}

export function currentCombo(judgments: readonly NoteJudgment[]): number {
  let combo = 0;
  for (const record of [...judgments].sort(
    (left, right) => left.noteIndex - right.noteIndex,
  )) {
    combo = record.judgment === "miss" ? 0 : combo + 1;
  }
  return combo;
}
