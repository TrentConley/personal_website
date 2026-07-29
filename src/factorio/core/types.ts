export const SIDES = ["north", "east", "south", "west"] as const;
export type Side = (typeof SIDES)[number];

export const BELT_TIERS = ["yellow", "red", "blue"] as const;
export type BeltTier = (typeof BELT_TIERS)[number];

// Factorio 2.0 uses 16 direction values, so cardinal directions are 0/4/8/12.
export type CardinalDirection = 0 | 4 | 8 | 12;

export interface BlueprintEntity {
  entity_number: number;
  name: string;
  position: { x: number; y: number };
  direction?: CardinalDirection;
  recipe?: string;
  type?: "input" | "output";
  output_priority?: "left" | "right";
}

export interface BlueprintDocument {
  blueprint: {
    item: "blueprint";
    label: string;
    description: string;
    icons: Array<{
      signal: { type: "item"; name: string };
      index: number;
    }>;
    entities: BlueprintEntity[];
    version: number;
  };
}
