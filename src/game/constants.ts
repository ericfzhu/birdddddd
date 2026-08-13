export const VIEW_WIDTH = 320;
export const VIEW_HEIGHT = 180;
export const PLAY_TOP = 16;
export const PLAY_BOTTOM = 164;
export const PLAYER_X = 90;
export const PLAYER_MIN_X = 10;
export const PLAYER_WIDTH = 14;
export const PLAYER_HEIGHT = 12;
export const HITBOX_INSET = 2;
export const TERRAIN_SPIKE_MIN_SCALE = 0.7;
export const GRAVITY_ACCELERATION = 420;
export const MAX_VERTICAL_SPEED = 155;
export const FLIP_DEBOUNCE_SECONDS = 0.08;
export const RESTART_DELAY_SECONDS = 0.32;
export const FIXED_STEP_SECONDS = 1 / 60;

export const COLORS = {
  ink: 0x17182b,
  cream: 0xf6e7c1,
  teal: 0x4e9b91,
  yolk: 0xf2b544,
  coral: 0xef5b62,
  shadow: 0x242743,
  white: 0xfff9e9,
} as const;

export const BIOMES = [
  {
    sky: 0x6d9fbd,
    far: 0x436d73,
    terrain: 0x503522,
    terrainDark: 0x30261f,
    surface: 0x6fa545,
    accent: 0xa9d35f,
    danger: 0xb94b54,
    glow: 0xf6d77a,
  },
  {
    sky: 0x102d2d,
    far: 0x18504a,
    terrain: 0x3b3521,
    terrainDark: 0x201f18,
    surface: 0x6f8f3e,
    accent: 0x59c6a8,
    danger: 0xd4535d,
    glow: 0xf0bd58,
  },
  {
    sky: 0xd99b5d,
    far: 0xb56b43,
    terrain: 0x8b5836,
    terrainDark: 0x593b31,
    surface: 0xe0b45f,
    accent: 0xf4da91,
    danger: 0x9e3f4e,
    glow: 0xffe09b,
  },
  {
    sky: 0x172a4b,
    far: 0x294d78,
    terrain: 0xd3c8ad,
    terrainDark: 0x5a6680,
    surface: 0xf3e8ca,
    accent: 0x638fd5,
    danger: 0xc64c5d,
    glow: 0xf3c75b,
  },
  {
    sky: 0x281b43,
    far: 0x41285f,
    terrain: 0x33243e,
    terrainDark: 0x211a31,
    surface: 0x8951ad,
    accent: 0xd37be4,
    danger: 0xf06fa7,
    glow: 0xf3b6f0,
  },
  {
    sky: 0x11162f,
    far: 0x173d59,
    terrain: 0x242442,
    terrainDark: 0x111426,
    surface: 0x2f7290,
    accent: 0x43d1c7,
    danger: 0xd85767,
    glow: 0x78f0da,
  },
  {
    sky: 0x17191b,
    far: 0x2f332f,
    terrain: 0x353330,
    terrainDark: 0x1d1d1c,
    surface: 0x765038,
    accent: 0xc77b36,
    danger: 0xe45458,
    glow: 0xf2b544,
  },
  {
    sky: 0x1b151d,
    far: 0x3e1d25,
    terrain: 0x2d272c,
    terrainDark: 0x17151a,
    surface: 0x74505a,
    accent: 0xef663f,
    danger: 0xff9c38,
    glow: 0xffc65b,
  },
  {
    sky: 0x26080d,
    far: 0x681217,
    terrain: 0x291a25,
    terrainDark: 0x100d14,
    surface: 0xb42925,
    accent: 0xf05123,
    danger: 0xffb128,
    glow: 0xffdc5c,
  },
] as const;

export const CHAPTERS = [
  { id: 0, name: "VERDANT WILDS", speed: 80, at: 0, shade: BIOMES[0].sky },
  { id: 1, name: "UNDERGROUND JUNGLE", speed: 84, at: 8, shade: BIOMES[1].sky },
  { id: 2, name: "SUNKEN DUNES", speed: 88, at: 18, shade: BIOMES[2].sky },
  { id: 3, name: "MARBLE CAVE", speed: 92, at: 30, shade: BIOMES[3].sky },
  { id: 4, name: "VIOLET CHASM", speed: 96, at: 44, shade: BIOMES[4].sky },
  { id: 5, name: "UNDERGROUND CORRUPTION", speed: 99, at: 60, shade: BIOMES[5].sky },
  { id: 6, name: "ABANDONED MINECART", speed: 101, at: 78, shade: BIOMES[6].sky },
  { id: 7, name: "ASHEN DEPTHS", speed: 104, at: 98, shade: BIOMES[7].sky },
  { id: 8, name: "UNDERWORLD", speed: 104, at: 120, shade: BIOMES[8].sky },
] as const;

export function chapterForGates(gates: number): number {
  for (let index = CHAPTERS.length - 1; index >= 0; index -= 1) {
    if (gates >= (CHAPTERS[index]?.at ?? 0)) return index;
  }
  return CHAPTERS[0].id;
}
