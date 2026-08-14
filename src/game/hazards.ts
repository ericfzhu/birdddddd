export interface SpikePointLayout {
  offset: number;
  width: number;
}

export const TERRAIN_SPIKE_POINT_WIDTH = 6;

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
