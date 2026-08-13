export interface MobileViewportSignals {
  width: number;
  height: number;
  coarsePointer: boolean;
  touchPoints: number;
}

export function isPhoneLikeViewport(signals: MobileViewportSignals): boolean {
  const shortEdge = Math.min(signals.width, signals.height);
  const longEdge = Math.max(signals.width, signals.height);
  const touchCapable = signals.coarsePointer || signals.touchPoints > 0;
  return touchCapable && shortEdge <= 600 && longEdge <= 1200;
}

export function shouldGateForPortrait(signals: MobileViewportSignals): boolean {
  return isPhoneLikeViewport(signals) && signals.height > signals.width;
}
