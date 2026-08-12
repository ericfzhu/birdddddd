import {
  CHAPTERS,
  FIXED_STEP_SECONDS,
  FLIP_DEBOUNCE_SECONDS,
  GRAVITY_ACCELERATION,
  HITBOX_INSET,
  MAX_VERTICAL_SPEED,
  PLAY_BOTTOM,
  PLAY_TOP,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_X,
  RESTART_DELAY_SECONDS,
  VIEW_WIDTH,
  chapterForGates,
} from "./constants";
import { chunksForChapter, envelopesCompatible, transitionChunk } from "./chunks";
import type {
  ActiveChunk,
  ChapterTransitionState,
  GameEvent,
  GameMode,
  HazardSpec,
  VisibleFeather,
  VisibleRect,
} from "./types";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class GameModel {
  mode: GameMode = "ready";
  playerY = PLAY_BOTTOM - PLAYER_HEIGHT / 2;
  velocityY = 0;
  gravity: -1 | 1 = 1;
  score = 0;
  gates = 0;
  bestScore = 0;
  featherChain = 0;
  chapter = 0;
  distance = 0;
  simTime = 0;
  deathTimer = 0;
  lastFlipAt = -Infinity;
  seed: number;
  reducedMotion = false;
  chunks: ActiveChunk[] = [];
  private rngState: number;
  private events: GameEvent[] = [];
  private lastChunkId = "";
  private pendingTransition?: { from: number; to: number };

  constructor(seed = 0x51a7e, bestScore = 0, startingChapter = 0) {
    this.seed = seed >>> 0;
    this.rngState = this.seed;
    this.bestScore = bestScore;
    this.chapter = clamp(Math.floor(startingChapter), 0, CHAPTERS.length - 1);
    this.gates = CHAPTERS[this.chapter]?.at ?? 0;
    this.score = this.gates;
    this.populateInitialChunks();
  }

  reset(nextSeed = (this.seed + 0x9e3779b9) >>> 0): void {
    this.mode = "ready";
    this.playerY = PLAY_BOTTOM - PLAYER_HEIGHT / 2;
    this.velocityY = 0;
    this.gravity = 1;
    this.score = 0;
    this.gates = 0;
    this.featherChain = 0;
    this.chapter = 0;
    this.distance = 0;
    this.simTime = 0;
    this.deathTimer = 0;
    this.lastFlipAt = -Infinity;
    this.seed = nextSeed;
    this.rngState = nextSeed;
    this.events = [];
    this.chunks = [];
    this.lastChunkId = "";
    this.pendingTransition = undefined;
    this.populateInitialChunks();
  }

  action(): boolean {
    if (this.mode === "dead") {
      if (this.deathTimer < RESTART_DELAY_SECONDS) return false;
      this.reset();
      this.mode = "playing";
      this.gravity = -1;
      this.lastFlipAt = this.simTime;
      this.events.push({ type: "restart" }, { type: "flip", gravity: this.gravity });
      return true;
    }
    if (this.mode === "paused") return false;
    if (this.mode === "ready") this.mode = "playing";
    if (this.simTime - this.lastFlipAt < FLIP_DEBOUNCE_SECONDS) return false;
    this.gravity = this.gravity === 1 ? -1 : 1;
    this.lastFlipAt = this.simTime;
    this.events.push({ type: "flip", gravity: this.gravity });
    return true;
  }

  togglePause(): void {
    if (this.mode === "dead" || this.mode === "ready") return;
    this.mode = this.mode === "paused" ? "playing" : "paused";
    this.events.push({ type: "pause", paused: this.mode === "paused" });
  }

  step(dt = FIXED_STEP_SECONDS): void {
    if (this.mode === "paused" || this.mode === "ready") return;
    if (this.mode === "dead") {
      this.deathTimer += dt;
      return;
    }

    this.simTime += dt;
    const previousY = this.playerY;
    const speed = CHAPTERS[this.chapter]?.speed ?? CHAPTERS[0].speed;
    this.distance += speed * dt;
    this.velocityY = clamp(
      this.velocityY + this.gravity * GRAVITY_ACCELERATION * dt,
      -MAX_VERTICAL_SPEED,
      MAX_VERTICAL_SPEED,
    );
    this.playerY += this.velocityY * dt;

    this.resolveWorldBounds();
    this.resolveSolids(previousY);
    this.processHazards();
    if (this.mode !== "playing") return;
    this.processFeathers();
    this.processGates();
    this.recycleChunks();
  }

  advance(milliseconds: number): void {
    const steps = Math.max(1, Math.round(milliseconds / (FIXED_STEP_SECONDS * 1000)));
    for (let i = 0; i < steps; i += 1) this.step(FIXED_STEP_SECONDS);
  }

  drainEvents(): GameEvent[] {
    const pending = this.events;
    this.events = [];
    return pending;
  }

  visibleRects(): VisibleRect[] {
    const rects: VisibleRect[] = [];
    for (const active of this.chunks) {
      const origin = active.startX - this.distance;
      for (const solid of active.definition.solids) {
        const x = origin + solid.x;
        if (x < VIEW_WIDTH + 20 && x + solid.w > -20) {
          rects.push({
            ...solid,
            x,
            kind: "solid",
            detail: solid.detail,
            chapter: active.definition.chapter,
            decoration: active.definition.decoration,
          });
        }
      }
      for (const hazard of active.definition.hazards) {
        const x = origin + hazard.x;
        if (x < VIEW_WIDTH + 20 && x + hazard.w > -20) {
          rects.push({
            ...hazard,
            x,
            y: hazard.y + this.motionOffset(hazard),
            kind: hazard.kind,
            chapter: active.definition.chapter,
            decoration: active.definition.decoration,
          });
        }
      }
    }
    return rects;
  }

  visibleFeathers(): VisibleFeather[] {
    const feathers: VisibleFeather[] = [];
    for (const active of this.chunks) {
      const origin = active.startX - this.distance;
      for (const feather of active.feathers) {
        const x = origin + feather.x;
        if (!feather.collected && x > -12 && x < VIEW_WIDTH + 12) {
          feathers.push({ x, y: feather.y, collected: false });
        }
      }
    }
    return feathers;
  }

  chapterTransition(): ChapterTransitionState | undefined {
    const active = this.chunks.find((chunk) => chunk.definition.transition);
    const transition = active?.definition.transition;
    if (!active || !transition) return undefined;
    const localX = this.distance + PLAYER_X - active.startX;
    return {
      id: active.definition.id,
      from: transition.from,
      to: transition.to,
      progress: clamp(localX / active.definition.width, 0, 1),
      active: localX >= 0 && localX <= active.definition.width,
    };
  }

  textSnapshot(): string {
    const visibleHazards = this.visibleRects().filter((rect) => rect.kind !== "solid").slice(0, 8);
    return JSON.stringify({
      coordinateSystem: "origin top-left; x increases right; y increases down; logical viewport 320x180",
      mode: this.mode,
      player: { x: PLAYER_X, y: Number(this.playerY.toFixed(2)), vy: Number(this.velocityY.toFixed(2)), gravity: this.gravity },
      score: this.score,
      gates: this.gates,
      bestScore: this.bestScore,
      featherChain: this.featherChain,
      chapter: CHAPTERS[this.chapter]?.name,
      speed: CHAPTERS[this.chapter]?.speed,
      transition: this.chapterTransition(),
      restartReady: this.mode === "dead" && this.deathTimer >= RESTART_DELAY_SECONDS,
      hazards: visibleHazards.map(({ x, y, w, h, kind }) => ({ x: Math.round(x), y: Math.round(y), w, h, kind })),
      feathers: this.visibleFeathers().filter((item) => !item.collected).slice(0, 6).map((item) => ({ x: Math.round(item.x), y: item.y })),
    });
  }

  private resolveWorldBounds(): void {
    const halfHeight = PLAYER_HEIGHT / 2;
    if (this.playerY + halfHeight >= PLAY_BOTTOM) {
      const landed = this.velocityY > 35;
      this.playerY = PLAY_BOTTOM - halfHeight;
      if (this.velocityY > 0) this.velocityY = 0;
      if (landed) this.events.push({ type: "land" });
    }
    if (this.playerY - halfHeight <= PLAY_TOP) {
      const landed = this.velocityY < -35;
      this.playerY = PLAY_TOP + halfHeight;
      if (this.velocityY < 0) this.velocityY = 0;
      if (landed) this.events.push({ type: "land" });
    }
  }

  private resolveSolids(previousY: number): void {
    const halfWidth = PLAYER_WIDTH / 2 - HITBOX_INSET;
    const halfHeight = PLAYER_HEIGHT / 2 - HITBOX_INSET;
    for (const active of this.chunks) {
      const origin = active.startX - this.distance;
      for (const solid of active.definition.solids) {
        const left = origin + solid.x;
        if (PLAYER_X + halfWidth <= left || PLAYER_X - halfWidth >= left + solid.w) continue;
        if (this.gravity === 1) {
          const previousBottom = previousY + halfHeight;
          const currentBottom = this.playerY + halfHeight;
          if (previousBottom <= solid.y && currentBottom >= solid.y && this.velocityY >= 0) {
            this.playerY = solid.y - halfHeight;
            const landed = this.velocityY > 35;
            this.velocityY = 0;
            if (landed) this.events.push({ type: "land" });
          }
        } else {
          const underside = solid.y + solid.h;
          const previousTop = previousY - halfHeight;
          const currentTop = this.playerY - halfHeight;
          if (previousTop >= underside && currentTop <= underside && this.velocityY <= 0) {
            this.playerY = underside + halfHeight;
            const landed = this.velocityY < -35;
            this.velocityY = 0;
            if (landed) this.events.push({ type: "land" });
          }
        }
      }
    }
  }

  private processHazards(): void {
    const playerRect = {
      x: PLAYER_X - PLAYER_WIDTH / 2 + HITBOX_INSET,
      y: this.playerY - PLAYER_HEIGHT / 2 + HITBOX_INSET,
      w: PLAYER_WIDTH - HITBOX_INSET * 2,
      h: PLAYER_HEIGHT - HITBOX_INSET * 2,
    };
    for (const active of this.chunks) {
      const origin = active.startX - this.distance;
      for (const hazard of active.definition.hazards) {
        const rect = { x: origin + hazard.x, y: hazard.y + this.motionOffset(hazard), w: hazard.w, h: hazard.h };
        if (overlaps(playerRect, rect)) {
          this.die();
          return;
        }
      }
    }
  }

  private processFeathers(): void {
    const playerRect = {
      x: PLAYER_X - PLAYER_WIDTH / 2,
      y: this.playerY - PLAYER_HEIGHT / 2,
      w: PLAYER_WIDTH,
      h: PLAYER_HEIGHT,
    };
    for (const active of this.chunks) {
      const origin = active.startX - this.distance;
      for (const feather of active.feathers) {
        if (feather.collected || feather.missed) continue;
        const featherRect = { x: origin + feather.x - 4, y: feather.y - 5, w: 8, h: 10 };
        if (overlaps(playerRect, featherRect)) {
          feather.collected = true;
          this.featherChain += 1;
          this.events.push({ type: "feather", chain: this.featherChain });
          if (this.featherChain >= 3) {
            this.featherChain = 0;
            this.score += 1;
            this.events.push({ type: "bonus" });
          }
        } else if (origin + feather.x < PLAYER_X - PLAYER_WIDTH) {
          feather.missed = true;
          this.featherChain = 0;
        }
      }
    }
  }

  private processGates(): void {
    for (const active of this.chunks) {
      const gateX = active.startX + active.definition.width - 12 - this.distance;
      if (!active.gatePassed && gateX <= PLAYER_X) {
        active.gatePassed = true;
        if (active.definition.transition) continue;
        this.gates += 1;
        this.score += 1;
        this.events.push({ type: "gate", score: this.score });
        const nextChapter = chapterForGates(this.gates);
        if (nextChapter !== this.chapter) {
          const previousChapter = this.chapter;
          this.chapter = nextChapter;
          this.pendingTransition = { from: previousChapter, to: nextChapter };
          this.pruneUnseenQueue();
          this.events.push({ type: "chapter", chapter: this.chapter });
        }
      }
    }
  }

  private recycleChunks(): void {
    this.chunks = this.chunks.filter((active) => active.startX + active.definition.width - this.distance > -40);
    let rightEdge = this.chunks.length > 0
      ? Math.max(...this.chunks.map((active) => active.startX + active.definition.width))
      : this.distance + VIEW_WIDTH;
    while (rightEdge - this.distance < VIEW_WIDTH + 360) {
      const previous = this.chunks.at(-1)?.definition;
      const definition = this.pendingTransition
        ? transitionChunk(this.pendingTransition.from, this.pendingTransition.to)
        : this.chooseChunk(this.chapter, previous?.exit);
      this.pendingTransition = undefined;
      this.chunks.push({
        definition,
        startX: rightEdge,
        gatePassed: false,
        feathers: definition.feathers.map((feather) => ({ ...feather, collected: false, missed: false })),
      });
      rightEdge += definition.width;
    }
  }

  private pruneUnseenQueue(): void {
    this.chunks = this.chunks.filter((active) => active.startX - this.distance <= VIEW_WIDTH + 32);
    this.lastChunkId = this.chunks.at(-1)?.definition.id ?? "";
  }

  private populateInitialChunks(): void {
    let startX = 240;
    for (let i = 0; i < 5; i += 1) {
      const previous = this.chunks.at(-1)?.definition;
      const definition = this.chooseChunk(this.chapter, previous?.exit);
      this.chunks.push({
        definition,
        startX,
        gatePassed: false,
        feathers: definition.feathers.map((feather) => ({ ...feather, collected: false, missed: false })),
      });
      startX += definition.width;
    }
  }

  private chooseChunk(chapter: number, previousExit?: { surface: "any" | "top" | "bottom"; maxAbsVelocity: number }) {
    const pool = chunksForChapter(chapter).filter((candidate) => {
      if (candidate.id === this.lastChunkId) return false;
      return previousExit ? envelopesCompatible(previousExit, candidate.entry) : true;
    });
    const fallback = chunksForChapter(chapter).filter((candidate) => candidate.id !== this.lastChunkId);
    const candidates = pool.length > 0 ? pool : fallback;
    const selected = candidates[Math.floor(this.random() * candidates.length)] ?? chunksForChapter(chapter)[0];
    if (!selected) throw new Error(`No chunks available for chapter ${chapter}`);
    this.lastChunkId = selected.id;
    return selected;
  }

  private motionOffset(hazard: HazardSpec): number {
    if (!hazard.motion) return 0;
    const phase = hazard.motion.phase ?? 0;
    return Math.sin((this.simTime * hazard.motion.frequency + phase) * Math.PI * 2) * hazard.motion.amplitude;
  }

  private random(): number {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
    let value = this.rngState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  private die(): void {
    if (this.mode !== "playing") return;
    this.mode = "dead";
    this.deathTimer = 0;
    this.bestScore = Math.max(this.bestScore, this.score);
    this.events.push({ type: "death", score: this.score });
  }
}
