import type { BeltTier, BlueprintDocument, CardinalDirection, Side } from "../core/types";

export type MaterialType = "item" | "fluid";

export interface MaterialRate {
  name: string;
  maxPerSecond?: number;
}

export interface ChainGeneratorConfig {
  output: string;
  outputPerSecond: number;
  inputs: MaterialRate[];
  inputSide?: Side;
  outputSide?: Side;
  beltTier?: BeltTier;
  pipeCapacityPerSecond?: number;
}

export interface CatalogAmount {
  type: MaterialType;
  name: string;
  amount: number;
}

export interface CatalogRecipe {
  id: string;
  category:
    | "basic-crafting"
    | "crafting"
    | "advanced-crafting"
    | "crafting-with-fluid"
    | "smelting"
    | "chemistry";
  energySeconds: number;
  machine: {
    name: "assembling-machine-3" | "electric-furnace" | "chemical-plant";
    craftingSpeed: number;
  };
  ingredients: CatalogAmount[];
  result: CatalogAmount;
}

export interface ProductGroup {
  id: string;
  label: string;
  products: string[];
}

export interface PlannedRecipe {
  material: string;
  materialType: MaterialType;
  recipe: CatalogRecipe;
  outputPerSecond: number;
  designedOutputPerSecond: number;
  craftsPerSecond: number;
  machineCount: number;
  machineCapacityPerSecond: number;
  ingredientRates: Array<CatalogAmount & { perSecond: number }>;
}

export interface PlannedInput {
  name: string;
  type: MaterialType;
  requiredPerSecond: number;
  maximumPerSecond: number;
  utilization: number;
}

export type ThroughputConstraintKind = "boundary-input" | "output-transport" | "physical-block";

export interface ThroughputConstraint {
  id: string;
  kind: ThroughputConstraintKind;
  material: string;
  capacityPerSecond: number;
  requiredPerOutput: number;
  maximumOutputPerSecond: number;
  binding: boolean;
  explanation: string;
}

export interface ChainPlan {
  requestedOutputPerSecond: number;
  effectiveOutputPerSecond: number;
  maximumOutputPerSecond: number;
  clamped: boolean;
  target: string;
  targetType: MaterialType;
  beltCapacityPerSecond: number;
  pipeCapacityPerSecond: number;
  inputs: PlannedInput[];
  recipes: PlannedRecipe[];
  materialRates: Record<string, number>;
  unitInputRequirements: Record<string, number>;
  constraints: ThroughputConstraint[];
  limitingConstraints: ThroughputConstraint[];
}

export type ChainEntityRole =
  | "machine"
  | "input-belt"
  | "material-bus"
  | "ingredient-branch"
  | "ingredient-feeder"
  | "output-belt"
  | "splitter"
  | "underground-belt"
  | "pipe"
  | "pipe-to-ground"
  | "input-inserter"
  | "output-inserter"
  | "power-pole";

export interface ChainBlueprintEntity {
  entity_number: number;
  name: string;
  position: { x: number; y: number };
  direction?: CardinalDirection;
  recipe?: string;
  type?: "input" | "output";
  output_priority?: "left" | "right";
}

export interface ChainPlannedEntity {
  role: ChainEntityRole;
  material?: string;
  recipe?: string;
  entity: ChainBlueprintEntity;
}

export interface ChainPort {
  material: string;
  type: MaterialType;
  side: Side;
  position: { x: number; y: number };
  requiredPerSecond: number;
  maximumPerSecond: number;
}

export interface GeneratedChainBlueprint {
  config: Required<Omit<ChainGeneratorConfig, "inputs">> & { inputs: MaterialRate[] };
  plan: ChainPlan;
  document: BlueprintDocument;
  blueprintString: string;
  entities: ChainPlannedEntity[];
  inputPorts: ChainPort[];
  outputPort: ChainPort;
  itemCost: Record<string, number>;
  spatialOptimization?: {
    strategy: "bounded-candidate-search-v1";
    policy: string;
    candidatesAccepted: number;
    width: number;
    height: number;
    area: number;
    transportEntities: number;
    undergroundEntities: number;
    score: number;
  };
  warnings: string[];
}
