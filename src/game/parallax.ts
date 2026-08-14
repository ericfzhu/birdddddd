export interface ParallaxCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VerdantParallaxState {
  far: ParallaxCrop;
  mid: ParallaxCrop;
  near: ParallaxCrop;
}

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

/** Crop windows for the three authored Verdant Wilds raster depth plates. */
export function verdantParallaxState(distance: number, cameraOffsetY: number, reducedMotion: boolean): VerdantParallaxState {
  const motionScale = reducedMotion ? 0.35 : 1;
  return {
    far: crop(distance, cameraOffsetY, motionScale, 448, 252, 0.025, 0.1),
    mid: crop(distance, cameraOffsetY, motionScale, 416, 234, 0.05, 0.16),
    near: crop(distance, cameraOffsetY, motionScale, 384, 216, 0.075, 0.22),
  };
}
