import { MAX_VIEW_WIDTH, VIEW_HEIGHT, VIEW_WIDTH } from "./game/constants";

/**
 * Keep the authored 180px-tall playfield and reveal extra horizontal space on
 * landscape displays. Narrower displays retain the original 16:9 composition.
 */
export function logicalViewportWidth(physicalWidth: number, physicalHeight: number): number {
  if (!Number.isFinite(physicalWidth) || !Number.isFinite(physicalHeight) || physicalHeight <= 0) {
    return VIEW_WIDTH;
  }
  const proportionalWidth = Math.round((VIEW_HEIGHT * physicalWidth) / physicalHeight / 2) * 2;
  return Math.max(VIEW_WIDTH, Math.min(MAX_VIEW_WIDTH, proportionalWidth));
}

export function viewportAspect(logicalWidth: number): string {
  return String(logicalWidth / VIEW_HEIGHT);
}
