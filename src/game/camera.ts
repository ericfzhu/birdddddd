import type { GameMode } from "./types";

export const CAMERA_DEAD_ZONE_TOP = 76;
export const CAMERA_DEAD_ZONE_BOTTOM = 104;

export function cameraTargetY(currentOffset: number, playerWorldY: number, mode: GameMode): number {
  if (mode === "ready") return 0;
  const playerScreenY = playerWorldY + currentOffset;
  if (playerScreenY < CAMERA_DEAD_ZONE_TOP) return CAMERA_DEAD_ZONE_TOP - playerWorldY;
  if (playerScreenY > CAMERA_DEAD_ZONE_BOTTOM) return CAMERA_DEAD_ZONE_BOTTOM - playerWorldY;
  return currentOffset;
}

export function trackCameraY(currentOffset: number, targetOffset: number, deltaSeconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return targetOffset;
  const blend = 1 - Math.exp(-Math.max(0, deltaSeconds) * 32);
  const next = currentOffset + (targetOffset - currentOffset) * blend;
  return Math.abs(next - targetOffset) < 0.01 ? targetOffset : next;
}
