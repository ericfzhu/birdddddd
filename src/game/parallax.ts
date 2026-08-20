export interface ParallaxCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayeredParallaxState {
  far: ParallaxCrop;
  mid: ParallaxCrop;
  near: ParallaxCrop;
}

interface ParallaxRates {
  farX: number;
  farY: number;
  midX: number;
  midY: number;
  nearX: number;
  nearY: number;
}

export type VerdantParallaxState = LayeredParallaxState;

export const PARALLAX_BIOME_SLUGS = [
  "forest",
  "underground-jungle",
  "desert",
  "marble-cave",
  "violet",
  "underground-corruption",
  "abandoned-minecart",
  "ashen",
  "underworld",
] as const;

const PARALLAX_RATES: readonly ParallaxRates[] = [
  { farX: 0.025, farY: 0.1, midX: 0.05, midY: 0.16, nearX: 0.075, nearY: 0.22 },
  { farX: 0.014, farY: 0.07, midX: 0.038, midY: 0.13, nearX: 0.07, nearY: 0.22 },
  { farX: 0.018, farY: 0.08, midX: 0.045, midY: 0.14, nearX: 0.08, nearY: 0.22 },
  { farX: 0.012, farY: 0.06, midX: 0.032, midY: 0.11, nearX: 0.064, nearY: 0.18 },
  { farX: 0.016, farY: 0.08, midX: 0.042, midY: 0.14, nearX: 0.074, nearY: 0.22 },
  { farX: 0.014, farY: 0.07, midX: 0.038, midY: 0.13, nearX: 0.07, nearY: 0.21 },
  { farX: 0.012, farY: 0.05, midX: 0.036, midY: 0.11, nearX: 0.068, nearY: 0.18 },
  { farX: 0.014, farY: 0.07, midX: 0.04, midY: 0.13, nearX: 0.074, nearY: 0.21 },
  { farX: 0.01, farY: 0.05, midX: 0.034, midY: 0.1, nearX: 0.066, nearY: 0.18 },
] as const;

const crop = (
  distance: number,
  cameraOffsetY: number,
  motionScale: number,
  width: number,
  height: number,
  horizontalRate: number,
  verticalRate: number,
): ParallaxCrop => ({
  x: Math.round(Math.min(512 - width, Math.max(0, distance * horizontalRate * motionScale))),
  y: Math.round(Math.min(288 - height, Math.max(0, (288 - height) / 2 - cameraOffsetY * verticalRate * motionScale))),
  width,
  height,
});

/** Crop windows for the authored far, midground, and near plates of any biome. */
export function biomeParallaxState(
  chapter: number,
  distance: number,
  cameraOffsetY: number,
  reducedMotion: boolean,
): LayeredParallaxState {
  const rates = PARALLAX_RATES[chapter] ?? PARALLAX_RATES[0]!;
  const motionScale = reducedMotion ? 0.35 : 1;
  return {
    far: crop(distance, cameraOffsetY, motionScale, 448, 252, rates.farX, rates.farY),
    mid: crop(distance, cameraOffsetY, motionScale, 416, 234, rates.midX, rates.midY),
    near: crop(distance, cameraOffsetY, motionScale, 384, 216, rates.nearX, rates.nearY),
  };
}

/** Backwards-compatible named helpers used by focused movement tests. */
export function verdantParallaxState(distance: number, cameraOffsetY: number, reducedMotion: boolean): VerdantParallaxState {
  return biomeParallaxState(0, distance, cameraOffsetY, reducedMotion);
}

export function desertParallaxState(distance: number, cameraOffsetY: number, reducedMotion: boolean): LayeredParallaxState {
  return biomeParallaxState(2, distance, cameraOffsetY, reducedMotion);
}
