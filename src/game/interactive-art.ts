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
  | "sandjet"
  | "sandjet-nozzle"
  | "flame-plume"
  | "flame-warning"
  | "vine";

export interface InteractiveArtFamily {
  slug: string;
  assets: readonly InteractiveAssetKind[];
  hazards: Partial<Record<HazardKind, InteractiveAssetKind>>;
  emphasis?: {
    spikeWidthBonus?: number;
    pillarWidthBonus?: number;
    shutterWidthBonus?: number;
    clusteredThorns?: boolean;
  };
}

export interface TransitionArt {
  from: number;
  to: number;
  slug: string;
}

const common = ["platform", "pillar", "thorn", "barb"] as const;

export const INTERACTIVE_ART: readonly InteractiveArtFamily[] = [
  { slug: "forest", assets: common, hazards: { thorns: "thorn", barbs: "barb" } },
  { slug: "underground-jungle", assets: [...common, "vine"], hazards: { thorns: "thorn", barbs: "barb", vine: "vine" } },
  {
    slug: "mushroom-kingdom",
    assets: common,
    hazards: { thorns: "thorn", barbs: "barb" },
    emphasis: { pillarWidthBonus: 8 },
  },
  {
    slug: "desert",
    assets: [...common, "sandjet", "sandjet-nozzle", "spinner"],
    hazards: { thorns: "thorn", barbs: "barb", sandJet: "sandjet", spinner: "spinner" },
  },
  { slug: "marble-cave", assets: [...common, "crusher"], hazards: { thorns: "thorn", barbs: "barb", crusher: "crusher" } },
  { slug: "violet", assets: [...common, "crystal", "shutter"], hazards: { thorns: "thorn", barbs: "barb", crystal: "crystal", shutter: "shutter" } },
  { slug: "underground-corruption", assets: [...common, "spore", "shutter"], hazards: { thorns: "thorn", barbs: "barb", spore: "spore", shutter: "shutter" } },
  {
    slug: "abandoned-minecart",
    assets: [...common, "cart", "spinner", "shutter"],
    hazards: { thorns: "thorn", barbs: "barb", cart: "cart", spinner: "spinner", shutter: "shutter" },
    emphasis: {
      spikeWidthBonus: 4,
      pillarWidthBonus: 8,
      shutterWidthBonus: 4,
      clusteredThorns: true,
    },
  },
  { slug: "ashen", assets: [...common, "ember", "beak", "spinner", "shutter"], hazards: { thorns: "thorn", barbs: "barb", ember: "ember", beak: "beak", spinner: "spinner", shutter: "shutter" } },
  { slug: "underworld", assets: [...common, "flame-plume", "flame-warning", "spinner", "shutter"], hazards: { thorns: "thorn", barbs: "barb", flame: "flame-plume", spinner: "spinner", shutter: "shutter" } },
] as const;

export const TRANSITION_ART: readonly TransitionArt[] = [
  { from: 1, to: 2, slug: "jungle-mushroom" },
  { from: 2, to: 3, slug: "mushroom-dunes" },
  { from: 3, to: 4, slug: "dunes-marble" },
  { from: 4, to: 5, slug: "marble-violet" },
  { from: 5, to: 6, slug: "violet-corruption" },
  { from: 6, to: 7, slug: "corruption-minecart" },
  { from: 7, to: 8, slug: "minecart-ashen" },
  { from: 8, to: 9, slug: "ashen-underworld" },
] as const;

export function interactiveTextureKey(chapter: number, asset: InteractiveAssetKind): string {
  return `authored-terrain-${chapter}-${asset}`;
}

export function interactiveDangerTextureKey(chapter: number, asset: InteractiveAssetKind): string {
  return `${interactiveTextureKey(chapter, asset)}-danger`;
}

export function interactiveAssetPath(family: InteractiveArtFamily, asset: InteractiveAssetKind): string {
  return `/assets/biome-${family.slug}-${asset}-v2-runtime.png`;
}

export function authoredAssetForHazard(chapter: number, kind: HazardKind): InteractiveAssetKind | undefined {
  return INTERACTIVE_ART[chapter]?.hazards[kind];
}

export function transitionTextureKey(from: number, to: number): string {
  return `authored-transition-${from}-${to}`;
}

export function transitionArtFor(from: number, to: number): TransitionArt | undefined {
  return TRANSITION_ART.find((asset) => asset.from === from && asset.to === to);
}
