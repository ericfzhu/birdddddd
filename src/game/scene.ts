import Phaser from "phaser";
import { AudioDirector } from "./audio";
import {
  CHAPTERS,
  COLORS,
  FIXED_STEP_SECONDS,
  PLAY_BOTTOM,
  PLAY_TOP,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_X,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from "./constants";
import { GameModel } from "./model";
import type { GameEvent, VisibleRect } from "./types";

interface FeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: number;
}

interface StoredSettings {
  bestScore: number;
  muted: boolean;
  reducedMotion: boolean;
}

const STORAGE_KEY = "impossible-aviary:v1";
const textStyle = (size: number, color = "#f6e7c1"): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: '"Courier New", ui-monospace, monospace',
  fontSize: `${size}px`,
  fontStyle: "bold",
  color,
  align: "center",
  stroke: "#17182b",
  strokeThickness: size >= 12 ? 2 : 1,
});

export class AviaryScene extends Phaser.Scene {
  model!: GameModel;
  private settings!: StoredSettings;
  private background!: Phaser.GameObjects.Graphics;
  private world!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private ui!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private chapterText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private helperText!: Phaser.GameObjects.Text;
  private audio!: AudioDirector;
  private accumulator = 0;
  private manualMode = false;
  private uiTime = 0;
  private pulse = 0;
  private shake = 0;
  private landingSquash = 0;
  private chapterBanner = 0;
  private particles: FeatherParticle[] = [];

  constructor() {
    super("aviary");
  }

  create(): void {
    this.settings = this.loadSettings();
    const requestedSeed = Number(new URLSearchParams(window.location.search).get("seed"));
    const seed = Number.isFinite(requestedSeed) && requestedSeed > 0 ? requestedSeed >>> 0 : (Date.now() ^ 0x51a7e) >>> 0;
    this.model = new GameModel(seed, this.settings.bestScore);
    this.model.reducedMotion = this.settings.reducedMotion;

    this.background = this.add.graphics();
    this.world = this.add.graphics();
    this.effects = this.add.graphics();
    this.ui = this.add.graphics();

    this.titleText = this.add.text(VIEW_WIDTH / 2, 57, "IMPOSSIBLE\nAVIARY", textStyle(18, "#fff9e9")).setOrigin(0.5);
    this.promptText = this.add.text(VIEW_WIDTH / 2, 123, "TAP TO TURN GRAVITY", textStyle(8)).setOrigin(0.5);
    this.scoreText = this.add.text(VIEW_WIDTH / 2, 18, "0", textStyle(15, "#fff9e9")).setOrigin(0.5, 0);
    this.chapterText = this.add.text(VIEW_WIDTH / 2, 49, "NURSERY WORKS", textStyle(7, "#f2b544")).setOrigin(0.5);
    this.resultText = this.add.text(VIEW_WIDTH / 2, 73, "", textStyle(16, "#fff9e9")).setOrigin(0.5);
    this.helperText = this.add.text(VIEW_WIDTH / 2, 124, "", textStyle(7)).setOrigin(0.5);

    this.audio = new AudioDirector(this, this.settings.muted);
    this.bindInput();
    this.installTestHooks();
    this.renderFrame();
  }

  update(_time: number, deltaMs: number): void {
    if (this.manualMode) return;
    const delta = Math.min(deltaMs / 1000, 0.1);
    this.uiTime += delta;
    this.updateEffects(delta);
    this.accumulator += delta;
    while (this.accumulator >= FIXED_STEP_SECONDS) {
      this.model.step(FIXED_STEP_SECONDS);
      this.accumulator -= FIXED_STEP_SECONDS;
    }
    this.handleEvents(this.model.drainEvents());
    this.audio.update(this.model.chapter, this.model.mode === "playing");
    this.renderFrame();
  }

  private bindInput(): void {
    this.input.keyboard?.on("keydown-SPACE", (event: KeyboardEvent) => {
      event.preventDefault();
      this.primaryAction();
    });
    this.input.keyboard?.on("keydown-P", () => this.togglePause());
    this.input.keyboard?.on("keydown-M", () => this.toggleMute());
    this.input.keyboard?.on("keydown-F", () => this.toggleFullscreen());
    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
    });
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const x = pointer.worldX;
      const y = pointer.worldY;
      if (y <= 38 && x >= 282) {
        this.toggleMute();
        return;
      }
      if (y <= 38 && x >= 246) {
        this.togglePause();
        return;
      }
      this.primaryAction();
    });
  }

  private installTestHooks(): void {
    window.render_game_to_text = () => {
      const snapshot = JSON.parse(this.model.textSnapshot()) as Record<string, unknown>;
      snapshot.settings = { muted: this.settings.muted, reducedMotion: this.settings.reducedMotion };
      return JSON.stringify(snapshot);
    };
    window.advanceTime = (milliseconds: number) => {
      this.manualMode = true;
      const steps = Math.max(1, Math.round(milliseconds / (FIXED_STEP_SECONDS * 1000)));
      for (let index = 0; index < steps; index += 1) {
        this.model.step(FIXED_STEP_SECONDS);
        this.uiTime += FIXED_STEP_SECONDS;
        this.updateEffects(FIXED_STEP_SECONDS);
      }
      this.handleEvents(this.model.drainEvents());
      this.renderFrame();
    };
  }

  private primaryAction(): void {
    this.audio.unlock();
    if (this.model.action()) {
      this.handleEvents(this.model.drainEvents());
      this.renderFrame();
    }
  }

  private togglePause(): void {
    this.model.togglePause();
    this.handleEvents(this.model.drainEvents());
    this.renderFrame();
  }

  private toggleMute(): void {
    this.settings.muted = !this.settings.muted;
    this.audio.setMuted(this.settings.muted);
    this.saveSettings();
    this.renderFrame();
  }

  private toggleFullscreen(): void {
    if (this.scale.isFullscreen) this.scale.stopFullscreen();
    else this.scale.startFullscreen();
  }

  private handleEvents(events: GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "flip":
          this.pulse = this.settings.reducedMotion ? 0.04 : 0.13;
          this.spawnFeathers(PLAYER_X - 5, this.model.playerY, 2, COLORS.cream);
          this.audio.flip(event.gravity);
          break;
        case "land":
          this.landingSquash = this.settings.reducedMotion ? 0.02 : 0.09;
          this.audio.land();
          break;
        case "feather":
          this.spawnFeathers(PLAYER_X, this.model.playerY, 5, COLORS.yolk);
          this.audio.feather(event.chain);
          break;
        case "bonus":
          this.pulse = this.settings.reducedMotion ? 0.04 : 0.18;
          this.audio.bonus();
          break;
        case "gate":
          this.audio.gate();
          break;
        case "chapter":
          this.chapterBanner = 2.2;
          this.pulse = this.settings.reducedMotion ? 0.04 : 0.2;
          break;
        case "death":
          this.shake = this.settings.reducedMotion ? 0 : 0.16;
          this.spawnFeathers(PLAYER_X, this.model.playerY, 18, COLORS.yolk);
          this.audio.death();
          this.settings.bestScore = Math.max(this.settings.bestScore, event.score);
          this.saveSettings();
          break;
        case "restart":
          this.particles = [];
          break;
        case "pause":
          break;
      }
    }
  }

  private updateEffects(delta: number): void {
    this.pulse = Math.max(0, this.pulse - delta);
    this.shake = Math.max(0, this.shake - delta);
    this.landingSquash = Math.max(0, this.landingSquash - delta);
    this.chapterBanner = Math.max(0, this.chapterBanner - delta);
    for (const particle of this.particles) {
      particle.life -= delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 80 * delta;
      particle.vx *= 0.985;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  private spawnFeathers(x: number, y: number, count: number, color: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / Math.max(1, count)) * Math.PI * 2 + this.uiTime;
      const speed = 18 + ((index * 17) % 32);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed - 12,
        vy: Math.sin(angle) * speed - 10,
        life: 0.35 + (index % 4) * 0.08,
        color,
      });
    }
  }

  private renderFrame(): void {
    this.renderBackground();
    this.renderWorld();
    this.renderEffects();
    this.renderUi();
  }

  private renderBackground(): void {
    const chapter = CHAPTERS[this.model.chapter] ?? CHAPTERS[0];
    const bg = this.background;
    bg.clear();
    bg.fillStyle(chapter.shade, 1);
    bg.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    const drift = -((this.model.distance * 0.12) % 48);
    bg.lineStyle(1, COLORS.teal, 0.13);
    for (let x = drift - 48; x < VIEW_WIDTH + 48; x += 48) {
      bg.lineBetween(x, PLAY_TOP, x + 24, PLAY_BOTTOM);
      bg.lineBetween(x + 24, PLAY_TOP, x, PLAY_BOTTOM);
    }
    bg.lineStyle(1, COLORS.cream, 0.06);
    for (let y = 38; y < PLAY_BOTTOM; y += 28) bg.lineBetween(0, y, VIEW_WIDTH, y);

    this.drawBackgroundBirds(bg);
    bg.fillStyle(COLORS.ink, 0.72);
    bg.fillRect(0, 0, VIEW_WIDTH, PLAY_TOP);
    bg.fillRect(0, PLAY_BOTTOM, VIEW_WIDTH, VIEW_HEIGHT - PLAY_BOTTOM);
    bg.fillStyle(COLORS.teal, 0.35);
    for (let x = -((this.model.distance * 0.4) % 24); x < VIEW_WIDTH; x += 24) {
      bg.fillRect(x, 5, 10, 2);
      bg.fillRect(x + 8, 172, 10, 2);
    }
  }

  private drawBackgroundBirds(graphics: Phaser.GameObjects.Graphics): void {
    const offset = -((this.model.distance * 0.06) % 170);
    for (let index = -1; index < 4; index += 1) {
      const x = offset + index * 170 + 44;
      const y = 48 + ((index + this.model.chapter) % 3) * 31;
      graphics.fillStyle(COLORS.shadow, 0.48);
      graphics.fillCircle(x, y, 11 + (index & 1) * 3);
      graphics.fillRect(x - 8, y + 6, 16, 14);
      graphics.fillStyle(COLORS.teal, 0.16);
      graphics.fillCircle(x + 5, y - 2, 2);
      graphics.lineStyle(1, COLORS.shadow, 0.5);
      graphics.lineBetween(x - 18, y + 20, x + 22, y + 20);
    }
  }

  private renderWorld(): void {
    const g = this.world;
    g.clear();
    const shakeX = this.shake > 0 ? Math.sin(this.uiTime * 120) * 1.4 : 0;
    const shakeY = this.shake > 0 ? Math.cos(this.uiTime * 90) * 1.1 : 0;
    g.setPosition(shakeX, shakeY);

    g.fillStyle(COLORS.cream, 1);
    g.fillRect(0, PLAY_TOP - 3, VIEW_WIDTH, 3);
    g.fillRect(0, PLAY_BOTTOM, VIEW_WIDTH, 3);
    g.fillStyle(COLORS.teal, 0.55);
    for (let x = -((this.model.distance * 0.65) % 18); x < VIEW_WIDTH; x += 18) {
      g.fillRect(x, PLAY_TOP - 3, 8, 1);
      g.fillRect(x + 6, PLAY_BOTTOM + 2, 8, 1);
    }

    this.drawChunkGates(g);
    for (const rect of this.model.visibleRects()) this.drawRectEntity(g, rect);
    for (const feather of this.model.visibleFeathers()) {
      if (!feather.collected) this.drawFeather(g, feather.x, feather.y, 1);
    }
    if (this.model.mode !== "dead" || this.model.deathTimer < 0.08) this.drawBird(g);
  }

  private drawChunkGates(g: Phaser.GameObjects.Graphics): void {
    for (const chunk of this.model.chunks) {
      const x = chunk.startX + chunk.definition.width - 12 - this.model.distance;
      if (x < -8 || x > VIEW_WIDTH + 8) continue;
      g.fillStyle(COLORS.teal, 0.28);
      for (let y = PLAY_TOP + 7; y < PLAY_BOTTOM - 5; y += 14) g.fillRect(x, y, 2, 7);
      g.fillStyle(COLORS.cream, 0.48);
      g.fillRect(x - 2, PLAY_TOP, 6, 3);
      g.fillRect(x - 2, PLAY_BOTTOM - 3, 6, 3);
    }
  }

  private drawRectEntity(g: Phaser.GameObjects.Graphics, rect: VisibleRect): void {
    if (rect.kind === "solid") {
      g.fillStyle(COLORS.shadow, 0.9);
      g.fillRect(rect.x + 2, rect.y + 2, rect.w, rect.h);
      g.fillStyle(COLORS.cream, 1);
      g.fillRect(rect.x, rect.y, rect.w, rect.h);
      g.fillStyle(COLORS.teal, 0.8);
      for (let x = rect.x + 4; x < rect.x + rect.w - 2; x += 10) g.fillRect(x, rect.y + 2, 5, 2);
      return;
    }
    if (rect.kind === "thorns") {
      g.fillStyle(COLORS.coral, 1);
      const count = Math.max(1, Math.ceil(rect.w / 7));
      const unit = rect.w / count;
      for (let index = 0; index < count; index += 1) {
        const left = rect.x + index * unit;
        if (rect.flipY) g.fillTriangle(left, rect.y, left + unit / 2, rect.y + rect.h, left + unit, rect.y);
        else g.fillTriangle(left, rect.y + rect.h, left + unit / 2, rect.y, left + unit, rect.y + rect.h);
      }
      g.fillStyle(COLORS.ink, 0.55);
      g.fillRect(rect.x, rect.flipY ? rect.y : rect.y + rect.h - 3, rect.w, 3);
      return;
    }
    if (rect.kind === "wire") {
      g.fillStyle(COLORS.coral, 1);
      g.fillRect(rect.x + 2, rect.y, Math.max(2, rect.w - 4), rect.h);
      g.fillStyle(COLORS.cream, 1);
      for (let y = rect.y + 4; y < rect.y + rect.h; y += 10) g.fillRect(rect.x, y, rect.w, 3);
      return;
    }
    if (rect.kind === "shutter") {
      g.fillStyle(COLORS.shadow, 1);
      g.fillRect(rect.x + 2, rect.y + 2, rect.w, rect.h);
      g.fillStyle(COLORS.cream, 1);
      g.fillRect(rect.x, rect.y, rect.w, rect.h);
      g.fillStyle(COLORS.coral, 1);
      for (let y = rect.y + 5; y < rect.y + rect.h - 3; y += 9) g.fillRect(rect.x + 2, y, rect.w - 4, 3);
      return;
    }
    if (rect.kind === "beak") {
      g.fillStyle(COLORS.coral, 1);
      if (rect.flipY) g.fillTriangle(rect.x, rect.y, rect.x + rect.w, rect.y, rect.x + rect.w / 2, rect.y + rect.h);
      else g.fillTriangle(rect.x, rect.y + rect.h, rect.x + rect.w, rect.y + rect.h, rect.x + rect.w / 2, rect.y);
      g.fillStyle(COLORS.cream, 0.72);
      g.fillCircle(rect.x + rect.w / 2, rect.flipY ? rect.y + 5 : rect.y + rect.h - 5, 2);
    }
  }

  private drawFeather(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number): void {
    const bob = Math.sin(this.uiTime * 5 + x * 0.04) * 2;
    g.fillStyle(COLORS.yolk, 1);
    g.fillTriangle(x - 4 * scale, y + bob, x + 4 * scale, y - 4 * scale + bob, x + 2 * scale, y + 5 * scale + bob);
    g.lineStyle(Math.max(1, scale), COLORS.cream, 0.85);
    g.lineBetween(x - 2 * scale, y + 3 * scale + bob, x + 3 * scale, y - 2 * scale + bob);
  }

  private drawBird(g: Phaser.GameObjects.Graphics): void {
    const gravity = this.model.gravity;
    const y = this.model.playerY;
    const squash = this.landingSquash > 0 ? 2 : 0;
    const flutter = this.model.mode === "playing" && this.model.velocityY !== 0 ? Math.sin(this.uiTime * 18) : 0;
    const bodyHeight = PLAYER_HEIGHT - squash;
    const bodyY = y - bodyHeight / 2 + (gravity > 0 ? squash / 2 : -squash / 2);

    g.fillStyle(COLORS.shadow, 0.75);
    g.fillRect(PLAYER_X - PLAYER_WIDTH / 2 + 2, bodyY + 2, PLAYER_WIDTH, bodyHeight);
    g.fillStyle(COLORS.yolk, 1);
    g.fillRect(PLAYER_X - PLAYER_WIDTH / 2, bodyY, PLAYER_WIDTH - 2, bodyHeight);
    g.fillRect(PLAYER_X + 4, bodyY + 2, 4, bodyHeight - 4);

    g.fillStyle(COLORS.cream, 1);
    const eyeY = y - gravity * 2;
    g.fillRect(PLAYER_X + 3, eyeY - 2, 4, 4);
    g.fillStyle(COLORS.ink, 1);
    g.fillRect(PLAYER_X + 5, eyeY - 1, 2, 2);

    g.fillStyle(COLORS.teal, 1);
    const wingY = y + gravity * (1 + flutter * 1.5);
    g.fillTriangle(PLAYER_X - 4, wingY - 3, PLAYER_X + 1, wingY, PLAYER_X - 4, wingY + 4);

    g.fillStyle(COLORS.coral, 1);
    g.fillTriangle(PLAYER_X + 8, y - 2, PLAYER_X + 12, y, PLAYER_X + 8, y + 2);
    g.fillStyle(COLORS.cream, 1);
    const feetY = y + gravity * (bodyHeight / 2 + 2);
    g.fillRect(PLAYER_X - 3, feetY - (gravity < 0 ? 1 : 0), 3, 1);
    g.fillRect(PLAYER_X + 2, feetY - (gravity < 0 ? 1 : 0), 3, 1);

    g.fillStyle(COLORS.yolk, 1);
    g.fillRect(PLAYER_X - 9, y - gravity * 4, 3, 2);
    g.fillRect(PLAYER_X - 10, y + gravity * 1, 4, 2);
  }

  private renderEffects(): void {
    const g = this.effects;
    g.clear();
    g.setPosition(0, 0);
    for (const particle of this.particles) {
      const alpha = Math.min(1, particle.life * 3);
      g.fillStyle(particle.color, alpha);
      g.fillRect(Math.round(particle.x), Math.round(particle.y), 2, 1);
    }
    if (this.pulse > 0) {
      const max = this.settings.reducedMotion ? 0.04 : 0.2;
      g.fillStyle(COLORS.cream, (this.pulse / max) * 0.08);
      g.fillRect(0, PLAY_TOP, VIEW_WIDTH, PLAY_BOTTOM - PLAY_TOP);
    }
  }

  private renderUi(): void {
    const g = this.ui;
    g.clear();
    const mode = this.model.mode;
    this.scoreText.setText(String(this.model.score)).setVisible(mode === "playing" || mode === "paused");
    this.titleText.setVisible(mode === "ready");
    this.promptText.setVisible(mode === "ready");
    this.resultText.setVisible(mode === "dead");
    this.helperText.setVisible(mode === "dead" || mode === "paused");

    if (mode === "ready") {
      this.titleText.setY(57 + Math.sin(this.uiTime * 2.5) * 1.5);
      this.promptText.setAlpha(0.72 + Math.sin(this.uiTime * 4) * 0.2);
      const arrowY = 145 + Math.sin(this.uiTime * 4) * 4;
      g.fillStyle(COLORS.yolk, 1);
      g.fillTriangle(PLAYER_X - 5, arrowY + 4, PLAYER_X + 5, arrowY + 4, PLAYER_X, arrowY - 3);
      g.fillRect(PLAYER_X - 1, arrowY + 3, 2, 8);
      g.fillStyle(COLORS.ink, 0.68);
      g.fillRoundedRect(86, 36, 148, 93, 8);
      g.lineStyle(1, COLORS.cream, 0.12);
      g.strokeRoundedRect(86, 36, 148, 93, 8);
    }

    this.drawTopButtons(g);
    this.drawChain(g);

    if (this.chapterBanner > 0 && mode === "playing") {
      const alpha = Math.min(1, this.chapterBanner * 2);
      g.fillStyle(COLORS.ink, 0.72 * alpha);
      g.fillRoundedRect(91, 43, 138, 18, 5);
      this.chapterText.setText(CHAPTERS[this.model.chapter]?.name ?? "").setAlpha(alpha).setVisible(true);
    } else {
      this.chapterText.setVisible(false);
    }

    if (mode === "paused") {
      g.fillStyle(COLORS.ink, 0.84);
      g.fillRect(0, PLAY_TOP, VIEW_WIDTH, PLAY_BOTTOM - PLAY_TOP);
      g.fillStyle(COLORS.cream, 1);
      g.fillRect(145, 65, 9, 28);
      g.fillRect(166, 65, 9, 28);
      this.helperText.setText("PAUSED  ·  P OR TAP ⏸ TO RETURN").setY(112);
    }

    if (mode === "dead") {
      g.fillStyle(COLORS.ink, 0.82);
      g.fillRoundedRect(82, 45, 156, 96, 10);
      g.lineStyle(1, COLORS.cream, 0.16);
      g.strokeRoundedRect(82, 45, 156, 96, 10);
      this.resultText.setText(`SCORE ${this.model.score}\nBEST  ${this.model.bestScore}`);
      const ready = this.model.deathTimer >= 0.32;
      this.helperText.setText(ready ? "TAP TO TRY AGAIN" : "...").setY(122).setAlpha(ready ? 0.75 + Math.sin(this.uiTime * 5) * 0.2 : 0.5);
    }
  }

  private drawTopButtons(g: Phaser.GameObjects.Graphics): void {
    const paused = this.model.mode === "paused";
    g.fillStyle(COLORS.ink, 0.62);
    g.fillRoundedRect(248, 17, 30, 20, 5);
    g.fillRoundedRect(284, 17, 30, 20, 5);
    g.lineStyle(1, COLORS.cream, 0.12);
    g.strokeRoundedRect(248, 17, 30, 20, 5);
    g.strokeRoundedRect(284, 17, 30, 20, 5);
    g.fillStyle(COLORS.cream, 0.9);
    if (paused) {
      g.fillTriangle(259, 22, 259, 32, 269, 27);
    } else {
      g.fillRect(257, 22, 3, 10);
      g.fillRect(266, 22, 3, 10);
    }
    if (this.settings.muted) {
      g.fillRect(291, 25, 5, 5);
      g.lineStyle(2, COLORS.coral, 1);
      g.lineBetween(300, 22, 308, 32);
    } else {
      g.fillRect(291, 25, 5, 5);
      g.fillTriangle(296, 25, 301, 21, 301, 34);
      g.lineStyle(1, COLORS.cream, 0.9);
      g.strokeCircle(300, 27, 5);
    }
  }

  private drawChain(g: Phaser.GameObjects.Graphics): void {
    if (this.model.mode !== "playing" || this.model.featherChain <= 0) return;
    for (let index = 0; index < 3; index += 1) {
      g.fillStyle(index < this.model.featherChain ? COLORS.yolk : COLORS.shadow, 1);
      g.fillTriangle(12 + index * 10, 27, 18 + index * 10, 24, 16 + index * 10, 32);
    }
  }

  private loadSettings(): StoredSettings {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<StoredSettings>;
      return {
        bestScore: Number.isFinite(parsed.bestScore) ? Math.max(0, Number(parsed.bestScore)) : 0,
        muted: Boolean(parsed.muted),
        reducedMotion: parsed.reducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      };
    } catch {
      return { bestScore: 0, muted: false, reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches };
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage may be unavailable in privacy modes; gameplay remains fully functional.
    }
  }
}
