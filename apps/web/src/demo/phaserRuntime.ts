async function importPhaser() {
  const { default: Phaser } = await import("phaser");
  return Phaser;
}

let phaserPromise: ReturnType<typeof importPhaser> | null = null;

export function loadPhaser() {
  phaserPromise ??= importPhaser();
  return phaserPromise;
}
