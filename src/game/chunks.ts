import { MAX_VERTICAL_SPEED, PLAY_BOTTOM, PLAY_TOP } from "./constants";
import type { ChunkDefinition, Envelope, FeatherSpec, HazardSpec, SolidSpec, TunnelPoint } from "./types";

const ANY: Envelope = { surface: "any", maxAbsVelocity: MAX_VERTICAL_SPEED };
const TOP: Envelope = { surface: "top", maxAbsVelocity: 120 };
const BOTTOM: Envelope = { surface: "bottom", maxAbsVelocity: 120 };

const topThorns = (x: number, w = 28, h = 17): HazardSpec => ({
  x,
  y: PLAY_TOP,
  w,
  h,
  kind: "thorns",
  flipY: true,
});

const bottomThorns = (x: number, w = 28, h = 17): HazardSpec => ({
  x,
  y: PLAY_BOTTOM - h,
  w,
  h,
  kind: "thorns",
});

const ceilingBarbs = (x: number, w = 32, h = 23): HazardSpec => ({
  x,
  y: PLAY_TOP,
  w,
  h,
  kind: "barbs",
  attachment: "ceiling",
  flipY: true,
});

const floorBarbs = (x: number, w = 32, h = 23): HazardSpec => ({
  x,
  y: PLAY_BOTTOM - h,
  w,
  h,
  kind: "barbs",
  attachment: "floor",
});

const spinner = (
  x: number,
  y: number,
  size = 18,
  motion?: HazardSpec["motion"],
): HazardSpec => ({ x, y, w: size, h: size, kind: "spinner", attachment: "floating", motion });

const wire = (x: number, y: number, h: number): HazardSpec => ({ x, y, w: 6, h, kind: "wire" });

const perch = (x: number, y: number, w: number): SolidSpec => ({ x, y, w, h: 6, detail: "perch" });

const featherArc = (points: Array<[number, number]>): FeatherSpec[] => points.map(([x, y]) => ({ x, y }));

function chunk(
  id: string,
  chapter: number,
  width: number,
  hazards: HazardSpec[],
  feathers: FeatherSpec[] = [],
  solids: SolidSpec[] = [],
  entry: Envelope = ANY,
  exit: Envelope = ANY,
  decoration: ChunkDefinition["decoration"] = "nest",
): ChunkDefinition {
  return { id, chapter, width, hazards, feathers, solids, entry, exit, decoration };
}

const tunnelDip = (width: number, offset: number): TunnelPoint[] => [
  { x: 0, y: 0 },
  { x: Math.round(width * 0.18), y: 0 },
  { x: Math.round(width * 0.42), y: offset },
  { x: Math.round(width * 0.68), y: offset },
  { x: Math.round(width * 0.9), y: 0 },
  { x: width, y: 0 },
];

const tunnelWave = (width: number, first: number, second: number): TunnelPoint[] => [
  { x: 0, y: 0 },
  { x: Math.round(width * 0.16), y: 0 },
  { x: Math.round(width * 0.36), y: first },
  { x: Math.round(width * 0.54), y: first },
  { x: Math.round(width * 0.72), y: second },
  { x: Math.round(width * 0.88), y: 0 },
  { x: width, y: 0 },
];

const withTunnel = (definition: ChunkDefinition, tunnel: TunnelPoint[]): ChunkDefinition => ({ ...definition, tunnel });

export const CHUNKS: readonly ChunkDefinition[] = [
  // Nursery Works — wide, readable single decisions.
  chunk("nursery-low", 0, 210, [floorBarbs(72, 34, 20)], [{ x: 90, y: 72 }]),
  chunk("nursery-high", 0, 210, [ceilingBarbs(76, 36, 20)], [{ x: 94, y: 110 }]),
  withTunnel(chunk("nursery-sway", 0, 230, [bottomThorns(58, 26), topThorns(152, 28)], featherArc([[76, 70], [116, 90], [164, 110]])), tunnelDip(230, 25)),
  chunk("nursery-gate", 0, 220, [wire(108, PLAY_TOP, 48), wire(108, 120, PLAY_BOTTOM - 120)], [{ x: 110, y: 90 }]),
  chunk("nursery-perch", 0, 230, [bottomThorns(146, 32)], [{ x: 92, y: 77 }], [perch(66, 105, 48)]),
  withTunnel(chunk("nursery-rungs", 0, 240, [ceilingBarbs(54, 24, 21), floorBarbs(138, 28, 21)], featherArc([[72, 112], [108, 90], [154, 68]])), tunnelDip(240, -25)),

  // Clockwork Roost — alternating decisions and reward arcs.
  chunk("clock-low-high", 1, 230, [floorBarbs(46, 32), ceilingBarbs(142, 34)], featherArc([[64, 62], [106, 90], [160, 118]]), [], BOTTOM, TOP, "gears"),
  chunk("clock-high-low", 1, 230, [ceilingBarbs(48, 32), floorBarbs(144, 34)], featherArc([[64, 118], [108, 88], [162, 62]]), [], TOP, BOTTOM, "gears"),
  chunk("clock-eye", 1, 220, [wire(102, PLAY_TOP, 55), wire(102, 113, PLAY_BOTTOM - 113), bottomThorns(168, 22)], [{ x: 106, y: 86 }], [], ANY, BOTTOM, "gears"),
  withTunnel(chunk("clock-steps", 1, 250, [bottomThorns(50, 22), topThorns(116, 22), bottomThorns(186, 24)], featherArc([[66, 58], [132, 120], [202, 60]]), [], ANY, ANY, "bells"), tunnelDip(250, 31)),
  chunk("clock-perches", 1, 240, [ceilingBarbs(170, 28), spinner(202, 104, 17)], featherArc([[78, 116], [118, 95], [174, 70]]), [perch(62, 120, 40), perch(116, 72, 42)], ANY, TOP, "bells"),
  withTunnel(chunk("clock-teeth", 1, 240, [topThorns(66, 24, 21), bottomThorns(125, 24, 21), topThorns(184, 24, 21)], featherArc([[86, 116], [145, 64], [204, 116]]), [], ANY, ANY, "gears"), tunnelDip(240, -31)),

  // Crooked Gallery — moving shutters and delayed reversals.
  chunk("crooked-shutter-a", 2, 240, [{ x: 106, y: 26, w: 10, h: 58, kind: "shutter", attachment: "floating", motion: { amplitude: 16, frequency: 0.35 } }, floorBarbs(178, 28)], [{ x: 110, y: 120 }], [], ANY, BOTTOM, "eggs"),
  chunk("crooked-shutter-b", 2, 240, [{ x: 112, y: 96, w: 10, h: 58, kind: "shutter", attachment: "floating", motion: { amplitude: 15, frequency: 0.38, phase: 0.5 } }, ceilingBarbs(182, 28)], [{ x: 116, y: 58 }], [], ANY, TOP, "eggs"),
  withTunnel(chunk("crooked-scissors", 2, 250, [wire(82, PLAY_TOP, 58), wire(148, 106, PLAY_BOTTOM - 106), topThorns(204, 24)], featherArc([[90, 100], [154, 78], [214, 118]]), [], ANY, ANY, "bells"), tunnelDip(250, 37)),
  withTunnel(chunk("crooked-islands", 2, 250, [bottomThorns(58, 24), topThorns(190, 24)], featherArc([[92, 74], [128, 92], [172, 112]]), [perch(94, 116, 34), perch(144, 58, 34)], ANY, ANY, "eggs"), tunnelDip(250, -37)),
  chunk("crooked-pendulum", 2, 260, [spinner(116, 80, 20, { amplitude: 28, frequency: 0.28, phase: 0.25 }), floorBarbs(204, 28)], featherArc([[72, 60], [150, 90], [218, 58]]), [], TOP, BOTTOM, "bells"),
  chunk("crooked-comb", 2, 250, [topThorns(50, 20, 25), bottomThorns(104, 20, 25), topThorns(158, 20, 25), bottomThorns(212, 20, 25)], featherArc([[66, 116], [120, 62], [174, 116]]), [], ANY, ANY, "gears"),

  // Midnight Coop — expert combinations, still solver-safe.
  chunk("midnight-needle", 3, 250, [wire(74, PLAY_TOP, 62), wire(142, 102, PLAY_BOTTOM - 102), spinner(166, 63, 18), wire(208, PLAY_TOP, 60)], featherArc([[84, 105], [152, 70], [218, 108]]), [], ANY, ANY, "eggs"),
  chunk("midnight-crank", 3, 260, [{ x: 92, y: 28, w: 10, h: 54, kind: "shutter", attachment: "floating", motion: { amplitude: 18, frequency: 0.42 } }, spinner(181, 80, 20, { amplitude: 28, frequency: 0.36, phase: 0.5 })], featherArc([[106, 118], [150, 90], [212, 62]]), [], ANY, ANY, "gears"),
  withTunnel(chunk("midnight-nests", 3, 270, [floorBarbs(54, 26), ceilingBarbs(214, 28)], featherArc([[90, 64], [142, 92], [204, 116]]), [perch(96, 116, 38), perch(156, 58, 38)], ANY, ANY, "nest"), tunnelDip(270, 43)),
  chunk("midnight-beaks", 3, 260, [{ x: 66, y: PLAY_TOP, w: 20, h: 28, kind: "beak", flipY: true }, { x: 138, y: 136, w: 20, h: 28, kind: "beak" }, { x: 210, y: PLAY_TOP, w: 20, h: 28, kind: "beak", flipY: true }], featherArc([[84, 118], [156, 62], [226, 116]]), [], ANY, ANY, "nest"),
  withTunnel(chunk("midnight-belfry", 3, 270, [ceilingBarbs(52, 22), spinner(122, 78, 20, { amplitude: 30, frequency: 0.3 }), floorBarbs(214, 24)], featherArc([[72, 112], [158, 88], [228, 62]]), [], ANY, ANY, "bells"), tunnelDip(270, -43)),
  withTunnel(chunk("midnight-finale", 3, 280, [floorBarbs(46, 22, 23), ceilingBarbs(102, 22, 23), floorBarbs(160, 22, 23), ceilingBarbs(218, 22, 23)], featherArc([[64, 60], [120, 120], [178, 60], [236, 120]]), [], ANY, ANY, "eggs"), tunnelWave(280, -32, 30)),
] as const;

export const TRANSITION_CHUNKS: readonly ChunkDefinition[] = [
  chunk("passage-nursery-clockwork", 1, 190, [], [], [], ANY, ANY, "passage"),
  chunk("passage-clockwork-crooked", 2, 190, [], [], [], ANY, ANY, "passage"),
  chunk("passage-crooked-midnight", 3, 190, [], [], [], ANY, ANY, "passage"),
].map((definition, index) => ({
  ...definition,
  transition: { from: index, to: index + 1 },
}));

export function transitionChunk(from: number, to: number): ChunkDefinition {
  const definition = TRANSITION_CHUNKS.find((candidate) => candidate.transition?.from === from && candidate.transition.to === to);
  if (!definition) throw new Error(`No transition passage from chapter ${from} to ${to}`);
  return definition;
}

export function chunksForChapter(chapter: number): ChunkDefinition[] {
  return CHUNKS.filter((candidate) => candidate.chapter === chapter);
}

export function envelopesCompatible(a: Envelope, b: Envelope): boolean {
  const surfacesMatch = a.surface === "any" || b.surface === "any" || a.surface === b.surface;
  return surfacesMatch && Math.min(a.maxAbsVelocity, b.maxAbsVelocity) >= 80;
}

export function tunnelOffsetAt(definition: ChunkDefinition, localX: number): number {
  const points = definition.tunnel;
  if (!points || points.length < 2) return 0;
  if (localX <= (points[0]?.x ?? 0)) return points[0]?.y ?? 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (!previous || !next || localX > next.x) continue;
    const span = Math.max(1, next.x - previous.x);
    const progress = (localX - previous.x) / span;
    return previous.y + (next.y - previous.y) * progress;
  }
  return points.at(-1)?.y ?? 0;
}

export function validateChunkLibrary(): string[] {
  const errors: string[] = [];
  for (let chapter = 0; chapter < 4; chapter += 1) {
    if (chunksForChapter(chapter).length !== 6) errors.push(`Chapter ${chapter} must contain six chunks.`);
  }
  const ids = new Set<string>();
  for (const item of CHUNKS) {
    if (ids.has(item.id)) errors.push(`Duplicate chunk id: ${item.id}`);
    ids.add(item.id);
    if (item.width < 200) errors.push(`${item.id} is too short for a readable decision window.`);
    if (item.tunnel) {
      if (item.tunnel[0]?.x !== 0 || item.tunnel[0]?.y !== 0) errors.push(`${item.id} tunnel must enter at the baseline.`);
      if (item.tunnel.at(-1)?.x !== item.width || item.tunnel.at(-1)?.y !== 0) errors.push(`${item.id} tunnel must return to the baseline.`);
      for (let index = 1; index < item.tunnel.length; index += 1) {
        if ((item.tunnel[index]?.x ?? 0) <= (item.tunnel[index - 1]?.x ?? 0)) errors.push(`${item.id} tunnel points must advance in x.`);
      }
    }
    for (const hazard of item.hazards) {
      if (hazard.y < PLAY_TOP || hazard.y + hazard.h > PLAY_BOTTOM) errors.push(`${item.id} has an out-of-bounds hazard.`);
    }
    const sameChapter = chunksForChapter(item.chapter).filter((next) => next.id !== item.id);
    if (!sameChapter.some((next) => envelopesCompatible(item.exit, next.entry))) {
      errors.push(`${item.id} has no compatible successor.`);
    }
  }
  return errors;
}
