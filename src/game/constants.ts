export const VIEW_WIDTH = 320;
export const VIEW_HEIGHT = 180;
export const PLAY_TOP = 16;
export const PLAY_BOTTOM = 164;
export const PLAYER_X = 90;
export const PLAYER_MIN_X = 10;
export const PLAYER_RECOVERY_SPEED = 52;
export const PLAYER_WIDTH = 14;
export const PLAYER_HEIGHT = 12;
export const HITBOX_INSET = 2;
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

export const CHAPTERS = [
  { id: 0, name: "NURSERY WORKS", speed: 80, at: 0, shade: 0x25304a },
  { id: 1, name: "CLOCKWORK ROOST", speed: 88, at: 10, shade: 0x253b45 },
  { id: 2, name: "CROOKED GALLERY", speed: 96, at: 25, shade: 0x332b49 },
  { id: 3, name: "MIDNIGHT COOP", speed: 104, at: 45, shade: 0x20243d },
] as const;

export function chapterForGates(gates: number): number {
  if (gates >= 45) return 3;
  if (gates >= 25) return 2;
  if (gates >= 10) return 1;
  return 0;
}
