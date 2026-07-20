export const GAME_HEIGHT = 540;
export const TARGET_Y = 430;
export const APPROACH_PIXELS_PER_SECOND = 260;

export function noteYForSongTime(
  noteTimeSeconds: number,
  songTimeSeconds: number,
): number {
  return (
    TARGET_Y - (noteTimeSeconds - songTimeSeconds) * APPROACH_PIXELS_PER_SECOND
  );
}
