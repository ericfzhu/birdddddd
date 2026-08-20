import { describe, expect, it } from "vitest";
import {
  BIOMES,
  CHAPTERS,
  FLAME_VENT_DEPTH,
  FIXED_STEP_SECONDS,
  FLIP_DEBOUNCE_SECONDS,
  HITBOX_INSET,
  PLAY_BOTTOM,
  PLAY_TOP,
  PLAYER_HEIGHT,
  PLAYER_MIN_X,
  PLAYER_RECOVERY_SPEED,
  PLAYER_X,
  SANDJET_NOZZLE_DEPTH,
  WALKER_STOMP_BOUNCE_SPEED,
} from "../src/game/constants";
import { CHUNKS, TRANSITION_CHUNKS, envelopesCompatible, tunnelOffsetAt, validateChunkLibrary } from "../src/game/chunks";
import { GameModel } from "../src/game/model";
import { canTraverseChunk } from "../src/game/solver";
import { CAMERA_DEAD_ZONE_BOTTOM, CAMERA_DEAD_ZONE_TOP, cameraTargetY, trackCameraY } from "../src/game/camera";
import {
  sandJetVisualLayout,
  spikeClusterLayout,
  spikeRotationForNormal,
  TERRAIN_SPIKE_POINT_WIDTH,
} from "../src/game/hazards";
import { PROP_ART, propGroundPlacement, propGroundPlacementAtWorldX, propLayout } from "../src/game/props";
import { biomeParallaxState, desertParallaxState, PARALLAX_BIOME_SLUGS, verdantParallaxState } from "../src/game/parallax";
import { dangerOutlineDisplaySize, screenXAtRenderDistance, snappedRenderDistance, walkerLayerLayout } from "../src/game/rendering";
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
  it("can place a requested authored chunk first for direct test-ground previews", () => {
    const model = new GameModel(123, 0, 3, "clock-perches");
    expect(model.chapter).toBe(3);
    expect(model.chunks[0]?.definition.id).toBe("clock-perches");
    expect(model.chunks[0]?.startX).toBe(130);
  });

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
    expect(a.chapterDistance).toBeCloseTo(b.chapterDistance, 8);
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
      "MUSHROOM KINGDOM",
      "SUNKEN DUNES",
      "MARBLE CAVE",
      "VIOLET CHASM",
      "UNDERGROUND CORRUPTION",
      "ABANDONED MINECART",
      "ASHEN DEPTHS",
      "UNDERWORLD",
    ]);
    expect(new Set(BIOMES.map((biome) => biome.sky)).size).toBe(CHAPTERS.length);
    const decorations = ["forest", "jungle", "mushroom", "desert", "marble", "blight", "corruption", "minecart", "depths", "underworld"] as const;
    for (let chapter = 0; chapter < decorations.length; chapter += 1) {
      expect(new Set(CHUNKS.filter((chunk) => chunk.chapter === chapter).map((chunk) => chunk.decoration))).toEqual(new Set([decorations[chapter]]));
    }
  });

  it("inserts Mushroom Kingdom third and shifts every later chapter intact", () => {
    expect(CHAPTERS).toHaveLength(10);
    expect(CHAPTERS.map((chapter) => chapter.at)).toEqual([0, 8, 18, 30, 44, 60, 78, 98, 120, 144]);
    expect(CHUNKS.filter((chunk) => chunk.chapter === 2).map((chunk) => chunk.id)).toEqual([
      "mushroom-pipe-gates",
      "mushroom-brick-hop",
      "mushroom-green-hills",
      "mushroom-block-arc",
      "mushroom-castle-road",
      "mushroom-warp-way",
    ]);
    expect(CHUNKS.find((chunk) => chunk.id === "clock-low-high")?.chapter).toBe(3);
    expect(CHUNKS.find((chunk) => chunk.id === "underworld-forge")?.chapter).toBe(9);
    expect(INTERACTIVE_ART[2]?.slug).toBe("mushroom-kingdom");
    expect(INTERACTIVE_ART[2]?.emphasis?.pillarWidthBonus).toBe(8);
    expect(INTERACTIVE_ART[2]?.assets).toEqual(expect.arrayContaining(["walker", "winged-shell"]));
    expect(authoredAssetForHazard(2, "walker")).toBe("walker");
    expect(authoredAssetForHazard(2, "wingedShell")).toBe("winged-shell");
    const mushroomHazards = CHUNKS.filter((chunk) => chunk.chapter === 2).flatMap((chunk) => chunk.hazards);
    expect(mushroomHazards.find((hazard) => hazard.kind === "walker")?.motion?.axis).toBe("x");
    expect(mushroomHazards.find((hazard) => hazard.kind === "wingedShell")?.motion?.axis).toBe("y");
    expect(propLayout(2).originY).toBe(1);
    expect(transitionArtFor(1, 2)?.slug).toBe("jungle-mushroom");
    expect(transitionArtFor(2, 3)?.slug).toBe("mushroom-dunes");
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
      [2, ["walker", "wingedShell"]],
      [3, ["sandJet"]],
      [4, ["crusher"]],
      [5, ["crystal"]],
      [6, ["spore"]],
      [7, ["cart"]],
      [8, ["ember"]],
      [9, ["flame"]],
    ]);
    for (const [chapter, kinds] of expectedKinds) {
      const authored = new Set(CHUNKS.filter((chunk) => chunk.chapter === chapter).flatMap((chunk) => chunk.hazards.map((hazard) => hazard.kind)));
      for (const kind of kinds) expect(authored.has(kind as never), `chapter ${chapter} should introduce ${kind}`).toBe(true);
    }
  });

  it("maps every authored hazard in every biome to an explicit raster asset", () => {
    for (let chapter = 0; chapter < CHAPTERS.length; chapter += 1) {
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

  it("renders the desert sand jet from separate reusable nozzle and lethal plume assets", () => {
    const desertArt = INTERACTIVE_ART[3];
    expect(desertArt?.assets).toEqual(expect.arrayContaining(["sandjet", "sandjet-nozzle"]));
    expect(authoredAssetForHazard(3, "sandJet")).toBe("sandjet");
    expect(Object.values(desertArt?.hazards ?? {})).not.toContain("sandjet-nozzle");
  });

  it("renders Underworld flames from a persistent vent and separate lethal plume", () => {
    const underworldArt = INTERACTIVE_ART[9];
    expect(underworldArt?.assets).toEqual(expect.arrayContaining(["flame-plume", "flame-warning"]));
    expect(authoredAssetForHazard(9, "flame")).toBe("flame-plume");
    expect(Object.values(underworldArt?.hazards ?? {})).not.toContain("flame-warning");
  });

  it("gives Minecart's narrow machinery stronger visual emphasis without changing collision data", () => {
    const minecartArt = INTERACTIVE_ART[7];
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
    const remaining = TRANSITION_CHUNKS.filter((chunk) => (chunk.transition?.from ?? -1) >= 1);
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

  it("keeps the sand-jet nozzle safe while the separated plume remains lethal", () => {
    const floorJet: ChunkDefinition = {
      ...safeChunk(),
      id: "test-floor-sandjet",
      hazards: [{ x: PLAYER_X - 5, y: 80, w: 10, h: 42, kind: "sandJet", attachment: "floor" }],
    };
    const nozzleContact = new GameModel(901);
    nozzleContact.chunks = [activate(floorJet)];
    nozzleContact.mode = "playing";
    nozzleContact.playerY = 122 - SANDJET_NOZZLE_DEPTH / 2;
    nozzleContact.step();
    expect(nozzleContact.mode).toBe("playing");

    const plumeContact = new GameModel(902);
    plumeContact.chunks = [activate(floorJet)];
    plumeContact.mode = "playing";
    plumeContact.playerY = 92;
    plumeContact.step();
    expect(plumeContact.mode).toBe("dead");

    const ceilingJet: ChunkDefinition = {
      ...safeChunk(),
      id: "test-ceiling-sandjet",
      hazards: [{ x: PLAYER_X - 5, y: 58, w: 10, h: 42, kind: "sandJet", attachment: "ceiling", flipY: true }],
    };
    const ceilingNozzleContact = new GameModel(903);
    ceilingNozzleContact.chunks = [activate(ceilingJet)];
    ceilingNozzleContact.mode = "playing";
    ceilingNozzleContact.gravity = -1;
    ceilingNozzleContact.playerY = 58 + SANDJET_NOZZLE_DEPTH / 2;
    ceilingNozzleContact.step();
    expect(ceilingNozzleContact.mode).toBe("playing");

    const ceilingPlumeContact = new GameModel(904);
    ceilingPlumeContact.chunks = [activate(ceilingJet)];
    ceilingPlumeContact.mode = "playing";
    ceilingPlumeContact.playerY = 84;
    ceilingPlumeContact.step();
    expect(ceilingPlumeContact.mode).toBe("dead");
  });

  it("keeps Underworld vent housings safe while separated flame plumes remain lethal", () => {
    const floorVent: ChunkDefinition = {
      ...safeChunk(),
      id: "test-floor-flame-vent",
      hazards: [{ x: PLAYER_X - 5, y: PLAY_BOTTOM - 48, w: 10, h: 48, kind: "flame", attachment: "floor" }],
    };
    const floorHousingContact = new GameModel(905);
    floorHousingContact.chunks = [activate(floorVent)];
    floorHousingContact.mode = "playing";
    floorHousingContact.playerY = PLAY_BOTTOM - FLAME_VENT_DEPTH / 2;
    floorHousingContact.step();
    expect(floorHousingContact.mode).toBe("playing");

    const floorPlumeContact = new GameModel(906);
    floorPlumeContact.chunks = [activate(floorVent)];
    floorPlumeContact.mode = "playing";
    floorPlumeContact.playerY = 136;
    floorPlumeContact.step();
    expect(floorPlumeContact.mode).toBe("dead");

    const ceilingVent: ChunkDefinition = {
      ...safeChunk(),
      id: "test-ceiling-flame-vent",
      hazards: [{ x: PLAYER_X - 5, y: PLAY_TOP, w: 10, h: 48, kind: "flame", attachment: "ceiling", flipY: true }],
    };
    const ceilingHousingContact = new GameModel(907);
    ceilingHousingContact.chunks = [activate(ceilingVent)];
    ceilingHousingContact.mode = "playing";
    ceilingHousingContact.gravity = -1;
    ceilingHousingContact.playerY = PLAY_TOP + FLAME_VENT_DEPTH / 2;
    ceilingHousingContact.step();
    expect(ceilingHousingContact.mode).toBe("playing");

    const ceilingPlumeContact = new GameModel(908);
    ceilingPlumeContact.chunks = [activate(ceilingVent)];
    ceilingPlumeContact.mode = "playing";
    ceilingPlumeContact.playerY = 44;
    ceilingPlumeContact.step();
    expect(ceilingPlumeContact.mode).toBe("dead");
  });

  it("anchors ceiling sand-jet art downward from the ceiling opening", () => {
    const floor = sandJetVisualLayout(80, 42, SANDJET_NOZZLE_DEPTH, false);
    expect(floor).toEqual({ baseY: 122, openingY: 108, originY: 1, flipY: false });

    const ceiling = sandJetVisualLayout(58, 42, SANDJET_NOZZLE_DEPTH, true);
    expect(ceiling).toEqual({ baseY: 58, openingY: 72, originY: 0, flipY: true });
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

  it("keeps walking hazards seated on the terrain while they patrol across a slope", () => {
    const walkerChunk: ChunkDefinition = {
      ...safeChunk(),
      id: "test-slope-walker",
      tunnel: [{ x: 0, y: 0 }, { x: 200, y: 40 }],
      hazards: [{
        x: 80,
        y: PLAY_BOTTOM - 16,
        w: 18,
        h: 16,
        kind: "walker",
        attachment: "floor",
        motion: { amplitude: 20, frequency: 0.25, axis: "x" },
      }],
    };
    const model = new GameModel(93);
    model.chunks = [activate(walkerChunk)];
    const start = model.visibleRects()[0];
    expect(start?.motionDirectionX).toBe(1);
    model.simTime = 1;
    const shifted = model.visibleRects()[0];
    expect(shifted?.x).toBeCloseTo((start?.x ?? 0) + 20, 5);
    expect(shifted?.y).toBeCloseTo((start?.y ?? 0) + 4, 5);
    model.simTime = 2;
    expect(model.visibleRects()[0]?.motionDirectionX).toBe(-1);
  });

  it("animates walker legs independently while keeping one immutable body crop", () => {
    const first = walkerLayerLayout(80, 72, 0, false);
    const second = walkerLayerLayout(80, 72, 0.13, false);
    expect(first.bodyCrop).toEqual([0, 0, 80, 48]);
    expect(second.bodyCrop).toEqual(first.bodyCrop);
    expect(first.leftLegCrop).toEqual(second.leftLegCrop);
    expect(first.rightLegCrop).toEqual(second.rightLegCrop);
    expect(second.leftLegOffset).toEqual({ x: 1, y: -1 });
    expect(second.rightLegOffset).toEqual({ x: -1, y: 0 });

    const reduced = walkerLayerLayout(80, 72, 9.9, true);
    expect(reduced.step).toBe(0);
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

  it("recovers slowly from slope pushback and still dies under continuous displacement", () => {
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
    expect(model.playerX).toBeGreaterThan(shovedX);
    expect(model.playerX).toBeLessThan(PLAYER_X);

    const trapped = new GameModel(83);
    trapped.chunks = [activate(risingTunnel, 20)];
    trapped.mode = "playing";
    trapped.advance(1400);
    expect(trapped.mode, trapped.textSnapshot()).toBe("dead");
    expect(trapped.playerX).toBeLessThanOrEqual(PLAYER_MIN_X + 0.5);
  });

  it("recovers slowly after a safe cage pillar releases the bird", () => {
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
    expect(model.playerX).toBeGreaterThan(shovedX);
    expect(model.playerX).toBeLessThan(PLAYER_X);
  });

  it("recovers at a fixed slow rate and stops exactly at the resting position", () => {
    const model = new GameModel(851);
    model.chunks = [activate(safeChunk())];
    model.mode = "playing";
    model.playerX = 50;
    model.playerY = 90;

    model.advance(1000);
    expect(model.playerX).toBeCloseTo(50 + PLAYER_RECOVERY_SPEED, 5);
    expect(JSON.parse(model.textSnapshot()).player.recovering).toBe(true);

    model.playerX = PLAYER_X - 2;
    model.advance(1000);
    expect(model.playerX).toBe(PLAYER_X);
    expect(model.recovering).toBe(false);
  });

  it("pushes the bird back at floating-platform edges while retaining landings", () => {
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
    expect(sideContact.playerX).toBeLessThan(PLAYER_X);
    const firstPushX = sideContact.playerX;

    sideContact.step();
    expect(sideContact.mode).toBe("playing");
    expect(sideContact.playerX).toBeLessThanOrEqual(firstPushX);
    expect(sideContact.recovering).toBe(false);

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

  it("resolves platform faces from momentum when velocity and gravity disagree", () => {
    const topContactChunk: ChunkDefinition = {
      ...safeChunk(),
      id: "test-perch-opposite-gravity-top",
      solids: [{ x: 45, y: 100, w: 80, h: 6, detail: "perch" }],
    };
    const fallingAgainstUpwardGravity = new GameModel(871);
    fallingAgainstUpwardGravity.chunks = [activate(topContactChunk)];
    fallingAgainstUpwardGravity.mode = "playing";
    fallingAgainstUpwardGravity.gravity = -1;
    fallingAgainstUpwardGravity.playerY = 95.5;
    fallingAgainstUpwardGravity.velocityY = 70;

    fallingAgainstUpwardGravity.step();
    expect(fallingAgainstUpwardGravity.mode).toBe("playing");
    expect(fallingAgainstUpwardGravity.playerX).toBe(PLAYER_X);
    expect(fallingAgainstUpwardGravity.playerY).toBe(96);
    expect(fallingAgainstUpwardGravity.velocityY).toBe(0);

    const undersideContactChunk: ChunkDefinition = {
      ...safeChunk(),
      id: "test-perch-opposite-gravity-underside",
      solids: [{ x: 45, y: 80, w: 80, h: 6, detail: "perch" }],
    };
    const risingAgainstDownwardGravity = new GameModel(872);
    risingAgainstDownwardGravity.chunks = [activate(undersideContactChunk)];
    risingAgainstDownwardGravity.mode = "playing";
    risingAgainstDownwardGravity.gravity = 1;
    risingAgainstDownwardGravity.playerY = 90.5;
    risingAgainstDownwardGravity.velocityY = -70;

    risingAgainstDownwardGravity.step();
    expect(risingAgainstDownwardGravity.mode).toBe("playing");
    expect(risingAgainstDownwardGravity.playerX).toBe(PLAYER_X);
    expect(risingAgainstDownwardGravity.playerY).toBe(90);
    expect(risingAgainstDownwardGravity.velocityY).toBe(0);
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

  it.each(["walker", "wingedShell"] as const)("treats Mushroom Kingdom %s enemies as lethal", (kind) => {
    const model = new GameModel(kind === "walker" ? 811 : 812);
    const enemyChunk: ChunkDefinition = {
      ...safeChunk(),
      hazards: [{ x: PLAYER_X - 6, y: model.playerY - 6, w: 12, h: 12, kind, attachment: "floating" }],
    };
    model.chunks = [activate(enemyChunk)];
    model.mode = "playing";
    model.step();
    expect(model.mode).toBe("dead");
  });

  it("stomps a walker from above, removes it, and rebounds the bird", () => {
    const stompChunk: ChunkDefinition = {
      ...safeChunk(),
      hazards: [{ x: PLAYER_X - 7, y: 100, w: 18, h: 16, kind: "walker", attachment: "floor" }],
    };
    const model = new GameModel(813);
    model.chunks = [activate(stompChunk)];
    model.mode = "playing";
    model.playerY = 95.5;
    model.velocityY = 60;

    model.step();

    expect(model.mode).toBe("playing");
    expect(model.playerY).toBe(96);
    expect(model.velocityY).toBe(-WALKER_STOMP_BOUNCE_SPEED);
    expect(model.stomps).toBe(1);
    expect(model.visibleRects().some((rect) => rect.kind === "walker")).toBe(false);
    expect(model.drainEvents()).toContainEqual(expect.objectContaining({ type: "stomp" }));

    model.step();
    expect(model.mode).toBe("playing");
  });

  it("de-wings a stomped flying shell, lands it as a walker, then retracts it on a later stomp", () => {
    const flyingChunk: ChunkDefinition = {
      ...safeChunk(),
      hazards: [{ x: PLAYER_X - 7, y: 100, w: 22, h: 16, kind: "wingedShell", attachment: "floating" }],
    };
    const model = new GameModel(814);
    model.chunks = [activate(flyingChunk)];
    model.mode = "playing";
    model.playerY = 95.5;
    model.velocityY = 60;

    model.step();

    expect(model.mode).toBe("playing");
    expect(model.velocityY).toBe(-WALKER_STOMP_BOUNCE_SPEED);
    expect(model.stomps).toBe(1);
    expect(model.visibleRects().find((rect) => rect.kind === "wingedShell")?.enemyState).toBe("falling");
    expect(model.drainEvents()).toContainEqual(expect.objectContaining({
      type: "stomp",
      enemy: "wingedShell",
      outcome: "dewinged",
    }));

    model.advance(500);
    const grounded = model.visibleRects().find((rect) => rect.kind === "wingedShell");
    expect(grounded?.enemyState).toBe("walking");
    expect(grounded?.motionDirectionX).toBeDefined();

    model.playerX = (grounded?.x ?? PLAYER_X) + (grounded?.w ?? 22) / 2;
    model.playerY = (grounded?.y ?? 100) - (PLAYER_HEIGHT / 2 - HITBOX_INSET) + 0.5;
    model.velocityY = 60;
    model.step();
    expect(model.mode).toBe("playing");
    expect(model.stomps).toBe(2);
    expect(model.visibleRects().find((rect) => rect.kind === "wingedShell")?.enemyState).toBe("shell");
    expect(model.drainEvents()).toContainEqual(expect.objectContaining({
      type: "stomp",
      enemy: "wingedShell",
      outcome: "shelled",
    }));
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

    const minecart = propLayout(7);
    expect(minecart.displayWidth).toBe(54);
    expect(minecart.displayHeight).toBeCloseTo(35.86, 2);
    expect(minecart.originY).toBeCloseTo(80 / 85, 5);

    const marble = propLayout(4);
    expect(marble.displayWidth).toBeCloseTo(45.75, 2);
    expect(marble.displayHeight).toBe(48);
    expect(marble.originY).toBeCloseTo(122 / 128, 5);

    const corruption = propLayout(6);
    expect(corruption.originY).toBeCloseTo(117 / 128, 5);
  });

  it("aligns wide foreground props to slopes without burying the uphill side", () => {
    const layout = propLayout(7);
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

  it("keeps prop placement fixed at its authored world anchor as the camera advances", () => {
    const layout = propLayout(7);
    const anchorWorldX = 420;
    const floorAtWorldX = (worldX: number) => 150 + (worldX - anchorWorldX) * 0.3;
    const beforeEntryScreenX = anchorWorldX - 80;
    const afterEntryScreenX = anchorWorldX - 360;

    const beforeEntry = propGroundPlacementAtWorldX(
      layout,
      80 + beforeEntryScreenX,
      floorAtWorldX,
    );
    const afterEntry = propGroundPlacementAtWorldX(
      layout,
      360 + afterEntryScreenX,
      floorAtWorldX,
    );

    expect(beforeEntry).toEqual(afterEntry);
    expect(beforeEntry?.rotation).toBeCloseTo(Math.atan(0.3), 5);
    expect(beforeEntry?.y).toBeCloseTo(151, 5);
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

  it("moves Sunken Dunes background layers at increasing depth rates", () => {
    const start = desertParallaxState(0, 0, false);
    const moved = desertParallaxState(400, -20, false);
    expect(start.far.x).toBe(0);
    expect(moved.far.x).toBe(7);
    expect(moved.mid.x).toBeGreaterThan(moved.far.x);
    expect(moved.near.x).toBeGreaterThan(moved.mid.x);
    expect(moved.far.y).toBeGreaterThan(start.far.y);

    const reduced = desertParallaxState(400, -20, true);
    expect(reduced.far.x).toBeLessThan(moved.far.x);
    expect(reduced.mid.x).toBeLessThan(moved.mid.x);
    expect(reduced.near.x).toBeLessThan(moved.near.x);
  });

  it("gives every biome three independently moving authored depth layers", () => {
    expect(PARALLAX_BIOME_SLUGS).toHaveLength(CHAPTERS.length);
    for (let chapter = 0; chapter < CHAPTERS.length; chapter += 1) {
      const start = biomeParallaxState(chapter, 0, 0, false);
      const moved = biomeParallaxState(chapter, 400, 20, false);
      const reduced = biomeParallaxState(chapter, 400, 20, true);
      expect(moved.far.x, `chapter ${chapter} far`).toBeGreaterThan(start.far.x);
      expect(moved.mid.x, `chapter ${chapter} mid`).toBeGreaterThan(moved.far.x);
      expect(moved.near.x, `chapter ${chapter} near`).toBeGreaterThan(moved.mid.x);
      expect(reduced.far.x, `chapter ${chapter} reduced far`).toBeLessThan(moved.far.x);
      expect(reduced.mid.x, `chapter ${chapter} reduced mid`).toBeLessThan(moved.mid.x);
      expect(reduced.near.x, `chapter ${chapter} reduced near`).toBeLessThan(moved.near.x);
      for (const layer of [moved.far, moved.mid, moved.near]) {
        expect(layer.x + layer.width).toBeLessThanOrEqual(512);
        expect(layer.y + layer.height).toBeLessThanOrEqual(288);
      }
    }
  });

  it("shares one pixel-snapped scroll sample and preserves an outline's undistorted center", () => {
    const firstRenderDistance = snappedRenderDistance(10.4);
    const nextRenderDistance = snappedRenderDistance(10.6);
    expect(firstRenderDistance).toBe(10);
    expect(nextRenderDistance).toBe(11);
    expect(screenXAtRenderDistance(140, firstRenderDistance) - screenXAtRenderDistance(100, firstRenderDistance)).toBe(40);
    expect(screenXAtRenderDistance(140, nextRenderDistance) - screenXAtRenderDistance(100, nextRenderDistance)).toBe(40);

    const outline = dangerOutlineDisplaySize(20, 40, 100, 200, 10, 0.5, 1);
    const horizontalPadding = outline.width * 10 / 120;
    const verticalPadding = outline.height * 10 / 220;
    expect(outline.width - horizontalPadding * 2).toBeCloseTo(20, 5);
    expect(outline.height - verticalPadding * 2).toBeCloseTo(40, 5);
    expect(outline.originX).toBe(0.5);
    expect(outline.originY).toBeCloseTo(210 / 220, 5);
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
    model.chapterDistance = 640;
    model.chunks = [activate(safeChunk())];

    model.step();

    expect(model.chapter).toBe(1);
    expect(model.chapterDistance).toBeCloseTo(640 + CHAPTERS[0].speed * FIXED_STEP_SECONDS, 5);
    expect(model.gates).toBe(CHAPTERS[1].at);
    const passage = model.chunks.find((active) => active.definition.transition);
    expect(passage?.definition.id).toBe(TRANSITION_CHUNKS[0]?.id);
    expect(model.chapterTransition()?.progress).toBe(0);
    expect(model.chapterTransition()?.fromDistance).toBe(model.chapterDistance);
    expect(model.chapterTransition()?.toDistance).toBe(0);

    if (!passage) throw new Error("Expected a transition passage");
    model.distance = passage.startX - PLAYER_X;
    model.chapterDistance = 700;
    model.step();
    expect(model.chapterTransition()?.fromDistance).toBeCloseTo(700, 5);
    expect(model.chapterTransition()?.toDistance).toBeCloseTo(CHAPTERS[1].speed * FIXED_STEP_SECONDS, 5);

    model.distance = passage.startX - PLAYER_X + passage.definition.width / 2;
    expect(model.chapterTransition()).toMatchObject({ from: 0, to: 1, active: true });
    expect(model.chapterTransition()?.progress).toBeCloseTo(0.5, 5);

    const frozenOutgoingDistance = model.chapterTransition()?.fromDistance;
    model.step();
    expect(model.chapterTransition()?.fromDistance).toBe(frozenOutgoingDistance);
    expect(model.chapterTransition()?.toDistance).toBeCloseTo(CHAPTERS[1].speed * FIXED_STEP_SECONDS * 2, 5);

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
    model.chapterDistance = 240;
    expect(model.action()).toBe(false);
    model.advance(400);
    expect(model.action()).toBe(true);
    expect(model.mode).toBe("playing");
    expect(model.gravity).toBe(-1);
    expect(model.chapterDistance).toBe(0);
  });
});
