import type { CardinalDirection, Side } from "../core/types";
import type { ChainEntityRole, ChainPlannedEntity } from "./types";

export interface Draft {
  role: ChainEntityRole;
  material?: string;
  recipe?: string;
  name: string;
  position: { x: number; y: number };
  direction?: CardinalDirection;
  recipeSetting?: string;
  undergroundType?: "input" | "output";
  outputPriority?: "left" | "right";
  /** Compiler-only provenance; never serialized into a Factorio blueprint. */
  directTransfer?: boolean;
}

export interface CanonicalLayout {
  drafts: Draft[];
  inputPositions: Map<string, { x: number; y: number }>;
  additionalInputPositions?: Map<string, Array<{ x: number; y: number }>>;
  /** Originated from the frozen Factorio-live-validated exemplar corpus. */
  liveValidatedExemplar?: boolean;
  outputPosition: { x: number; y: number };
  canonicalOutputSide: Side;
  rotationQuarterTurns: number;
}

function rotatePosition(position: { x: number; y: number }, turns: number): { x: number; y: number } {
  let result = position;
  for (let index = 0; index < turns; index += 1) result = { x: -result.y, y: result.x };
  return result;
}

/** Converts a validated global-synthesis draft into Factorio blueprint entities. */
export function finalizeLayout(layout: CanonicalLayout): {
  entities: ChainPlannedEntity[];
  inputPositions: Map<string, { x: number; y: number }>;
  additionalInputPositions: Map<string, Array<{ x: number; y: number }>>;
  liveValidatedExemplar: boolean;
  outputPosition: { x: number; y: number };
} {
  const entities = layout.drafts.map((draft, index): ChainPlannedEntity => ({
    role: draft.role,
    material: draft.material,
    recipe: draft.recipe,
    entity: {
      entity_number: index + 1,
      name: draft.name,
      position: rotatePosition(draft.position, layout.rotationQuarterTurns),
      ...(draft.direction === undefined
        ? {}
        : { direction: ((draft.direction + layout.rotationQuarterTurns * 4) % 16) as CardinalDirection }),
      ...(draft.recipeSetting ? { recipe: draft.recipeSetting } : {}),
      ...(draft.undergroundType ? { type: draft.undergroundType } : {}),
      ...(draft.outputPriority ? { output_priority: draft.outputPriority } : {}),
    },
  }));
  return {
    entities,
    inputPositions: new Map(
      [...layout.inputPositions].map(([material, position]) =>
        [material, rotatePosition(position, layout.rotationQuarterTurns)]),
    ),
    additionalInputPositions: new Map(
      [...(layout.additionalInputPositions ?? new Map())].map(([material, positions]) =>
        [material, positions.map((position) => rotatePosition(position, layout.rotationQuarterTurns))]),
    ),
    liveValidatedExemplar: layout.liveValidatedExemplar ?? false,
    outputPosition: rotatePosition(layout.outputPosition, layout.rotationQuarterTurns),
  };
}
