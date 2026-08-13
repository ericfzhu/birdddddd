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
  TERRAIN_SPIKE_MIN_SCALE,
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
  private biomeBackgrounds: Phaser.GameObjects.Image[] = [];
  private terrainBase!: Phaser.GameObjects.Graphics;
  private terrainTiles!: Phaser.GameObjects.Container;
  private terrainTilePool: Phaser.GameObjects.Image[] = [];
  private propLayer!: Phaser.GameObjects.Container;
  private propPool: Phaser.GameObjects.Image[] = [];
  private world!: Phaser.GameObjects.Graphics;
  private effects!: Phaser.GameObjects.Graphics;
  private ui!: Phaser.GameObjects.Graphics;
  private titleText!: HudText;
  private promptText!: HudText;
  private scoreText!: HudText;
  private chapterText!: HudText;
  private resultText!: HudText;
  private helperText!: HudText;
  private pauseControl!: HTMLButtonElement;
  private soundControl!: HTMLButtonElement;
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

  preload(): void {
    this.load.image("biome-background-0", "/assets/biome-forest-background-runtime.png");
    this.load.image("biome-background-1", "/assets/biome-desert-background-runtime.png");
    this.load.image("biome-background-2", "/assets/biome-violet-background-runtime.png");
    this.load.image("biome-background-3", "/assets/biome-ashen-background-runtime.png");
    this.load.spritesheet("biome-props-atlas", "/assets/biome-props-atlas-runtime.png", {
      frameWidth: 128,
      frameHeight: 128,
    });
    this.load.spritesheet("biome-terrain-atlas", "/assets/biome-terrain-atlas-runtime.png", {
      frameWidth: 16,
      frameHeight: 16,
    });
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
    for (let chapter = 0; chapter < 4; chapter += 1) {
      const image = this.add.image(0, 0, `biome-background-${chapter}`).setOrigin(0, 0).setDisplaySize(VIEW_WIDTH, VIEW_HEIGHT).setVisible(false);
      this.biomeBackgrounds.push(image);
    }
    this.terrainBase = this.add.graphics();
    this.terrainTiles = this.add.container();
    for (let index = 0; index < 768; index += 1) {
      const tile = this.add.image(0, 0, "biome-terrain-atlas", 0).setOrigin(0, 0).setVisible(false);
      this.terrainTiles.add(tile);
      this.terrainTilePool.push(tile);
    }
    this.propLayer = this.add.container();
    for (let index = 0; index < 16; index += 1) {
      const prop = this.add.image(0, 0, "biome-props-atlas", 0).setOrigin(0.5, 1).setVisible(false);
      this.propLayer.add(prop);
      this.propPool.push(prop);
    }
    this.world = this.add.graphics();
    this.effects = this.add.graphics();
    this.ui = this.add.graphics();

    this.titleText = new HudText("hud-title", 64);
    this.promptText = new HudText("hud-prompt", 108);
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
    const pauseControl = document.querySelector<HTMLButtonElement>("#hud-pause");
    const soundControl = document.querySelector<HTMLButtonElement>("#hud-sound");
    if (!pauseControl || !soundControl) throw new Error("Missing game HUD controls.");
    this.pauseControl = pauseControl;
    this.soundControl = soundControl;
    this.pauseControl.addEventListener("click", () => this.togglePause());
    this.soundControl.addEventListener("click", () => this.toggleMute());
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
    for (const [chapter, image] of this.biomeBackgrounds.entries()) {
      let alpha = 0;
      if (chapter === from) alpha = 1 - progress;
      if (chapter === to) alpha = to === from ? 1 : progress;
      image.setVisible(alpha > 0).setAlpha(alpha);
      if (alpha > 0) image.setCrop().setDisplaySize(VIEW_WIDTH, VIEW_HEIGHT);
    }
  }

  private renderWorld(): void {
    const base = this.terrainBase;
    const g = this.world;
    base.clear();
    g.clear();
    const shakeX = this.shake > 0 ? Math.sin(this.uiTime * 120) * 1.4 : 0;
    const shakeY = this.shake > 0 ? Math.cos(this.uiTime * 90) * 1.1 : 0;
    const renderX = Math.round(shakeX);
    const renderY = Math.round(shakeY + this.cameraOffsetY);
    base.setPosition(renderX, renderY);
    this.terrainTiles.setPosition(renderX, renderY);
    this.propLayer.setPosition(renderX, renderY);
    g.setPosition(renderX, renderY);

    const transition = this.model.chapterTransition();
    const from = transition?.from ?? this.model.chapter;
    const to = transition?.to ?? from;
    const progress = transition?.progress ?? 0;
    const tunnel = this.renderTunnelPoints();
    this.drawTunnelFill(base, tunnel, from, 1 - progress);
    if (to !== from) this.drawTunnelFill(base, tunnel, to, progress);
    this.renderTerrainTiles(tunnel, from, to, progress, renderY);
    this.renderChunkDecorations(tunnel);
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

  private renderTunnelPoints(step = 4): VisibleTunnelPoint[] {
    const points: VisibleTunnelPoint[] = [];
    const firstWorldX = Math.floor((this.model.distance - step) / step) * step;
    const lastWorldX = this.model.distance + VIEW_WIDTH + step;
    for (let worldX = firstWorldX; worldX <= lastWorldX; worldX += step) {
      const offset = this.model.terrainOffsetAtWorldX(worldX);
      points.push({
        x: worldX - this.model.distance,
        ceiling: PLAY_TOP + offset,
        floor: PLAY_BOTTOM + offset,
      });
    }
    return points;
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
  }

  private tunnelPointAt(tunnel: VisibleTunnelPoint[], x: number): VisibleTunnelPoint | undefined {
    if (tunnel.length === 0) return undefined;
    const first = tunnel[0];
    const last = tunnel.at(-1);
    if (!first || !last) return undefined;
    if (x <= first.x) return first;
    if (x >= last.x) return last;
    for (let index = 1; index < tunnel.length; index += 1) {
      const right = tunnel[index];
      const left = tunnel[index - 1];
      if (!left || !right || x > right.x) continue;
      const progress = (x - left.x) / Math.max(0.001, right.x - left.x);
      return {
        x,
        ceiling: Phaser.Math.Linear(left.ceiling, right.ceiling, progress),
        floor: Phaser.Math.Linear(left.floor, right.floor, progress),
      };
    }
    return last;
  }

  private renderTerrainTiles(tunnel: VisibleTunnelPoint[], from: number, to: number, progress: number, renderY: number): void {
    for (const tile of this.terrainTilePool) tile.setVisible(false);
    const tileSize = 8;
    const samplesPerAxis = 8;
    const firstWorldColumn = Math.floor((this.model.distance - tileSize) / tileSize);
    const lastWorldColumn = Math.ceil((this.model.distance + VIEW_WIDTH + tileSize) / tileSize);
    const visibleTop = -renderY - tileSize;
    const visibleBottom = VIEW_HEIGHT - renderY + tileSize;
    let poolIndex = 0;
    for (let worldColumn = firstWorldColumn; worldColumn <= lastWorldColumn; worldColumn += 1) {
      const worldX = worldColumn * tileSize;
      const x = worldX - this.model.distance;
      const point = this.tunnelPointAt(tunnel, x + tileSize / 2);
      if (!point) continue;
      const topLayers = Math.max(0, Math.ceil((point.ceiling - visibleTop) / tileSize));
      const bottomLayers = Math.max(0, Math.ceil((visibleBottom - point.floor) / tileSize));
      const drawTile = (layer: number, top: boolean): boolean => {
        const mixHash = Math.abs((worldColumn * 37 + layer * 17) % 100) / 100;
        const chapter = to !== from && mixHash < progress ? to : from;
        const sourceHash = Math.abs(worldColumn * 73 + layer * 151 + chapter * 997);
        const sourceColumn = sourceHash % samplesPerAxis;
        const sourceRow = chapter === 0 && layer === 0 ? 0 : Math.floor(sourceHash / samplesPerAxis) % samplesPerAxis;
        const atlasColumn = (chapter % 2) * samplesPerAxis + sourceColumn;
        const atlasRow = Math.floor(chapter / 2) * samplesPerAxis + sourceRow;
        const textureFrame = atlasRow * 16 + atlasColumn;
        const tile = this.terrainTilePool[poolIndex++];
        if (!tile) return false;
        tile
          .setFrame(textureFrame)
          .setCrop()
          .setDisplaySize(tileSize + 0.25, tileSize + 0.25)
          .setPosition(Math.round(x), Math.round(top ? point.ceiling - (layer + 1) * tileSize : point.floor + layer * tileSize))
          .setFlipY(top)
          .setVisible(true);
        return true;
      };
      for (let layer = 0; layer < topLayers; layer += 1) if (!drawTile(layer, true)) return;
      for (let layer = 0; layer < bottomLayers; layer += 1) if (!drawTile(layer, false)) return;
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
      const point = this.tunnelPointAt(tunnel, x + 4);
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

  private renderChunkDecorations(tunnel: VisibleTunnelPoint[]): void {
    for (const prop of this.propPool) prop.setVisible(false);
    let propIndex = 0;
    for (const chunk of this.model.chunks) {
      if (chunk.definition.transition) continue;
      const origin = chunk.startX - this.model.distance;
      const idValue = [...chunk.definition.id].reduce((total, character) => total + character.charCodeAt(0), 0);
      const localX = 72 + (idValue % 38);
      const x = origin + localX;
      if (x < -36 || x > VIEW_WIDTH + 36) continue;
      const point = this.tunnelPointAt(tunnel, x);
      if (!point) continue;
      if (chunk.definition.decoration === "passage") continue;
      const prop = this.propPool[propIndex++];
      if (!prop) return;
      const chapter = chunk.definition.chapter;
      const sizes = [52, 45, 48, 45] as const;
      const size = sizes[chapter] ?? 45;
      prop
        .setFrame(chapter)
        .setDisplaySize(size, size)
        .setPosition(Math.round(x), Math.round(point.floor + 1))
        .setAlpha(0.92)
        .setVisible(true);
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

  private terrainSurfaceYAt(x: number, ceiling: boolean): number {
    const offset = this.model.terrainOffsetAtWorldX(this.model.distance + x);
    return (ceiling ? PLAY_TOP : PLAY_BOTTOM) + offset;
  }

  private terrainInwardNormalAt(x: number, ceiling: boolean): Phaser.Math.Vector2 {
    const sampleRadius = 2;
    const leftOffset = this.model.terrainOffsetAtWorldX(this.model.distance + x - sampleRadius);
    const rightOffset = this.model.terrainOffsetAtWorldX(this.model.distance + x + sampleRadius);
    const slope = (rightOffset - leftOffset) / (sampleRadius * 2);
    const length = Math.hypot(1, slope);
    return ceiling
      ? new Phaser.Math.Vector2(-slope / length, 1 / length)
      : new Phaser.Math.Vector2(slope / length, -1 / length);
  }

  private drawTerrainPlate(
    g: Phaser.GameObjects.Graphics,
    left: number,
    right: number,
    ceiling: boolean,
    thickness: number,
  ): void {
    const leftY = this.terrainSurfaceYAt(left, ceiling);
    const rightY = this.terrainSurfaceYAt(right, ceiling);
    const leftNormal = this.terrainInwardNormalAt(left, ceiling);
    const rightNormal = this.terrainInwardNormalAt(right, ceiling);
    const outerLeftX = left - leftNormal.x * thickness;
    const outerLeftY = leftY - leftNormal.y * thickness;
    const outerRightX = right - rightNormal.x * thickness;
    const outerRightY = rightY - rightNormal.y * thickness;
    g.fillTriangle(left, leftY, right, rightY, outerRightX, outerRightY);
    g.fillTriangle(left, leftY, outerRightX, outerRightY, outerLeftX, outerLeftY);
  }

  private drawTerrainSpike(
    g: Phaser.GameObjects.Graphics,
    left: number,
    right: number,
    depth: number,
    ceiling: boolean,
  ): void {
    const center = (left + right) / 2;
    const baseY = this.terrainSurfaceYAt(center, ceiling);
    const normal = this.terrainInwardNormalAt(center, ceiling);
    g.fillTriangle(
      left,
      this.terrainSurfaceYAt(left, ceiling),
      center + normal.x * depth,
      baseY + normal.y * depth,
      right,
      this.terrainSurfaceYAt(right, ceiling),
    );
  }

  private terrainSpikeScale(x: number, index: number): number {
    const pattern = [1, 0.78, 0.9, TERRAIN_SPIKE_MIN_SCALE, 0.84] as const;
    const worldCell = Math.floor((this.model.distance + x) / 8);
    const patternIndex = Math.abs(worldCell + index * 2) % pattern.length;
    return pattern[patternIndex] ?? 1;
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
      const ceiling = rect.attachment === "ceiling" || rect.flipY === true;
      g.fillStyle(biome.danger, 1);
      const count = Math.max(1, Math.ceil(rect.w / 7));
      const unit = rect.w / count;
      for (let index = 0; index < count; index += 1) {
        const left = rect.x + index * unit;
        const depth = rect.h * this.terrainSpikeScale(left, index);
        this.drawTerrainSpike(g, left, left + unit, depth, ceiling);
      }
      g.fillStyle(biome.terrainDark, 0.8);
      this.drawTerrainPlate(g, rect.x, rect.x + rect.w, ceiling, 3);
      return;
    }
    if (rect.kind === "barbs") {
      const biome = BIOMES[rect.chapter] ?? BIOMES[0];
      const ceiling = rect.attachment === "ceiling" || rect.flipY === true;
      g.fillStyle(biome.terrainDark, 1);
      this.drawTerrainPlate(g, rect.x, rect.x + rect.w, ceiling, 5);
      g.fillStyle(biome.danger, 1);
      const widths = [8, 11, 7, 10];
      let cursor = rect.x;
      let index = 0;
      while (cursor < rect.x + rect.w) {
        const width = Math.min(widths[index % widths.length] ?? 8, rect.x + rect.w - cursor);
        const depth = rect.h * this.terrainSpikeScale(cursor, index + 1);
        this.drawTerrainSpike(g, cursor, cursor + width, depth, ceiling);
        cursor += width;
        index += 1;
      }
      g.fillStyle(biome.glow, 0.75);
      for (let x = rect.x + 4; x < rect.x + rect.w - 2; x += 9) {
        const surfaceY = this.terrainSurfaceYAt(x, ceiling);
        const normal = this.terrainInwardNormalAt(x, ceiling);
        g.fillRect(Math.round(x - normal.x * 2) - 1, Math.round(surfaceY - normal.y * 2) - 1, 2, 2);
      }
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
    const centerY = y + bob;
    const glowPulse = this.settings.reducedMotion ? 0.5 : (Math.sin(this.uiTime * 4.5 + x * 0.025) + 1) / 2;
    g.fillStyle(COLORS.cream, 0.07 + glowPulse * 0.035);
    g.fillCircle(x, centerY, (8 + glowPulse) * scale);
    g.fillStyle(COLORS.yolk, 0.12 + glowPulse * 0.04);
    g.fillCircle(x, centerY, (5.5 + glowPulse * 0.5) * scale);
    g.fillStyle(COLORS.ink, 0.52);
    g.fillTriangle(x - 5 * scale, centerY, x + 4.5 * scale, centerY - 5 * scale, x + 2.5 * scale, centerY + 6 * scale);
    g.fillStyle(COLORS.yolk, 1);
    g.fillTriangle(x - 4 * scale, centerY, x + 4 * scale, centerY - 4 * scale, x + 2 * scale, centerY + 5 * scale);
    g.lineStyle(Math.max(1, scale), COLORS.cream, 0.85);
    g.lineBetween(x - 2 * scale, centerY + 3 * scale, x + 3 * scale, centerY - 2 * scale);
    g.fillStyle(COLORS.cream, 0.72 + glowPulse * 0.2);
    g.fillRect(Math.round(x - 4 * scale), Math.round(centerY - 5 * scale), Math.max(1, scale), 3 * scale);
    g.fillRect(Math.round(x - 5 * scale), Math.round(centerY - 4 * scale), 3 * scale, Math.max(1, scale));
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
    this.syncControlState();

    if (mode === "ready") {
      this.titleText.setY(57 + Math.sin(this.uiTime * 2.5) * 1.5);
      this.promptText.setAlpha(0.72 + Math.sin(this.uiTime * 4) * 0.2);
      const arrowY = 145 + Math.sin(this.uiTime * 4) * 4;
      g.fillStyle(COLORS.yolk, 1);
      g.fillTriangle(PLAYER_X - 5, arrowY + 4, PLAYER_X + 5, arrowY + 4, PLAYER_X, arrowY - 3);
      g.fillRect(PLAYER_X - 1, arrowY + 3, 2, 8);
      this.drawPixelPanel(g, 86, 36, 148, 93, 0);
    }

    this.drawTopButtonFrames(g);
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

  private syncControlState(): void {
    const paused = this.model.mode === "paused";
    this.pauseControl.dataset.state = paused ? "paused" : "playing";
    this.pauseControl.setAttribute("aria-label", paused ? "Resume game" : "Pause game");
    this.soundControl.dataset.state = this.settings.muted ? "muted" : "audible";
    this.soundControl.setAttribute("aria-label", this.settings.muted ? "Unmute sound" : "Mute sound");
  }

  private drawTopButtonFrames(g: Phaser.GameObjects.Graphics): void {
    const biome = BIOMES[this.model.chapter] ?? BIOMES[0];
    g.fillStyle(biome.terrainDark, 0.82);
    g.fillRect(248, 17, 30, 20);
    g.fillRect(284, 17, 30, 20);
    g.lineStyle(1, biome.surface, 0.7);
    g.strokeRect(248, 17, 30, 20);
    g.strokeRect(284, 17, 30, 20);
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
