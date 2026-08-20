export interface SpikePointLayout {
  offset: number;
  width: number;
}

export const TERRAIN_SPIKE_POINT_WIDTH = 6;

export interface SandJetVisualLayout {
  baseY: number;
  openingY: number;
  originY: 0 | 1;
  flipY: boolean;
}

/**
 * Anchors a sand-jet assembly to the terrain edge it grows from. Ceiling jets
 * must use a top origin before being flipped so their sprites extend into the
 * corridor instead of across the ceiling boundary.
 */
export function sandJetVisualLayout(
  y: number,
  height: number,
  nozzleDepth: number,
  ceiling: boolean,
): SandJetVisualLayout {
  return {
    baseY: ceiling ? y : y + height,
    openingY: ceiling ? y + nozzleDepth : y + height - nozzleDepth,
    originY: ceiling ? 0 : 1,
    flipY: ceiling,
  };
}

/** Rotates an upward-authored spike so its tip follows a terrain inward normal. */
export function spikeRotationForNormal(normalX: number, normalY: number): number {
  return Math.atan2(normalY, normalX) + Math.PI / 2;
}

/**
 * Keeps every point the same width while allowing a hazard cluster to contain
 * three, four, or five individual spikes according to its authored footprint.
 */
export function spikeClusterLayout(clusterWidth: number): SpikePointLayout[] {
  const count = Math.max(1, Math.min(5, Math.floor((clusterWidth + 1) / 7)));
  const occupied = count * TERRAIN_SPIKE_POINT_WIDTH;
  const gap = Math.max(0, (clusterWidth - occupied) / (count + 1));
  return Array.from({ length: count }, (_value, index) => ({
    offset: gap + index * (TERRAIN_SPIKE_POINT_WIDTH + gap),
    width: TERRAIN_SPIKE_POINT_WIDTH,
  }));
}
