export type PlaybackOwner = symbol;

interface ActivePlayback {
  readonly owner: PlaybackOwner;
  readonly stop: () => void;
}

class PlaybackCoordinator {
  private active: ActivePlayback | null = null;

  claim(owner: PlaybackOwner, stop: () => void): void {
    const previous = this.active;
    if (previous?.owner !== owner) {
      this.active = null;
      previous?.stop();
    }
    this.active = { owner, stop };
  }

  release(owner: PlaybackOwner): void {
    if (this.active?.owner === owner) {
      this.active = null;
    }
  }
}

export const playbackCoordinator = new PlaybackCoordinator();
