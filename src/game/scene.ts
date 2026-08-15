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
  RENDER_DENSITY,
  SANDJET_NOZZLE_DEPTH,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from "./constants";
import { sandJetVisualLayout, spikeClusterLayout, spikeRotationForNormal } from "./hazards";
import { desertParallaxState, verdantParallaxState, type ParallaxCrop } from "./parallax";
import { propGroundPlacement, propLayout } from "./props";
import {
  authoredAssetForHazard,
  interactiveAssetPath,
  interactiveDangerTextureKey,
  interactiveTextureKey,
  INTERACTIVE_ART,
  TRANSITION_ART,
  transitionArtFor,
  transitionTextureKey,
} from "./interactive-art";
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
const DANGER_RED = 0xff1238;
const BACKGROUND_ASSETS = [
  "biome-forest-far-background-v2-runtime.png",
  "biome-underground-jungle-background-runtime.png",
  "biome-desert-far-background-v2-runtime.png",
  "biome-marble-cave-background-runtime.png",
  "biome-violet-background-runtime.png",
  "biome-underground-corruption-background-runtime.png",
  "biome-abandoned-minecart-background-runtime.png",
  "biome-ashen-background-runtime.png",
  "biome-underworld-background-runtime.png",
] as const;
const NEW_ART_CHAPTERS = [1, 3, 5, 6, 8] as const;
const NEW_ART_SLUGS = ["underground-jungle", "marble-cave", "underground-corruption", "abandoned-minecart", "underworld"] as const;
const LEGACY_ATLAS_CHAPTER = new Map<number, number>([[0, 0], [2, 1], [4, 2], [7, 3]]);

export class AviaryScene extends Phaser.Scene {
  model!: GameModel;
  private settings!: StoredSettings;
  private background!: Phaser.GameObjects.Graphics;
  private biomeBackgrounds: Phaser.GameObjects.Image[] = [];
  private verdantMidground!: Phaser.GameObjects.Image;
  private verdantNear!: Phaser.GameObjects.Image;
  private desertMidground!: Phaser.GameObjects.Image;
  private desertNear!: Phaser.GameObjects.Image;
  private terrainBase!: Phaser.GameObjects.Graphics;
  private terrainTiles!: Phaser.GameObjects.Container;
  private terrainTilePool: Phaser.GameObjects.Image[] = [];
  private propLayer!: Phaser.GameObjects.Container;
  private propPool: Phaser.GameObjects.Image[] = [];
  private authoredTerrainLayer!: Phaser.GameObjects.Container;
  private authoredTerrainPool: Phaser.GameObjects.Image[] = [];
  private authoredRects = new Set<VisibleRect>();
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
    BACKGROUND_ASSETS.forEach((asset, chapter) => this.load.image(`biome-background-${chapter}`, `/assets/${asset}`));
    this.load.image("verdant-midground", "/assets/biome-forest-midground-v2-runtime.png");
    this.load.image("verdant-near", "/assets/biome-forest-near-v2-runtime.png");
    this.load.image("desert-midground", "/assets/biome-desert-midground-v2-runtime.png");
    this.load.image("desert-near", "/assets/biome-desert-near-v2-runtime.png");
    INTERACTIVE_ART.forEach((family, chapter) => {
      for (const asset of family.assets) {
        this.load.image(interactiveTextureKey(chapter, asset), interactiveAssetPath(family, asset));
      }
    });
    for (const transition of TRANSITION_ART) {
      this.load.image(
        transitionTextureKey(transition.from, transition.to),
        `/assets/transition-${transition.slug}-v2-runtime.png`,
      );
    }
    this.load.spritesheet("biome-props-atlas", "/assets/biome-props-atlas-runtime.png", {
      frameWidth: 128,
      frameHeight: 128,
    });
    this.load.spritesheet("biome-terrain-atlas", "/assets/biome-terrain-atlas-runtime.png", {
      frameWidth: 16,
      frameHeight: 16,
    });
    NEW_ART_CHAPTERS.forEach((chapter, index) => {
      const slug = NEW_ART_SLUGS[index];
      this.load.spritesheet(`biome-terrain-${chapter}`, `/assets/biome-${slug}-terrain-runtime.png`, { frameWidth: 16, frameHeight: 16 });
      this.load.image(`biome-prop-${chapter}`, `/assets/biome-${slug}-prop-runtime.png`);
    });
  }

  create(): void {
    this.cameras.main.setOrigin(0, 0).setZoom(RENDER_DENSITY).setRoundPixels(true);
    const dangerColor = `#${DANGER_RED.toString(16).padStart(6, "0")}`;
    INTERACTIVE_ART.forEach((family, chapter) => {
      for (const asset of family.assets) {
        if (!Object.values(family.hazards).includes(asset)) continue;
        this.createSolidSilhouetteTexture(
          interactiveTextureKey(chapter, asset),
          interactiveDangerTextureKey(chapter, asset),
          dangerColor,
        );
      }
    });
    this.settings = this.loadSettings();
    const query = new URLSearchParams(window.location.search);
    const requestedSeed = Number(query.get("seed"));
    const requestedChapter = query.get("previewChapter");
    const previewChapter = requestedChapter === null ? (import.meta.env.DEV ? 2 : 0) : Number(requestedChapter);
    const seed = Number.isFinite(requestedSeed) && requestedSeed > 0 ? requestedSeed >>> 0 : (Date.now() ^ 0x51a7e) >>> 0;
    this.model = new GameModel(seed, this.settings.bestScore, Number.isFinite(previewChapter) ? previewChapter : 0);
    this.model.reducedMotion = this.settings.reducedMotion;

    this.background = this.add.graphics();
    for (let chapter = 0; chapter < CHAPTERS.length; chapter += 1) {
      const image = this.add.image(0, 0, `biome-background-${chapter}`).setOrigin(0, 0).setDisplaySize(VIEW_WIDTH, VIEW_HEIGHT).setVisible(false);
      this.biomeBackgrounds.push(image);
    }
    this.verdantMidground = this.add.image(0, 0, "verdant-midground").setOrigin(0, 0).setVisible(false);
    this.verdantNear = this.add.image(0, 0, "verdant-near").setOrigin(0, 0).setVisible(false);
    this.desertMidground = this.add.image(0, 0, "desert-midground").setOrigin(0, 0).setVisible(false);
    this.desertNear = this.add.image(0, 0, "desert-near").setOrigin(0, 0).setVisible(false);
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
    this.authoredTerrainLayer = this.add.container();
    for (let index = 0; index < 128; index += 1) {
      const sprite = this.add.image(0, 0, "authored-terrain-0-thorn").setVisible(false);
      this.authoredTerrainLayer.add(sprite);
      this.authoredTerrainPool.push(sprite);
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
    window.dispatchEvent(new Event("birdddddd:scene-ready"));
  }

  private createSolidSilhouetteTexture(sourceKey: string, targetKey: string, color: string): void {
    const source = this.textures.get(sourceKey).getSourceImage();
    if (!(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement)) {
      throw new Error(`Silhouette source is not a drawable image: ${sourceKey}`);
    }
    const texture = this.textures.createCanvas(targetKey, source.width, source.height);
    if (!texture) throw new Error(`Could not create silhouette texture: ${targetKey}`);
    const context = texture.getContext();
    context.clearRect(0, 0, source.width, source.height);
    context.drawImage(source, 0, 0, source.width, source.height);
    context.globalCompositeOperation = "source-in";
    context.fillStyle = color;
    context.fillRect(0, 0, source.width, source.height);
    context.globalCompositeOperation = "source-over";
    texture.refresh();
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
      if (alpha <= 0) continue;
      if (chapter === 0 || chapter === 2) {
        const parallax = chapter === 0
          ? verdantParallaxState(this.model.chapterDistance, this.cameraOffsetY, this.settings.reducedMotion)
          : desertParallaxState(this.model.chapterDistance, this.cameraOffsetY, this.settings.reducedMotion);
        this.applyParallaxCrop(image, parallax.far);
      } else {
        image.setCrop().setDisplaySize(VIEW_WIDTH, VIEW_HEIGHT);
      }
    }
    const verdantAlpha = from === 0 ? 1 - progress : to === 0 ? progress : 0;
    const parallax = verdantParallaxState(this.model.chapterDistance, this.cameraOffsetY, this.settings.reducedMotion);
    this.renderParallaxLayer(this.verdantMidground, parallax.mid, verdantAlpha);
    this.renderParallaxLayer(this.verdantNear, parallax.near, verdantAlpha);

    const desertAlpha = from === 2 ? 1 - progress : to === 2 ? progress : 0;
    const desertParallax = desertParallaxState(this.model.chapterDistance, this.cameraOffsetY, this.settings.reducedMotion);
    this.renderParallaxLayer(this.desertMidground, desertParallax.mid, desertAlpha);
    this.renderParallaxLayer(this.desertNear, desertParallax.near, desertAlpha);
  }

  private applyParallaxCrop(image: Phaser.GameObjects.Image, crop: ParallaxCrop): void {
    const scaleX = VIEW_WIDTH / crop.width;
    const scaleY = VIEW_HEIGHT / crop.height;
    image
      .setCrop(crop.x, crop.y, crop.width, crop.height)
      .setScale(scaleX, scaleY)
      .setPosition(-crop.x * scaleX, -crop.y * scaleY);
  }

  private renderParallaxLayer(image: Phaser.GameObjects.Image, crop: ParallaxCrop, alpha: number): void {
    image.setVisible(alpha > 0).setAlpha(alpha);
    if (alpha > 0) this.applyParallaxCrop(image, crop);
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
    this.authoredTerrainLayer.setPosition(renderX, renderY);
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
    const visibleRects = this.model.visibleRects();
    this.renderAuthoredTerrainSprites(visibleRects);
    for (const rect of visibleRects) this.drawRectEntity(g, rect);
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
        const legacyChapter = LEGACY_ATLAS_CHAPTER.get(chapter);
        const textureKey = legacyChapter === undefined ? `biome-terrain-${chapter}` : "biome-terrain-atlas";
        const textureFrame = legacyChapter === undefined
          ? sourceRow * samplesPerAxis + sourceColumn
          : (Math.floor(legacyChapter / 2) * samplesPerAxis + sourceRow) * 16 + (legacyChapter % 2) * samplesPerAxis + sourceColumn;
        const tile = this.terrainTilePool[poolIndex++];
        if (!tile) return false;
        tile
          .setTexture(textureKey, textureFrame)
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
    const thickness = chapter === 4 || chapter === 8 ? 4 : 3;
    const spacing = [12, 14, 16, 15, 14, 13, 12, 16, 12][chapter] ?? 16;
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
      } else if (chapter === 1 || chapter === 3) {
        g.fillStyle(biome.accent, 0.78 * alpha);
        g.fillRect(x, point.ceiling - 2, 7, 2);
        g.fillRect(x + 8, point.floor, 7, 2);
        g.fillStyle(biome.terrain, 0.85 * alpha);
        g.fillRect(x + 3, point.ceiling - 5, 3, 2);
        g.fillRect(x + 10, point.floor + 4, 3, 2);
      } else if (chapter === 2 || chapter === 4 || chapter === 5) {
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
      const origin = chunk.startX - this.model.distance;
      const transition = chunk.definition.transition;
      if (transition) {
        const art = transitionArtFor(transition.from, transition.to);
        if (!art) continue;
        const x = origin + chunk.definition.width * 0.5;
        if (x < -48 || x > VIEW_WIDTH + 48) continue;
        const point = this.tunnelPointAt(tunnel, x);
        const prop = this.propPool[propIndex++];
        if (!point || !prop) continue;
        prop
          .setTexture(transitionTextureKey(transition.from, transition.to))
          .setOrigin(0.5, 1)
          .setDisplaySize(72, 42)
          .setPosition(Math.round(x), Math.round(point.floor + 1))
          .setRotation(0)
          .setAlpha(0.94)
          .setVisible(true);
        continue;
      }
      const idValue = [...chunk.definition.id].reduce((total, character) => total + character.charCodeAt(0), 0);
      const localX = 72 + (idValue % 38);
      const x = origin + localX;
      if (x < -36 || x > VIEW_WIDTH + 36) continue;
      if (chunk.definition.decoration === "passage") continue;
      const prop = this.propPool[propIndex++];
      if (!prop) return;
      const chapter = chunk.definition.chapter;
      const layout = propLayout(chapter);
      const placement = propGroundPlacement(layout, (relativeX) => this.tunnelPointAt(tunnel, x + relativeX)?.floor);
      if (!placement) continue;
      const legacyChapter = LEGACY_ATLAS_CHAPTER.get(chapter);
      if (legacyChapter === undefined) prop.setTexture(`biome-prop-${chapter}`);
      else prop.setTexture("biome-props-atlas", legacyChapter);
      prop
        .setOrigin(0.5, layout.originY)
        .setDisplaySize(layout.displayWidth, layout.displayHeight)
        .setPosition(Math.round(x), Math.round(placement.y))
        .setRotation(placement.rotation)
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
      g.fillStyle(biome.terrain, 1);
      g.fillRect(rect.x, rect.y, rect.w, rect.h);
      g.fillStyle(biome.surface, 1);
      g.fillRect(rect.x, rect.y, rect.w, 2);
      g.fillStyle(biome.accent, 0.8);
      for (let x = rect.x + 3; x < rect.x + rect.w - 2; x += 8) g.fillRect(x, rect.y + 2, 2, Math.min(4, rect.h - 2));
      return;
    }
    if (rect.chapter === 2) {
      g.fillStyle(biome.surface, 1);
      g.fillRect(rect.x, rect.y, rect.w, rect.h);
      g.fillStyle(biome.accent, 0.9);
      g.fillRect(rect.x, rect.y, rect.w, 2);
      g.fillStyle(biome.terrain, 0.75);
      for (let x = rect.x + 3; x < rect.x + rect.w - 2; x += 9) g.fillRect(x, rect.y + Math.max(2, rect.h - 3), 6, 2);
      return;
    }
    if (rect.chapter === 4 || rect.chapter === 5) {
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

  private renderAuthoredTerrainSprites(rects: VisibleRect[]): void {
    for (const sprite of this.authoredTerrainPool) sprite.setVisible(false);
    this.authoredRects.clear();
    let poolIndex = 0;
    const takeSprite = (texture: string): Phaser.GameObjects.Image | undefined => {
      const sprite = this.authoredTerrainPool[poolIndex++];
      if (!sprite) return undefined;
      return sprite
        .setTexture(texture)
        .setAlpha(1)
        .clearTint()
        .setTintMode(Phaser.TintModes.MULTIPLY)
        .setFlipX(false)
        .setFlipY(false)
        .setRotation(0)
        .setVisible(true);
    };

    for (const rect of rects) {
      const family = INTERACTIVE_ART[rect.chapter];
      if (!family) continue;
      const texturePrefix = `authored-terrain-${rect.chapter}`;
      if (rect.kind === "solid") {
        let sprite: Phaser.GameObjects.Image | undefined;
        if (rect.detail === "cage") {
          sprite = takeSprite(`${texturePrefix}-pillar`)
            ?.setOrigin(0.5, 0.5)
            .setDisplaySize(rect.w + 2 + (family.emphasis?.pillarWidthBonus ?? 0), rect.h)
            .setPosition(Math.round(rect.x + rect.w / 2), Math.round(rect.y + rect.h / 2));
        } else {
          sprite = takeSprite(`${texturePrefix}-platform`)
            ?.setOrigin(0.5, 0.5)
            .setDisplaySize(rect.w, rect.h + 2)
            .setPosition(Math.round(rect.x + rect.w / 2), Math.round(rect.y + rect.h / 2));
        }
        if (sprite) this.authoredRects.add(rect);
        continue;
      }

      if (rect.kind === "thorns" || rect.kind === "barbs") {
        const ceiling = rect.attachment === "ceiling" || rect.flipY === true;
        if (rect.kind === "thorns" && family.emphasis?.clusteredThorns) {
          const centerX = rect.x + rect.w / 2;
          const surfaceY = this.terrainSurfaceYAt(centerX, ceiling);
          const normal = this.terrainInwardNormalAt(centerX, ceiling);
          const rotation = spikeRotationForNormal(normal.x, normal.y);
          const warningEdge = takeSprite(`${texturePrefix}-thorn`);
          const cluster = takeSprite(`${texturePrefix}-thorn`);
          if (warningEdge && cluster) {
            warningEdge
              .setTexture(interactiveDangerTextureKey(rect.chapter, "thorn"))
              .setOrigin(0.5, 1)
              .setDisplaySize(rect.w + 11, rect.h + 5)
              .setPosition(Math.round(centerX), Math.round(surfaceY))
              .setRotation(rotation)
              .setAlpha(1);
            cluster
              .setOrigin(0.5, 1)
              .setDisplaySize(rect.w + 7, rect.h + 2)
              .setPosition(Math.round(centerX), Math.round(surfaceY))
              .setRotation(rotation);
            this.authoredRects.add(rect);
          }
          continue;
        }
        let complete = true;
        for (const point of spikeClusterLayout(rect.w)) {
          const centerX = rect.x + point.offset + point.width / 2;
          const surfaceY = this.terrainSurfaceYAt(centerX, ceiling);
          const normal = this.terrainInwardNormalAt(centerX, ceiling);
          const texture = `${texturePrefix}-${rect.kind === "barbs" ? "barb" : "thorn"}`;
          const rotation = spikeRotationForNormal(normal.x, normal.y);
          const warningEdge = takeSprite(texture);
          const spike = takeSprite(texture);
          if (!warningEdge || !spike) {
            complete = false;
            continue;
          }
          warningEdge
            .setTexture(interactiveDangerTextureKey(rect.chapter, rect.kind === "barbs" ? "barb" : "thorn"))
            .setOrigin(0.5, 1)
            .setDisplaySize(point.width + 4 + (family.emphasis?.spikeWidthBonus ?? 0), rect.h + 4)
            .setPosition(Math.round(centerX), Math.round(surfaceY))
            .setRotation(rotation)
            .setAlpha(1);
          spike
            .setOrigin(0.5, 1)
            .setDisplaySize(point.width + 2 + (family.emphasis?.spikeWidthBonus ?? 0), rect.h + 2)
            .setPosition(Math.round(centerX), Math.round(surfaceY))
            .setRotation(rotation);
        }
        if (complete) this.authoredRects.add(rect);
        continue;
      }

      if (rect.kind === "sandJet") {
        const active = rect.active !== false;
        const centerX = Math.round(rect.x + rect.w / 2);
        const layout = sandJetVisualLayout(
          rect.y,
          rect.h,
          SANDJET_NOZZLE_DEPTH,
          rect.attachment === "ceiling" || rect.flipY === true,
        );
        const warningSprite = active
          ? takeSprite(interactiveDangerTextureKey(rect.chapter, "sandjet"))
          : undefined;
        const nozzleSprite = takeSprite(interactiveTextureKey(rect.chapter, "sandjet-nozzle"));
        const plumeSprite = active ? takeSprite(interactiveTextureKey(rect.chapter, "sandjet")) : undefined;
        if (!nozzleSprite || (active && (!warningSprite || !plumeSprite))) {
          warningSprite?.setVisible(false);
          nozzleSprite?.setVisible(false);
          plumeSprite?.setVisible(false);
          continue;
        }
        nozzleSprite
          .setOrigin(0.5, layout.originY)
          .setDisplaySize(rect.w + 8, 16)
          .setPosition(centerX, Math.round(layout.baseY))
          .setAlpha(1)
          .setFlipY(layout.flipY);
        if (warningSprite && plumeSprite) {
          plumeSprite
            .setOrigin(0.5, layout.originY)
            .setDisplaySize(rect.w + 8, rect.h - SANDJET_NOZZLE_DEPTH + 4)
            .setPosition(centerX, Math.round(layout.openingY))
            .setFlipY(layout.flipY);
          this.syncDangerSilhouette(warningSprite, plumeSprite, 4);
        }
        this.authoredRects.add(rect);
        continue;
      }

      const asset = authoredAssetForHazard(rect.chapter, rect.kind);
      if (!asset) continue;
      const texture = interactiveTextureKey(rect.chapter, asset);
      const centerX = Math.round(rect.x + rect.w / 2);
      const centerY = Math.round(rect.y + rect.h / 2);
      const firstSprite = takeSprite(texture);
      if (!firstSprite) continue;
      const warningSprite = rect.active === false
        ? undefined
        : firstSprite.setTexture(interactiveDangerTextureKey(rect.chapter, asset));
      const sprite = warningSprite ? takeSprite(texture) : firstSprite;
      if (!sprite) {
        warningSprite?.setVisible(false);
        continue;
      }

      if (rect.kind === "vine") {
        sprite.setOrigin(0.5, 0).setDisplaySize(rect.w + 6, rect.h + 2).setPosition(centerX, Math.round(rect.y));
      } else if (rect.kind === "flame") {
        const ceiling = rect.attachment === "ceiling" || rect.flipY === true;
        const flameAsset = rect.active === false ? "flame-warning" : "flame";
        sprite
          .setTexture(interactiveTextureKey(rect.chapter, flameAsset))
          .setOrigin(0.5, 1)
          .setDisplaySize(rect.w + 8, rect.active === false ? 14 : rect.h + 4)
          .setPosition(centerX, Math.round(ceiling ? rect.y : rect.y + rect.h))
          .setFlipY(ceiling);
      } else if (rect.kind === "shutter") {
        const width = rect.w + 6 + (family.emphasis?.shutterWidthBonus ?? 0);
        sprite.setOrigin(0.5, 0.5).setDisplaySize(width, rect.h + 4).setPosition(centerX, centerY);
      } else if (rect.kind === "beak") {
        sprite.setOrigin(0.5, 0.5).setDisplaySize(rect.w + 4, rect.h + 3).setPosition(centerX, centerY).setFlipY(rect.flipY === true);
      } else {
        sprite
          .setOrigin(0.5, 0.5)
          .setDisplaySize(rect.w + (rect.kind === "cart" ? 4 : 6), rect.h + 6)
          .setPosition(centerX, centerY);
        if (rect.kind === "spinner") sprite.setRotation(this.settings.reducedMotion ? 0 : this.uiTime * 3.4);
        if (rect.kind === "cart" && !this.settings.reducedMotion) sprite.setRotation(Math.sin(this.uiTime * 10) * 0.025);
        if (rect.kind === "crystal" && !this.settings.reducedMotion) sprite.setRotation(Math.sin(this.uiTime * 2.6) * 0.08);
        if ((rect.kind === "spore" || rect.kind === "ember") && !this.settings.reducedMotion) {
          const pulse = 1 + Math.sin(this.uiTime * 6) * 0.06;
          sprite.setScale(sprite.scaleX * pulse, sprite.scaleY * pulse);
        }
      }
      if (warningSprite) {
        this.syncDangerSilhouette(warningSprite, sprite, rect.kind === "shutter" ? 7 : 4);
      }
      this.authoredRects.add(rect);
    }
  }

  private syncDangerSilhouette(
    warning: Phaser.GameObjects.Image,
    sprite: Phaser.GameObjects.Image,
    padding: number,
  ): void {
    warning
      .setOrigin(sprite.originX, sprite.originY)
      .setDisplaySize(sprite.displayWidth + padding, sprite.displayHeight + padding)
      .setPosition(sprite.x, sprite.y)
      .setRotation(sprite.rotation)
      .setFlipX(sprite.flipX)
      .setFlipY(sprite.flipY)
      .setAlpha(1);
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

  private drawRectEntity(g: Phaser.GameObjects.Graphics, rect: VisibleRect): void {
    if (this.authoredRects.has(rect)) return;
    if (rect.kind !== "solid") {
      throw new Error(`Authored hazard failed to render: chapter ${rect.chapter} ${rect.kind}`);
    }
    if (rect.detail === "cage") {
      this.drawCagePillar(g, rect);
      return;
    }
    this.drawChapterSolid(g, rect);
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
    const flapFrame = animation === "flutter" ? Math.floor(motionTime * 12) % 3 : 1;
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

    const wingRootX = x;
    const wingRootY = y + gravity;
    const wingTipX = stunned ? x - 10 : animation === "flutter" && flapFrame === 1 ? x - 12 : x - 10;
    const wingTipY = stunned
      ? y + gravity * 7
      : animation === "flutter"
        ? y + gravity * (flapFrame === 0 ? -7 : flapFrame === 1 ? -1 : 7)
        : y + gravity * 4;
    const wingShoulderY = y - gravity * 3;

    // A dark outer silhouette keeps the wing readable over every biome. The
    // three flutter poses describe a broad arc instead of merely resizing the
    // old triangle, so even a single frame clearly reads as a flapping wing.
    g.fillStyle(0x3b2630, 0.9);
    g.fillTriangle(wingRootX + 2, wingRootY - gravity * 3, wingTipX - 1, wingTipY, wingRootX, wingRootY + gravity * 3);
    g.fillTriangle(wingTipX - 1, wingTipY, wingTipX + 4, wingTipY - gravity * 2, wingTipX + 3, wingTipY + gravity * 2);
    g.fillStyle(0xb66f35, 1);
    g.fillTriangle(wingRootX + 1, wingRootY - gravity * 2, wingTipX, wingTipY, wingRootX - 1, wingRootY + gravity * 2);
    g.fillTriangle(wingTipX, wingTipY, wingTipX + 4, wingTipY - gravity, wingTipX + 3, wingTipY + gravity * 2);
    g.fillStyle(0xe7a746, 1);
    g.fillTriangle(wingRootX, wingShoulderY, wingTipX + 3, wingTipY, wingRootX + 2, wingRootY + gravity);
    g.fillStyle(0xf2c25b, 1);
    g.fillRect(Math.round(wingTipX + 1), Math.round(wingTipY - gravity * 2), 5, 1);
    g.fillRect(Math.round(wingTipX), Math.round(wingTipY), 5, 1);
    g.fillStyle(COLORS.cream, 0.82);
    g.fillRect(Math.round(wingTipX + 2), Math.round(wingTipY - gravity * 3), 3, 1);

    if (stunned) {
      g.fillStyle(0x3b2630, 0.9);
      g.fillTriangle(x + 2, wingRootY, x + 8, y + gravity * 6, x + 7, wingRootY - gravity * 2);
      g.fillStyle(0xb66f35, 1);
      g.fillTriangle(x + 3, wingRootY, x + 7, y + gravity * 5, x + 6, wingRootY - gravity);
    }

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
