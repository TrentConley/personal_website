import { decodeBlueprint } from "../core/codec";
import type { BlueprintDocument, CardinalDirection } from "../core/types";
import type { ChainPlan, ChainPlannedEntity } from "./types";

export interface ChainValidationCheck {
  id: string;
  passed: boolean;
  detail: string;
}
export interface ChainValidationReport {
  valid: boolean;
  checks: ChainValidationCheck[];
}

interface ValidationInput {
  plan: ChainPlan;
  document: BlueprintDocument;
  blueprintString: string;
  entities: ChainPlannedEntity[];
  inputPositions: Map<string, { x: number; y: number }>;
  outputPosition: { x: number; y: number };
}

function directionVector(direction: CardinalDirection): { x: number; y: number } {
  if (direction === 0) return { x: 0, y: -1 };
  if (direction === 4) return { x: 1, y: 0 };
  if (direction === 8) return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

function floorPosition(position: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.floor(position.x), y: Math.floor(position.y) };
}

function occupiedTiles(planned: ChainPlannedEntity): Array<{ x: number; y: number }> {
  const entity = planned.entity;
  const center = floorPosition(entity.position);
  if (["assembling-machine-3", "electric-furnace", "chemical-plant"].includes(entity.name)) {
    return Array.from({ length: 3 }, (_, row) => Array.from({ length: 3 }, (_, column) => ({
      x: center.x + column - 1,
      y: center.y + row - 1,
    }))).flat();
  }
  if (entity.name === "substation") return [
    center,
    { x: center.x + 1, y: center.y },
    { x: center.x, y: center.y + 1 },
    { x: center.x + 1, y: center.y + 1 },
  ];
  if (entity.name === "pump") return entity.direction === 0 || entity.direction === 8
    ? [{ x: center.x, y: center.y - 1 }, center]
    : [{ x: center.x - 1, y: center.y }, center];
  if (entity.name.includes("splitter")) return entity.direction === 0 || entity.direction === 8
    ? [{ x: center.x - 1, y: center.y }, center]
    : [{ x: center.x, y: center.y - 1 }, center];
  return [center];
}

function undergroundReach(name: string): number {
  if (name === "underground-belt") return 5;
  if (name === "fast-underground-belt") return 7;
  return 9;
}

function check(id: string, passed: boolean, detail: string): ChainValidationCheck {
  return { id, passed, detail };
}

/** Independent post-serialization checks over the final emitted blueprint. */
export function validateFinalChainBlueprint(input: ValidationInput): ChainValidationReport {
  const checks: ChainValidationCheck[] = [];
  let decoded: BlueprintDocument | undefined;
  try {
    decoded = decodeBlueprint(input.blueprintString);
  } catch (error) {
    checks.push(check("blueprint-round-trip", false,
      error instanceof Error ? error.message : String(error)));
  }
  if (decoded) checks.push(check(
    "blueprint-round-trip",
    JSON.stringify(decoded) === JSON.stringify(input.document),
    "Encoded blueprint decodes to the exact emitted document.",
  ));

  const numbers = input.entities.map(({ entity }) => entity.entity_number);
  const centers = input.entities.map(({ entity }) => `${entity.position.x},${entity.position.y}`);
  checks.push(check(
    "entity-identity",
    new Set(numbers).size === numbers.length && new Set(centers).size === centers.length &&
      numbers.every((number, index) => number === index + 1),
    `${input.entities.length} sequential entities have unique centers.`,
  ));

  const tileOwners = new Map<string, number[]>();
  input.entities.forEach((planned, index) => occupiedTiles(planned).forEach((tile) => {
    const key = `${tile.x},${tile.y}`;
    tileOwners.set(key, [...(tileOwners.get(key) ?? []), index]);
  }));
  const collisions = [...tileOwners].filter(([, owners]) => owners.length > 1);
  checks.push(check(
    "collision-boxes",
    collisions.length === 0,
    collisions.length === 0 ? "All entity collision tiles are disjoint." :
      `${collisions.length} occupied tiles contain multiple entities.`,
  ));

  const undergrounds = input.entities.filter(({ entity }) =>
    entity.type !== undefined && entity.name.includes("underground-belt"));
  const outputs = new Set<number>();
  let undergroundError: string | undefined;
  for (const entrance of undergrounds.filter(({ entity }) => entity.type === "input")) {
    const direction = entrance.entity.direction;
    if (direction === undefined) {
      undergroundError = `Underground input ${entrance.entity.entity_number} has no direction.`;
      break;
    }
    const start = floorPosition(entrance.entity.position);
    const vector = directionVector(direction);
    const match = undergrounds.filter(({ entity }, index) => entity.type === "output" &&
      !outputs.has(index) && entity.name === entrance.entity.name && entity.direction === direction)
      .map((candidate) => ({
        candidate,
        index: undergrounds.indexOf(candidate),
        point: floorPosition(candidate.entity.position),
      }))
      .filter(({ candidate, point }) => candidate.material === entrance.material &&
        (point.x - start.x) * vector.y - (point.y - start.y) * vector.x === 0 &&
        (point.x - start.x) * vector.x + (point.y - start.y) * vector.y > 0 &&
        (point.x - start.x) * vector.x + (point.y - start.y) * vector.y <=
          undergroundReach(entrance.entity.name))
      .sort((left, right) => Math.abs(left.point.x - start.x) + Math.abs(left.point.y - start.y) -
        Math.abs(right.point.x - start.x) - Math.abs(right.point.y - start.y))[0];
    if (!match) {
      undergroundError = `Underground input ${entrance.entity.entity_number} has no reachable paired output.`;
      break;
    }
    outputs.add(match.index);
  }
  checks.push(check(
    "underground-pairs",
    !undergroundError && outputs.size === undergrounds.filter(({ entity }) => entity.type === "output").length,
    undergroundError ?? `${undergrounds.length / 2} underground segments pair by tier, material, and direction.`,
  ));

  const actualMachines = new Map<string, number>();
  input.entities.filter((planned) => planned.role === "machine").forEach((planned) => {
    if (planned.entity.recipe) actualMachines.set(planned.entity.recipe,
      (actualMachines.get(planned.entity.recipe) ?? 0) + 1);
  });
  const insufficient = input.plan.recipes.filter((planned) => {
    const count = actualMachines.get(planned.recipe.id) ?? 0;
    const capacity = count * planned.recipe.result.amount * planned.recipe.machine.craftingSpeed /
      planned.recipe.energySeconds;
    return capacity < planned.designedOutputPerSecond - 1e-9;
  });
  checks.push(check(
    "machine-capacity",
    insufficient.length === 0,
    insufficient.length === 0 ? `${input.plan.recipes.length} recipe stages meet planned machine capacity.` :
      `Insufficient machine capacity for ${insufficient.map((planned) => planned.material).join(", ")}.`,
  ));

  const prohibited = input.entities.filter(({ entity }) => entity.name.includes("beacon") ||
    entity.name.includes("module") || entity.name.includes("quality"));
  checks.push(check(
    "vanilla-no-modules",
    prohibited.length === 0,
    prohibited.length === 0 ? "No modules, beacons, quality, or modded entities are emitted." :
      `${prohibited.length} prohibited entities were emitted.`,
  ));

  const entityCenters = new Set(centers);
  const missingPorts = [
    ...[...input.inputPositions].map(([material, position]) => ({ material, position })),
    { material: input.plan.target, position: input.outputPosition },
  ].filter(({ position }) => !entityCenters.has(`${position.x},${position.y}`));
  checks.push(check(
    "boundary-ports",
    missingPorts.length === 0 && input.inputPositions.size === input.plan.inputs.length,
    missingPorts.length === 0 && input.inputPositions.size === input.plan.inputs.length
      ? `${input.inputPositions.size} inputs and one output have physical entities.`
      : missingPorts.length === 0
        ? `Expected ${input.plan.inputs.length} inputs but routed ${input.inputPositions.size}: ` +
          `${[...input.inputPositions.keys()].join(", ")}.`
        :
      `Missing physical ports for ${missingPorts.map(({ material }) => material).join(", ")}.`,
  ));

  return { valid: checks.every((entry) => entry.passed), checks };
}
