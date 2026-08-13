import { describe, expect, it } from "vitest";
import { CHAPTERS, FIXED_STEP_SECONDS, FLIP_DEBOUNCE_SECONDS, PLAY_TOP, PLAYER_HEIGHT, PLAYER_X } from "../src/game/constants";
import { CHUNKS, TRANSITION_CHUNKS, envelopesCompatible, validateChunkLibrary } from "../src/game/chunks";
import { GameModel } from "../src/game/model";
import { canTraverseChunk } from "../src/game/solver";
import type { ActiveChunk, ChunkDefinition } from "../src/game/types";

const safeChunk = (feathers: Array<{ x: number; y: number }> = []): ChunkDefinition => ({
  id: "test-safe",
  chapter: 0,
  width: 200,
  entry: { surface: "any", maxAbsVelocity: 155 },
  exit: { surface: "any", maxAbsVelocity: 155 },
  solids: [],
  hazards: [],
  feathers,
  decoration: "nest",
});

const activate = (definition: ChunkDefinition, startX = 0): ActiveChunk => ({
  definition,
  startX,
  gatePassed: false,
  feathers: definition.feathers.map((feather) => ({ ...feather, collected: false, missed: false })),
});

describe("Impossible Aviary model", () => {
  it("preserves velocity when gravity flips", () => {
    const model = new GameModel(123);
    model.action();
    model.advance(300);
    const before = model.velocityY;
    expect(before).toBeLessThan(0);
    model.action();
    expect(model.gravity).toBe(1);
    expect(model.velocityY).toBe(before);
  });

  it("debounces duplicate flips but permits later airborne reversals", () => {
    const model = new GameModel(123);
    expect(model.action()).toBe(true);
    expect(model.action()).toBe(false);
    model.advance(FLIP_DEBOUNCE_SECONDS * 1000 + 20);
    expect(model.action()).toBe(true);
  });

  it("is deterministic across equivalent fixed-step advances", () => {
    const a = new GameModel(444);
    const b = new GameModel(444);
    a.action();
    b.action();
    a.advance(1000);
    for (let i = 0; i < 60; i += 1) b.step(FIXED_STEP_SECONDS);
    expect(a.playerY).toBeCloseTo(b.playerY, 8);
    expect(a.velocityY).toBeCloseTo(b.velocityY, 8);
    expect(a.distance).toBeCloseTo(b.distance, 8);
  });

  it("lands safely on the ceiling", () => {
    const model = new GameModel(777);
    model.action();
    model.advance(1500);
    expect(model.playerY).toBeCloseTo(PLAY_TOP + PLAYER_HEIGHT / 2, 5);
    expect(model.velocityY).toBe(0);
    expect(model.isGrounded()).toBe(true);
    expect(model.animationState()).toBe("run");
    expect(model.mode).toBe("playing");
  });

  it("exposes the stunned pose before the death burst clears the bird", () => {
    const model = new GameModel(778);
    model.mode = "dead";
    expect(model.animationState()).toBe("stunned");
    model.advance(260);
    expect(model.animationState()).toBe("gone");
  });

  it("contains exactly six validated chunks per chapter", () => {
    expect(CHUNKS).toHaveLength(24);
    expect(validateChunkLibrary()).toEqual([]);
    for (let chapter = 0; chapter < 4; chapter += 1) {
      expect(CHUNKS.filter((chunk) => chunk.chapter === chapter)).toHaveLength(6);
    }
  });

  it("inserts a safe non-scoring passage when a chapter threshold is crossed", () => {
    const model = new GameModel(91);
    model.mode = "playing";
    model.gates = 9;
    model.score = 9;
    model.distance = 98;
    model.chunks = [activate(safeChunk())];

    model.step();

    expect(model.chapter).toBe(1);
    expect(model.gates).toBe(10);
    const passage = model.chunks.find((active) => active.definition.transition);
    expect(passage?.definition.id).toBe(TRANSITION_CHUNKS[0]?.id);
    expect(model.chapterTransition()?.progress).toBe(0);

    if (!passage) throw new Error("Expected a transition passage");
    model.distance = passage.startX - PLAYER_X + passage.definition.width / 2;
    expect(model.chapterTransition()).toMatchObject({ from: 0, to: 1, active: true });
    expect(model.chapterTransition()?.progress).toBeCloseTo(0.5, 5);

    model.distance = passage.startX - PLAYER_X + passage.definition.width + 1;
    model.step();
    expect(model.gates).toBe(10);
    expect(model.score).toBe(10);
  });

  it("declares at least one compatible successor for every chunk", () => {
    for (const chunk of CHUNKS) {
      const peers = CHUNKS.filter((candidate) => candidate.chapter === chunk.chapter && candidate.id !== chunk.id);
      expect(peers.some((candidate) => envelopesCompatible(chunk.exit, candidate.entry))).toBe(true);
    }
  });

  it("physically traverses every declared same-chapter transition across moving-hazard phases", () => {
    const cache = new Map<string, boolean>();
    for (const previous of CHUNKS) {
      const speed = CHAPTERS[previous.chapter]?.speed ?? 80;
      const successors = CHUNKS.filter(
        (candidate) => candidate.chapter === previous.chapter && candidate.id !== previous.id && envelopesCompatible(previous.exit, candidate.entry),
      );
      for (const next of successors) {
        const phases = next.hazards.some((hazard) => hazard.motion) ? [0, 0.25, 0.5, 0.75] : [0];
        for (const phase of phases) {
          const key = `${next.id}:${previous.exit.surface}:${previous.exit.maxAbsVelocity}:${speed}:${phase}`;
          const reachable = cache.get(key) ?? canTraverseChunk(next, previous.exit, speed, phase);
          cache.set(key, reachable);
          expect(reachable, `${previous.id} -> ${next.id} at phase ${phase}`).toBe(true);
        }
      }
    }
  }, 15_000);

  it("awards gate points and a bonus for each three-feather chain", () => {
    const model = new GameModel(5);
    model.mode = "playing";
    const feathered = safeChunk([
      { x: PLAYER_X + 1, y: model.playerY },
      { x: PLAYER_X + 1, y: model.playerY },
      { x: PLAYER_X + 1, y: model.playerY },
    ]);
    model.chunks = [activate(feathered)];
    model.step();
    expect(model.score).toBe(1);
    expect(model.featherChain).toBe(0);

    model.chunks = [activate(safeChunk())];
    model.distance = 98;
    model.step();
    expect(model.gates).toBe(1);
    expect(model.score).toBe(2);
  });

  it("keeps missed feathers visible until they scroll offscreen", () => {
    const model = new GameModel(17);
    model.mode = "playing";
    model.featherChain = 1;
    const missedFeather = safeChunk([{ x: PLAYER_X - PLAYER_HEIGHT - 3, y: 40 }]);
    model.chunks = [activate(missedFeather)];

    model.step();

    expect(model.chunks[0]?.feathers[0]?.missed).toBe(true);
    expect(model.featherChain).toBe(0);
    const stillVisible = model.visibleFeathers().find((feather) => feather.y === 40);
    expect(stillVisible?.x).toBeLessThan(PLAYER_X);

    model.distance = 100;
    expect(model.visibleFeathers().some((feather) => feather.y === 40)).toBe(false);
  });

  it("restarts only after the death delay", () => {
    const model = new GameModel(2);
    model.mode = "dead";
    expect(model.action()).toBe(false);
    model.advance(400);
    expect(model.action()).toBe(true);
    expect(model.mode).toBe("playing");
    expect(model.gravity).toBe(-1);
  });
});
