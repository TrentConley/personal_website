import { BELTS } from "../core/throughput";
import { MATERIAL_TYPES, materialType, recipeFor } from "./catalog";
import { Fraction } from "./fraction";
import { groupSolidIngredients } from "./ingredient-groups";
import type {
  ChainGeneratorConfig,
  ChainPlan,
  MaterialType,
  PlannedRecipe,
} from "./types";

const MACHINE_UTILIZATION = 0.9;
const NEAR_INSERTER_ITEMS_PER_SECOND = 2;
const LONG_HANDED_ITEMS_PER_SECOND = 1;
export const DEFAULT_PIPE_CAPACITY_PER_SECOND = 1_200;

function validatePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number.`);
}

interface Expansion {
  boundaries: Map<string, Fraction>;
  materials: Map<string, Fraction>;
  recipes: Set<string>;
}

function add(map: Map<string, Fraction>, name: string, amount: Fraction): void {
  map.set(name, (map.get(name) ?? new Fraction(0n)).add(amount));
}

function expandUnit(target: string, boundaryNames: Set<string>): Expansion {
  const expansion: Expansion = {
    boundaries: new Map(),
    materials: new Map(),
    recipes: new Set(),
  };
  const active = new Set<string>();

  function visit(material: string, rate: Fraction): void {
    add(expansion.materials, material, rate);
    if (boundaryNames.has(material)) {
      add(expansion.boundaries, material, rate);
      return;
    }
    if (active.has(material)) throw new Error(`Recipe cycle detected while expanding ${material}.`);
    const recipe = recipeFor(material);
    if (!recipe) {
      const kind = MATERIAL_TYPES[material] === "fluid" ? "fluid" : "material";
      throw new Error(
        `${material} is a required ${kind} with no supported assembler, furnace, or chemical-plant recipe. ` +
          `Add it to inputs (refinery, mining, and water extraction are intentionally outside the blueprint).`,
      );
    }
    expansion.recipes.add(material);
    active.add(material);
    const crafts = rate.divide(Fraction.from(recipe.result.amount));
    for (const ingredient of recipe.ingredients) {
      visit(ingredient.name, crafts.multiply(Fraction.from(ingredient.amount)));
    }
    active.delete(material);
  }

  visit(target, new Fraction(1n));
  return expansion;
}

function topologicalRecipes(target: string, included: Set<string>, boundaries: Set<string>): string[] {
  const visited = new Set<string>();
  const ordered: string[] = [];
  function visit(material: string): void {
    if (visited.has(material) || boundaries.has(material) || !included.has(material)) return;
    visited.add(material);
    const recipe = recipeFor(material)!;
    for (const ingredient of recipe.ingredients) visit(ingredient.name);
    ordered.push(material);
  }
  visit(target);
  return ordered;
}

export function planChain(config: ChainGeneratorConfig): ChainPlan {
  validatePositive(config.outputPerSecond, "Output throughput");
  if (!materialType(config.output)) throw new Error(`Unknown vanilla material: ${config.output}.`);
  const beltTier = config.beltTier ?? "blue";
  const beltCapacity = BELTS[beltTier].itemsPerSecond;
  const pipeCapacity = config.pipeCapacityPerSecond ?? DEFAULT_PIPE_CAPACITY_PER_SECOND;
  validatePositive(pipeCapacity, "Pipe capacity");

  const inputCaps = new Map<string, number>();
  for (const input of config.inputs) {
    const type = materialType(input.name);
    if (!type) throw new Error(`Unknown vanilla input material: ${input.name}.`);
    const maximum = input.maxPerSecond ?? (type === "item" ? beltCapacity : pipeCapacity);
    validatePositive(maximum, `Maximum rate for ${input.name}`);
    const physicalLimit = type === "item" ? beltCapacity : pipeCapacity;
    if (maximum > physicalLimit + 1e-9) {
      throw new Error(
        `${input.name} is capped at ${physicalLimit}/s by one ${type === "item" ? `${beltTier} belt` : "pipe"}.`,
      );
    }
    if (inputCaps.has(input.name)) throw new Error(`Input ${input.name} is listed more than once.`);
    inputCaps.set(input.name, maximum);
  }
  if (inputCaps.size === 0) throw new Error("At least one boundary input is required.");

  const expansion = expandUnit(config.output, new Set(inputCaps.keys()));
  // Current recipe collectors side-load a single physical belt lane.
  // Keep the advertised target within that proven 50% lane capacity.
  const outputTransportCapacity = materialType(config.output) === "item" ? beltCapacity / 2 : pipeCapacity;
  let maximumOutput = outputTransportCapacity;
  for (const [material, unitRate] of expansion.materials) {
    if (!expansion.recipes.has(material)) continue;
    const recipe = recipeFor(material)!;
    if (recipe.ingredients.filter((ingredient) => ingredient.type === "item").length <= 4) continue;
    const oneMachineOutput =
      (recipe.result.amount * recipe.machine.craftingSpeed * MACHINE_UTILIZATION) /
      recipe.energySeconds;
    maximumOutput = Math.min(maximumOutput, oneMachineOutput / unitRate.toNumber());
  }
  for (const [name, unitRate] of expansion.boundaries) {
    maximumOutput = Math.min(maximumOutput, inputCaps.get(name)! / unitRate.toNumber());
  }
  let effectiveOutput = Math.min(config.outputPerSecond, maximumOutput);
  if (!(effectiveOutput > 0)) throw new Error("The declared inputs cannot produce any requested output.");

  let materialRates = Object.fromEntries(
    [...expansion.materials].map(([name, rate]) => [name, rate.multiply(Fraction.from(effectiveOutput)).toNumber()]),
  );
  const boundarySet = new Set(inputCaps.keys());
  const recipes: PlannedRecipe[] = topologicalRecipes(
    config.output,
    expansion.recipes,
    boundarySet,
  ).map((material) => {
    const recipe = recipeFor(material)!;
    const outputPerSecond = materialRates[material];
    const craftsPerSecond = outputPerSecond / recipe.result.amount;
    const machineCapacityPerSecond =
      (recipe.result.amount * recipe.machine.craftingSpeed * MACHINE_UTILIZATION) /
      recipe.energySeconds;
    return {
      material,
      materialType: recipe.result.type,
      recipe,
      outputPerSecond,
      designedOutputPerSecond: outputPerSecond,
      craftsPerSecond,
      machineCount: Math.ceil(outputPerSecond / machineCapacityPerSecond - 1e-12),
      machineCapacityPerSecond,
      ingredientRates: recipe.ingredients.map((ingredient) => ({
        ...ingredient,
        perSecond: craftsPerSecond * ingredient.amount,
      })),
    };
  });

  function sizeMachines(recipe: PlannedRecipe): void {
    let required = Math.ceil(
      recipe.designedOutputPerSecond / recipe.machineCapacityPerSecond - 1e-12,
    );
    const designScale = recipe.designedOutputPerSecond / recipe.outputPerSecond;
    const groups = groupSolidIngredients(
      recipe.ingredientRates
        .filter((ingredient) => ingredient.type === "item")
        .map((ingredient) => ({
          name: ingredient.name,
          perSecond: ingredient.perSecond * designScale,
        })),
    );
    if (recipe.ingredientRates.filter((ingredient) => ingredient.type === "item").length > 4) {
      recipe.machineCount = Math.max(1, required);
      return;
    }
    const hasFluid = recipe.ingredientRates.some((ingredient) => ingredient.type === "fluid") ||
      recipe.materialType === "fluid";
    groups.forEach((group, groupIndex) => {
      const longHanded = hasFluid ? groupIndex >= 1 : groupIndex >= 2;
      const inserterCapacity = longHanded
        ? LONG_HANDED_ITEMS_PER_SECOND
        : NEAR_INSERTER_ITEMS_PER_SECOND;
      const groupRate = group.reduce((sum, ingredient) => sum + ingredient.perSecond, 0);
      required = Math.max(required, Math.ceil(groupRate / inserterCapacity - 1e-12));
    });
    recipe.machineCount = Math.max(1, required);
  }

  function distributionRequirement(material: string): number {
    const consumerRates = recipes.flatMap((consumer) =>
      consumer.ingredientRates
        .filter((ingredient) => ingredient.name === material)
        .map(
          (ingredient) =>
            ingredient.perSecond *
            (consumer.designedOutputPerSecond / consumer.outputPerSecond),
        ),
    );
    if (consumerRates.length === 0) return material === config.output ? effectiveOutput : 0;
    return Math.max(
      ...consumerRates.map((rate, index) =>
        rate * 2 ** (index === consumerRates.length - 1 ? index : index + 1),
      ),
    );
  }

  // A cascade tap receives half the remaining belt until its branch backs up;
  // the final tap receives the backed-up remainder. Size every shared
  // intermediate for that physical distribution network, propagating the
  // requirement recursively toward the declared boundary inputs.
  for (const producer of [...recipes].reverse()) {
    producer.designedOutputPerSecond = Math.max(
      producer.outputPerSecond,
      distributionRequirement(producer.material),
    );
    sizeMachines(producer);
  }

  const boundaryRequirements = new Map(
    [...expansion.boundaries].map(([name]) => [name, distributionRequirement(name)]),
  );
  maximumOutput = outputTransportCapacity;
  for (const [name, required] of boundaryRequirements) {
    const unitPhysicalRequirement = required / effectiveOutput;
    maximumOutput = Math.min(maximumOutput, inputCaps.get(name)! / unitPhysicalRequirement);
  }
  let maximumInternalItemRate = 0;
  for (const recipe of recipes) {
    if (recipe.materialType === "item") {
      maximumInternalItemRate = Math.max(maximumInternalItemRate, recipe.designedOutputPerSecond);
    }
    const designScale = recipe.designedOutputPerSecond / recipe.outputPerSecond;
    for (const ingredient of recipe.ingredientRates) {
      if (ingredient.type === "item") {
        maximumInternalItemRate = Math.max(
          maximumInternalItemRate,
          ingredient.perSecond * designScale,
        );
      }
    }
  }
  if (maximumInternalItemRate > 0) {
    const unitInternalItemRate = maximumInternalItemRate / effectiveOutput;
    maximumOutput = Math.min(maximumOutput, (beltCapacity / 2) / unitInternalItemRate);
  }
  const finalEffectiveOutput = Math.min(config.outputPerSecond, maximumOutput);
  const finalScale = finalEffectiveOutput / effectiveOutput;
  if (finalScale < 1 - 1e-12) {
    effectiveOutput = finalEffectiveOutput;
    materialRates = Object.fromEntries(
      Object.entries(materialRates).map(([name, rate]) => [name, rate * finalScale]),
    );
    for (const recipe of recipes) {
      recipe.outputPerSecond *= finalScale;
      recipe.designedOutputPerSecond *= finalScale;
      recipe.craftsPerSecond *= finalScale;
      recipe.ingredientRates.forEach((ingredient) => { ingredient.perSecond *= finalScale; });
      sizeMachines(recipe);
    }
    for (const [name, required] of boundaryRequirements) {
      boundaryRequirements.set(name, required * finalScale);
    }
  }

  return {
    requestedOutputPerSecond: config.outputPerSecond,
    effectiveOutputPerSecond: effectiveOutput,
    maximumOutputPerSecond: maximumOutput,
    clamped: effectiveOutput < config.outputPerSecond - 1e-9,
    target: config.output,
    targetType: materialType(config.output) as MaterialType,
    beltCapacityPerSecond: beltCapacity,
    pipeCapacityPerSecond: pipeCapacity,
    inputs: [...expansion.boundaries]
      .map(([name]) => {
        const requiredPerSecond = boundaryRequirements.get(name)!;
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
      [...boundaryRequirements].map(([name, rate]) => [name, rate / effectiveOutput]),
    ),
  };
}
