import type { HazardKind } from "./types";

export type InteractiveAssetKind =
  | "platform"
  | "pillar"
  | "thorn"
  | "barb"
  | "crusher"
  | "crystal"
  | "spore"
  | "cart"
  | "ember"
  | "shutter"
  | "beak"
  | "spinner"
  | "flame"
  | "flame-warning"
  | "vine";

export interface InteractiveArtFamily {
  slug: string;
  assets: readonly InteractiveAssetKind[];
  hazards: Partial<Record<HazardKind, InteractiveAssetKind>>;
}

const common = ["platform", "pillar", "thorn", "barb"] as const;

export const INTERACTIVE_ART: readonly InteractiveArtFamily[] = [
  { slug: "forest", assets: common, hazards: { thorns: "thorn", barbs: "barb" } },
  { slug: "underground-jungle", assets: [...common, "vine"], hazards: { thorns: "thorn", barbs: "barb", vine: "vine" } },
  { slug: "desert", assets: common, hazards: { thorns: "thorn", barbs: "barb" } },
  { slug: "marble-cave", assets: [...common, "crusher"], hazards: { thorns: "thorn", barbs: "barb", crusher: "crusher" } },
  { slug: "violet", assets: [...common, "crystal", "shutter"], hazards: { thorns: "thorn", barbs: "barb", crystal: "crystal", shutter: "shutter" } },
  { slug: "underground-corruption", assets: [...common, "spore", "shutter"], hazards: { thorns: "thorn", barbs: "barb", spore: "spore", shutter: "shutter" } },
  { slug: "abandoned-minecart", assets: [...common, "cart", "spinner", "shutter"], hazards: { thorns: "thorn", barbs: "barb", cart: "cart", spinner: "spinner", shutter: "shutter" } },
  { slug: "ashen", assets: [...common, "ember", "beak", "spinner", "shutter"], hazards: { thorns: "thorn", barbs: "barb", ember: "ember", beak: "beak", spinner: "spinner", shutter: "shutter" } },
  { slug: "underworld", assets: [...common, "flame", "flame-warning", "spinner", "shutter"], hazards: { thorns: "thorn", barbs: "barb", flame: "flame", spinner: "spinner", shutter: "shutter" } },
] as const;

export function interactiveTextureKey(chapter: number, asset: InteractiveAssetKind): string {
  return `authored-terrain-${chapter}-${asset}`;
}

export function interactiveAssetPath(family: InteractiveArtFamily, asset: InteractiveAssetKind): string {
  return `/assets/biome-${family.slug}-${asset}-v2-runtime.png`;
}

export function authoredAssetForHazard(chapter: number, kind: HazardKind): InteractiveAssetKind | undefined {
  return INTERACTIVE_ART[chapter]?.hazards[kind];
}
