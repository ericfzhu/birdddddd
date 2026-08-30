import { MAX_VIEW_HEIGHT, MAX_VIEW_WIDTH, VIEW_HEIGHT, VIEW_WIDTH } from "./game/constants";

export interface LogicalViewportSize {
  width: number;
  height: number;
}

/**
 * Preserve the authored 320x180 playfield while revealing extra space on the
 * unconstrained axis: horizontally on wide screens and vertically on squarer
 * screens. Expansion is bounded so gameplay remains readable.
 */
export function logicalViewportWidth(physicalWidth: number, physicalHeight: number): number {
  return logicalViewportSize(physicalWidth, physicalHeight).width;
}

export function logicalViewportSize(physicalWidth: number, physicalHeight: number): LogicalViewportSize {
  if (!Number.isFinite(physicalWidth) || !Number.isFinite(physicalHeight) || physicalHeight <= 0) {
    return { width: VIEW_WIDTH, height: VIEW_HEIGHT };
  }
  const physicalAspect = physicalWidth / physicalHeight;
  const baseAspect = VIEW_WIDTH / VIEW_HEIGHT;
  if (physicalAspect >= baseAspect) {
    const proportionalWidth = Math.round((VIEW_HEIGHT * physicalAspect) / 2) * 2;
    return {
      width: Math.max(VIEW_WIDTH, Math.min(MAX_VIEW_WIDTH, proportionalWidth)),
      height: VIEW_HEIGHT,
    };
  }
  const proportionalHeight = Math.round((VIEW_WIDTH / physicalAspect) / 2) * 2;
  return {
    width: VIEW_WIDTH,
    height: Math.max(VIEW_HEIGHT, Math.min(MAX_VIEW_HEIGHT, proportionalHeight)),
  };
}

export function viewportAspect(viewport: LogicalViewportSize): string {
  return String(viewport.width / viewport.height);
}
