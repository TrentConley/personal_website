import type { ChainPlan, MaterialType, PlannedRecipe } from "./types";

export type ProductionBlockKind = "solid-panel" | "multi-input-row" | "fluid-row" | "complex-cell";

export interface PhysicalIngredientFlow {
  materialId: string;
  name: string;
  type: MaterialType;
  perSecond: number;
}

export interface ProductionBlockContract {
  id: string;
  kind: ProductionBlockKind;
  materialId: string;
  material: string;
  recipe: PlannedRecipe["recipe"];
  outputPerSecond: number;
  machineCount: number;
  machineCapacityPerSecond: number;
  ingredients: PhysicalIngredientFlow[];
  depth: number;
  columns: number;
  machineRows: number;
  estimatedWidth: number;
  estimatedHeight: number;
  local: boolean;
}

export interface PhysicalMaterialContract {
  id: string;
  name: string;
  type: MaterialType;
  perSecond: number;
  boundary: boolean;
}

export interface ProductionTopology {
  blocks: ProductionBlockContract[];
  materials: PhysicalMaterialContract[];
  depths: number[];
  score: number;
  strategy: "hierarchical-blocks-v1";
}

const MAX_SOLID_FLOW_PER_BELT = 45;
const MAX_FLUID_FLOW_PER_PIPE = 1_200;
const MAX_PANEL_COLUMNS = 24;
const SAFE_BULK_INSERTER_ITEMS_PER_SECOND = 2.31;
const SAFE_LONG_HANDED_INSERTER_ITEMS_PER_SECOND = 0.5;
const INSERTER_SLOTS_PER_MACHINE_SIDE = 3;

function transportSizedMachineCount(
  recipeMinimum: number,
  outputPerSecond: number,
  outputType: MaterialType,
  ingredients: PhysicalIngredientFlow[],
  kind: ProductionBlockKind,
): number {
  const solids = ingredients.filter((ingredient) => ingredient.type === "item");
  let machineCount = Math.max(recipeMinimum, 1);
  while (true) {
    const slots = solids.map((ingredient, index) => Math.max(
      1,
      Math.ceil(
        ingredient.perSecond /
          machineCount /
          (kind === "multi-input-row"
            ? index === 0
              ? SAFE_BULK_INSERTER_ITEMS_PER_SECOND
              : SAFE_LONG_HANDED_INSERTER_ITEMS_PER_SECOND
            : index % 2 === 0
            ? SAFE_BULK_INSERTER_ITEMS_PER_SECOND
            : SAFE_LONG_HANDED_INSERTER_ITEMS_PER_SECOND) -
          1e-12,
      ),
    ));
    const outputSlots = outputType === "item"
      ? Math.max(1, Math.ceil(
          outputPerSecond / machineCount / SAFE_BULK_INSERTER_ITEMS_PER_SECOND - 1e-12,
        ))
      : 0;
    const fits = kind === "multi-input-row"
      // This template loads two contracts from the north and shares its south
      // face between the third contract and product discharge.
      ? slots.slice(0, 2).reduce((sum, count) => sum + count, 0) <= INSERTER_SLOTS_PER_MACHINE_SIDE &&
        (slots[2] ?? 0) + outputSlots <= INSERTER_SLOTS_PER_MACHINE_SIDE
      : kind === "solid-panel"
        ? slots.reduce((sum, count) => sum + count, 0) <= INSERTER_SLOTS_PER_MACHINE_SIDE &&
          outputSlots <= INSERTER_SLOTS_PER_MACHINE_SIDE
        // Fluid rows and radial complex cells allocate one physical arm per
        // solid contract and one product arm. Add machines until those arms
        // can sustain the requested rate.
        : slots.every((count) => count <= 1) && outputSlots <= 1;
    if (fits) {
      return machineCount;
    }
    machineCount += 1;
  }
}

function splitCount(recipe: PlannedRecipe): number {
  const solidIngredients = recipe.ingredientRates.filter((ingredient) => ingredient.type === "item");
  const transportSplits = [
    recipe.materialType === "item"
      ? Math.ceil(recipe.outputPerSecond / MAX_SOLID_FLOW_PER_BELT - 1e-12)
      : Math.ceil(recipe.outputPerSecond / MAX_FLUID_FLOW_PER_PIPE - 1e-12),
    ...recipe.ingredientRates.map((ingredient) => Math.ceil(
      ingredient.perSecond /
        (ingredient.type === "item" ? MAX_SOLID_FLOW_PER_BELT : MAX_FLUID_FLOW_PER_PIPE) -
        1e-12,
    )),
  ];
  if (solidIngredients.length > 4) transportSplits.push(recipe.machineCount);
  return Math.max(1, ...transportSplits);
}

function minimumMachineRows(
  outputPerSecond: number,
  outputType: MaterialType,
  ingredients: PhysicalIngredientFlow[],
): number {
  const outputRows = outputType === "item"
    ? outputPerSecond > 22.5 + 1e-12
      ? 2 * Math.ceil(outputPerSecond / 22.5 - 1e-12)
      : 1
    : 1;
  return Math.max(
    1,
    outputRows,
    ...ingredients.map((ingredient) => ingredient.type === "item"
      ? Math.ceil(ingredient.perSecond / 22.5 - 1e-12)
      : 1),
  );
}

function chooseGeometry(machineCount: number, kind: ProductionBlockKind, requiredRows = 1): {
  columns: number;
  machineRows: number;
  width: number;
  height: number;
} {
  if (kind === "complex-cell") {
    return { columns: 1, machineRows: machineCount, width: 34, height: machineCount * 24 };
  }
  if (kind === "solid-panel") {
    const requiredColumns = Math.ceil(machineCount / requiredRows);
    if (requiredColumns <= MAX_PANEL_COLUMNS) {
      return {
        columns: requiredColumns,
        machineRows: requiredRows,
        width: requiredColumns * 4 + 20,
        height: Math.ceil(requiredRows / 2) * 16,
      };
    }
  }
  if (kind === "multi-input-row") {
    const requiredColumns = Math.ceil(machineCount / requiredRows);
    if (requiredColumns <= MAX_PANEL_COLUMNS) {
      return {
        columns: requiredColumns,
        machineRows: requiredRows,
        width: requiredColumns * 4 + 20,
        height: requiredRows * 16,
      };
    }
  }
  let best: { columns: number; machineRows: number; width: number; height: number; score: number } | undefined;
  for (let columns = 1; columns <= Math.min(MAX_PANEL_COLUMNS, machineCount); columns += 1) {
    const machineRows = Math.ceil(machineCount / columns);
    if (machineRows < requiredRows) continue;
    const panelCount = kind === "solid-panel" ? Math.ceil(machineRows / 2) : machineRows;
    const width = columns * 4 + 20;
    const height = panelCount * (kind === "solid-panel" || kind === "multi-input-row" ? 16 : 18);
    const area = width * height;
    const score = area + Math.max(width, height) * 12 + panelCount * 40;
    if (!best || score < best.score) best = { columns, machineRows, width, height, score };
  }
  return {
    columns: best!.columns,
    machineRows: best!.machineRows,
    width: best!.width,
    height: best!.height,
  };
}

function blockKind(recipe: PlannedRecipe["recipe"]): ProductionBlockKind {
  const solids = recipe.ingredients.filter((ingredient) => ingredient.type === "item").length;
  if (recipe.ingredients.some((ingredient) => ingredient.type === "fluid") || recipe.result.type === "fluid") {
    return solids <= 4 ? "fluid-row" : "complex-cell";
  }
  if (solids === 4) return "fluid-row";
  if (solids > 3) return "complex-cell";
  if (solids === 3) return "multi-input-row";
  return "solid-panel";
}

/**
 * Converts the exact recipe plan into physical, independently routable blocks.
 * Expanding intermediates are localized per consumer so high-volume material
 * never becomes a factory-wide transport bottleneck. Selection is based only
 * on flow expansion and graph position; material names are opaque.
 */
export function optimizeProductionTopology(plan: ChainPlan): ProductionTopology {
  const localizedRecipes = new Map(plan.recipes
    .filter((planned) => {
      if (planned.material === plan.target || planned.materialType !== "item") return false;
      if (planned.recipe.ingredients.length === 0 ||
        planned.recipe.ingredients.some((ingredient) => ingredient.type !== "item")) return false;
      const inputFlow = planned.ingredientRates.reduce((sum, ingredient) => sum + ingredient.perSecond, 0);
      const consumers = plan.recipes.filter((candidate) =>
        candidate.recipe.ingredients.some((ingredient) => ingredient.name === planned.material));
      return consumers.length > 0 && planned.outputPerSecond > inputFlow * 1.25 + 1e-12;
    })
    .map((planned) => [planned.material, planned]));

  const materialDepth = new Map<string, number>(plan.inputs.map((input) => [input.name, 0]));
  for (const recipe of plan.recipes) {
    const depth = 1 + Math.max(
      0,
      ...recipe.recipe.ingredients.map((ingredient) => materialDepth.get(ingredient.name) ?? 0),
    );
    materialDepth.set(recipe.material, depth);
  }

  const blocks: ProductionBlockContract[] = [];
  const materialRates = new Map<string, PhysicalMaterialContract>();
  for (const input of plan.inputs) {
    materialRates.set(input.name, {
      id: input.name,
      name: input.name,
      type: input.type,
      perSecond: input.requiredPerSecond,
      boundary: true,
    });
  }

  function addMaterial(material: PhysicalMaterialContract): void {
    const current = materialRates.get(material.id);
    if (current) current.perSecond += material.perSecond;
    else materialRates.set(material.id, material);
  }

  for (const planned of plan.recipes) {
    if (localizedRecipes.has(planned.material)) continue;
    const shards = splitCount(planned);
    for (let shard = 0; shard < shards; shard += 1) {
      const outputPerSecond = planned.outputPerSecond / shards;
      const machineCount = Math.max(
        1,
        Math.ceil(outputPerSecond / planned.machineCapacityPerSecond - 1e-12),
      );
      const ingredients: PhysicalIngredientFlow[] = [];
      for (const ingredient of planned.ingredientRates) {
        const perSecond = ingredient.perSecond / shards;
        const localRecipe = localizedRecipes.get(ingredient.name);
        if (localRecipe) {
          const streamId = `${localRecipe.material}@${planned.material}:${shard + 1}`;
          const localRecipeMinimum = Math.max(
            1,
            Math.ceil(perSecond / localRecipe.machineCapacityPerSecond - 1e-12),
          );
          const localIngredients: PhysicalIngredientFlow[] = localRecipe.ingredientRates.map((localIngredient) => ({
            materialId: localIngredient.name,
            name: localIngredient.name,
            type: localIngredient.type,
            perSecond: perSecond * localIngredient.perSecond / localRecipe.outputPerSecond,
          }));
          const kind = blockKind(localRecipe.recipe);
          const localRows = minimumMachineRows(perSecond, "item", localIngredients);
          const localMachinesPerRow = transportSizedMachineCount(
            Math.ceil(localRecipeMinimum / localRows),
            perSecond / localRows,
            "item",
            localIngredients.map((ingredient) => ({
              ...ingredient,
              perSecond: ingredient.perSecond / localRows,
            })),
            kind,
          );
          const localMachineCount = localMachinesPerRow * localRows;
          const geometry = chooseGeometry(localMachineCount, kind, localRows);
          blocks.push({
            id: `block:${streamId}`,
            kind,
            materialId: streamId,
            material: localRecipe.material,
            recipe: localRecipe.recipe,
            outputPerSecond: perSecond,
            machineCount: localMachineCount,
            machineCapacityPerSecond: localRecipe.machineCapacityPerSecond,
            ingredients: localIngredients,
            depth: Math.max(1, materialDepth.get(localRecipe.material) ?? 1),
            columns: geometry.columns,
            machineRows: geometry.machineRows,
            estimatedWidth: geometry.width,
            estimatedHeight: geometry.height,
            local: true,
          });
          addMaterial({
            id: streamId,
            name: localRecipe.material,
            type: "item",
            perSecond,
            boundary: false,
          });
          ingredients.push({
            materialId: streamId,
            name: localRecipe.material,
            type: "item",
            perSecond,
          });
        } else {
          ingredients.push({
            materialId: ingredient.name,
            name: ingredient.name,
            type: ingredient.type,
            perSecond,
          });
        }
      }

      const kind = blockKind(planned.recipe);
      const sizedMachineCount = transportSizedMachineCount(
        machineCount,
        outputPerSecond,
        planned.materialType,
        ingredients,
        kind,
      );
      const requiredRows = minimumMachineRows(
        outputPerSecond,
        planned.materialType,
        ingredients,
      );
      const rowSizedMachineCount = transportSizedMachineCount(
        Math.ceil(machineCount / requiredRows),
        outputPerSecond / requiredRows,
        planned.materialType,
        ingredients.map((ingredient) => ({
          ...ingredient,
          perSecond: ingredient.perSecond / requiredRows,
        })),
        kind,
      ) * requiredRows;
      const physicalMachineCount = Math.max(sizedMachineCount, rowSizedMachineCount, requiredRows);
      const geometry = chooseGeometry(physicalMachineCount, kind, requiredRows);
      blocks.push({
        id: `block:${planned.material}:${shard + 1}`,
        kind,
        materialId: planned.material,
        material: planned.material,
        recipe: planned.recipe,
        outputPerSecond,
        machineCount: physicalMachineCount,
        machineCapacityPerSecond: planned.machineCapacityPerSecond,
        ingredients,
        depth: materialDepth.get(planned.material) ?? 1,
        columns: geometry.columns,
        machineRows: geometry.machineRows,
        estimatedWidth: geometry.width,
        estimatedHeight: geometry.height,
        local: false,
      });
      addMaterial({
        id: planned.material,
        name: planned.material,
        type: planned.materialType,
        perSecond: outputPerSecond,
        boundary: false,
      });
    }
  }

  const depths = [...new Set(blocks.map((block) => block.depth))].sort((left, right) => left - right);
  const depthWidths = depths.map((depth) => Math.max(
    ...blocks.filter((block) => block.depth === depth).map((block) => block.estimatedWidth),
  ));
  const depthHeights = depths.map((depth) => blocks
    .filter((block) => block.depth === depth)
    .reduce((sum, block) => sum + block.estimatedHeight + 4, 0));
  const estimatedWidth = depthWidths.reduce((sum, width) => sum + width + 12, 0);
  const estimatedHeight = Math.max(...depthHeights, materialRates.size * 4 + 20);

  return {
    blocks,
    materials: [...materialRates.values()],
    depths,
    score: estimatedWidth * estimatedHeight,
    strategy: "hierarchical-blocks-v1",
  };
}
