export interface DangerOutlineDisplaySize {
  width: number;
  height: number;
  originX: number;
  originY: number;
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
