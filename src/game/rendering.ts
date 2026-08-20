export interface DangerOutlineDisplaySize {
  width: number;
  height: number;
  originX: number;
  originY: number;
}

export interface WalkerLayerLayout {
  bodyCrop: readonly [x: number, y: number, width: number, height: number];
  leftLegCrop: readonly [x: number, y: number, width: number, height: number];
  rightLegCrop: readonly [x: number, y: number, width: number, height: number];
  leftLegOffset: { x: number; y: number };
  rightLegOffset: { x: number; y: number };
  step: 0 | 1;
}

/**
 * Splits one immutable walker texture into a fixed torso and two independently
 * positioned leg layers. Only the legs move between steps, so the generated
 * character body can never drift or morph during the walk cycle.
 */
export function walkerLayerLayout(
  sourceWidth: number,
  sourceHeight: number,
  simTime: number,
  reducedMotion: boolean,
): WalkerLayerLayout {
  const splitY = Math.round(sourceHeight * 2 / 3);
  const splitX = Math.round(sourceWidth / 2);
  const step = reducedMotion ? 0 : Math.floor(simTime * 8) % 2 as 0 | 1;
  return {
    bodyCrop: [0, 0, sourceWidth, splitY],
    leftLegCrop: [0, splitY, splitX, sourceHeight - splitY],
    rightLegCrop: [splitX, splitY, sourceWidth - splitX, sourceHeight - splitY],
    leftLegOffset: step === 0 ? { x: -1, y: 0 } : { x: 1, y: -1 },
    rightLegOffset: step === 0 ? { x: 1, y: -1 } : { x: -1, y: 0 },
    step,
  };
}

/** One shared scroll sample keeps static terrain and sprites on the same pixel step. */
export function snappedRenderDistance(distance: number): number {
  return Math.round(distance);
}

export function screenXAtRenderDistance(worldX: number, renderDistance: number): number {
  return worldX - renderDistance;
}

/**
 * Scales a padded silhouette so its unpadded center exactly matches the normal
 * sprite. The extra pixels therefore remain a true outline rather than a
 * stretched duplicate of the artwork.
 */
export function dangerOutlineDisplaySize(
  spriteWidth: number,
  spriteHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  sourcePadding: number,
  spriteOriginX: number,
  spriteOriginY: number,
): DangerOutlineDisplaySize {
  return {
    width: spriteWidth * (sourceWidth + sourcePadding * 2) / sourceWidth,
    height: spriteHeight * (sourceHeight + sourcePadding * 2) / sourceHeight,
    originX: (sourcePadding + sourceWidth * spriteOriginX) / (sourceWidth + sourcePadding * 2),
    originY: (sourcePadding + sourceHeight * spriteOriginY) / (sourceHeight + sourcePadding * 2),
  };
}
