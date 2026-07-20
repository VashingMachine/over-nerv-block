import { useEffect, useRef } from "react";

import type { RhythmChart } from "@rhythm-game/chart-schema";

import { loadPhaser } from "./phaserRuntime";
import { GAME_HEIGHT, noteYForSongTime } from "./timing";

const GAME_WIDTH = 960;

interface RhythmGameCanvasProps {
  chart: RhythmChart;
  getSongTime: () => number;
  isNoteJudged: (noteIndex: number) => boolean;
  onInput: (eventTimestampMilliseconds: number) => void;
}

export function RhythmGameCanvas({
  chart,
  getSongTime,
  isNoteJudged,
  onInput,
}: RhythmGameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const getSongTimeRef = useRef(getSongTime);
  const isNoteJudgedRef = useRef(isNoteJudged);
  const onInputRef = useRef(onInput);

  getSongTimeRef.current = getSongTime;
  isNoteJudgedRef.current = isNoteJudged;
  onInputRef.current = onInput;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let disposed = false;
    let destroyGame: (() => void) | undefined;

    void loadPhaser().then((Phaser) => {
      if (disposed) {
        return;
      }

      class RhythmScene extends Phaser.Scene {
        private noteObjects: Phaser.GameObjects.Arc[] = [];

        create() {
          const centerX = GAME_WIDTH / 2;
          this.add.rectangle(
            centerX,
            GAME_HEIGHT / 2,
            300,
            GAME_HEIGHT,
            0x1b1917,
          );
          this.add.rectangle(centerX, 430, 270, 6, 0xec5a3d);
          this.add
            .text(centerX, 475, "PRESS SPACE · TAP CANVAS · HIT BUTTON", {
              color: "#a7a198",
              fontFamily: "monospace",
              fontSize: "17px",
            })
            .setOrigin(0.5);

          this.noteObjects = chart.notes.map(() =>
            this.add
              .circle(centerX, -50, 28, 0xf5f1e9)
              .setStrokeStyle(6, 0xe7c467),
          );

          this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) =>
            onInputRef.current(pointer.event?.timeStamp ?? performance.now()),
          );
        }

        override update() {
          const songTime = getSongTimeRef.current();
          chart.notes.forEach((note, index) => {
            const noteObject = this.noteObjects[index];
            const y = noteYForSongTime(note.timeSeconds, songTime);
            noteObject
              ?.setY(y)
              .setVisible(
                !isNoteJudgedRef.current(index) &&
                  y > -40 &&
                  y < GAME_HEIGHT + 40,
              );
          });
        }
      }

      const game = new Phaser.Game({
        type: Phaser.CANVAS,
        parent: container,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        backgroundColor: "#12110f",
        audio: { noAudio: true },
        scene: RhythmScene,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: GAME_WIDTH,
          height: GAME_HEIGHT,
        },
      });

      destroyGame = () => game.destroy(true);
    });

    return () => {
      disposed = true;
      destroyGame?.();
    };
  }, [chart]);

  return (
    <div
      className="game-canvas"
      ref={containerRef}
      role="img"
      aria-label="One-lane rhythm track with notes moving toward the hit line"
      data-testid="rhythm-canvas"
    />
  );
}
