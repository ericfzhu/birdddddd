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
  { ...DEFAULT_PROP, alphaLeft: 8, alphaRight: 121, maxSize: 45 },
  { sourceWidth: 122, sourceHeight: 128, alphaLeft: 0, alphaRight: 102, alphaBottom: 122, maxSize: 48 },
  { ...DEFAULT_PROP, maxSize: 48 },
  { sourceWidth: 128, sourceHeight: 128, alphaLeft: 17, alphaRight: 112, alphaBottom: 117, maxSize: 48 },
  { sourceWidth: 128, sourceHeight: 85, alphaLeft: 12, alphaRight: 126, alphaBottom: 85, maxSize: 54 },
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
