import type Phaser from "phaser";

type SoundManagerWithContext = Phaser.Sound.BaseSoundManager & {
  context?: AudioContext;
  unlock?: () => void;
};

export class AudioDirector {
  muted: boolean;
  private context?: AudioContext;
  private nextMusicAt = 0;
  private noteIndex = 0;

  constructor(scene: Phaser.Scene, muted: boolean) {
    this.muted = muted;
    const manager = scene.sound as SoundManagerWithContext;
    this.context = manager.context;
  }

  unlock(): void {
    if (!this.context) return;
    if (this.context.state === "suspended") void this.context.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  update(chapter: number, playing: boolean): void {
    if (!this.context || this.muted || !playing || this.context.state !== "running") return;
    const now = this.context.currentTime;
    if (this.nextMusicAt < now - 0.4) this.nextMusicAt = now;
    const interval = [0.23, 0.225, 0.21, 0.205, 0.19, 0.185, 0.18, 0.17, 0.165][chapter] ?? 0.23;
    const palettes = [
      [220, 277, 330, 415],
      [196, 233, 294, 349],
      [196, 247, 294, 370],
      [208, 262, 330, 392],
      [174, 220, 262, 330],
      [147, 185, 220, 277],
      [165, 196, 247, 294],
      [165, 208, 247, 311],
      [139, 175, 208, 262],
    ];
    const notes = palettes[chapter] ?? palettes[0];
    while (this.nextMusicAt < now + 0.12) {
      const frequency = notes?.[this.noteIndex % notes.length] ?? 220;
      this.tone(frequency, 0.055, 0.022, "square", this.nextMusicAt);
      if (this.noteIndex % 4 === 0) this.tone(frequency / 2, 0.09, 0.012, "triangle", this.nextMusicAt);
      this.noteIndex += 1;
      this.nextMusicAt += interval;
    }
  }

  flip(gravity: -1 | 1): void {
    this.unlock();
    this.tone(gravity < 0 ? 620 : 440, 0.075, 0.055, "square");
    this.tone(gravity < 0 ? 820 : 560, 0.035, 0.025, "triangle", undefined, 0.025);
  }

  land(): void {
    this.tone(130, 0.045, 0.04, "square");
  }

  feather(chain: number): void {
    this.tone(720 + chain * 90, 0.085, 0.045, "triangle");
  }

  bonus(): void {
    [660, 880, 1100].forEach((frequency, index) => this.tone(frequency, 0.08, 0.04, "square", undefined, index * 0.045));
  }

  gate(): void {
    this.tone(300, 0.035, 0.025, "square");
  }

  death(): void {
    [220, 180, 140, 95].forEach((frequency, index) => this.tone(frequency, 0.12, 0.055, "sawtooth", undefined, index * 0.055));
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    at?: number,
    delay = 0,
  ): void {
    if (!this.context || this.muted || this.context.state !== "running") return;
    const start = (at ?? this.context.currentTime) + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}
