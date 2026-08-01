import { BELTS } from "../core/throughput";
import { materialType, recipeFor } from "./catalog";
import { buildProductionFlowGraph } from "./flow";
import type {
  ChainGeneratorConfig,
  ChainPlan,
  MaterialType,
  PlannedRecipe,
  ThroughputConstraint,
} from "./types";

// A machine's prototype crafting rate is an unattainable whole-factory bound:
// even a valid belt network loses brief cycles while inserters switch between
// recipe-controlled buffers. A five-percent physical reserve was the smallest
// general margin that sustained a one-blue-belt raw circuit factory in 2.0.77.
// Stoichiometric flow remains exact; this only rounds rack capacity upward.
const MACHINE_UTILIZATION = 0.95;
export const DEFAULT_PIPE_CAPACITY_PER_SECOND = 1_200;

function validatePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number.`);
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(1e-9, Math.abs(right) * 1e-9);
}

function sizeMachines(recipe: PlannedRecipe): void {
  recipe.machineCount = Math.max(
    1,
    Math.ceil(recipe.outputPerSecond / recipe.machineCapacityPerSecond - 1e-12),
  );
}

/**
 * Plans exact production flows. Physical topology selection happens after this
 * stage and must realize these flows rather than changing their stoichiometry.
 */
export function planChain(config: ChainGeneratorConfig): ChainPlan {
  validatePositive(config.outputPerSecond, "Output throughput");
  const targetType = materialType(config.output);
  if (!targetType) throw new Error(`Unknown vanilla material: ${config.output}.`);
  const beltTier = config.beltTier ?? "blue";
  const beltCapacity = BELTS[beltTier].itemsPerSecond;
  const pipeCapacity = config.pipeCapacityPerSecond ?? DEFAULT_PIPE_CAPACITY_PER_SECOND;
  validatePositive(pipeCapacity, "Pipe capacity");

  const inputCaps = new Map<string, number>();
  for (const input of config.inputs) {
    const type = materialType(input.name);
    if (!type) throw new Error(`Unknown vanilla input material: ${input.name}.`);
    const physicalLimit = type === "item" ? beltCapacity : pipeCapacity;
    const maximum = input.maxPerSecond ?? physicalLimit;
    validatePositive(maximum, `Maximum rate for ${input.name}`);
    if (maximum > physicalLimit + 1e-9) {
      throw new Error(
        `${input.name} is capped at ${physicalLimit}/s by one ${type === "item" ? `${beltTier} belt` : "pipe"}.`,
      );
    }
    if (inputCaps.has(input.name)) throw new Error(`Input ${input.name} is listed more than once.`);
    inputCaps.set(input.name, maximum);
  }
  if (inputCaps.size === 0) throw new Error("At least one boundary input is required.");

  const flow = buildProductionFlowGraph(config.output, new Set(inputCaps.keys()));
  const constraints: ThroughputConstraint[] = [];
  const outputCapacity = targetType === "item" ? beltCapacity : pipeCapacity;
  constraints.push({
    id: "output-transport",
    kind: "output-transport",
    material: config.output,
    capacityPerSecond: outputCapacity,
    requiredPerOutput: 1,
    maximumOutputPerSecond: outputCapacity,
    binding: false,
    explanation: `One ${targetType === "item" ? `${beltTier} output belt` : "output pipe"} carries at most ${outputCapacity}/s.`,
  });
  for (const [name, unitRate] of flow.boundaries) {
    const requiredPerOutput = unitRate.toNumber();
    const capacity = inputCaps.get(name)!;
    constraints.push({
      id: `input:${name}`,
      kind: "boundary-input",
      material: name,
      capacityPerSecond: capacity,
      requiredPerOutput,
      maximumOutputPerSecond: capacity / requiredPerOutput,
      binding: false,
      explanation: `${name} supplies ${capacity}/s and each ${config.output} requires ${requiredPerOutput}.`,
    });
  }

  const maximumOutput = Math.min(...constraints.map((constraint) => constraint.maximumOutputPerSecond));
  const effectiveOutput = Math.min(config.outputPerSecond, maximumOutput);
  if (!(effectiveOutput > 0)) throw new Error("The declared inputs cannot produce any requested output.");
  for (const constraint of constraints) constraint.binding = nearlyEqual(constraint.maximumOutputPerSecond, maximumOutput);

  const materialRates = Object.fromEntries(
    [...flow.materials].map(([name, rate]) => [name, rate.toNumber() * effectiveOutput]),
  );
  const recipes: PlannedRecipe[] = flow.recipeOrder.map((material) => {
    const recipe = recipeFor(material)!;
    const outputPerSecond = materialRates[material];
    const craftsPerSecond = outputPerSecond / recipe.result.amount;
    const machineCapacityPerSecond =
      recipe.result.amount * recipe.machine.craftingSpeed * MACHINE_UTILIZATION / recipe.energySeconds;
    const planned: PlannedRecipe = {
      material,
      materialType: recipe.result.type,
      recipe,
      outputPerSecond,
      designedOutputPerSecond: outputPerSecond,
      craftsPerSecond,
      machineCount: 1,
      machineCapacityPerSecond,
      ingredientRates: recipe.ingredients.map((ingredient) => ({
        ...ingredient,
        perSecond: craftsPerSecond * ingredient.amount,
      })),
    };
    sizeMachines(planned);
    return planned;
  });

  return {
    requestedOutputPerSecond: config.outputPerSecond,
    effectiveOutputPerSecond: effectiveOutput,
    maximumOutputPerSecond: maximumOutput,
    clamped: effectiveOutput < config.outputPerSecond - 1e-9,
    target: config.output,
    targetType: targetType as MaterialType,
    beltCapacityPerSecond: beltCapacity,
    pipeCapacityPerSecond: pipeCapacity,
    inputs: [...flow.boundaries]
      .map(([name, unitRate]) => {
        const requiredPerSecond = unitRate.toNumber() * effectiveOutput;
        const maximumPerSecond = inputCaps.get(name)!;
        return {
          name,
          type: materialType(name)!,
          requiredPerSecond,
          maximumPerSecond,
          utilization: requiredPerSecond / maximumPerSecond,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name)),
    recipes,
    materialRates,
    unitInputRequirements: Object.fromEntries(
      [...flow.boundaries].map(([name, rate]) => [name, rate.toNumber()]),
    ),
    constraints,
    limitingConstraints: constraints.filter((constraint) => constraint.binding),
  };
}
