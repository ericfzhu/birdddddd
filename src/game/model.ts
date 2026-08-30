import {
  CHAPTERS,
  FIXED_STEP_SECONDS,
  FLAME_VENT_DEPTH,
  FLIP_DEBOUNCE_SECONDS,
  GRAVITY_ACCELERATION,
  HITBOX_INSET,
  MAX_VIEW_WIDTH,
  MAX_VERTICAL_SPEED,
  PLAY_BOTTOM,
  PLAY_TOP,
  PLAYER_HEIGHT,
  PLAYER_MIN_X,
  PLAYER_RECOVERY_SPEED,
  PLAYER_WIDTH,
  PLAYER_X,
  RESTART_DELAY_SECONDS,
  SANDJET_NOZZLE_DEPTH,
  TERRAIN_SPIKE_COLLISION_RATIO,
  WALKER_STOMP_BOUNCE_SPEED,
  VIEW_WIDTH,
  chapterForGates,
} from "./constants";
import { chunksForChapter, envelopesCompatible, transitionChunk, tunnelOffsetAt } from "./chunks";
import type {
  ActiveChunk,
  ChapterTransitionState,
  GameEvent,
  GameMode,
  HazardSpec,
  EnemyState,
  VisibleFeather,
  VisibleRect,
  VisibleTunnelPoint,
} from "./types";

interface WingedShellRuntimeState {
  phase: Exclude<EnemyState, "flying">;
  localX: number;
  y: number;
  velocityY: number;
  velocityX: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class GameModel {
  mode: GameMode = "ready";
  playerX = PLAYER_X;
  playerY = PLAY_BOTTOM - PLAYER_HEIGHT / 2;
  velocityY = 0;
  gravity: -1 | 1 = 1;
  score = 0;
  gates = 0;
  bestScore = 0;
  featherChain = 0;
  chapter = 0;
  distance = 0;
  chapterDistance = 0;
  simTime = 0;
  deathTimer = 0;
  lastFlipAt = -Infinity;
  seed: number;
  reducedMotion = false;
  recovering = false;
  stomps = 0;
  chunks: ActiveChunk[] = [];
  private rngState: number;
  private events: GameEvent[] = [];
  private lastChunkId = "";
  private pendingTransition?: { from: number; to: number };
  private parallaxTransitionId = "";
  private outgoingChapterDistance = 0;
  private viewportWidth: number;
  private defeatedHazards = new WeakMap<ActiveChunk, Set<number>>();
  private wingedShellStates = new WeakMap<ActiveChunk, Map<number, WingedShellRuntimeState>>();

  constructor(seed = 0x51a7e, bestScore = 0, startingChapter = 0, startingChunkId?: string, viewportWidth = VIEW_WIDTH) {
    this.seed = seed >>> 0;
    this.rngState = this.seed;
    this.bestScore = bestScore;
    this.chapter = clamp(Math.floor(startingChapter), 0, CHAPTERS.length - 1);
    this.gates = CHAPTERS[this.chapter]?.at ?? 0;
    this.score = this.gates;
    this.viewportWidth = clamp(viewportWidth, VIEW_WIDTH, MAX_VIEW_WIDTH);
    this.populateInitialChunks(startingChunkId);
  }

  setViewportWidth(width: number): void {
    this.viewportWidth = clamp(width, VIEW_WIDTH, MAX_VIEW_WIDTH);
    this.recycleChunks();
  }

  reset(nextSeed = (this.seed + 0x9e3779b9) >>> 0): void {
    this.mode = "ready";
    this.playerX = PLAYER_X;
    this.playerY = PLAY_BOTTOM - PLAYER_HEIGHT / 2;
    this.velocityY = 0;
    this.gravity = 1;
    this.score = 0;
    this.gates = 0;
    this.featherChain = 0;
    this.chapter = 0;
    this.distance = 0;
    this.chapterDistance = 0;
    this.simTime = 0;
    this.deathTimer = 0;
    this.lastFlipAt = -Infinity;
    this.recovering = false;
    this.stomps = 0;
    this.seed = nextSeed;
    this.rngState = nextSeed;
    this.events = [];
    this.chunks = [];
    this.lastChunkId = "";
    this.pendingTransition = undefined;
    this.parallaxTransitionId = "";
    this.outgoingChapterDistance = 0;
    this.defeatedHazards = new WeakMap<ActiveChunk, Set<number>>();
    this.wingedShellStates = new WeakMap<ActiveChunk, Map<number, WingedShellRuntimeState>>();
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
    this.recovering = false;
    const previousX = this.playerX;
    const previousY = this.playerY;
    const previousDistance = this.distance;
    const speed = CHAPTERS[this.chapter]?.speed ?? CHAPTERS[0].speed;
    this.distance += speed * dt;
    this.chapterDistance += speed * dt;
    this.syncParallaxTransition();
    this.velocityY = clamp(
      this.velocityY + this.gravity * GRAVITY_ACCELERATION * dt,
      -MAX_VERTICAL_SPEED,
      MAX_VERTICAL_SPEED,
    );
    this.playerY += this.velocityY * dt;
    this.updateWingedShellStates(dt);

    const tunnelPushed = this.resolveTunnel(previousX, previousY, previousDistance);
    if (this.mode !== "playing") return;
    const solidPushed = this.resolveSolids(previousY);
    if (this.mode !== "playing") return;
    if (!tunnelPushed && !solidPushed) this.recoverPlayerX(dt);
    this.processHazards(previousY);
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
        const y = solid.y + tunnelOffsetAt(active.definition, solid.x + solid.w / 2);
        if (x < this.viewportWidth + 20 && x + solid.w > -20) {
          rects.push({
            ...solid,
            x,
            y,
            kind: "solid",
            detail: solid.detail,
            chapter: active.definition.chapter,
            decoration: active.definition.decoration,
          });
        }
      }
      for (const [hazardIndex, hazard] of active.definition.hazards.entries()) {
        if (this.hazardIsDefeated(active, hazardIndex)) continue;
        const state = this.wingedShellState(active, hazardIndex);
        const motion = state ? { x: state.localX - hazard.x, y: 0 } : this.motionOffset(hazard);
        const motionDirectionX = state?.phase === "walking" ? (state.velocityX >= 0 ? 1 : -1) : this.motionDirectionX(hazard);
        const x = origin + hazard.x + motion.x;
        const tunnelOffset = tunnelOffsetAt(active.definition, hazard.x + motion.x + hazard.w / 2);
        if (x < this.viewportWidth + 20 && x + hazard.w > -20) {
          rects.push({
            ...hazard,
            x,
            y: state?.y ?? hazard.y + tunnelOffset + motion.y,
            kind: hazard.kind,
            chapter: active.definition.chapter,
            decoration: active.definition.decoration,
            active: hazard.cycle ? this.hazardIsActive(hazard) : undefined,
            cycleProgress: hazard.cycle ? this.hazardCycleProgress(hazard) : undefined,
            motionDirectionX,
            enemyState: hazard.kind === "wingedShell" ? state?.phase ?? "flying" : undefined,
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
        if (!feather.collected && x > -12 && x < this.viewportWidth + 12) {
          feathers.push({ x, y: feather.y + tunnelOffsetAt(active.definition, feather.x), collected: false });
        }
      }
    }
    return feathers;
  }

  visibleTunnelPoints(step = 4): VisibleTunnelPoint[] {
    const points: VisibleTunnelPoint[] = [];
    for (let x = -step; x <= this.viewportWidth + step; x += step) {
      const offset = this.terrainOffsetAtWorldX(this.distance + x);
      points.push({ x, ceiling: PLAY_TOP + offset, floor: PLAY_BOTTOM + offset });
    }
    return points;
  }

  terrainOffsetAtWorldX(worldX: number): number {
    const active = this.chunks.find((chunk) => worldX >= chunk.startX && worldX <= chunk.startX + chunk.definition.width);
    return active ? tunnelOffsetAt(active.definition, worldX - active.startX) : 0;
  }

  isGrounded(): boolean {
    if (Math.abs(this.velocityY) > 0.01) return false;
    const solidHalfWidth = PLAYER_WIDTH / 2 - HITBOX_INSET;
    const solidHalfHeight = PLAYER_HEIGHT / 2 - HITBOX_INSET;
    const tunnel = this.tunnelBoundsAtWorldX(this.distance + this.playerX);
    if (this.gravity === 1 && Math.abs(this.playerY - (tunnel.floor - PLAYER_HEIGHT / 2)) < 0.85) return true;
    if (this.gravity === -1 && Math.abs(this.playerY - (tunnel.ceiling + PLAYER_HEIGHT / 2)) < 0.85) return true;
    for (const active of this.chunks) {
      const origin = active.startX - this.distance;
      for (const solid of active.definition.solids) {
        const left = origin + solid.x;
        if (this.playerX + solidHalfWidth <= left || this.playerX - solidHalfWidth >= left + solid.w) continue;
        const solidY = solid.y + tunnelOffsetAt(active.definition, solid.x + solid.w / 2);
        const surfaceY = this.gravity === 1 ? solidY - solidHalfHeight : solidY + solid.h + solidHalfHeight;
        if (Math.abs(this.playerY - surfaceY) < 0.1) return true;
      }
    }
    return false;
  }

  animationState(): "idle" | "run" | "flutter" | "stunned" | "gone" {
    if (this.mode === "dead") return this.deathTimer < 0.24 ? "stunned" : "gone";
    if (this.mode !== "playing") return "idle";
    return this.isGrounded() ? "run" : "flutter";
  }

  chapterTransition(): ChapterTransitionState | undefined {
    const active = this.chunks.find((chunk) => chunk.definition.transition);
    const transition = active?.definition.transition;
    if (!active || !transition) return undefined;
    const localX = this.distance + this.playerX - active.startX;
    const transitionStarted = active.definition.id === this.parallaxTransitionId;
    return {
      id: active.definition.id,
      from: transition.from,
      to: transition.to,
      fromDistance: transitionStarted ? this.outgoingChapterDistance : this.chapterDistance,
      toDistance: transitionStarted ? this.chapterDistance : 0,
      progress: clamp(localX / active.definition.width, 0, 1),
      active: localX >= 0 && localX <= active.definition.width,
    };
  }

  private syncParallaxTransition(): void {
    const active = this.chunks.find((chunk) => chunk.definition.transition);
    if (!active || active.definition.id === this.parallaxTransitionId) return;
    const localX = this.distance + this.playerX - active.startX;
    if (localX < 0) return;
    this.outgoingChapterDistance = Math.max(0, this.chapterDistance - localX);
    this.chapterDistance = Math.max(0, localX);
    this.parallaxTransitionId = active.definition.id;
  }

  textSnapshot(): string {
    const visibleRects = this.visibleRects();
    const visibleHazards = visibleRects.filter((rect) => rect.kind !== "solid").slice(0, 8);
    const visibleSolids = visibleRects.filter((rect) => rect.kind === "solid").slice(0, 8);
    return JSON.stringify({
      coordinateSystem: `origin top-left; x increases right; y increases down; logical viewport ${this.viewportWidth}x180`,
      viewport: { width: this.viewportWidth, height: 180 },
      mode: this.mode,
      player: {
        x: Number(this.playerX.toFixed(2)),
        y: Number(this.playerY.toFixed(2)),
        vy: Number(this.velocityY.toFixed(2)),
        gravity: this.gravity,
        pushback: Number((PLAYER_X - this.playerX).toFixed(2)),
        recovering: this.recovering,
      },
      animation: this.animationState(),
      score: this.score,
      gates: this.gates,
      bestScore: this.bestScore,
      featherChain: this.featherChain,
      stomps: this.stomps,
      chapter: CHAPTERS[this.chapter]?.name,
      chapterDistance: Number(this.chapterDistance.toFixed(2)),
      speed: CHAPTERS[this.chapter]?.speed,
      tunnel: this.tunnelBoundsAtWorldX(this.distance + this.playerX),
      transition: this.chapterTransition(),
      restartReady: this.mode === "dead" && this.deathTimer >= RESTART_DELAY_SECONDS,
      hazards: visibleHazards.map(({ x, y, w, h, kind, active, cycleProgress, motionDirectionX, enemyState }) => ({
        x: Math.round(x),
        y: Math.round(y),
        w,
        h,
        kind,
        ...(active === undefined ? {} : { active }),
        ...(cycleProgress === undefined ? {} : { cycleProgress: Number(cycleProgress.toFixed(2)) }),
        ...(motionDirectionX === undefined ? {} : { motionDirectionX }),
        ...(enemyState === undefined ? {} : { enemyState }),
      })),
      solids: visibleSolids.map(({ x, y, w, h, detail }) => ({ x: Math.round(x), y: Math.round(y), w, h, detail })),
      feathers: this.visibleFeathers().filter((item) => !item.collected).slice(0, 6).map((item) => ({ x: Math.round(item.x), y: item.y })),
    });
  }

  private resolveTunnel(previousX: number, previousY: number, previousDistance: number): boolean {
    const halfHeight = PLAYER_HEIGHT / 2;
    const previousBounds = this.tunnelBoundsAtWorldX(previousDistance + previousX);
    const bounds = this.tunnelBoundsAtWorldX(this.distance + this.playerX);
    const previousTop = previousY - halfHeight;
    const previousBottom = previousY + halfHeight;
    const currentTop = this.playerY - halfHeight;
    const currentBottom = this.playerY + halfHeight;
    let pushed = false;

    if (currentBottom >= bounds.floor) {
      const birdFall = Math.max(0, currentBottom - previousBottom);
      const floorRise = Math.max(0, previousBounds.floor - bounds.floor);
      if (this.velocityY > 0 && birdFall + 0.01 >= floorRise) {
        const landed = this.velocityY > 35;
        this.playerY = bounds.floor - halfHeight;
        this.velocityY = 0;
        if (landed) this.events.push({ type: "land" });
      } else {
        pushed = true;
      }
    }

    if (!pushed && currentTop <= bounds.ceiling) {
      const birdRise = Math.max(0, previousTop - currentTop);
      const ceilingDrop = Math.max(0, bounds.ceiling - previousBounds.ceiling);
      if (this.velocityY < 0 && birdRise + 0.01 >= ceilingDrop) {
        const landed = this.velocityY < -35;
        this.playerY = bounds.ceiling + halfHeight;
        this.velocityY = 0;
        if (landed) this.events.push({ type: "land" });
      } else {
        pushed = true;
      }
    }

    if (pushed) {
      this.pushBackToClearance(previousY);
      return true;
    }
    return false;
  }

  private pushBackToClearance(previousY: number): void {
    const halfHeight = PLAYER_HEIGHT / 2;
    for (let candidate = this.playerX - 0.5; candidate >= PLAYER_MIN_X; candidate -= 0.5) {
      const bounds = this.tunnelBoundsAtWorldX(this.distance + candidate);
      const clear = this.playerY - halfHeight >= bounds.ceiling - 0.75 && this.playerY + halfHeight <= bounds.floor + 0.75;
      if (!clear) continue;
      this.playerX = candidate;
      if (this.playerY + halfHeight > bounds.floor) {
        this.playerY = Math.min(this.playerY, previousY);
        if (this.velocityY > 0) this.velocityY = 0;
      } else if (this.playerY - halfHeight < bounds.ceiling) {
        this.playerY = Math.max(this.playerY, previousY);
        if (this.velocityY < 0) this.velocityY = 0;
      }
      if (this.playerX <= PLAYER_MIN_X + 0.5) this.die();
      return;
    }
    this.playerX = PLAYER_MIN_X;
    this.die();
  }

  private tunnelBoundsAtWorldX(worldX: number): { ceiling: number; floor: number; offset: number } {
    const offset = this.terrainOffsetAtWorldX(worldX);
    return { ceiling: PLAY_TOP + offset, floor: PLAY_BOTTOM + offset, offset: Number(offset.toFixed(2)) };
  }

  private resolveSolids(previousY: number): boolean {
    const halfWidth = PLAYER_WIDTH / 2 - HITBOX_INSET;
    const halfHeight = PLAYER_HEIGHT / 2 - HITBOX_INSET;
    let pushed = false;
    for (const active of this.chunks) {
      const origin = active.startX - this.distance;
      for (const solid of active.definition.solids) {
        const left = origin + solid.x;
        if (this.playerX + halfWidth <= left || this.playerX - halfWidth >= left + solid.w) continue;
        const solidY = solid.y + tunnelOffsetAt(active.definition, solid.x + solid.w / 2);
        if (this.velocityY >= 0) {
          const previousBottom = previousY + halfHeight;
          const currentBottom = this.playerY + halfHeight;
          if (previousBottom <= solidY && currentBottom >= solidY) {
            this.playerY = solidY - halfHeight;
            const landed = this.velocityY > 35;
            this.velocityY = 0;
            if (landed) this.events.push({ type: "land" });
          }
        } else {
          const underside = solidY + solid.h;
          const previousTop = previousY - halfHeight;
          const currentTop = this.playerY - halfHeight;
          if (previousTop >= underside && currentTop <= underside) {
            this.playerY = underside + halfHeight;
            const landed = this.velocityY < -35;
            this.velocityY = 0;
            if (landed) this.events.push({ type: "land" });
          }
        }

        const overlapsHorizontally = this.playerX + halfWidth > left && this.playerX - halfWidth < left + solid.w;
        const overlapsVertically = this.playerY + halfHeight > solidY && this.playerY - halfHeight < solidY + solid.h;
        if (!overlapsHorizontally || !overlapsVertically) continue;
        this.playerX = Math.min(this.playerX, left - halfWidth);
        pushed = true;
        if (this.playerX <= PLAYER_MIN_X + 0.5) {
          this.playerX = Math.max(PLAYER_MIN_X, this.playerX);
          this.die();
          return true;
        }
      }
    }
    return pushed;
  }

  private recoverPlayerX(dt: number): void {
    if (this.playerX >= PLAYER_X) return;
    const candidate = Math.min(PLAYER_X, this.playerX + PLAYER_RECOVERY_SPEED * dt);
    if (!this.canOccupyHorizontalPosition(candidate)) return;
    this.playerX = candidate;
    this.recovering = true;
  }

  private canOccupyHorizontalPosition(candidateX: number): boolean {
    const tunnelHalfHeight = PLAYER_HEIGHT / 2;
    const bounds = this.tunnelBoundsAtWorldX(this.distance + candidateX);
    if (this.playerY - tunnelHalfHeight < bounds.ceiling - 0.75) return false;
    if (this.playerY + tunnelHalfHeight > bounds.floor + 0.75) return false;

    const halfWidth = PLAYER_WIDTH / 2 - HITBOX_INSET;
    const halfHeight = PLAYER_HEIGHT / 2 - HITBOX_INSET;
    for (const active of this.chunks) {
      const origin = active.startX - this.distance;
      for (const solid of active.definition.solids) {
        const left = origin + solid.x;
        const solidY = solid.y + tunnelOffsetAt(active.definition, solid.x + solid.w / 2);
        const overlapsHorizontally = candidateX + halfWidth > left && candidateX - halfWidth < left + solid.w;
        const overlapsVertically = this.playerY + halfHeight > solidY && this.playerY - halfHeight < solidY + solid.h;
        if (overlapsHorizontally && overlapsVertically) return false;
      }
    }
    return true;
  }

  private processHazards(previousY: number): void {
    const playerHalfHeight = PLAYER_HEIGHT / 2 - HITBOX_INSET;
    const playerRect = {
      x: this.playerX - PLAYER_WIDTH / 2 + HITBOX_INSET,
      y: this.playerY - playerHalfHeight,
      w: PLAYER_WIDTH - HITBOX_INSET * 2,
      h: playerHalfHeight * 2,
    };
    for (const active of this.chunks) {
      const origin = active.startX - this.distance;
      for (const [hazardIndex, hazard] of active.definition.hazards.entries()) {
        if (this.hazardIsDefeated(active, hazardIndex)) continue;
        const state = this.wingedShellState(active, hazardIndex);
        const motion = state ? { x: state.localX - hazard.x, y: 0 } : this.motionOffset(hazard);
        const tunnelOffset = tunnelOffsetAt(active.definition, hazard.x + motion.x + hazard.w / 2);
        if (!this.hazardIsActive(hazard)) continue;
        const terrainSpike = hazard.kind === "thorns" || hazard.kind === "barbs";
        const sandJet = hazard.kind === "sandJet";
        const surfaceFlame = hazard.kind === "flame" && hazard.attachment !== "floating";
        const collisionHeight = terrainSpike
          ? hazard.h * TERRAIN_SPIKE_COLLISION_RATIO
          : sandJet || surfaceFlame
            ? Math.max(1, hazard.h - (sandJet ? SANDJET_NOZZLE_DEPTH : FLAME_VENT_DEPTH))
            : hazard.h;
        const ceilingSpike = hazard.attachment === "ceiling" || hazard.flipY === true;
        const collisionInsetY = terrainSpike && !ceilingSpike
          ? hazard.h - collisionHeight
          : (sandJet || surfaceFlame) && ceilingSpike
            ? sandJet ? SANDJET_NOZZLE_DEPTH : FLAME_VENT_DEPTH
            : 0;
        const rect = {
          x: origin + hazard.x + motion.x,
          y: (state?.y ?? hazard.y + tunnelOffset + motion.y) + collisionInsetY,
          w: hazard.w,
          h: collisionHeight,
        };
        if (overlaps(playerRect, rect)) {
          const previousBottom = previousY + playerHalfHeight;
          const currentBottom = this.playerY + playerHalfHeight;
          const stompedEnemy = (hazard.kind === "walker" || hazard.kind === "wingedShell")
            && this.velocityY > 0
            && previousBottom <= rect.y + 0.75
            && currentBottom >= rect.y;
          if (stompedEnemy) {
            const dewinged = hazard.kind === "wingedShell" && !state;
            const shelled = hazard.kind === "wingedShell" && state?.phase === "walking";
            if (dewinged) {
              this.setWingedShellState(active, hazardIndex, {
                phase: "falling",
                localX: hazard.x + motion.x,
                y: rect.y,
                velocityY: 34,
                velocityX: -22,
              });
            } else if (shelled && state) {
              state.phase = "shell";
              state.velocityX = 0;
              state.velocityY = 0;
            } else if (hazard.kind === "wingedShell" && state?.phase === "shell") {
              // A stationary shell stays in the world; top contact simply gives
              // the bird another safe bounce while side contact remains lethal.
            } else {
              this.defeatHazard(active, hazardIndex);
            }
            this.playerY = rect.y - playerHalfHeight;
            this.velocityY = -WALKER_STOMP_BOUNCE_SPEED;
            this.stomps += 1;
            this.events.push({
              type: "stomp",
              x: rect.x + rect.w / 2,
              y: rect.y + rect.h / 2,
              direction: state?.velocityX && state.velocityX > 0 ? 1 : this.motionDirectionX(hazard) ?? -1,
              enemy: hazard.kind as "walker" | "wingedShell",
              outcome: dewinged ? "dewinged" : shelled ? "shelled" : hazard.kind === "wingedShell" ? "bounced" : "defeated",
            });
            return;
          }
          this.die();
          return;
        }
      }
    }
  }

  private hazardIsDefeated(active: ActiveChunk, hazardIndex: number): boolean {
    return this.defeatedHazards.get(active)?.has(hazardIndex) ?? false;
  }

  private defeatHazard(active: ActiveChunk, hazardIndex: number): void {
    const defeated = this.defeatedHazards.get(active) ?? new Set<number>();
    defeated.add(hazardIndex);
    this.defeatedHazards.set(active, defeated);
  }

  private wingedShellState(active: ActiveChunk, hazardIndex: number): WingedShellRuntimeState | undefined {
    return this.wingedShellStates.get(active)?.get(hazardIndex);
  }

  private setWingedShellState(active: ActiveChunk, hazardIndex: number, state: WingedShellRuntimeState): void {
    const states = this.wingedShellStates.get(active) ?? new Map<number, WingedShellRuntimeState>();
    states.set(hazardIndex, state);
    this.wingedShellStates.set(active, states);
  }

  private updateWingedShellStates(dt: number): void {
    for (const active of this.chunks) {
      const states = this.wingedShellStates.get(active);
      if (!states) continue;
      for (const [hazardIndex, state] of states) {
        const hazard = active.definition.hazards[hazardIndex];
        if (!hazard || this.hazardIsDefeated(active, hazardIndex)) continue;
        if (state.phase === "falling") {
          state.velocityY = Math.min(155, state.velocityY + 360 * dt);
          state.y += state.velocityY * dt;
          const floor = PLAY_BOTTOM + tunnelOffsetAt(active.definition, state.localX + hazard.w / 2);
          if (state.y + hazard.h >= floor) {
            state.phase = "walking";
            state.y = floor - hazard.h;
            state.velocityY = 0;
          }
          continue;
        }
        if (state.phase === "shell") continue;
        state.localX += state.velocityX * dt;
        const patrolMin = Math.max(4, hazard.x - 22);
        const patrolMax = Math.min(active.definition.width - hazard.w - 4, hazard.x + 22);
        if (state.localX <= patrolMin) {
          state.localX = patrolMin;
          state.velocityX = Math.abs(state.velocityX);
        } else if (state.localX >= patrolMax) {
          state.localX = patrolMax;
          state.velocityX = -Math.abs(state.velocityX);
        }
        state.y = PLAY_BOTTOM + tunnelOffsetAt(active.definition, state.localX + hazard.w / 2) - hazard.h;
      }
    }
  }

  private processFeathers(): void {
    const playerRect = {
      x: this.playerX - PLAYER_WIDTH / 2,
      y: this.playerY - PLAYER_HEIGHT / 2,
      w: PLAYER_WIDTH,
      h: PLAYER_HEIGHT,
    };
    for (const active of this.chunks) {
      const origin = active.startX - this.distance;
      for (const feather of active.feathers) {
        if (feather.collected || feather.missed) continue;
        const featherY = feather.y + tunnelOffsetAt(active.definition, feather.x);
        const featherRect = { x: origin + feather.x - 4, y: featherY - 5, w: 8, h: 10 };
        if (overlaps(playerRect, featherRect)) {
          feather.collected = true;
          this.featherChain += 1;
          this.events.push({ type: "feather", chain: this.featherChain });
          if (this.featherChain >= 3) {
            this.featherChain = 0;
            this.score += 1;
            this.events.push({ type: "bonus" });
          }
        } else if (origin + feather.x < this.playerX - PLAYER_WIDTH) {
          feather.missed = true;
          this.featherChain = 0;
        }
      }
    }
  }

  private processGates(): void {
    for (const active of this.chunks) {
      const gateX = active.startX + active.definition.width - 12 - this.distance;
      if (!active.gatePassed && gateX <= this.playerX) {
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
      : this.distance + this.viewportWidth;
    while (rightEdge - this.distance < this.viewportWidth + 360) {
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
    this.chunks = this.chunks.filter((active) => active.startX - this.distance <= this.viewportWidth + 32);
    this.lastChunkId = this.chunks.at(-1)?.definition.id ?? "";
  }

  private populateInitialChunks(startingChunkId?: string): void {
    const requestedChunk = startingChunkId
      ? chunksForChapter(this.chapter).find((candidate) => candidate.id === startingChunkId)
      : undefined;
    let startX = requestedChunk ? 130 : 240;
    for (let i = 0; i < 5; i += 1) {
      const previous = this.chunks.at(-1)?.definition;
      const definition = i === 0 && requestedChunk
        ? requestedChunk
        : this.chooseChunk(this.chapter, previous?.exit);
      if (i === 0 && requestedChunk) this.lastChunkId = requestedChunk.id;
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

  private motionOffset(hazard: HazardSpec): { x: number; y: number } {
    if (!hazard.motion) return { x: 0, y: 0 };
    const phase = hazard.motion.phase ?? 0;
    const offset = Math.sin((this.simTime * hazard.motion.frequency + phase) * Math.PI * 2) * hazard.motion.amplitude;
    return hazard.motion.axis === "x" ? { x: offset, y: 0 } : { x: 0, y: offset };
  }

  private motionDirectionX(hazard: HazardSpec): -1 | 1 | undefined {
    if (!hazard.motion || hazard.motion.axis !== "x") return undefined;
    const phase = hazard.motion.phase ?? 0;
    const velocity = Math.cos((this.simTime * hazard.motion.frequency + phase) * Math.PI * 2);
    return velocity >= 0 ? 1 : -1;
  }

  private hazardCycleProgress(hazard: HazardSpec): number {
    if (!hazard.cycle) return 0;
    const phase = hazard.cycle.phase ?? 0;
    return ((this.simTime / hazard.cycle.period + phase) % 1 + 1) % 1;
  }

  private hazardIsActive(hazard: HazardSpec): boolean {
    return !hazard.cycle || this.hazardCycleProgress(hazard) < hazard.cycle.activeRatio;
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
    this.recovering = false;
    this.deathTimer = 0;
    this.bestScore = Math.max(this.bestScore, this.score);
    this.events.push({ type: "death", score: this.score });
  }
}
