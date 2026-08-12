import { MAX_VERTICAL_SPEED, PLAY_BOTTOM, PLAY_TOP } from "./constants";
import type { ChunkDefinition, Envelope, FeatherSpec, HazardSpec, SolidSpec } from "./types";

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

export const CHUNKS: readonly ChunkDefinition[] = [
  // Nursery Works — wide, readable single decisions.
  chunk("nursery-low", 0, 210, [bottomThorns(72, 34)], [{ x: 90, y: 72 }]),
  chunk("nursery-high", 0, 210, [topThorns(76, 36)], [{ x: 94, y: 110 }]),
  chunk("nursery-sway", 0, 230, [bottomThorns(58, 26), topThorns(152, 28)], featherArc([[76, 70], [116, 90], [164, 110]])),
  chunk("nursery-gate", 0, 220, [wire(108, PLAY_TOP, 48), wire(108, 120, PLAY_BOTTOM - 120)], [{ x: 110, y: 90 }]),
  chunk("nursery-perch", 0, 230, [bottomThorns(146, 32)], [{ x: 92, y: 77 }], [perch(66, 105, 48)]),
  chunk("nursery-rungs", 0, 240, [topThorns(54, 24), bottomThorns(138, 28)], featherArc([[72, 112], [108, 90], [154, 68]])),

  // Clockwork Roost — alternating decisions and reward arcs.
  chunk("clock-low-high", 1, 230, [bottomThorns(46, 32), topThorns(142, 34)], featherArc([[64, 62], [106, 90], [160, 118]]), [], BOTTOM, TOP, "gears"),
  chunk("clock-high-low", 1, 230, [topThorns(48, 32), bottomThorns(144, 34)], featherArc([[64, 118], [108, 88], [162, 62]]), [], TOP, BOTTOM, "gears"),
  chunk("clock-eye", 1, 220, [wire(102, PLAY_TOP, 55), wire(102, 113, PLAY_BOTTOM - 113), bottomThorns(168, 22)], [{ x: 106, y: 86 }], [], ANY, BOTTOM, "gears"),
  chunk("clock-steps", 1, 250, [bottomThorns(50, 22), topThorns(116, 22), bottomThorns(186, 24)], featherArc([[66, 58], [132, 120], [202, 60]]), [], ANY, ANY, "bells"),
  chunk("clock-perches", 1, 240, [topThorns(170, 28)], featherArc([[78, 116], [118, 95], [174, 70]]), [perch(62, 120, 40), perch(116, 72, 42)], ANY, TOP, "bells"),
  chunk("clock-teeth", 1, 240, [topThorns(66, 24, 21), bottomThorns(125, 24, 21), topThorns(184, 24, 21)], featherArc([[86, 116], [145, 64], [204, 116]]), [], ANY, ANY, "gears"),

  // Crooked Gallery — moving shutters and delayed reversals.
  chunk("crooked-shutter-a", 2, 240, [{ x: 106, y: 26, w: 10, h: 58, kind: "shutter", motion: { amplitude: 16, frequency: 0.35 } }, bottomThorns(178, 28)], [{ x: 110, y: 120 }], [], ANY, BOTTOM, "eggs"),
  chunk("crooked-shutter-b", 2, 240, [{ x: 112, y: 96, w: 10, h: 58, kind: "shutter", motion: { amplitude: 15, frequency: 0.38, phase: 0.5 } }, topThorns(182, 28)], [{ x: 116, y: 58 }], [], ANY, TOP, "eggs"),
  chunk("crooked-scissors", 2, 250, [wire(82, PLAY_TOP, 58), wire(148, 106, PLAY_BOTTOM - 106), topThorns(204, 24)], featherArc([[90, 100], [154, 78], [214, 118]]), [], ANY, ANY, "bells"),
  chunk("crooked-islands", 2, 250, [bottomThorns(58, 24), topThorns(190, 24)], featherArc([[92, 74], [128, 92], [172, 112]]), [perch(94, 116, 34), perch(144, 58, 34)], ANY, ANY, "eggs"),
  chunk("crooked-pendulum", 2, 260, [{ x: 118, y: 54, w: 8, h: 72, kind: "shutter", motion: { amplitude: 28, frequency: 0.28, phase: 0.25 } }, bottomThorns(204, 28)], featherArc([[72, 60], [132, 90], [218, 58]]), [], TOP, BOTTOM, "bells"),
  chunk("crooked-comb", 2, 250, [topThorns(50, 20, 25), bottomThorns(104, 20, 25), topThorns(158, 20, 25), bottomThorns(212, 20, 25)], featherArc([[66, 116], [120, 62], [174, 116]]), [], ANY, ANY, "gears"),

  // Midnight Coop — expert combinations, still solver-safe.
  chunk("midnight-needle", 3, 250, [wire(74, PLAY_TOP, 62), wire(142, 102, PLAY_BOTTOM - 102), wire(208, PLAY_TOP, 60)], featherArc([[84, 105], [152, 70], [218, 108]]), [], ANY, ANY, "eggs"),
  chunk("midnight-crank", 3, 260, [{ x: 92, y: 28, w: 10, h: 54, kind: "shutter", motion: { amplitude: 18, frequency: 0.42 } }, { x: 184, y: 98, w: 10, h: 54, kind: "shutter", motion: { amplitude: 18, frequency: 0.42, phase: 0.5 } }], featherArc([[106, 118], [150, 90], [198, 62]]), [], ANY, ANY, "gears"),
  chunk("midnight-nests", 3, 270, [bottomThorns(54, 26), topThorns(214, 28)], featherArc([[90, 64], [142, 92], [204, 116]]), [perch(96, 116, 38), perch(156, 58, 38)], ANY, ANY, "nest"),
  chunk("midnight-beaks", 3, 260, [{ x: 66, y: PLAY_TOP, w: 20, h: 28, kind: "beak", flipY: true }, { x: 138, y: 136, w: 20, h: 28, kind: "beak" }, { x: 210, y: PLAY_TOP, w: 20, h: 28, kind: "beak", flipY: true }], featherArc([[84, 118], [156, 62], [226, 116]]), [], ANY, ANY, "nest"),
  chunk("midnight-belfry", 3, 270, [topThorns(52, 22), { x: 126, y: 50, w: 9, h: 72, kind: "shutter", motion: { amplitude: 24, frequency: 0.3 } }, bottomThorns(214, 24)], featherArc([[72, 112], [142, 88], [228, 62]]), [], ANY, ANY, "bells"),
  chunk("midnight-finale", 3, 280, [bottomThorns(46, 22, 23), topThorns(102, 22, 23), bottomThorns(160, 22, 23), topThorns(218, 22, 23)], featherArc([[64, 60], [120, 120], [178, 60], [236, 120]]), [], ANY, ANY, "eggs"),
] as const;

export function chunksForChapter(chapter: number): ChunkDefinition[] {
  return CHUNKS.filter((candidate) => candidate.chapter === chapter);
}

export function envelopesCompatible(a: Envelope, b: Envelope): boolean {
  const surfacesMatch = a.surface === "any" || b.surface === "any" || a.surface === b.surface;
  return surfacesMatch && Math.min(a.maxAbsVelocity, b.maxAbsVelocity) >= 80;
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
