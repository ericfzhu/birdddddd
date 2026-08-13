import Phaser from "phaser";
import { AudioDirector } from "./audio";
import { cameraTargetY, trackCameraY } from "./camera";
import {
  BIOMES,
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
import { HudText } from "./hud";
import type { GameEvent, VisibleRect, VisibleTunnelPoint } from "./types";

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

const STORAGE_KEY = "birdddddd:v1";
const LEGACY_STORAGE_KEY = "impossible-aviary:v1";

export class AviaryScene extends Phaser.Scene {
  model!: GameModel;
  private settings!: StoredSettings;
  private background!: Phaser.GameObjects.Graphics;
  private world!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private ui!: Phaser.GameObjects.Graphics;
  private titleText!: HudText;
  private promptText!: HudText;
  private scoreText!: HudText;
  private chapterText!: HudText;
  private resultText!: HudText;
  private helperText!: HudText;
  private audio!: AudioDirector;
  private accumulator = 0;
  private cameraOffsetY = 0;
  private manualMode = false;
  private uiTime = 0;
  private pulse = 0;
  private shake = 0;
  private landingSquash = 0;
  private chapterBanner = 0;
  private bannerChapter = 0;
  private lastTransitionId = "";
  private particles: FeatherParticle[] = [];

  constructor() {
    super("aviary");
  }

  create(): void {
    this.settings = this.loadSettings();
    const query = new URLSearchParams(window.location.search);
    const requestedSeed = Number(query.get("seed"));
    const previewChapter = Number(query.get("previewChapter"));
    const seed = Number.isFinite(requestedSeed) && requestedSeed > 0 ? requestedSeed >>> 0 : (Date.now() ^ 0x51a7e) >>> 0;
    this.model = new GameModel(seed, this.settings.bestScore, Number.isFinite(previewChapter) ? previewChapter : 0);
    this.model.reducedMotion = this.settings.reducedMotion;

    this.background = this.add.graphics();
    this.world = this.add.graphics();
    this.effects = this.add.graphics();
    this.ui = this.add.graphics();

    this.titleText = new HudText("hud-title", 64);
    this.promptText = new HudText("hud-prompt", 123);
    this.scoreText = new HudText("hud-score", 18);
    this.chapterText = new HudText("hud-chapter", 49);
    this.resultText = new HudText("hud-result", 73);
    this.helperText = new HudText("hud-helper", 124);

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
    this.updateCamera(delta);
    this.handleEvents(this.model.drainEvents());
    this.syncChapterTransition();
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
      const player = snapshot.player as Record<string, unknown>;
      player.screenY = Number((this.model.playerY + this.cameraOffsetY).toFixed(2));
      const hazards = snapshot.hazards as Array<Record<string, unknown>>;
      for (const hazard of hazards) hazard.screenY = Math.round(Number(hazard.y) + this.cameraOffsetY);
      const feathers = snapshot.feathers as Array<Record<string, unknown>>;
      for (const feather of feathers) feather.screenY = Math.round(Number(feather.y) + this.cameraOffsetY);
      snapshot.camera = { offsetY: Number(this.cameraOffsetY.toFixed(2)), deadZone: [76, 104] };
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
        this.updateCamera(FIXED_STEP_SECONDS);
      }
      this.handleEvents(this.model.drainEvents());
      this.syncChapterTransition();
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
          this.spawnFeathers(this.model.playerX - 5, this.model.playerY, 2, COLORS.cream);
          this.audio.flip(event.gravity);
          break;
        case "land":
          this.landingSquash = this.settings.reducedMotion ? 0.02 : 0.09;
          this.audio.land();
          break;
        case "feather":
          this.spawnFeathers(this.model.playerX, this.model.playerY, 5, COLORS.yolk);
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
          break;
        case "death":
          this.shake = this.settings.reducedMotion ? 0 : 0.16;
          this.spawnFeathers(this.model.playerX, this.model.playerY, 18, COLORS.yolk);
          this.audio.death();
          this.settings.bestScore = Math.max(this.settings.bestScore, event.score);
          this.saveSettings();
          break;
        case "restart":
          this.particles = [];
          this.lastTransitionId = "";
          this.bannerChapter = 0;
          break;
        case "pause":
          break;
      }
    }
  }

  private syncChapterTransition(): void {
    const transition = this.model.chapterTransition();
    if (!transition?.active || transition.id === this.lastTransitionId) return;
    this.lastTransitionId = transition.id;
    this.bannerChapter = transition.to;
    this.chapterBanner = 2.2;
    this.pulse = this.settings.reducedMotion ? 0.04 : 0.2;
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

  private updateCamera(delta: number): void {
    const target = cameraTargetY(this.cameraOffsetY, this.model.playerY, this.model.mode);
    this.cameraOffsetY = trackCameraY(this.cameraOffsetY, target, delta, this.settings.reducedMotion);
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
    const transition = this.model.chapterTransition();
    const from = transition?.from ?? this.model.chapter;
    const to = transition?.to ?? from;
    const progress = transition?.progress ?? 0;
    const fromChapter = CHAPTERS[from] ?? CHAPTERS[0];
    const toChapter = CHAPTERS[to] ?? fromChapter;
    const bg = this.background;
    bg.clear();
    bg.fillStyle(fromChapter.shade, 1);
    bg.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    if (to !== from && progress > 0) {
      bg.fillStyle(toChapter.shade, progress);
      bg.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    }
    this.drawChapterBackground(bg, from, 1 - progress);
    if (to !== from) this.drawChapterBackground(bg, to, progress);
  }

  private drawChapterBackground(g: Phaser.GameObjects.Graphics, chapter: number, alpha: number): void {
    if (alpha <= 0) return;
    const biome = BIOMES[chapter] ?? BIOMES[0];
    if (chapter === 0) {
      const cloudDrift = -((this.model.distance * 0.018) % 118);
      for (let x = cloudDrift - 118; x < VIEW_WIDTH + 118; x += 118) {
        const y = 35 + (Math.abs(Math.round(x / 118)) % 2) * 23;
        g.fillStyle(0xd9edf0, 0.48 * alpha);
        g.fillRect(x + 10, y, 39, 7);
        g.fillRect(x + 17, y - 7, 22, 8);
        g.fillRect(x + 24, y - 11, 10, 5);
      }
      const mountainDrift = -((this.model.distance * 0.035) % 112);
      for (let x = mountainDrift - 112; x < VIEW_WIDTH + 112; x += 112) {
        g.fillStyle(0x527988, 0.38 * alpha);
        g.fillTriangle(x - 18, VIEW_HEIGHT, x + 42, 74, x + 103, VIEW_HEIGHT);
        g.fillStyle(0x3f6871, 0.34 * alpha);
        g.fillTriangle(x + 46, VIEW_HEIGHT, x + 92, 96, x + 151, VIEW_HEIGHT);
      }
      const treeDrift = -((this.model.distance * 0.085) % 48);
      for (let x = treeDrift - 48; x < VIEW_WIDTH + 48; x += 48) {
        const variant = Math.abs(Math.round(x / 48)) % 3;
        const crownY = 101 - variant * 8;
        g.fillStyle(0x345e4b, 0.54 * alpha);
        g.fillRect(x + 22, crownY + 10, 6, VIEW_HEIGHT - crownY);
        g.fillStyle(0x4d8054, 0.48 * alpha);
        g.fillRect(x + 9, crownY, 31, 16);
        g.fillRect(x + 15, crownY - 9, 20, 12);
        g.fillRect(x + 3, crownY + 7, 42, 11);
      }
      return;
    }
    if (chapter === 1) {
      g.fillStyle(biome.glow, 0.34 * alpha);
      g.fillRect(246, 28, 39, 39);
      g.fillRect(240, 35, 51, 25);
      const farDrift = -((this.model.distance * 0.045) % 128);
      for (let x = farDrift - 128; x < VIEW_WIDTH + 128; x += 128) {
        g.fillStyle(biome.far, 0.36 * alpha);
        g.fillTriangle(x - 18, VIEW_HEIGHT, x + 66, 83, x + 148, VIEW_HEIGHT);
        g.fillStyle(biome.accent, 0.16 * alpha);
        g.fillTriangle(x + 35, VIEW_HEIGHT, x + 85, 108, x + 168, VIEW_HEIGHT);
      }
      const ruinDrift = -((this.model.distance * 0.12) % 78);
      g.fillStyle(biome.terrainDark, 0.34 * alpha);
      for (let x = ruinDrift - 78; x < VIEW_WIDTH + 78; x += 78) {
        const top = 103 + (Math.abs(Math.round(x / 78)) % 2) * 11;
        g.fillRect(x + 18, top, 27, VIEW_HEIGHT - top);
        g.fillRect(x + 14, top - 4, 35, 5);
        g.fillStyle(biome.surface, 0.22 * alpha);
        g.fillRect(x + 29, top + 9, 5, VIEW_HEIGHT - top - 9);
        g.fillStyle(biome.terrainDark, 0.34 * alpha);
      }
      return;
    }
    if (chapter === 2) {
      g.fillStyle(0x171126, 0.38 * alpha);
      g.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      const chasmDrift = -((this.model.distance * 0.045) % 110);
      for (let x = chasmDrift - 110; x < VIEW_WIDTH + 110; x += 110) {
        g.fillStyle(biome.far, 0.62 * alpha);
        g.fillTriangle(x, 0, x + 36, 92, x + 58, 0);
        g.fillTriangle(x + 46, VIEW_HEIGHT, x + 82, 88, x + 112, VIEW_HEIGHT);
        g.fillStyle(biome.surface, 0.23 * alpha);
        g.fillTriangle(x + 17, VIEW_HEIGHT, x + 27, 96, x + 35, VIEW_HEIGHT);
        g.fillTriangle(x + 70, 0, x + 82, 34, x + 89, 0);
      }
      const sporeDrift = -((this.model.distance * 0.09) % 61);
      for (let x = sporeDrift; x < VIEW_WIDTH + 20; x += 61) {
        const y = 47 + (Math.abs(Math.round(x)) % 89);
        g.fillStyle(biome.glow, (0.22 + Math.sin(this.uiTime * 2 + x) * 0.04) * alpha);
        g.fillRect(x, y, 3, 3);
        g.fillRect(x + 11, y + 23, 2, 2);
      }
      return;
    }

    const ruinDrift = -((this.model.distance * 0.055) % 92);
    for (let x = ruinDrift - 92; x < VIEW_WIDTH + 92; x += 92) {
      const y = 73 + (Math.abs(Math.round(x / 92)) % 2) * 18;
      g.fillStyle(biome.far, 0.76 * alpha);
      g.fillRect(x + 19, y, 46, VIEW_HEIGHT - y);
      g.fillRect(x + 13, y + 8, 7, VIEW_HEIGHT - y - 8);
      g.fillRect(x + 65, y + 8, 7, VIEW_HEIGHT - y - 8);
      g.fillStyle(biome.terrainDark, 0.8 * alpha);
      g.fillRect(x + 30, y + 17, 24, VIEW_HEIGHT - y - 17);
      g.fillStyle(biome.accent, 0.28 * alpha);
      g.fillRect(x + 34, y + 23, 16, 4);
    }
    for (let x = 8; x < VIEW_WIDTH; x += 29) {
      const y = 37 + ((x * 11) % 103);
      g.fillStyle(biome.glow, (0.35 + Math.sin(this.uiTime * 3 + x) * 0.08) * alpha);
      g.fillRect(x, y, 2, 2);
    }
  }

  private renderWorld(): void {
    const g = this.world;
    g.clear();
    const shakeX = this.shake > 0 ? Math.sin(this.uiTime * 120) * 1.4 : 0;
    const shakeY = this.shake > 0 ? Math.cos(this.uiTime * 90) * 1.1 : 0;
    g.setPosition(shakeX, shakeY + this.cameraOffsetY);

    const transition = this.model.chapterTransition();
    const from = transition?.from ?? this.model.chapter;
    const to = transition?.to ?? from;
    const progress = transition?.progress ?? 0;
    const tunnel = this.model.visibleTunnelPoints();
    this.drawChunkDecorations(g, tunnel);
    this.drawTunnelFill(g, tunnel, from, 1 - progress);
    if (to !== from) this.drawTunnelFill(g, tunnel, to, progress);
    this.drawTunnelRails(g, tunnel, from, 1 - progress);
    if (to !== from) this.drawTunnelRails(g, tunnel, to, progress);
    this.drawTransitionPassages(g);
    this.drawChunkGates(g, tunnel);
    for (const rect of this.model.visibleRects()) this.drawRectEntity(g, rect);
    for (const feather of this.model.visibleFeathers()) {
      if (!feather.collected) this.drawFeather(g, feather.x, feather.y, 1);
    }
    if (this.model.animationState() !== "gone") this.drawBird(g);
  }

  private drawTunnelFill(g: Phaser.GameObjects.Graphics, tunnel: VisibleTunnelPoint[], chapter: number, alpha: number): void {
    const first = tunnel[0];
    const last = tunnel.at(-1);
    if (!first || !last) return;
    const ceiling = tunnel.map((point) => new Phaser.Math.Vector2(point.x, point.ceiling));
    const floor = tunnel.map((point) => new Phaser.Math.Vector2(point.x, point.floor));
    const biome = BIOMES[chapter] ?? BIOMES[0];
    g.fillStyle(biome.terrain, alpha);
    g.fillPoints([new Phaser.Math.Vector2(first.x, -VIEW_HEIGHT * 2), ...ceiling, new Phaser.Math.Vector2(last.x, -VIEW_HEIGHT * 2)], true);
    g.fillPoints([new Phaser.Math.Vector2(first.x, VIEW_HEIGHT * 3), ...floor, new Phaser.Math.Vector2(last.x, VIEW_HEIGHT * 3)], true);
    this.drawTerrainTiles(g, tunnel, chapter, alpha);
  }

  private tunnelPointAt(tunnel: VisibleTunnelPoint[], x: number): VisibleTunnelPoint | undefined {
    if (tunnel.length === 0) return undefined;
    const index = Math.max(0, Math.min(tunnel.length - 1, Math.round(x / 4)));
    return tunnel[index];
  }

  private drawTerrainTiles(g: Phaser.GameObjects.Graphics, tunnel: VisibleTunnelPoint[], chapter: number, alpha: number): void {
    const biome = BIOMES[chapter] ?? BIOMES[0];
    const tile = 8;
    const drift = -((this.model.distance % tile + tile) % tile);
    const seam = chapter === 0 ? 0x2d2119 : chapter === 1 ? 0x6d432c : chapter === 2 ? 0x24182f : 0x18151a;
    const fleck = chapter === 0 ? 0x795037 : chapter === 1 ? 0xf0ca77 : chapter === 2 ? biome.accent : biome.accent;
    for (let x = drift - tile; x < VIEW_WIDTH + tile; x += tile) {
      const point = this.tunnelPointAt(tunnel, x + tile / 2);
      if (!point) continue;
      for (let layer = 0; layer < 5; layer += 1) {
        const topY = Math.floor(point.ceiling - 5 - layer * tile);
        const bottomY = Math.floor(point.floor + 4 + layer * tile);
        g.lineStyle(1, seam, 0.42 * alpha);
        g.lineBetween(x, topY, x + tile - 1, topY);
        g.lineBetween(x, bottomY, x + tile - 1, bottomY);
        if ((Math.round(x / tile) + layer) % 2 === 0) {
          g.fillStyle(fleck, 0.54 * alpha);
          g.fillRect(x + 2 + (layer % 2) * 2, topY - 3, 2, 2);
          g.fillRect(x + 4 - (layer % 2) * 2, bottomY + 3, 2, 2);
        }
      }
      g.lineStyle(1, seam, 0.32 * alpha);
      g.lineBetween(x, point.ceiling - 38, x, point.ceiling - 4);
      g.lineBetween(x, point.floor + 4, x, point.floor + 38);
      if (chapter === 2 && Math.round(x / tile) % 5 === 0) {
        g.fillStyle(biome.glow, 0.75 * alpha);
        g.fillTriangle(x + 1, point.ceiling - 10, x + 4, point.ceiling - 17, x + 6, point.ceiling - 10);
        g.fillTriangle(x + 1, point.floor + 10, x + 4, point.floor + 17, x + 6, point.floor + 10);
      }
      if (chapter === 3 && Math.round(x / tile) % 6 === 0) {
        g.fillStyle(biome.glow, 0.74 * alpha);
        g.fillRect(x + 2, point.ceiling - 15, 3, 3);
        g.fillRect(x + 4, point.floor + 12, 3, 3);
      }
    }
  }

  private drawTunnelRails(g: Phaser.GameObjects.Graphics, tunnel: VisibleTunnelPoint[], chapter: number, alpha: number): void {
    if (alpha <= 0 || tunnel.length < 2) return;
    const biome = BIOMES[chapter] ?? BIOMES[0];
    const thickness = chapter === 2 ? 4 : 3;
    const spacing = [12, 16, 14, 16][chapter] ?? 16;
    g.lineStyle(thickness, biome.surface, alpha);
    for (let index = 1; index < tunnel.length; index += 1) {
      const previous = tunnel[index - 1];
      const point = tunnel[index];
      if (!previous || !point) continue;
      g.lineBetween(previous.x, previous.ceiling, point.x, point.ceiling);
      g.lineBetween(previous.x, previous.floor, point.x, point.floor);
    }
    g.lineStyle(1, biome.accent, 0.82 * alpha);
    for (let index = 1; index < tunnel.length; index += 1) {
      const previous = tunnel[index - 1];
      const point = tunnel[index];
      if (!previous || !point) continue;
      g.lineBetween(previous.x, previous.ceiling + 2, point.x, point.ceiling + 2);
      g.lineBetween(previous.x, previous.floor - 2, point.x, point.floor - 2);
    }
    const drift = -((this.model.distance % spacing + spacing) % spacing);
    for (let x = drift; x < VIEW_WIDTH + spacing; x += spacing) {
      const point = tunnel[Math.max(0, Math.min(tunnel.length - 1, Math.round((x + 4) / 4)))];
      if (!point) continue;
      if (chapter === 0) {
        g.fillStyle(biome.accent, 0.92 * alpha);
        g.fillTriangle(x, point.floor, x + 2, point.floor - 4 - (Math.round(x / spacing) % 2), x + 4, point.floor);
        g.fillTriangle(x + 6, point.ceiling, x + 8, point.ceiling + 4, x + 10, point.ceiling);
        g.fillStyle(biome.terrainDark, 0.58 * alpha);
        g.fillRect(x + 5, point.floor + 5, 2, 2);
      } else if (chapter === 1) {
        g.fillStyle(biome.accent, 0.78 * alpha);
        g.fillRect(x, point.ceiling - 2, 7, 2);
        g.fillRect(x + 8, point.floor, 7, 2);
        g.fillStyle(biome.terrain, 0.85 * alpha);
        g.fillRect(x + 3, point.ceiling - 5, 3, 2);
        g.fillRect(x + 10, point.floor + 4, 3, 2);
      } else if (chapter === 2) {
        g.fillStyle(biome.accent, 0.9 * alpha);
        g.fillTriangle(x, point.ceiling, x + 3, point.ceiling - 5, x + 6, point.ceiling);
        g.fillTriangle(x + 7, point.floor, x + 10, point.floor + 5, x + 13, point.floor);
      } else {
        g.fillStyle(biome.surface, 0.9 * alpha);
        g.fillRect(x, point.ceiling - 3, 6, 3);
        g.fillRect(x + 8, point.floor, 6, 3);
        if (Math.round(x / spacing) % 3 === 0) {
          g.fillStyle(biome.glow, 0.9 * alpha);
          g.fillRect(x + 2, point.ceiling - 7, 2, 2);
          g.fillRect(x + 11, point.floor + 5, 2, 2);
        }
      }
    }
  }

  private drawChunkDecorations(g: Phaser.GameObjects.Graphics, tunnel: VisibleTunnelPoint[]): void {
    for (const chunk of this.model.chunks) {
      if (chunk.definition.transition) continue;
      const origin = chunk.startX - this.model.distance;
      const idValue = [...chunk.definition.id].reduce((total, character) => total + character.charCodeAt(0), 0);
      const localX = 72 + (idValue % 38);
      const x = origin + localX;
      if (x < -36 || x > VIEW_WIDTH + 36) continue;
      const point = this.tunnelPointAt(tunnel, x);
      if (!point) continue;
      const floorY = point.floor + 1;
      switch (chunk.definition.decoration) {
        case "forest":
          this.drawForestProp(g, x, floorY, idValue);
          break;
        case "desert":
          this.drawDesertProp(g, x, floorY, idValue);
          break;
        case "blight":
          this.drawBlightProp(g, x, floorY, idValue);
          break;
        case "depths":
          this.drawDepthsProp(g, x, floorY, idValue);
          break;
        case "passage":
          break;
      }
    }
  }

  private drawForestProp(g: Phaser.GameObjects.Graphics, x: number, y: number, variant: number): void {
    const biome = BIOMES[0];
    if (variant % 2 === 0) {
      const height = 40 + (variant % 3) * 5;
      const top = y - height;
      g.fillStyle(0x51331f, 0.72);
      g.fillRect(x - 3, top + 12, 7, height - 10);
      g.fillRect(x - 10, top + 23, 9, 4);
      g.fillRect(x + 3, top + 18, 9, 4);
      g.fillStyle(0x3f793e, 0.7);
      g.fillRect(x - 15, top + 4, 31, 14);
      g.fillRect(x - 10, top - 2, 22, 10);
      g.fillRect(x - 20, top + 11, 42, 9);
      g.fillStyle(0x70a64d, 0.72);
      g.fillRect(x - 11, top + 1, 14, 4);
      g.fillRect(x + 7, top + 8, 9, 4);
    } else {
      g.fillStyle(0x426f38, 0.72);
      g.fillRect(x - 1, y - 14, 3, 15);
      g.fillStyle(biome.accent, 0.78);
      g.fillRect(x - 7, y - 17, 15, 5);
      g.fillRect(x - 4, y - 20, 9, 3);
      g.fillStyle(biome.glow, 0.78);
      g.fillRect(x - 5, y - 18, 2, 2);
      g.fillRect(x + 3, y - 16, 2, 2);
    }
  }

  private drawDesertProp(g: Phaser.GameObjects.Graphics, x: number, y: number, variant: number): void {
    const biome = BIOMES[1];
    if (variant % 2 === 0) {
      g.fillStyle(0x3f7b59, 0.65);
      g.fillRect(x - 3, y - 37, 7, 38);
      g.fillRect(x - 11, y - 24, 10, 6);
      g.fillRect(x - 11, y - 24, 5, 13);
      g.fillRect(x + 3, y - 17, 10, 6);
      g.fillRect(x + 9, y - 25, 4, 13);
      g.fillStyle(biome.accent, 0.6);
      g.fillRect(x - 1, y - 33, 2, 2);
    } else {
      g.fillStyle(biome.terrainDark, 0.56);
      g.fillRect(x - 15, y - 22, 30, 23);
      g.fillRect(x - 20, y - 26, 40, 5);
      g.fillStyle(biome.surface, 0.42);
      g.fillRect(x - 10, y - 17, 6, 18);
      g.fillRect(x + 5, y - 17, 6, 18);
      g.fillStyle(biome.accent, 0.5);
      g.fillRect(x - 17, y - 24, 8, 2);
    }
  }

  private drawBlightProp(g: Phaser.GameObjects.Graphics, x: number, y: number, variant: number): void {
    const biome = BIOMES[2];
    if (variant % 2 === 0) {
      g.fillStyle(biome.surface, 0.48);
      g.fillRect(x - 2, y - 23, 5, 24);
      g.fillStyle(biome.accent, 0.58);
      g.fillEllipse(x, y - 25, 26, 11);
      g.fillStyle(biome.glow, 0.75);
      g.fillRect(x - 7, y - 28, 3, 2);
      g.fillRect(x + 4, y - 26, 2, 2);
    } else {
      g.fillStyle(biome.surface, 0.52);
      g.fillTriangle(x - 13, y, x - 5, y - 30, x + 1, y);
      g.fillTriangle(x - 1, y, x + 8, y - 21, x + 14, y);
      g.fillStyle(biome.glow, 0.48);
      g.fillTriangle(x - 10, y - 5, x - 5, y - 26, x - 2, y - 5);
    }
  }

  private drawDepthsProp(g: Phaser.GameObjects.Graphics, x: number, y: number, variant: number): void {
    const biome = BIOMES[3];
    if (variant % 2 === 0) {
      g.fillStyle(biome.terrainDark, 0.72);
      g.fillRect(x - 15, y - 27, 30, 28);
      g.fillStyle(biome.surface, 0.62);
      for (let row = 0; row < 3; row += 1) {
        for (let column = 0; column < 3; column += 1) g.fillRect(x - 13 + column * 10 + (row % 2) * 4, y - 25 + row * 8, 8, 5);
      }
      g.fillStyle(biome.glow, 0.52);
      g.fillRect(x - 4, y - 22, 8, 10);
    } else {
      g.fillStyle(biome.surface, 0.58);
      g.fillRect(x - 2, y - 33, 5, 34);
      g.fillRect(x - 9, y - 31, 19, 4);
      g.fillStyle(biome.accent, 0.72);
      g.fillRect(x - 5, y - 24, 11, 11);
      g.fillStyle(biome.glow, 0.88);
      g.fillRect(x - 2, y - 21, 5, 5);
    }
  }

  private drawTransitionPassages(g: Phaser.GameObjects.Graphics): void {
    for (const chunk of this.model.chunks) {
      if (!chunk.definition.transition) continue;
      const left = chunk.startX - this.model.distance;
      const right = left + chunk.definition.width;
      if (right < -12 || left > VIEW_WIDTH + 12) continue;
      const start = left - ((left % 24 + 24) % 24);
      for (let x = start; x <= right; x += 24) {
        if (x < left || x > right) continue;
        const fromBiome = BIOMES[chunk.definition.transition.from] ?? BIOMES[0];
        const toBiome = BIOMES[chunk.definition.transition.to] ?? fromBiome;
        const blend = Math.max(0, Math.min(1, (x - left) / Math.max(1, right - left)));
        const material = blend < 0.5 ? fromBiome : toBiome;
        const y = 45 + (Math.abs(Math.round(x / 24)) % 4) * 27;
        g.fillStyle(material.glow, 0.45);
        g.fillRect(x + 2, y, 2, 2);
        g.fillRect(x + 9, y + 11, 1, 1);
      }
    }
  }

  private drawChunkGates(g: Phaser.GameObjects.Graphics, tunnel: VisibleTunnelPoint[]): void {
    for (const chunk of this.model.chunks) {
      if (chunk.definition.transition) continue;
      const x = chunk.startX + chunk.definition.width - 12 - this.model.distance;
      if (x < -8 || x > VIEW_WIDTH + 8) continue;
      const biome = BIOMES[chunk.definition.chapter] ?? BIOMES[0];
      const point = this.tunnelPointAt(tunnel, x);
      if (!point) continue;
      g.fillStyle(0x5e4028, 0.82);
      g.fillRect(x, point.floor - 7, 2, 7);
      g.fillRect(x, point.ceiling, 2, 7);
      g.fillStyle(biome.glow, 0.9);
      g.fillRect(x - 2, point.floor - 10, 6, 5);
      g.fillRect(x - 2, point.ceiling + 5, 6, 5);
      g.fillStyle(0xfff1a0, 0.86);
      g.fillRect(x, point.floor - 10, 2, 2);
      g.fillRect(x, point.ceiling + 7, 2, 2);
    }
  }

  private drawChapterSolid(g: Phaser.GameObjects.Graphics, rect: VisibleRect): void {
    const biome = BIOMES[rect.chapter] ?? BIOMES[0];
    g.fillStyle(biome.terrainDark, 0.96);
    g.fillRect(rect.x + 2, rect.y + 2, rect.w, rect.h);
    if (rect.chapter === 0) {
      g.fillStyle(0x6b4628, 1);
      g.fillRect(rect.x, rect.y, rect.w, rect.h);
      g.fillStyle(biome.surface, 1);
      g.fillRect(rect.x, rect.y, rect.w, 2);
      g.fillStyle(biome.accent, 0.85);
      for (let x = rect.x + 5; x < rect.x + rect.w; x += 13) g.fillRect(x, rect.y - 1, 3, 3);
      return;
    }
    if (rect.chapter === 1) {
      g.fillStyle(biome.surface, 1);
      g.fillRect(rect.x, rect.y, rect.w, rect.h);
      g.fillStyle(biome.accent, 0.9);
      g.fillRect(rect.x, rect.y, rect.w, 2);
      g.fillStyle(biome.terrain, 0.75);
      for (let x = rect.x + 3; x < rect.x + rect.w - 2; x += 9) g.fillRect(x, rect.y + Math.max(2, rect.h - 3), 6, 2);
      return;
    }
    if (rect.chapter === 2) {
      g.fillStyle(biome.terrain, 1);
      g.fillRect(rect.x, rect.y, rect.w, rect.h);
      g.fillStyle(biome.surface, 1);
      for (let x = rect.x; x < rect.x + rect.w; x += 9) g.fillTriangle(x, rect.y + 4, x + 4, rect.y - 2, x + 8, rect.y + 4);
      g.fillStyle(biome.glow, 0.65);
      g.fillRect(rect.x + 3, rect.y + Math.max(2, rect.h - 3), Math.max(1, rect.w - 6), 2);
      return;
    }

    g.fillStyle(biome.terrain, 1);
    g.fillRect(rect.x, rect.y, rect.w, rect.h);
    g.fillStyle(biome.surface, 1);
    g.fillRect(rect.x, rect.y, rect.w, 2);
    for (let x = rect.x + 4; x < rect.x + rect.w - 2; x += 11) {
      g.fillStyle(biome.accent, 0.9);
      g.fillRect(x, rect.y + Math.max(2, rect.h - 3), 4, 2);
    }
  }

  private drawCagePillar(g: Phaser.GameObjects.Graphics, rect: VisibleRect): void {
    const biome = BIOMES[rect.chapter] ?? BIOMES[0];
    g.fillStyle(biome.terrainDark, 0.95);
    g.fillRect(rect.x + 2, rect.y + 2, rect.w, rect.h);
    g.fillStyle(rect.chapter === 0 ? 0x6b4628 : biome.surface, 1);
    g.fillRect(rect.x + 1, rect.y, Math.max(2, rect.w - 2), rect.h);
    g.fillStyle(biome.accent, 0.95);
    for (let y = rect.y + 4; y < rect.y + rect.h - 1; y += 9) g.fillRect(rect.x, y, rect.w, 2);
  }

  private drawRectEntity(g: Phaser.GameObjects.Graphics, rect: VisibleRect): void {
    if (rect.kind === "solid") {
      if (rect.detail === "cage") {
        this.drawCagePillar(g, rect);
        return;
      }
      this.drawChapterSolid(g, rect);
      return;
    }
    if (rect.kind === "thorns") {
      const biome = BIOMES[rect.chapter] ?? BIOMES[0];
      g.fillStyle(biome.danger, 1);
      const count = Math.max(1, Math.ceil(rect.w / 7));
      const unit = rect.w / count;
      for (let index = 0; index < count; index += 1) {
        const left = rect.x + index * unit;
        if (rect.flipY) g.fillTriangle(left, rect.y, left + unit / 2, rect.y + rect.h, left + unit, rect.y);
        else g.fillTriangle(left, rect.y + rect.h, left + unit / 2, rect.y, left + unit, rect.y + rect.h);
      }
      g.fillStyle(biome.terrainDark, 0.8);
      g.fillRect(rect.x, rect.flipY ? rect.y : rect.y + rect.h - 3, rect.w, 3);
      return;
    }
    if (rect.kind === "barbs") {
      const biome = BIOMES[rect.chapter] ?? BIOMES[0];
      g.fillStyle(biome.terrainDark, 1);
      const baseY = rect.flipY ? rect.y : rect.y + rect.h - 5;
      g.fillRect(rect.x, baseY, rect.w, 5);
      g.fillStyle(biome.danger, 1);
      const widths = [8, 11, 7, 10];
      let cursor = rect.x;
      let index = 0;
      while (cursor < rect.x + rect.w) {
        const width = Math.min(widths[index % widths.length] ?? 8, rect.x + rect.w - cursor);
        const depth = rect.h - 3 - (index % 2) * 4;
        if (rect.flipY) g.fillTriangle(cursor, rect.y, cursor + width / 2, rect.y + depth, cursor + width, rect.y);
        else g.fillTriangle(cursor, rect.y + rect.h, cursor + width / 2, rect.y + rect.h - depth, cursor + width, rect.y + rect.h);
        cursor += width;
        index += 1;
      }
      g.fillStyle(biome.glow, 0.75);
      for (let x = rect.x + 4; x < rect.x + rect.w - 2; x += 9) g.fillRect(x, baseY + 1, 2, 2);
      return;
    }
    if (rect.kind === "shutter") {
      const biome = BIOMES[rect.chapter] ?? BIOMES[0];
      g.fillStyle(biome.terrainDark, 1);
      g.fillRect(rect.x + 2, rect.y + 2, rect.w, rect.h);
      g.fillStyle(rect.chapter === 2 ? biome.surface : biome.terrain, 1);
      g.fillRect(rect.x, rect.y, rect.w, rect.h);
      g.fillStyle(biome.danger, 1);
      for (let y = rect.y + 5; y < rect.y + rect.h - 3; y += 9) g.fillRect(rect.x + 2, y, rect.w - 4, 3);
      return;
    }
    if (rect.kind === "beak") {
      const biome = BIOMES[rect.chapter] ?? BIOMES[0];
      g.fillStyle(biome.danger, 1);
      if (rect.flipY) g.fillTriangle(rect.x, rect.y, rect.x + rect.w, rect.y, rect.x + rect.w / 2, rect.y + rect.h);
      else g.fillTriangle(rect.x, rect.y + rect.h, rect.x + rect.w, rect.y + rect.h, rect.x + rect.w / 2, rect.y);
      g.fillStyle(biome.glow, 0.72);
      g.fillCircle(rect.x + rect.w / 2, rect.flipY ? rect.y + 5 : rect.y + rect.h - 5, 2);
      return;
    }
    if (rect.kind === "spinner") {
      const biome = BIOMES[rect.chapter] ?? BIOMES[0];
      const centerX = rect.x + rect.w / 2;
      const centerY = rect.y + rect.h / 2;
      const radius = Math.min(rect.w, rect.h) / 2 - 3;
      const rotation = this.settings.reducedMotion ? 0 : this.uiTime * 3.4;
      g.fillStyle(biome.danger, 1);
      g.fillCircle(centerX, centerY, radius);
      for (let tooth = 0; tooth < 8; tooth += 1) {
        const angle = rotation + tooth * Math.PI / 4;
        g.fillRect(Math.round(centerX + Math.cos(angle) * (radius + 1)) - 2, Math.round(centerY + Math.sin(angle) * (radius + 1)) - 2, 4, 4);
      }
      g.fillStyle(biome.terrainDark, 1);
      g.fillCircle(centerX, centerY, Math.max(2, radius - 4));
      g.fillStyle(biome.glow, 0.9);
      g.fillRect(centerX - 1, centerY - 1, 3, 3);
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
    const animation = this.model.animationState();
    const motionTime = this.settings.reducedMotion ? 0 : this.uiTime;
    const runFrame = Math.floor(motionTime * 12) % 2;
    const running = animation === "run";
    const stunned = animation === "stunned";
    const flutter = animation === "flutter" ? Math.sin(motionTime * 20) : 0;
    const runBob = running && runFrame === 1 ? -gravity : 0;
    const stunJitter = stunned && !this.settings.reducedMotion ? Math.round(Math.sin(this.model.deathTimer * 85)) : 0;
    const x = this.model.playerX + stunJitter;
    const y = this.model.playerY + runBob;
    const squash = stunned ? 3 : this.landingSquash > 0 ? 2 : 0;
    const bodyHeight = PLAYER_HEIGHT - squash;
    const bodyY = y - bodyHeight / 2 + (gravity > 0 ? squash / 2 : -squash / 2);

    g.fillStyle(0x3b2630, 0.82);
    g.fillRect(x - PLAYER_WIDTH / 2 + 1, bodyY + 2, PLAYER_WIDTH, bodyHeight - 1);
    const deathFlash = stunned && Math.floor(this.model.deathTimer * 24) % 2 === 1;
    g.fillStyle(deathFlash ? COLORS.cream : 0xe6a63c, 1);
    g.fillRect(x - PLAYER_WIDTH / 2, bodyY + 2, PLAYER_WIDTH - 1, Math.max(2, bodyHeight - 4));
    g.fillRect(x - 5, bodyY, 9, bodyHeight);
    g.fillStyle(deathFlash ? COLORS.cream : 0xf2c25b, 1);
    g.fillRect(x - 4, bodyY + 1, 7, Math.max(2, bodyHeight - 4));
    g.fillRect(x + 3, bodyY + 3, 4, Math.max(2, bodyHeight - 6));

    g.fillStyle(COLORS.cream, 1);
    const eyeY = y - gravity * 2;
    g.fillRect(x + 3, eyeY - 2, 4, 4);
    g.fillStyle(COLORS.ink, 1);
    if (stunned) {
      g.fillRect(x + 3, eyeY - 2, 1, 1);
      g.fillRect(x + 6, eyeY - 2, 1, 1);
      g.fillRect(x + 4, eyeY - 1, 2, 2);
      g.fillRect(x + 3, eyeY + 1, 1, 1);
      g.fillRect(x + 6, eyeY + 1, 1, 1);
    } else {
      g.fillRect(x + 5, eyeY - 1, 2, 2);
    }

    g.fillStyle(0xb66f35, 1);
    const wingY = y + gravity * (stunned ? 3 : 1 + flutter * 2);
    const wingReach = stunned ? 7 : animation === "flutter" ? (flutter > 0 ? 7 : 4) : 4;
    g.fillTriangle(x - 4, wingY - 3, x + 1, wingY, x - wingReach, wingY + gravity * 5);
    if (stunned) g.fillTriangle(x + 3, wingY - 2, x + 7, wingY, x + 5, wingY + gravity * 6);

    g.fillStyle(0xd9793d, 1);
    g.fillTriangle(x + 8, y - 2, x + 12, y + (stunned ? 2 : 0), x + 8, y + 2);
    g.fillStyle(0xf1d38b, 1);
    const feetY = y + gravity * (bodyHeight / 2 + 2);
    const footOffset = running ? (runFrame === 0 ? -2 : 2) : 0;
    g.fillRect(x - 3 + footOffset, feetY - (gravity < 0 ? 1 : 0), 3, 1);
    g.fillRect(x + 2 - footOffset, feetY - (gravity < 0 ? 1 : 0), 3, 1);
    if (running) {
      g.fillRect(x - 2 + footOffset, feetY + gravity, 2, 1);
      g.fillRect(x + 3 - footOffset, feetY + gravity, 2, 1);
    }

    g.fillStyle(0xc67d32, 1);
    const tailKick = running && runFrame === 1 ? 1 : 0;
    g.fillRect(x - 9 - tailKick, y - gravity * 4, 3, 2);
    g.fillRect(x - 10, y + gravity * (1 + tailKick), 4, 2);
  }

  private renderEffects(): void {
    const g = this.effects;
    g.clear();
    g.setPosition(0, 0);
    for (const particle of this.particles) {
      const alpha = Math.min(1, particle.life * 3);
      g.fillStyle(particle.color, alpha);
      g.fillRect(Math.round(particle.x), Math.round(particle.y + this.cameraOffsetY), 2, 1);
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
    const revealDeathPanel = mode === "dead" && this.model.deathTimer >= 0.24;
    this.scoreText.setText(String(this.model.score)).setVisible(mode === "playing" || mode === "paused");
    this.titleText.setVisible(mode === "ready");
    this.promptText.setVisible(mode === "ready");
    this.resultText.setVisible(revealDeathPanel);
    this.helperText.setVisible(revealDeathPanel || mode === "paused");

    if (mode === "ready") {
      this.titleText.setY(57 + Math.sin(this.uiTime * 2.5) * 1.5);
      this.promptText.setAlpha(0.72 + Math.sin(this.uiTime * 4) * 0.2);
      const arrowY = 145 + Math.sin(this.uiTime * 4) * 4;
      g.fillStyle(COLORS.yolk, 1);
      g.fillTriangle(PLAYER_X - 5, arrowY + 4, PLAYER_X + 5, arrowY + 4, PLAYER_X, arrowY - 3);
      g.fillRect(PLAYER_X - 1, arrowY + 3, 2, 8);
      this.drawPixelPanel(g, 86, 36, 148, 93, 0);
    }

    this.drawTopButtons(g);
    this.drawChain(g);

    if (this.chapterBanner > 0 && mode === "playing") {
      const alpha = Math.min(1, this.chapterBanner * 2);
      const biome = BIOMES[this.bannerChapter] ?? BIOMES[0];
      g.fillStyle(biome.terrainDark, 0.86 * alpha);
      g.fillRect(82, 43, 156, 18);
      g.lineStyle(1, biome.accent, 0.7 * alpha);
      g.strokeRect(82, 43, 156, 18);
      this.chapterText.setText(`ENTERING · ${CHAPTERS[this.bannerChapter]?.name ?? ""}`).setAlpha(alpha).setVisible(true);
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

    if (revealDeathPanel) {
      this.drawPixelPanel(g, 82, 45, 156, 96, this.model.chapter);
      this.resultText.setText(`SCORE ${this.model.score}\nBEST  ${this.model.bestScore}`);
      const ready = this.model.deathTimer >= 0.32;
      this.helperText.setText(ready ? "TAP TO TRY AGAIN" : "...").setY(122).setAlpha(ready ? 0.75 + Math.sin(this.uiTime * 5) * 0.2 : 0.5);
    }
  }

  private drawTopButtons(g: Phaser.GameObjects.Graphics): void {
    const paused = this.model.mode === "paused";
    const biome = BIOMES[this.model.chapter] ?? BIOMES[0];
    g.fillStyle(biome.terrainDark, 0.82);
    g.fillRect(248, 17, 30, 20);
    g.fillRect(284, 17, 30, 20);
    g.lineStyle(1, biome.surface, 0.7);
    g.strokeRect(248, 17, 30, 20);
    g.strokeRect(284, 17, 30, 20);
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

  private drawPixelPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, chapter: number): void {
    const biome = BIOMES[chapter] ?? BIOMES[0];
    g.fillStyle(biome.terrainDark, 0.92);
    g.fillRect(x, y, width, height);
    g.lineStyle(3, biome.terrain, 1);
    g.strokeRect(x + 1, y + 1, width - 2, height - 2);
    g.lineStyle(1, biome.surface, 0.85);
    g.strokeRect(x + 4, y + 4, width - 8, height - 8);
    g.fillStyle(biome.glow, 0.8);
    g.fillRect(x + 6, y + 6, 3, 3);
    g.fillRect(x + width - 9, y + 6, 3, 3);
    g.fillRect(x + 6, y + height - 9, 3, 3);
    g.fillRect(x + width - 9, y + height - 9, 3, 3);
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
      const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY) ?? "{}";
      const parsed = JSON.parse(stored) as Partial<StoredSettings>;
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
