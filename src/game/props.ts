export interface PropArtMetrics {
  sourceWidth: number;
  sourceHeight: number;
  alphaLeft: number;
  alphaRight: number;
  alphaBottom: number;
  maxSize: number;
}

const DEFAULT_PROP: PropArtMetrics = {
  sourceWidth: 128,
  sourceHeight: 128,
  alphaLeft: 0,
  alphaRight: 128,
  alphaBottom: 128,
  maxSize: 45,
};

/** Runtime image dimensions and measured non-transparent bounds. */
export const PROP_ART: readonly PropArtMetrics[] = [
  { ...DEFAULT_PROP, maxSize: 52 },
  { sourceWidth: 128, sourceHeight: 85, alphaLeft: 15, alphaRight: 112, alphaBottom: 85, maxSize: 50 },
  { sourceWidth: 128, sourceHeight: 83, alphaLeft: 0, alphaRight: 128, alphaBottom: 82, maxSize: 50 },
  { ...DEFAULT_PROP, alphaLeft: 8, alphaRight: 121, maxSize: 45 },
  { sourceWidth: 122, sourceHeight: 128, alphaLeft: 0, alphaRight: 102, alphaBottom: 122, maxSize: 48 },
  { ...DEFAULT_PROP, maxSize: 48 },
  { sourceWidth: 128, sourceHeight: 128, alphaLeft: 17, alphaRight: 112, alphaBottom: 117, maxSize: 48 },
  { sourceWidth: 128, sourceHeight: 85, alphaLeft: 12, alphaRight: 117, alphaBottom: 80, maxSize: 54 },
  { ...DEFAULT_PROP, maxSize: 45 },
  { sourceWidth: 128, sourceHeight: 117, alphaLeft: 0, alphaRight: 123, alphaBottom: 117, maxSize: 50 },
] as const;

export interface PropLayout {
  displayWidth: number;
  displayHeight: number;
  originY: number;
  visibleLeft: number;
  visibleRight: number;
}

export interface PropGroundPlacement {
  y: number;
  rotation: number;
}

export function propLayout(chapter: number): PropLayout {
  const art = PROP_ART[chapter] ?? DEFAULT_PROP;
  const scale = art.maxSize / Math.max(art.sourceWidth, art.sourceHeight);
  const displayWidth = art.sourceWidth * scale;
  return {
    displayWidth,
    displayHeight: art.sourceHeight * scale,
    originY: art.alphaBottom / art.sourceHeight,
    visibleLeft: -displayWidth / 2 + art.alphaLeft * scale,
    visibleRight: -displayWidth / 2 + art.alphaRight * scale,
  };
}

/**
 * Fits the measured visible base of a prop to the local floor. Wide scenery
 * rotates with a slope instead of sinking its uphill side to meet the lowest
 * point, then lifts just enough to clear any curvature inside its footprint.
 */
export function propGroundPlacement(
  layout: PropLayout,
  floorAt: (relativeX: number) => number | undefined,
  sampleCount = 8,
): PropGroundPlacement | undefined {
  const leftFloor = floorAt(layout.visibleLeft);
  const rightFloor = floorAt(layout.visibleRight);
  if (leftFloor === undefined || rightFloor === undefined) return undefined;

  const footprintWidth = Math.max(0.001, layout.visibleRight - layout.visibleLeft);
  const rawRotation = Math.atan2(rightFloor - leftFloor, footprintWidth);
  const rotation = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, rawRotation));
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  let anchorY = Infinity;

  for (let index = 0; index <= sampleCount; index += 1) {
    const localX = layout.visibleLeft + footprintWidth * (index / sampleCount);
    const floor = floorAt(localX * cosine);
    if (floor === undefined) continue;
    anchorY = Math.min(anchorY, floor - localX * sine);
  }

  if (!Number.isFinite(anchorY)) return undefined;
  return { y: anchorY + 1, rotation };
}

/**
 * Fits a prop at its immutable world anchor, independent of the camera and the
 * visible contour cache. This lets offscreen props enter with their final
 * height and rotation already resolved.
 */
export function propGroundPlacementAtWorldX(
  layout: PropLayout,
  anchorWorldX: number,
  floorAtWorldX: (worldX: number) => number | undefined,
  sampleCount = 8,
): PropGroundPlacement | undefined {
  return propGroundPlacement(
    layout,
    (relativeX) => floorAtWorldX(anchorWorldX + relativeX),
    sampleCount,
  );
}
