import {
  FIXED_STEP_SECONDS,
  GRAVITY_ACCELERATION,
  HITBOX_INSET,
  MAX_VERTICAL_SPEED,
  PLAY_BOTTOM,
  PLAY_TOP,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
} from "./constants";
import type { ChunkDefinition, Envelope, HazardSpec, SolidSpec } from "./types";

interface SolverState {
  y: number;
  vy: number;
  gravity: -1 | 1;
  cooldown: number;
}

const halfW = PLAYER_WIDTH / 2 - HITBOX_INSET;
const halfH = PLAYER_HEIGHT / 2 - HITBOX_INSET;
const debounceFrames = 5;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function startingStates(envelope: Envelope): SolverState[] {
  const top = PLAY_TOP + PLAYER_HEIGHT / 2;
  const bottom = PLAY_BOTTOM - PLAYER_HEIGHT / 2;
  const topStates: SolverState[] = [
    { y: top, vy: 0, gravity: -1, cooldown: 0 },
    { y: top + 18, vy: -80, gravity: -1, cooldown: 0 },
    { y: top + 28, vy: 80, gravity: 1, cooldown: 0 },
  ];
  const bottomStates: SolverState[] = [
    { y: bottom, vy: 0, gravity: 1, cooldown: 0 },
    { y: bottom - 18, vy: 80, gravity: 1, cooldown: 0 },
    { y: bottom - 28, vy: -80, gravity: -1, cooldown: 0 },
  ];
  if (envelope.surface === "top") return topStates;
  if (envelope.surface === "bottom") return bottomStates;
  return [
    ...topStates,
    ...bottomStates,
    { y: 90, vy: -Math.min(100, envelope.maxAbsVelocity), gravity: -1, cooldown: 0 },
    { y: 90, vy: Math.min(100, envelope.maxAbsVelocity), gravity: 1, cooldown: 0 },
  ];
}

function movingY(hazard: HazardSpec, time: number, phaseOffset: number): number {
  if (!hazard.motion) return hazard.y;
  const phase = (hazard.motion.phase ?? 0) + phaseOffset;
  return hazard.y + Math.sin((time * hazard.motion.frequency + phase) * Math.PI * 2) * hazard.motion.amplitude;
}

function collidesHazard(state: SolverState, progress: number, hazard: HazardSpec, time: number, phaseOffset: number): boolean {
  const horizontal = progress + halfW > hazard.x && progress - halfW < hazard.x + hazard.w;
  if (!horizontal) return false;
  const y = movingY(hazard, time, phaseOffset);
  return state.y + halfH > y && state.y - halfH < y + hazard.h;
}

function resolveSolid(state: SolverState, previousY: number, progress: number, solid: SolidSpec): void {
  if (progress + halfW <= solid.x || progress - halfW >= solid.x + solid.w) return;
  if (state.gravity === 1) {
    if (previousY + halfH <= solid.y && state.y + halfH >= solid.y && state.vy >= 0) {
      state.y = solid.y - halfH;
      state.vy = 0;
    }
  } else {
    const underside = solid.y + solid.h;
    if (previousY - halfH >= underside && state.y - halfH <= underside && state.vy <= 0) {
      state.y = underside + halfH;
      state.vy = 0;
    }
  }
}

function integrate(source: SolverState, flipped: boolean): SolverState {
  const state = { ...source };
  if (flipped) {
    state.gravity = state.gravity === 1 ? -1 : 1;
    state.cooldown = debounceFrames;
  } else {
    state.cooldown = Math.max(0, state.cooldown - 1);
  }
  state.vy = clamp(state.vy + state.gravity * GRAVITY_ACCELERATION * FIXED_STEP_SECONDS, -MAX_VERTICAL_SPEED, MAX_VERTICAL_SPEED);
  state.y += state.vy * FIXED_STEP_SECONDS;
  if (state.y + PLAYER_HEIGHT / 2 >= PLAY_BOTTOM) {
    state.y = PLAY_BOTTOM - PLAYER_HEIGHT / 2;
    if (state.vy > 0) state.vy = 0;
  }
  if (state.y - PLAYER_HEIGHT / 2 <= PLAY_TOP) {
    state.y = PLAY_TOP + PLAYER_HEIGHT / 2;
    if (state.vy < 0) state.vy = 0;
  }
  return state;
}

function stateKey(state: SolverState): string {
  return `${Math.round(state.y / 6)}:${Math.round(state.vy / 25)}:${state.gravity}:${state.cooldown === 0 ? 0 : 1}`;
}

export function canTraverseChunk(
  definition: ChunkDefinition,
  incoming: Envelope,
  speed: number,
  phaseOffset = 0,
): boolean {
  let states = startingStates(incoming);
  const frameCount = Math.ceil(definition.width / (speed * FIXED_STEP_SECONDS));
  for (let frame = 0; frame <= frameCount; frame += 1) {
    const progress = frame * speed * FIXED_STEP_SECONDS;
    const time = frame * FIXED_STEP_SECONDS;
    const next = new Map<string, SolverState>();
    for (const source of states) {
      // A 30 Hz decision grid is substantially finer than the 80 ms input debounce
      // while keeping exhaustive transition validation fast enough for every build.
      const choices = source.cooldown === 0 && frame % 2 === 0 ? [false, true] : [false];
      for (const flipped of choices) {
        const previousY = source.y;
        const state = integrate(source, flipped);
        for (const solid of definition.solids) resolveSolid(state, previousY, progress, solid);
        if (definition.hazards.some((hazard) => collidesHazard(state, progress, hazard, time, phaseOffset))) continue;
        next.set(stateKey(state), state);
      }
    }
    states = [...next.values()];
    if (states.length > 700) {
      const stride = Math.ceil(states.length / 700);
      states = states.filter((_state, index) => index % stride === 0);
    }
    if (states.length === 0) return false;
  }
  return true;
}
