import { CHAPTERS, MAX_VERTICAL_SPEED, PLAY_BOTTOM, PLAY_TOP } from "./constants";
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

const vine = (x: number, height = 42, phase = 0): HazardSpec => ({
  x, y: PLAY_TOP, w: 10, h: height, kind: "vine", attachment: "ceiling",
  motion: { amplitude: 12, frequency: 0.24, phase, axis: "x" },
});

const sandJet = (x: number, ceiling = false, phase = 0): HazardSpec => ({
  x, y: ceiling ? PLAY_TOP : PLAY_BOTTOM - 42, w: 12, h: 42, kind: "sandJet",
  attachment: ceiling ? "ceiling" : "floor", flipY: ceiling,
  cycle: { period: 1.8, activeRatio: 0.46, phase },
});

const crusher = (x: number, y: number, phase = 0): HazardSpec => ({
  x, y, w: 22, h: 42, kind: "crusher", attachment: "floating",
  motion: { amplitude: 34, frequency: 0.3, phase },
});

const crystal = (x: number, y: number, size = 20, motion?: HazardSpec["motion"]): HazardSpec => ({
  x, y, w: size, h: size, kind: "crystal", attachment: "floating", motion,
});

const spore = (x: number, y: number, phase = 0): HazardSpec => ({
  x, y, w: 18, h: 18, kind: "spore", attachment: "floating",
  motion: { amplitude: 28, frequency: 0.22, phase },
});

const minecart = (x: number, phase = 0): HazardSpec => ({
  x, y: PLAY_BOTTOM - 20, w: 34, h: 20, kind: "cart", attachment: "floor",
  motion: { amplitude: 32, frequency: 0.32, phase, axis: "x" },
});

const mushroomWalker = (x: number, phase = 0): HazardSpec => ({
  x, y: PLAY_BOTTOM - 16, w: 18, h: 16, kind: "walker", attachment: "floor",
  motion: { amplitude: 20, frequency: 0.2, phase, axis: "x" },
});

const wingedShell = (x: number, y: number, phase = 0): HazardSpec => ({
  x, y, w: 22, h: 16, kind: "wingedShell", attachment: "floating",
  motion: { amplitude: 22, frequency: 0.26, phase, axis: "y" },
});

const ember = (x: number, y: number, phase = 0): HazardSpec => ({
  x, y, w: 15, h: 15, kind: "ember", attachment: "floating",
  motion: { amplitude: 25, frequency: 0.33, phase },
});

const flameVent = (x: number, ceiling = false, phase = 0): HazardSpec => ({
  x, y: ceiling ? PLAY_TOP : PLAY_BOTTOM - 48, w: 14, h: 48, kind: "flame",
  attachment: ceiling ? "ceiling" : "floor", flipY: ceiling,
  cycle: { period: 1.55, activeRatio: 0.52, phase },
});

const perch = (x: number, y: number, w: number): SolidSpec => ({ x, y, w, h: 6, detail: "perch" });

const cagePillar = (x: number, y: number, h: number): SolidSpec => ({ x, y, w: 6, h, detail: "cage" });

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
  decoration: ChunkDefinition["decoration"] = "forest",
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

const PRE_MUSHROOM_CHUNKS: readonly ChunkDefinition[] = [
  // Verdant Wilds — wide, readable single decisions.
  chunk("nursery-low", 0, 210, [floorBarbs(72, 34, 20)], [{ x: 90, y: 72 }]),
  chunk("nursery-high", 0, 210, [ceilingBarbs(76, 36, 20)], [{ x: 94, y: 110 }]),
  withTunnel(chunk("nursery-sway", 0, 230, [bottomThorns(58, 26), topThorns(152, 28)], featherArc([[76, 70], [116, 90], [164, 110]])), tunnelDip(230, 25)),
  chunk("nursery-gate", 0, 220, [], [{ x: 110, y: 90 }], [cagePillar(108, PLAY_TOP, 48), cagePillar(108, 120, PLAY_BOTTOM - 120)]),
  chunk("nursery-perch", 0, 230, [bottomThorns(146, 32)], [{ x: 92, y: 77 }], [perch(66, 105, 48)]),
  withTunnel(chunk("nursery-rungs", 0, 240, [ceilingBarbs(54, 24, 21), floorBarbs(138, 28, 21)], featherArc([[72, 112], [108, 90], [154, 68]])), tunnelDip(240, -25)),

  // Underground Jungle — wet roots, hanging growth, and broad tunnel sweeps.
  withTunnel(chunk("jungle-rootfall", 1, 240, [ceilingBarbs(62, 28, 22), floorBarbs(166, 26, 22)], featherArc([[78, 112], [126, 88], [184, 62]]), [], ANY, ANY, "jungle"), tunnelDip(240, 29)),
  chunk("jungle-fireflies", 1, 230, [vine(126, 46, 0.25)], featherArc([[72, 58], [126, 92], [184, 118]]), [], ANY, ANY, "jungle"),
  chunk("jungle-root-gate", 1, 230, [bottomThorns(176, 24, 20)], [{ x: 118, y: 90 }], [cagePillar(106, PLAY_TOP, 50), cagePillar(106, 116, PLAY_BOTTOM - 116)], ANY, BOTTOM, "jungle"),
  withTunnel(chunk("jungle-undertow", 1, 250, [floorBarbs(54, 24, 22), ceilingBarbs(186, 26, 22)], featherArc([[76, 62], [128, 90], [202, 116]]), [], ANY, ANY, "jungle"), tunnelWave(250, 28, -22)),
  chunk("jungle-canopy", 1, 240, [vine(176, 50, 0.6)], featherArc([[68, 116], [116, 94], [168, 70]]), [perch(78, 118, 42), perch(132, 66, 38)], ANY, TOP, "jungle"),
  withTunnel(chunk("jungle-thicket", 1, 260, [topThorns(54, 22, 22), bottomThorns(122, 24, 22), topThorns(202, 24, 22)], featherArc([[70, 116], [140, 62], [218, 112]]), [], ANY, ANY, "jungle"), tunnelDip(260, -32)),

  // Sunken Dunes — alternating decisions and reward arcs.
  chunk("clock-low-high", 2, 230, [floorBarbs(46, 32), ceilingBarbs(142, 34)], featherArc([[64, 62], [106, 90], [160, 118]]), [], BOTTOM, TOP, "desert"),
  chunk("clock-high-low", 2, 230, [ceilingBarbs(48, 32), floorBarbs(144, 34)], featherArc([[64, 118], [108, 88], [162, 62]]), [], TOP, BOTTOM, "desert"),
  chunk("clock-eye", 2, 220, [sandJet(166, false, 0.2)], [{ x: 106, y: 86 }], [cagePillar(102, PLAY_TOP, 55), cagePillar(102, 113, PLAY_BOTTOM - 113)], ANY, BOTTOM, "desert"),
  withTunnel(chunk("clock-steps", 2, 250, [bottomThorns(50, 22), topThorns(116, 22), bottomThorns(186, 24)], featherArc([[66, 58], [132, 120], [202, 60]]), [], ANY, ANY, "desert"), tunnelDip(250, 31)),
  chunk("clock-perches", 2, 240, [sandJet(168, true, 0.55), spinner(202, 104, 17)], featherArc([[78, 116], [118, 95], [174, 70]]), [perch(62, 120, 40), perch(116, 72, 42)], ANY, TOP, "desert"),
  withTunnel(chunk("clock-teeth", 2, 240, [topThorns(66, 24, 21), bottomThorns(125, 24, 21), topThorns(184, 24, 21)], featherArc([[86, 116], [145, 64], [204, 116]]), [], ANY, ANY, "desert"), tunnelDip(240, -31)),

  // Marble Cave — columns, clean arches, and precise alternating lanes.
  chunk("marble-portico", 3, 240, [floorBarbs(180, 26, 24)], featherArc([[76, 62], [124, 88], [188, 116]]), [cagePillar(92, PLAY_TOP, 56), cagePillar(152, 108, PLAY_BOTTOM - 108)], ANY, ANY, "marble"),
  withTunnel(chunk("marble-vault", 3, 250, [ceilingBarbs(74, 26, 23), floorBarbs(190, 28, 23)], featherArc([[92, 116], [142, 90], [204, 62]]), [], ANY, ANY, "marble"), tunnelDip(250, -34)),
  chunk("marble-pools", 3, 240, [crusher(126, 66, 0.2)], featherArc([[70, 62], [128, 112], [190, 64]]), [perch(70, 116, 38), perch(164, 62, 38)], ANY, ANY, "marble"),
  chunk("marble-colonnade", 3, 260, [topThorns(206, 24, 22)], featherArc([[82, 116], [144, 62], [220, 112]]), [cagePillar(70, PLAY_TOP, 54), cagePillar(134, 110, PLAY_BOTTOM - 110), cagePillar(198, PLAY_TOP, 52)], ANY, ANY, "marble"),
  withTunnel(chunk("marble-cascade", 3, 260, [floorBarbs(62, 24, 22), ceilingBarbs(198, 24, 22)], featherArc([[80, 62], [142, 92], [214, 116]]), [], ANY, ANY, "marble"), tunnelWave(260, 30, -30)),
  chunk("marble-oculus", 3, 250, [crusher(110, 65, 0.65), bottomThorns(204, 26, 22)], featherArc([[72, 116], [150, 88], [220, 60]]), [], ANY, ANY, "marble"),

  // Violet Chasm — moving crystal columns and delayed reversals.
  chunk("crooked-shutter-a", 4, 240, [{ x: 106, y: 26, w: 10, h: 58, kind: "shutter", attachment: "floating", motion: { amplitude: 16, frequency: 0.35 } }, floorBarbs(178, 28)], [{ x: 110, y: 120 }], [], ANY, BOTTOM, "blight"),
  chunk("crooked-shutter-b", 4, 240, [{ x: 112, y: 96, w: 10, h: 58, kind: "shutter", attachment: "floating", motion: { amplitude: 15, frequency: 0.38, phase: 0.5 } }, ceilingBarbs(182, 28)], [{ x: 116, y: 58 }], [], ANY, TOP, "blight"),
  withTunnel(chunk("crooked-scissors", 4, 250, [topThorns(204, 24)], featherArc([[90, 100], [154, 78], [214, 118]]), [cagePillar(82, PLAY_TOP, 58), cagePillar(148, 106, PLAY_BOTTOM - 106)], ANY, ANY, "blight"), tunnelDip(250, 37)),
  withTunnel(chunk("crooked-islands", 4, 250, [bottomThorns(58, 24), topThorns(190, 24)], featherArc([[92, 74], [128, 92], [172, 112]]), [perch(94, 116, 34), perch(144, 58, 34)], ANY, ANY, "blight"), tunnelDip(250, -37)),
  chunk("crooked-pendulum", 4, 260, [crystal(116, 80, 20, { amplitude: 28, frequency: 0.28, phase: 0.25 }), floorBarbs(204, 28)], featherArc([[72, 60], [150, 90], [218, 58]]), [], TOP, BOTTOM, "blight"),
  chunk("crooked-comb", 4, 250, [topThorns(50, 20, 25), bottomThorns(104, 20, 25), topThorns(158, 20, 25), bottomThorns(212, 20, 25)], featherArc([[66, 116], [120, 62], [174, 116]]), [], ANY, ANY, "blight"),

  // Underground Corruption — fossil roots and drifting toxic mechanisms.
  chunk("corruption-ribs", 5, 250, [ceilingBarbs(62, 30, 25), floorBarbs(186, 30, 25)], featherArc([[82, 116], [136, 88], [204, 62]]), [], ANY, ANY, "corruption"),
  withTunnel(chunk("corruption-fissure", 5, 260, [bottomThorns(58, 26, 23), topThorns(198, 28, 23)], featherArc([[80, 60], [144, 92], [214, 118]]), [], ANY, ANY, "corruption"), tunnelDip(260, 38)),
  chunk("corruption-orbit", 5, 260, [spore(112, 76, 0.1), spore(202, 92, 0.65)], featherArc([[70, 116], [150, 62], [220, 116]]), [], ANY, ANY, "corruption"),
  chunk("corruption-cage", 5, 250, [floorBarbs(204, 26, 23)], [{ x: 138, y: 88 }], [cagePillar(92, PLAY_TOP, 58), cagePillar(160, 104, PLAY_BOTTOM - 104)], ANY, ANY, "corruption"),
  withTunnel(chunk("corruption-sinew", 5, 270, [topThorns(56, 22, 24), bottomThorns(128, 24, 24), topThorns(214, 24, 24)], featherArc([[74, 116], [146, 62], [230, 112]]), [], ANY, ANY, "corruption"), tunnelWave(270, -36, 34)),
  chunk("corruption-needle", 5, 250, [{ x: 122, y: 28, w: 10, h: 54, kind: "shutter", attachment: "floating", motion: { amplitude: 21, frequency: 0.39 } }, ceilingBarbs(202, 26, 24)], featherArc([[76, 116], [144, 90], [216, 62]]), [], ANY, ANY, "corruption"),

  // Abandoned Minecart — timber gates, signals, rails, and compact timing windows.
  chunk("minecart-signal", 6, 250, [spinner(178, 70, 18)], featherArc([[72, 116], [132, 88], [196, 60]]), [cagePillar(102, PLAY_TOP, 54), cagePillar(102, 114, PLAY_BOTTOM - 114)], ANY, ANY, "minecart"),
  withTunnel(chunk("minecart-grade", 6, 270, [floorBarbs(62, 28, 24), ceilingBarbs(210, 28, 24)], featherArc([[80, 62], [148, 92], [224, 116]]), [], ANY, ANY, "minecart"), tunnelDip(270, 40)),
  chunk("minecart-braces", 6, 260, [topThorns(212, 26, 24)], featherArc([[82, 116], [146, 62], [222, 110]]), [cagePillar(74, PLAY_TOP, 55), cagePillar(138, 109, PLAY_BOTTOM - 109), cagePillar(202, PLAY_TOP, 56)], ANY, ANY, "minecart"),
  chunk("minecart-switch", 6, 260, [minecart(110, 0.15), bottomThorns(212, 26, 24)], featherArc([[72, 60], [154, 92], [226, 60]]), [], ANY, ANY, "minecart"),
  withTunnel(chunk("minecart-broken-rail", 6, 270, [ceilingBarbs(54, 24, 24), floorBarbs(142, 26, 24), ceilingBarbs(226, 24, 24)], featherArc([[72, 116], [160, 62], [240, 112]]), [], ANY, ANY, "minecart"), tunnelDip(270, -40)),
  chunk("minecart-lift", 6, 260, [{ x: 104, y: 30, w: 10, h: 56, kind: "shutter", attachment: "floating", motion: { amplitude: 20, frequency: 0.44 } }, { x: 194, y: 94, w: 10, h: 56, kind: "shutter", attachment: "floating", motion: { amplitude: 18, frequency: 0.41, phase: 0.5 } }], featherArc([[120, 116], [158, 90], [210, 62]]), [], ANY, ANY, "minecart"),

  // Ashen Depths — expert combinations, still solver-safe.
  chunk("midnight-needle", 7, 250, [ember(166, 63, 0.2)], featherArc([[84, 105], [152, 70], [218, 108]]), [cagePillar(74, PLAY_TOP, 62), cagePillar(142, 102, PLAY_BOTTOM - 102), cagePillar(208, PLAY_TOP, 60)], ANY, ANY, "depths"),
  chunk("midnight-crank", 7, 260, [{ x: 92, y: 28, w: 10, h: 54, kind: "shutter", attachment: "floating", motion: { amplitude: 18, frequency: 0.42 } }, spinner(181, 80, 20, { amplitude: 28, frequency: 0.36, phase: 0.5 })], featherArc([[106, 118], [150, 90], [212, 62]]), [], ANY, ANY, "depths"),
  withTunnel(chunk("midnight-nests", 7, 270, [floorBarbs(54, 26), ceilingBarbs(214, 28)], featherArc([[90, 64], [142, 92], [204, 116]]), [perch(96, 116, 38), perch(156, 58, 38)], ANY, ANY, "depths"), tunnelDip(270, 43)),
  chunk("midnight-beaks", 7, 260, [{ x: 66, y: PLAY_TOP, w: 20, h: 28, kind: "beak", flipY: true }, { x: 138, y: 136, w: 20, h: 28, kind: "beak" }, { x: 210, y: PLAY_TOP, w: 20, h: 28, kind: "beak", flipY: true }], featherArc([[84, 118], [156, 62], [226, 116]]), [], ANY, ANY, "depths"),
  withTunnel(chunk("midnight-belfry", 7, 270, [ceilingBarbs(52, 22), ember(122, 78, 0.55), floorBarbs(214, 24)], featherArc([[72, 112], [158, 88], [228, 62]]), [], ANY, ANY, "depths"), tunnelDip(270, -43)),
  withTunnel(chunk("midnight-finale", 7, 280, [floorBarbs(46, 22, 23), ceilingBarbs(102, 22, 23), floorBarbs(160, 22, 23), ceilingBarbs(218, 22, 23)], featherArc([[64, 60], [120, 120], [178, 60], [236, 120]]), [], ANY, ANY, "depths"), tunnelWave(280, -32, 30)),

  // Underworld — the final lava kingdom, with the full mechanic set at top speed.
  chunk("underworld-forge", 8, 270, [flameVent(108, true, 0.1), floorBarbs(214, 28, 26)], featherArc([[76, 116], [150, 90], [228, 60]]), [], ANY, ANY, "underworld"),
  withTunnel(chunk("underworld-lavafall", 8, 280, [ceilingBarbs(58, 26, 26), spinner(148, 82, 20, { amplitude: 32, frequency: 0.38 }), floorBarbs(230, 26, 26)], featherArc([[76, 112], [164, 62], [244, 112]]), [], ANY, ANY, "underworld"), tunnelDip(280, 44)),
  chunk("underworld-chains", 8, 270, [flameVent(92, false, 0.15), flameVent(190, true, 0.62)], featherArc([[74, 116], [138, 88], [214, 60]]), [], ANY, ANY, "underworld"),
  chunk("underworld-citadel", 8, 280, [topThorns(242, 26, 26)], featherArc([[82, 116], [152, 62], [230, 112]]), [cagePillar(72, PLAY_TOP, 60), cagePillar(142, 100, PLAY_BOTTOM - 100), cagePillar(212, PLAY_TOP, 60)], ANY, ANY, "underworld"),
  withTunnel(chunk("underworld-crucible", 8, 290, [floorBarbs(52, 24, 26), ceilingBarbs(112, 24, 26), floorBarbs(178, 24, 26), ceilingBarbs(242, 24, 26)], featherArc([[68, 60], [130, 118], [194, 60], [258, 116]]), [], ANY, ANY, "underworld"), tunnelWave(290, -40, 39)),
  chunk("underworld-throne", 8, 280, [{ x: 88, y: 30, w: 10, h: 54, kind: "shutter", attachment: "floating", motion: { amplitude: 18, frequency: 0.46 } }, spinner(174, 78, 20, { amplitude: 31, frequency: 0.4 }), { x: 238, y: 96, w: 10, h: 54, kind: "shutter", attachment: "floating", motion: { amplitude: 18, frequency: 0.43, phase: 0.5 } }], featherArc([[104, 118], [154, 90], [212, 60]]), [], ANY, ANY, "underworld"),
] as const;

const MUSHROOM_CHUNKS: readonly ChunkDefinition[] = [
  chunk("mushroom-pipe-gates", 2, 240, [wingedShell(146, 70, 0.12), floorBarbs(194, 28, 22)], featherArc([[74, 62], [126, 104], [202, 116]]), [cagePillar(104, PLAY_TOP, 52), cagePillar(104, 114, PLAY_BOTTOM - 114)], ANY, ANY, "mushroom"),
  chunk("mushroom-brick-hop", 2, 240, [ceilingBarbs(188, 28, 22)], featherArc([[72, 116], [126, 92], [190, 62]]), [perch(64, 118, 42), perch(128, 66, 42)], ANY, TOP, "mushroom"),
  withTunnel(chunk("mushroom-green-hills", 2, 250, [bottomThorns(62, 26, 21), topThorns(194, 26, 21)], featherArc([[80, 62], [142, 92], [210, 116]]), [], ANY, ANY, "mushroom"), tunnelDip(250, 30)),
  withTunnel(chunk("mushroom-block-arc", 2, 250, [topThorns(58, 24, 21), mushroomWalker(132, 0.35), topThorns(198, 24, 21)], featherArc([[74, 116], [144, 62], [214, 114]]), [], ANY, ANY, "mushroom"), tunnelDip(250, -30)),
  chunk("mushroom-castle-road", 2, 250, [floorBarbs(206, 26, 22)], featherArc([[82, 116], [144, 64], [216, 110]]), [cagePillar(72, PLAY_TOP, 54), cagePillar(138, 110, PLAY_BOTTOM - 110), cagePillar(198, PLAY_TOP, 54)], ANY, ANY, "mushroom"),
  withTunnel(chunk("mushroom-warp-way", 2, 260, [ceilingBarbs(54, 24, 22), floorBarbs(138, 26, 22), ceilingBarbs(218, 24, 22)], featherArc([[72, 116], [156, 62], [232, 112]]), [perch(92, 112, 38)], ANY, ANY, "mushroom"), tunnelWave(260, 26, -25)),
] as const;

export const CHUNKS: readonly ChunkDefinition[] = [
  ...PRE_MUSHROOM_CHUNKS.filter((definition) => definition.chapter < 2),
  ...MUSHROOM_CHUNKS,
  ...PRE_MUSHROOM_CHUNKS
    .filter((definition) => definition.chapter >= 2)
    .map((definition) => ({ ...definition, chapter: definition.chapter + 1 })),
];

export const TRANSITION_CHUNKS: readonly ChunkDefinition[] = [
  chunk("passage-verdant-jungle", 1, 190, [], [], [], ANY, ANY, "passage"),
  chunk("passage-jungle-mushroom", 2, 190, [], [], [], ANY, ANY, "passage"),
  chunk("passage-mushroom-dunes", 3, 190, [], [], [], ANY, ANY, "passage"),
  chunk("passage-dunes-marble", 4, 190, [], [], [], ANY, ANY, "passage"),
  chunk("passage-marble-violet", 5, 190, [], [], [], ANY, ANY, "passage"),
  chunk("passage-violet-corruption", 6, 190, [], [], [], ANY, ANY, "passage"),
  chunk("passage-corruption-minecart", 7, 190, [], [], [], ANY, ANY, "passage"),
  chunk("passage-minecart-ashen", 8, 190, [], [], [], ANY, ANY, "passage"),
  chunk("passage-ashen-underworld", 9, 190, [], [], [], ANY, ANY, "passage"),
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
  for (let chapter = 0; chapter < CHAPTERS.length; chapter += 1) {
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
