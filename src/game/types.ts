export type GameMode = "ready" | "playing" | "paused" | "dead";
export type SurfacePreference = "any" | "top" | "bottom";
export type HazardKind = "thorns" | "wire" | "shutter" | "beak";

export interface Envelope {
  surface: SurfacePreference;
  maxAbsVelocity: number;
}

export interface MotionSpec {
  amplitude: number;
  frequency: number;
  phase?: number;
}

export interface RectSpec {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SolidSpec extends RectSpec {
  detail?: "perch" | "cage";
}

export interface HazardSpec extends RectSpec {
  kind: HazardKind;
  motion?: MotionSpec;
  flipY?: boolean;
}

export interface FeatherSpec {
  x: number;
  y: number;
}

export interface ChunkDefinition {
  id: string;
  chapter: number;
  width: number;
  entry: Envelope;
  exit: Envelope;
  solids: SolidSpec[];
  hazards: HazardSpec[];
  feathers: FeatherSpec[];
  decoration: "nest" | "gears" | "bells" | "eggs" | "passage";
  transition?: {
    from: number;
    to: number;
  };
}

export interface ActiveFeather extends FeatherSpec {
  collected: boolean;
  missed: boolean;
}

export interface ActiveChunk {
  definition: ChunkDefinition;
  startX: number;
  gatePassed: boolean;
  feathers: ActiveFeather[];
}

export type GameEvent =
  | { type: "flip"; gravity: -1 | 1 }
  | { type: "land" }
  | { type: "feather"; chain: number }
  | { type: "bonus" }
  | { type: "gate"; score: number }
  | { type: "chapter"; chapter: number }
  | { type: "death"; score: number }
  | { type: "restart" }
  | { type: "pause"; paused: boolean };

export interface VisibleRect extends RectSpec {
  kind: "solid" | HazardKind;
  detail?: string;
  flipY?: boolean;
  chapter: number;
  decoration: ChunkDefinition["decoration"];
}

export interface ChapterTransitionState {
  id: string;
  from: number;
  to: number;
  progress: number;
  active: boolean;
}

export interface VisibleFeather {
  x: number;
  y: number;
  collected: boolean;
}
