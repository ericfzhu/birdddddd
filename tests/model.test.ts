import { describe, expect, it } from "vitest";
import { BIOMES, CHAPTERS, FIXED_STEP_SECONDS, FLIP_DEBOUNCE_SECONDS, PLAY_BOTTOM, PLAY_TOP, PLAYER_HEIGHT, PLAYER_MIN_X, PLAYER_X } from "../src/game/constants";
import { CHUNKS, TRANSITION_CHUNKS, envelopesCompatible, tunnelOffsetAt, validateChunkLibrary } from "../src/game/chunks";
import { GameModel } from "../src/game/model";
import { canTraverseChunk } from "../src/game/solver";
import { CAMERA_DEAD_ZONE_BOTTOM, CAMERA_DEAD_ZONE_TOP, cameraTargetY, trackCameraY } from "../src/game/camera";
import { spikeClusterLayout, spikeRotationForNormal, TERRAIN_SPIKE_POINT_WIDTH } from "../src/game/hazards";
import { PROP_ART, propGroundPlacement, propLayout } from "../src/game/props";
import { verdantParallaxState } from "../src/game/parallax";
import {
  authoredAssetForHazard,
  interactiveDangerTextureKey,
  INTERACTIVE_ART,
  TRANSITION_ART,
  transitionArtFor,
} from "../src/game/interactive-art";
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
  decoration: "forest",
});

const activate = (definition: ChunkDefinition, startX = 0): ActiveChunk => ({
  definition,
  startX,
  gatePassed: false,
  feathers: definition.feathers.map((feather) => ({ ...feather, collected: false, missed: false })),
});

describe("birdddddd model", () => {
  it("keeps the player inside a small vertical camera dead zone while preserving world position", () => {
    const upwardTarget = cameraTargetY(0, 40, "playing");
    const downwardTarget = cameraTargetY(0, 140, "playing");
    expect(40 + upwardTarget).toBe(CAMERA_DEAD_ZONE_TOP);
    expect(140 + downwardTarget).toBe(CAMERA_DEAD_ZONE_BOTTOM);
    expect(cameraTargetY(24, 66, "playing")).toBe(24);
    expect(cameraTargetY(24, 66, "ready")).toBe(0);
    expect(trackCameraY(0, upwardTarget, 1, false)).toBeCloseTo(upwardTarget, 3);
  });

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
    expect(CHUNKS).toHaveLength(CHAPTERS.length * 6);
    expect(validateChunkLibrary()).toEqual([]);
    for (let chapter = 0; chapter < CHAPTERS.length; chapter += 1) {
      expect(CHUNKS.filter((chunk) => chunk.chapter === chapter)).toHaveLength(6);
    }
  });

  it("keeps each chapter tied to a distinct biome art family", () => {
    expect(CHAPTERS.map((chapter) => chapter.name)).toEqual([
      "VERDANT WILDS",
      "UNDERGROUND JUNGLE",
      "SUNKEN DUNES",
      "MARBLE CAVE",
      "VIOLET CHASM",
      "UNDERGROUND CORRUPTION",
      "ABANDONED MINECART",
      "ASHEN DEPTHS",
      "UNDERWORLD",
    ]);
    expect(new Set(BIOMES.map((biome) => biome.sky)).size).toBe(CHAPTERS.length);
    const decorations = ["forest", "jungle", "desert", "marble", "blight", "corruption", "minecart", "depths", "underworld"] as const;
    for (let chapter = 0; chapter < decorations.length; chapter += 1) {
      expect(new Set(CHUNKS.filter((chunk) => chunk.chapter === chapter).map((chunk) => chunk.decoration))).toEqual(new Set([decorations[chapter]]));
    }
  });

  it("authors hazards across both surfaces plus static and moving open air", () => {
    const hazards = CHUNKS.flatMap((chunk) => chunk.hazards);
    expect(hazards.some((hazard) => hazard.kind === "barbs" && hazard.attachment === "ceiling")).toBe(true);
    expect(hazards.some((hazard) => hazard.kind === "barbs" && hazard.attachment === "floor")).toBe(true);
    expect(hazards.some((hazard) => hazard.kind === "spinner" && !hazard.motion)).toBe(true);
    expect(hazards.some((hazard) => hazard.kind === "spinner" && hazard.motion)).toBe(true);
    expect(CHUNKS.flatMap((chunk) => chunk.solids).filter((solid) => solid.detail === "cage").length).toBeGreaterThanOrEqual(8);
  });

  it("introduces a distinct hazard language as chapters progress", () => {
    const expectedKinds = new Map<number, string[]>([
      [1, ["vine"]],
      [2, ["sandJet"]],
      [3, ["crusher"]],
      [4, ["crystal"]],
      [5, ["spore"]],
      [6, ["cart"]],
      [7, ["ember"]],
      [8, ["flame"]],
    ]);
    for (const [chapter, kinds] of expectedKinds) {
      const authored = new Set(CHUNKS.filter((chunk) => chunk.chapter === chapter).flatMap((chunk) => chunk.hazards.map((hazard) => hazard.kind)));
      for (const kind of kinds) expect(authored.has(kind as never), `chapter ${chapter} should introduce ${kind}`).toBe(true);
    }
  });

  it("maps every remaining biome hazard to an explicit authored asset", () => {
    for (let chapter = 3; chapter < CHAPTERS.length; chapter += 1) {
      expect(INTERACTIVE_ART[chapter], `chapter ${chapter} needs an interactive art family`).toBeDefined();
      const kinds = new Set(CHUNKS.filter((chunk) => chunk.chapter === chapter).flatMap((chunk) => chunk.hazards.map((hazard) => hazard.kind)));
      for (const kind of kinds) {
        expect(authoredAssetForHazard(chapter, kind), `chapter ${chapter} is missing authored ${kind} art`).toBeDefined();
      }
      expect(INTERACTIVE_ART[chapter]?.assets).toEqual(expect.arrayContaining(["platform", "pillar", "thorn", "barb"]));
    }
  });

  it("provides a distinct generated danger silhouette key for every authored lethal asset", () => {
    const keys = new Set<string>();
    INTERACTIVE_ART.forEach((family, chapter) => {
      for (const asset of new Set(Object.values(family.hazards))) {
        if (!asset) continue;
        const key = interactiveDangerTextureKey(chapter, asset);
        expect(key).toBe(`authored-terrain-${chapter}-${asset}-danger`);
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }
    });
    expect(keys.size).toBeGreaterThan(20);
  });

  it("gives Minecart's narrow machinery stronger visual emphasis without changing collision data", () => {
    const minecartArt = INTERACTIVE_ART[6];
    expect(minecartArt?.emphasis).toMatchObject({
      spikeWidthBonus: 4,
      pillarWidthBonus: 8,
      shutterWidthBonus: 4,
      clusteredThorns: true,
    });
    const lift = CHUNKS.find((chunk) => chunk.id === "minecart-lift");
    expect(lift?.hazards.filter((hazard) => hazard.kind === "shutter").map(({ w, h }) => ({ w, h }))).toEqual([
      { w: 10, h: 56 },
      { w: 10, h: 56 },
    ]);
  });

  it("provides authored dressing for every remaining chapter passage", () => {
    const remaining = TRANSITION_CHUNKS.filter((chunk) => (chunk.transition?.from ?? -1) >= 2);
    expect(TRANSITION_ART).toHaveLength(remaining.length);
    for (const chunk of remaining) {
      const transition = chunk.transition;
      if (!transition) throw new Error("Expected a transition definition");
      expect(transitionArtFor(transition.from, transition.to), chunk.id).toBeDefined();
    }
  });

  it("keeps cyclic vents visible as warnings but lethal only during their active window", () => {
    const ventChunk: ChunkDefinition = {
      ...safeChunk(),
      id: "test-cycle-vent",
      hazards: [{
        x: PLAYER_X - 5,
        y: 80,
        w: 10,
        h: 24,
        kind: "flame",
        attachment: "floating",
        cycle: { period: 2, activeRatio: 0.5 },
      }],
    };
    const warning = new GameModel(89);
    warning.chunks = [activate(ventChunk)];
    warning.mode = "playing";
    warning.playerY = 90;
    warning.simTime = 1.5;
    expect(warning.visibleRects()[0]?.active).toBe(false);
    warning.step();
    expect(warning.mode).toBe("playing");

    const erupting = new GameModel(90);
    erupting.chunks = [activate(ventChunk)];
    erupting.mode = "playing";
    erupting.playerY = 90;
    expect(erupting.visibleRects()[0]?.active).toBe(true);
    erupting.step();
    expect(erupting.mode).toBe("dead");
  });

  it("moves minecarts horizontally without changing their authored track height", () => {
    const cartChunk: ChunkDefinition = {
      ...safeChunk(),
      id: "test-moving-cart",
      hazards: [{
        x: 120,
        y: 130,
        w: 30,
        h: 18,
        kind: "cart",
        attachment: "floor",
        motion: { amplitude: 24, frequency: 0.25, axis: "x" },
      }],
    };
    const model = new GameModel(92);
    model.chunks = [activate(cartChunk)];
    const start = model.visibleRects()[0];
    model.simTime = 1;
    const shifted = model.visibleRects()[0];
    expect(shifted?.x).toBeCloseTo((start?.x ?? 0) + 24, 5);
    expect(shifted?.y).toBe(start?.y);
  });

  it("authors rising and falling tunnel sections that return to compatible flat entrances", () => {
    const tunnelChunks = CHUNKS.filter((chunk) => chunk.tunnel);
    expect(tunnelChunks.length).toBeGreaterThanOrEqual(8);
    expect(tunnelChunks.some((chunk) => Math.min(...(chunk.tunnel?.map((point) => point.y) ?? [0])) < 0)).toBe(true);
    expect(tunnelChunks.some((chunk) => Math.max(...(chunk.tunnel?.map((point) => point.y) ?? [0])) > 0)).toBe(true);
    for (const chunk of tunnelChunks) {
      expect(tunnelOffsetAt(chunk, 0)).toBe(0);
      expect(tunnelOffsetAt(chunk, chunk.width)).toBe(0);
    }
  });

  it("makes slope pushback permanent and kills the bird when repeated displacement reaches the screen edge", () => {
    const risingTunnel: ChunkDefinition = {
      ...safeChunk(),
      id: "test-rising-tunnel",
      tunnel: [
        { x: 0, y: 0 },
        { x: 70, y: 0 },
        { x: 130, y: -44 },
        { x: 200, y: 0 },
      ],
    };
    const model = new GameModel(82);
    model.chunks = [activate(risingTunnel, 20)];
    model.mode = "playing";

    model.advance(180);
    expect(model.mode).toBe("playing");
    expect(model.playerX).toBeLessThan(PLAYER_X - 5);

    const fallingTunnel: ChunkDefinition = {
      ...risingTunnel,
      id: "test-falling-tunnel",
      tunnel: risingTunnel.tunnel?.map((point) => ({ ...point, y: -point.y })),
    };
    const ceilingModel = new GameModel(84);
    ceilingModel.chunks = [activate(fallingTunnel, 20)];
    ceilingModel.mode = "playing";
    ceilingModel.gravity = -1;
    ceilingModel.playerY = PLAY_TOP + PLAYER_HEIGHT / 2;
    ceilingModel.advance(180);
    expect(ceilingModel.mode).toBe("playing");
    expect(ceilingModel.playerX).toBeLessThan(PLAYER_X - 5);

    const shovedX = model.playerX;
    model.chunks = [activate(safeChunk())];
    model.distance = 0;
    model.playerY = 90;
    model.velocityY = 0;
    model.advance(180);
    expect(model.playerX).toBeCloseTo(shovedX, 5);

    const trapped = new GameModel(83);
    trapped.chunks = [activate(risingTunnel, 20)];
    trapped.mode = "playing";
    trapped.advance(1400);
    expect(trapped.mode, trapped.textSnapshot()).toBe("dead");
    expect(trapped.playerX).toBeLessThanOrEqual(PLAYER_MIN_X + 0.5);
  });

  it("pushes the bird permanently when a safe cage pillar catches it from the side", () => {
    const pillarChunk: ChunkDefinition = {
      ...safeChunk(),
      id: "test-safe-pillar",
      solids: [{ x: 72, y: PLAY_TOP, w: 6, h: 55, detail: "cage" }],
    };
    const model = new GameModel(85);
    model.chunks = [activate(pillarChunk, 20)];
    model.mode = "playing";
    model.playerY = 40;

    model.step();
    expect(model.mode).toBe("playing");
    expect(model.playerX).toBeLessThan(PLAYER_X);

    const shovedX = model.playerX;
    model.playerY = 90;
    model.velocityY = 0;
    model.advance(300);
    expect(model.mode).toBe("playing");
    expect(model.playerX).toBeCloseTo(shovedX, 5);
  });

  it("lets the bird pass horizontal platform edges without pushback while retaining landings", () => {
    const sideContactChunk: ChunkDefinition = {
      ...safeChunk(),
      id: "test-perch-side",
      solids: [{ x: 72, y: 58, w: 48, h: 6, detail: "perch" }],
    };
    const sideContact = new GameModel(86);
    sideContact.chunks = [activate(sideContactChunk, 20)];
    sideContact.mode = "playing";
    sideContact.playerY = 61;
    sideContact.velocityY = 0;

    sideContact.step();
    expect(sideContact.mode).toBe("playing");
    expect(sideContact.playerX).toBe(PLAYER_X);

    const landingChunk: ChunkDefinition = {
      ...safeChunk(),
      id: "test-perch-landing",
      solids: [{ x: 45, y: 100, w: 80, h: 6, detail: "perch" }],
    };
    const landing = new GameModel(87);
    landing.chunks = [activate(landingChunk, 20)];
    landing.mode = "playing";
    landing.playerY = 88;
    landing.velocityY = 70;

    landing.advance(220);
    expect(landing.mode).toBe("playing");
    expect(landing.velocityY).toBe(0);
    expect(landing.isGrounded()).toBe(true);
  });

  it("treats a floating spinner as lethal terrain", () => {
    const model = new GameModel(81);
    const spinnerChunk: ChunkDefinition = {
      ...safeChunk(),
      hazards: [{ x: PLAYER_X, y: model.playerY - 5, w: 12, h: 12, kind: "spinner", attachment: "floating" }],
    };
    model.chunks = [activate(spinnerChunk)];
    model.mode = "playing";
    model.step();
    expect(model.mode).toBe("dead");
  });

  it("uses uniform individual spike geometry while varying the number of points", () => {
    const threePoints = spikeClusterLayout(24);
    const fourPoints = spikeClusterLayout(32);
    const fivePoints = spikeClusterLayout(36);
    expect(threePoints).toHaveLength(3);
    expect(fourPoints).toHaveLength(4);
    expect(fivePoints).toHaveLength(5);
    expect([...threePoints, ...fourPoints, ...fivePoints].every((point) => point.width === TERRAIN_SPIKE_POINT_WIDTH)).toBe(true);
  });

  it("rotates authored spike sprites along floor, ceiling, and slope normals", () => {
    expect(spikeRotationForNormal(0, -1)).toBeCloseTo(0, 6);
    expect(spikeRotationForNormal(0, 1)).toBeCloseTo(Math.PI, 6);
    expect(spikeRotationForNormal(Math.SQRT1_2, -Math.SQRT1_2)).toBeCloseTo(Math.PI / 4, 6);
  });

  it("preserves prop aspect ratios and anchors measured visible bottoms", () => {
    for (const [chapter, art] of PROP_ART.entries()) {
      const layout = propLayout(chapter);
      expect(layout.displayWidth / layout.displayHeight).toBeCloseTo(art.sourceWidth / art.sourceHeight, 5);
      expect(layout.originY).toBeGreaterThan(0);
      expect(layout.originY).toBeLessThanOrEqual(1);
      expect(layout.visibleLeft).toBeLessThan(layout.visibleRight);
    }

    const minecart = propLayout(6);
    expect(minecart.displayWidth).toBe(54);
    expect(minecart.displayHeight).toBeCloseTo(35.86, 2);
    expect(minecart.originY).toBe(1);

    const marble = propLayout(3);
    expect(marble.displayWidth).toBeCloseTo(45.75, 2);
    expect(marble.displayHeight).toBe(48);
    expect(marble.originY).toBeCloseTo(122 / 128, 5);

    const corruption = propLayout(5);
    expect(corruption.originY).toBeCloseTo(117 / 128, 5);
  });

  it("aligns wide foreground props to slopes without burying the uphill side", () => {
    const layout = propLayout(6);
    const slope = 0.35;
    const placement = propGroundPlacement(layout, (x) => 150 + x * slope);
    expect(placement).toBeDefined();
    expect(placement?.rotation).toBeCloseTo(Math.atan(slope), 5);
    expect(placement?.y).toBeCloseTo(151, 5);

    if (!placement) return;
    const sine = Math.sin(placement.rotation);
    const cosine = Math.cos(placement.rotation);
    for (let index = 0; index <= 8; index += 1) {
      const localX = layout.visibleLeft + (layout.visibleRight - layout.visibleLeft) * (index / 8);
      const propBaseY = placement.y + localX * sine;
      const floorY = 150 + localX * cosine * slope;
      expect(propBaseY).toBeLessThanOrEqual(floorY + 1.001);
      expect(propBaseY).toBeGreaterThanOrEqual(floorY + 0.999);
    }
  });

  it("moves Verdant Wilds background layers at increasing depth rates", () => {
    const start = verdantParallaxState(0, 0, false);
    const moved = verdantParallaxState(200, 20, false);
    expect(start.far.x).toBe(0);
    expect(moved.far.x).toBe(5);
    expect(moved.mid.x).toBeGreaterThan(moved.far.x);
    expect(moved.near.x).toBeGreaterThan(moved.mid.x);
    expect(moved.far.y).toBeLessThan(start.far.y);

    const reduced = verdantParallaxState(200, 20, true);
    expect(reduced.far.x).toBeLessThan(moved.far.x);
    expect(reduced.mid.x).toBeLessThan(moved.mid.x);
    expect(reduced.near.x).toBeLessThan(moved.near.x);
  });

  it("collides terrain spikes at their uniform visible height", () => {
    const spikeChunk: ChunkDefinition = {
      ...safeChunk(),
      hazards: [{ x: PLAYER_X - 6, y: PLAY_BOTTOM - 20, w: 12, h: 20, kind: "thorns", attachment: "floor" }],
    };
    const model = new GameModel(82);
    model.chunks = [activate(spikeChunk)];
    model.mode = "playing";
    model.gravity = -1;
    model.playerY = 140;

    model.step();
    expect(model.mode).toBe("playing");

    model.playerY = 146;
    model.step();
    expect(model.mode).toBe("dead");
  });

  it("inserts a safe non-scoring passage when a chapter threshold is crossed", () => {
    const model = new GameModel(91);
    model.mode = "playing";
    model.gates = CHAPTERS[1].at - 1;
    model.score = CHAPTERS[1].at - 1;
    model.distance = 98;
    model.chunks = [activate(safeChunk())];

    model.step();

    expect(model.chapter).toBe(1);
    expect(model.gates).toBe(CHAPTERS[1].at);
    const passage = model.chunks.find((active) => active.definition.transition);
    expect(passage?.definition.id).toBe(TRANSITION_CHUNKS[0]?.id);
    expect(model.chapterTransition()?.progress).toBe(0);

    if (!passage) throw new Error("Expected a transition passage");
    model.distance = passage.startX - PLAYER_X + passage.definition.width / 2;
    expect(model.chapterTransition()).toMatchObject({ from: 0, to: 1, active: true });
    expect(model.chapterTransition()?.progress).toBeCloseTo(0.5, 5);

    model.distance = passage.startX - PLAYER_X + passage.definition.width + 1;
    model.step();
    expect(model.gates).toBe(CHAPTERS[1].at);
    expect(model.score).toBe(CHAPTERS[1].at);
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
        const phases = next.hazards.some((hazard) => hazard.motion || hazard.cycle) ? [0, 0.25, 0.5, 0.75] : [0];
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
