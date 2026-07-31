import { BELTS } from "../core/throughput";
import type { CardinalDirection, Side } from "../core/types";
import {
  addVerticalBelt,
  addVerticalPipe,
  type CanonicalLayout,
  type Draft,
} from "./layout";
import { buildAnonymousCellLayout } from "./motif-layout";
import type {
  CatalogAmount,
  ChainPlan,
  MaterialType,
  PlannedInput,
  PlannedRecipe,
} from "./types";

const SIDE_INDEX: Record<Side, number> = { north: 0, east: 1, south: 2, west: 3 };
const INDEX_SIDE: Side[] = ["north", "east", "south", "west"];

interface HierarchicalPattern {
  source: PlannedRecipe;
  primary: PlannedRecipe;
  secondary: PlannedRecipe;
  terminal: PlannedRecipe;
  sourceBoundary: CatalogAmount;
  primaryBoundary: CatalogAmount;
  secondaryBoundary: CatalogAmount;
  terminalFluids: CatalogAmount[];
  primaryForTerminalPerSecond: number;
  secondaryForTerminalPerSecond: number;
}

interface Island {
  layout: CanonicalLayout;
  x: number;
  y: number;
}

interface PortTap {
  material: string;
  type: MaterialType;
  x: number;
  y: number;
}


interface SourcePanel {
  drafts: Draft[];
  inputPositions: Map<string, { x: number; y: number }>;
  outputPosition: { x: number; y: number };
  outputDirection: CardinalDirection;
}

function tilePosition(x: number, y: number): { x: number; y: number } {
  return { x: x + 0.5, y: y + 0.5 };
}

function floorPosition(position: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.floor(position.x), y: Math.floor(position.y) };
}

function directionBetween(from: { x: number; y: number }, to: { x: number; y: number }): CardinalDirection {
  if (to.x === from.x && to.y === from.y - 1) return 0;
  if (to.x === from.x + 1 && to.y === from.y) return 4;
  if (to.x === from.x && to.y === from.y + 1) return 8;
  if (to.x === from.x - 1 && to.y === from.y) return 12;
  throw new Error("Hierarchical routes must use one-tile cardinal steps.");
}

function addBeltPath(
  drafts: Draft[],
  role: Draft["role"],
  material: string,
  beltName: string,
  path: Array<{ x: number; y: number }>,
  finalDirection: CardinalDirection,
): void {
  path.forEach((point, index) => {
    drafts.push({
      role,
      material,
      name: beltName,
      position: tilePosition(point.x, point.y),
      direction: index + 1 < path.length ? directionBetween(point, path[index + 1]) : finalDirection,
    });
  });
}

function horizontalPoints(fromX: number, toX: number, y: number): Array<{ x: number; y: number }> {
  if (fromX > toX) return [];
  return Array.from({ length: toX - fromX + 1 }, (_, index) => ({ x: fromX + index, y }));
}

function addHorizontalBeltCrossings(
  drafts: Draft[],
  role: Draft["role"],
  material: string,
  beltName: string,
  undergroundName: string,
  fromX: number,
  toX: number,
  y: number,
  crossingColumns: number[],
): void {
  if (toX < fromX) return;
  const columns = [...new Set(crossingColumns)]
    .filter((column) => column > fromX && column < toX)
    .sort((left, right) => left - right);
  const clusters: Array<{ start: number; end: number }> = [];
  columns.forEach((column) => {
    const cluster = clusters.at(-1);
    if (cluster && column <= cluster.end + 3 && column - cluster.start <= 8) cluster.end = column;
    else clusters.push({ start: column, end: column });
  });
  const endpoints = new Map<number, "input" | "output">();
  const skipped = new Set<number>();
  clusters.forEach((cluster) => {
    endpoints.set(cluster.start - 1, "input");
    endpoints.set(cluster.end + 1, "output");
    for (let x = cluster.start; x <= cluster.end; x += 1) skipped.add(x);
  });
  for (let x = fromX; x <= toX; x += 1) {
    if (skipped.has(x)) continue;
    const undergroundType = endpoints.get(x);
    drafts.push({
      role: undergroundType ? "underground-belt" : role,
      material,
      name: undergroundType ? undergroundName : beltName,
      position: tilePosition(x, y),
      direction: 4,
      undergroundType,
    });
  }
}

function addWestboundBeltCrossings(
  drafts: Draft[],
  role: Draft["role"],
  material: string,
  beltName: string,
  undergroundName: string,
  fromX: number,
  toX: number,
  y: number,
  crossingColumns: number[],
  finalDirection: CardinalDirection,
): void {
  if (fromX < toX) return;
  const columns = [...new Set(crossingColumns)]
    .filter((column) => column < fromX && column > toX)
    .sort((left, right) => left - right);
  const clusters: Array<{ start: number; end: number }> = [];
  columns.forEach((column) => {
    const cluster = clusters.at(-1);
    if (cluster && column <= cluster.end + 3 && column - cluster.start <= 8) cluster.end = column;
    else clusters.push({ start: column, end: column });
  });
  const endpoints = new Map<number, "input" | "output">();
  const skipped = new Set<number>();
  clusters.forEach((cluster) => {
    endpoints.set(cluster.end + 1, "input");
    endpoints.set(cluster.start - 1, "output");
    for (let x = cluster.start; x <= cluster.end; x += 1) skipped.add(x);
  });
  for (let x = fromX; x >= toX; x -= 1) {
    if (skipped.has(x)) continue;
    const undergroundType = endpoints.get(x);
    drafts.push({
      role: undergroundType ? "underground-belt" : role,
      material,
      name: undergroundType ? undergroundName : beltName,
      position: tilePosition(x, y),
      direction: x === toX ? finalDirection : 12,
      undergroundType,
    });
  }
}

function addPumpFreeHorizontalPipe(
  drafts: Draft[],
  material: string,
  fromX: number,
  toX: number,
  y: number,
): void {
  let x = fromX;
  drafts.push({ role: "pipe", material, name: "pipe", position: tilePosition(x, y) });
  while (x < toX) {
    if (toX - x >= 5) {
      const entranceX = x + 1;
      const exitX = Math.min(x + 9, toX - 1);
      drafts.push({
        role: "pipe-to-ground",
        material,
        name: "pipe-to-ground",
        position: tilePosition(entranceX, y),
        direction: 12,
      });
      drafts.push({
        role: "pipe-to-ground",
        material,
        name: "pipe-to-ground",
        position: tilePosition(exitX, y),
        direction: 4,
      });
      x = exitX;
    } else {
      x += 1;
      drafts.push({ role: "pipe", material, name: "pipe", position: tilePosition(x, y) });
    }
  }
}

function distributeMachines(machineCount: number, rows: number): number[] {
  return Array.from({ length: rows }, (_, row) =>
    Math.floor(machineCount / rows) + (row < machineCount % rows ? 1 : 0));
}

function buildOneInputSourcePanel(
  planned: PlannedRecipe,
  beltName: string,
  _splitterName: string,
  requestedRows?: number,
): SourcePanel | undefined {
  if (planned.recipe.ingredients.length !== 1 || planned.recipe.ingredients[0].type !== "item" ||
    planned.materialType !== "item") return undefined;
  // Alternate the loading side of adjacent machine rows. Each pair shares its
  // output belt, while neighboring pairs share an input belt. This is the same
  // dense furnace/assembler grid principle used in hand-built smelting blocks,
  // generalized from entity geometry rather than a recipe name.
  const rows = requestedRows ?? Math.min(8, planned.machineCount);
  if (rows < 1 || rows > Math.min(8, planned.machineCount)) return undefined;
  const rowMachines = distributeMachines(planned.machineCount, rows);
  const rowYs = Array.from({ length: rows }, (_, row) => 3 + row * 6);
  const maximumMachines = Math.max(...rowMachines);
  const lastX = (maximumMachines - 1) * 4;
  const rightX = lastX + 3;
  const drafts: Draft[] = [];
  const input = planned.recipe.ingredients[0].name;
  const undergroundName = beltName === "transport-belt"
    ? "underground-belt"
    : beltName === "fast-transport-belt"
      ? "fast-underground-belt"
      : "express-underground-belt";

  const inputRows = Array.from({ length: Math.ceil(rows / 2) + (rows % 2 === 0 ? 1 : 0) },
    (_, index) => index * 12);
  const pairRows = Array.from({ length: Math.ceil(rows / 2) }, (_, index) => 6 + index * 12);
  const outputColumns = pairRows.map((_, index) => -12 + index);
  inputRows.forEach((y, index) => {
    const eastbound = index % 2 === 0;
    const startX = index === 0 ? -6 : eastbound ? -2 : rightX - 1;
    const endX = eastbound ? rightX : -3;
    const horizontal = Array.from(
      { length: Math.abs(endX - startX) + 1 },
      (_, offset) => ({ x: startX + (eastbound ? offset : -offset), y }),
    );
    addBeltPath(
      drafts,
      "input-belt",
      input,
      beltName,
      horizontal,
      index + 1 < inputRows.length ? 8 : eastbound ? 4 : 12,
    );
    if (index + 1 < inputRows.length) {
      addVerticalBelt(
        drafts,
        input,
        beltName,
        undergroundName,
        endX,
        y + 1,
        inputRows[index + 1],
        pairRows,
        eastbound ? 12 : 4,
      );
    }
  });

  rowYs.forEach((machineY, row) => {
    const northInput = row % 2 === 0;
    for (let machine = 0; machine < rowMachines[row]; machine += 1) {
      const centerX = machine * 4;
      drafts.push({
        role: "machine",
        material: planned.material,
        recipe: planned.recipe.id,
        name: planned.recipe.machine.name,
        position: tilePosition(centerX, machineY),
        direction: 0,
        recipeSetting: planned.recipe.id,
      });
      drafts.push({
        role: "input-inserter",
        material: input,
        recipe: planned.recipe.id,
        name: "bulk-inserter",
        position: tilePosition(centerX, machineY + (northInput ? -2 : 2)),
        direction: northInput ? 0 : 8,
      });
      drafts.push({
        role: "output-inserter",
        material: planned.material,
        recipe: planned.recipe.id,
        name: "bulk-inserter",
        position: tilePosition(centerX, machineY + (northInput ? 2 : -2)),
        direction: northInput ? 0 : 8,
      });
      if (machine % 2 === 0) {
        drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(centerX + 2, machineY + (northInput ? 1 : -1)) });
      }
    }
  });

  pairRows.forEach((y) => {
    const outputColumn = outputColumns[pairRows.indexOf(y)];
    for (let x = outputColumn; x <= lastX + 1; x += 1) {
      drafts.push({
        role: "output-belt",
        material: planned.material,
        name: beltName,
        position: tilePosition(x, y),
        direction: x === outputColumn ? 8 : 12,
      });
    }
  });
  if (pairRows.length === 1) {
    const outputY = pairRows[0];
    const outputCorner = drafts.find((draft) =>
      draft.role === "output-belt" && draft.material === planned.material &&
      Math.floor(draft.position.x) === outputColumns[0] && Math.floor(draft.position.y) === outputY);
    if (!outputCorner) throw new Error(`Missing single-pair output corner for ${planned.material}.`);
    outputCorner.direction = 12;
    for (let x = outputColumns[0] - 1; x >= outputColumns[0] - 5; x -= 1) {
      drafts.push({ role: "output-belt", material: planned.material, name: beltName, position: tilePosition(x, outputY), direction: 12 });
    }
    return {
      drafts,
      inputPositions: new Map([[input, tilePosition(-6, 0)]]),
      outputPosition: tilePosition(outputColumns[0] - 5, outputY),
      outputDirection: 12,
    };
  }

  // Merge full two-lane row belts with priority splitters rather than side
  // loading them onto one lane of a vertical collector.
  const firstMergeY = Math.max(...inputRows, ...pairRows) + 3;
  outputColumns.forEach((column, index) => {
    addVerticalBelt(
      drafts,
      planned.material,
      beltName,
      undergroundName,
      column,
      pairRows[index] + 1,
      firstMergeY - 1,
      [...inputRows, ...pairRows].filter((row) => row !== pairRows[index]),
      8,
    );
  });
  const survivingColumns: number[] = [];
  for (let index = 0; index < outputColumns.length; index += 2) {
    if (index + 1 >= outputColumns.length) {
      survivingColumns.push(outputColumns[index]);
      continue;
    }
    const leftColumn = outputColumns[index];
    drafts.push({
      role: "splitter",
      material: planned.material,
      name: _splitterName,
      position: { x: leftColumn + 1, y: firstMergeY + 0.5 },
      direction: 8,
      outputPriority: index === 0 ? "left" : "right",
    });
    survivingColumns.push(index === 0 ? leftColumn + 1 : leftColumn);
  }
  let outputColumn = survivingColumns[0];
  let outputY = firstMergeY + 1;
  if (survivingColumns.length === 2) {
    const secondMergeY = firstMergeY + 3;
    survivingColumns.forEach((column) => {
      for (let y = firstMergeY + 1; y < secondMergeY; y += 1) {
        drafts.push({ role: "output-belt", material: planned.material, name: beltName, position: tilePosition(column, y), direction: 8 });
      }
    });
    drafts.push({
      role: "splitter",
      material: planned.material,
      name: _splitterName,
      position: { x: survivingColumns[0] + 1, y: secondMergeY + 0.5 },
      direction: 8,
      outputPriority: "right",
    });
    outputColumn = survivingColumns[0];
    outputY = secondMergeY + 1;
  }
  drafts.push({ role: "output-belt", material: planned.material, name: beltName, position: tilePosition(outputColumn, outputY), direction: 12 });
  for (let x = outputColumn - 1; x >= outputColumn - 5; x -= 1) {
    drafts.push({ role: "output-belt", material: planned.material, name: beltName, position: tilePosition(x, outputY), direction: 12 });
  }
  return {
    drafts,
    inputPositions: new Map([[input, tilePosition(-6, 0)]]),
    outputPosition: tilePosition(outputColumn - 5, outputY),
    outputDirection: 12,
  };
}

function buildItemFluidSourcePanel(
  planned: PlannedRecipe,
  beltName: string,
): SourcePanel | undefined {
  const item = planned.recipe.ingredients.find((ingredient) => ingredient.type === "item");
  const fluid = planned.recipe.ingredients.find((ingredient) => ingredient.type === "fluid");
  if (!item || !fluid || planned.recipe.ingredients.length !== 2 || planned.materialType !== "item") return undefined;
  const drafts: Draft[] = [];
  const undergroundName = beltName === "transport-belt"
    ? "underground-belt"
    : beltName === "fast-transport-belt"
      ? "fast-underground-belt"
      : "express-underground-belt";
  const machineY = 5;
  const machineXs = Array.from({ length: planned.machineCount }, (_, index) => index * 6);
  const lastX = machineXs.at(-1)!;
  for (let x = -6; x <= lastX + 2; x += 1) {
    drafts.push({ role: "input-belt", material: item.name, name: beltName, position: tilePosition(x, machineY + 3), direction: 4 });
  }
  for (let x = -6; x <= lastX + 1; x += 1) {
    drafts.push({ role: "pipe", material: fluid.name, name: "pipe", position: tilePosition(x, machineY - 5) });
  }
  machineXs.forEach((centerX, index) => {
    drafts.push({
      role: "machine",
      material: planned.material,
      recipe: planned.recipe.id,
      name: planned.recipe.machine.name,
      position: tilePosition(centerX, machineY),
      direction: 0,
      recipeSetting: planned.recipe.id,
    });
    drafts.push({ role: "input-inserter", material: item.name, recipe: planned.recipe.id, name: "bulk-inserter", position: tilePosition(centerX, machineY + 2), direction: 8 });
    const connectorX = planned.recipe.machine.name === "chemical-plant" ? centerX - 1 : centerX;
    for (let y = machineY - 4; y <= machineY - 2; y += 1) {
      drafts.push({ role: "pipe", material: fluid.name, recipe: planned.recipe.id, name: "pipe", position: tilePosition(connectorX, y) });
    }
    drafts.push({ role: "output-inserter", material: planned.material, recipe: planned.recipe.id, name: "bulk-inserter", position: tilePosition(centerX + 2, machineY), direction: 12 });
    drafts.push({ role: "output-belt", material: planned.material, name: beltName, position: tilePosition(centerX + 3, machineY), direction: 8 });
    drafts.push({ role: "output-belt", material: planned.material, name: beltName, position: tilePosition(centerX + 3, machineY + 1), direction: 8 });
    drafts.push({ role: "underground-belt", material: planned.material, name: undergroundName, position: tilePosition(centerX + 3, machineY + 2), direction: 8, undergroundType: "input" });
    drafts.push({ role: "underground-belt", material: planned.material, name: undergroundName, position: tilePosition(centerX + 3, machineY + 4), direction: 8, undergroundType: "output" });
    drafts.push({ role: "output-belt", material: planned.material, name: beltName, position: tilePosition(centerX + 3, machineY + 5), direction: 4 });
    if (index % 2 === 0) drafts.push({ role: "power-pole", name: "substation", position: tilePosition(centerX + 3, machineY - 3) });
  });
  for (let x = 3; x <= lastX + 8; x += 1) {
    if (machineXs.some((centerX) => centerX + 3 === x)) continue;
    drafts.push({ role: "output-belt", material: planned.material, name: beltName, position: tilePosition(x, machineY + 5), direction: 4 });
  }
  return {
    drafts,
    inputPositions: new Map([
      [item.name, tilePosition(-6, machineY + 3)],
      [fluid.name, tilePosition(-6, machineY - 5)],
    ]),
    outputPosition: tilePosition(lastX + 8, machineY + 5),
    outputDirection: 4,
  };
}

function nominalOutputPerMachine(planned: PlannedRecipe): number {
  return planned.recipe.result.amount * planned.recipe.machine.craftingSpeed / planned.recipe.energySeconds;
}

/**
 * Finds a four-node production motif entirely from graph adjacency, recipe
 * arity, fluid boundaries, and the 3:2 direct-insertion ratio. Material and
 * recipe identifiers are deliberately opaque.
 */
function detectHierarchicalPattern(plan: ChainPlan): HierarchicalPattern | undefined {
  if (plan.targetType !== "item") return undefined;
  const terminal = plan.recipes.find((planned) => planned.material === plan.target);
  if (!terminal || terminal.recipe.machine.name !== "assembling-machine-3") return undefined;
  const terminalItems = terminal.recipe.ingredients.filter((ingredient) => ingredient.type === "item");
  const terminalFluids = terminal.recipe.ingredients.filter((ingredient) => ingredient.type === "fluid");
  if (terminalItems.length !== 2 || terminalFluids.length === 0) return undefined;

  for (const source of plan.recipes) {
    if (source.materialType !== "item" || source.recipe.machine.name !== "assembling-machine-3" ||
      source.recipe.ingredients.length !== 1 || source.recipe.ingredients[0].type !== "item") continue;
    for (const primary of plan.recipes) {
      const sourceIngredient = primary.recipe.ingredients.find((ingredient) =>
        ingredient.type === "item" && ingredient.name === source.material);
      const primaryOther = primary.recipe.ingredients.filter((ingredient) => ingredient.name !== source.material);
      if (!sourceIngredient || primaryOther.length !== 1 || primaryOther[0].type !== "item" ||
        primary.recipe.machine.name !== "assembling-machine-3") continue;
      const sourceMachinesPerPrimaryMachine =
        sourceIngredient.amount * primary.recipe.machine.craftingSpeed / primary.recipe.energySeconds /
        nominalOutputPerMachine(source);
      if (Math.abs(sourceMachinesPerPrimaryMachine - 1.5) > 1e-9) continue;

      for (const secondary of plan.recipes) {
        if (secondary.recipe.machine.name !== "assembling-machine-3") continue;
        const secondaryNames = new Set(secondary.recipe.ingredients
          .filter((ingredient) => ingredient.type === "item")
          .map((ingredient) => ingredient.name));
        const secondaryOther = secondary.recipe.ingredients.filter((ingredient) =>
          ingredient.name !== source.material && ingredient.name !== primary.material);
        if (secondaryNames.size !== 3 || !secondaryNames.has(source.material) ||
          !secondaryNames.has(primary.material) || secondaryOther.length !== 1 ||
          secondaryOther[0].type !== "item") continue;
        if (!terminalItems.some((ingredient) => ingredient.name === primary.material) ||
          !terminalItems.some((ingredient) => ingredient.name === secondary.material)) continue;

        const terminalCrafts = terminal.craftsPerSecond;
        return {
          source,
          primary,
          secondary,
          terminal,
          sourceBoundary: source.recipe.ingredients[0],
          primaryBoundary: primaryOther[0],
          secondaryBoundary: secondaryOther[0],
          terminalFluids,
          primaryForTerminalPerSecond:
            terminalCrafts * terminalItems.find((ingredient) => ingredient.name === primary.material)!.amount,
          secondaryForTerminalPerSecond:
            terminalCrafts * terminalItems.find((ingredient) => ingredient.name === secondary.material)!.amount,
        };
      }
    }
  }
  return undefined;
}

function scaledSubplan(
  original: ChainPlan,
  target: PlannedRecipe,
  outputPerSecond: number,
  boundaries: Set<string>,
): ChainPlan {
  const templateByMaterial = new Map(original.recipes.map((planned) => [planned.material, planned]));
  const demand = new Map<string, number>();
  const ordered: PlannedRecipe[] = [];
  const visiting = new Set<string>();
  const boundaryTypes = new Map<string, MaterialType>();

  const visit = (material: string, type: MaterialType, required: number): void => {
    demand.set(material, (demand.get(material) ?? 0) + required);
    if (boundaries.has(material)) {
      boundaryTypes.set(material, type);
      return;
    }
    if (visiting.has(material)) throw new Error(`Recursive recipe loop at ${material}.`);
    const template = templateByMaterial.get(material);
    if (!template) throw new Error(`Missing hierarchical producer for ${material}.`);
    visiting.add(material);
    const crafts = required / template.recipe.result.amount;
    template.recipe.ingredients.forEach((ingredient) => visit(
      ingredient.name,
      ingredient.type,
      crafts * ingredient.amount,
    ));
    visiting.delete(material);
    const nominalCapacity = nominalOutputPerMachine(template);
    const safeCapacity = nominalCapacity * 0.9;
    const existing = ordered.find((planned) => planned.material === material);
    if (existing) {
      existing.outputPerSecond += required;
      existing.designedOutputPerSecond += required;
      existing.craftsPerSecond += crafts;
      existing.machineCount = Math.ceil(existing.designedOutputPerSecond / safeCapacity - 1e-12);
      existing.ingredientRates = existing.recipe.ingredients.map((ingredient) => ({
        ...ingredient,
        perSecond: existing.craftsPerSecond * ingredient.amount,
      }));
    } else {
      ordered.push({
        material,
        materialType: template.materialType,
        recipe: template.recipe,
        outputPerSecond: required,
        designedOutputPerSecond: required,
        craftsPerSecond: crafts,
        machineCount: Math.max(1, Math.ceil(required / safeCapacity - 1e-12)),
        machineCapacityPerSecond: safeCapacity,
        ingredientRates: template.recipe.ingredients.map((ingredient) => ({
          ...ingredient,
          perSecond: crafts * ingredient.amount,
        })),
      });
    }
  };
  visit(target.material, target.materialType, outputPerSecond);

  const inputs: PlannedInput[] = [...boundaries]
    .filter((material) => (demand.get(material) ?? 0) > 0)
    .map((material) => {
      const requiredPerSecond = demand.get(material)!;
      const type = boundaryTypes.get(material)!;
      const maximumPerSecond = type === "item" ? original.beltCapacityPerSecond : original.pipeCapacityPerSecond;
      return { name: material, type, requiredPerSecond, maximumPerSecond, utilization: requiredPerSecond / maximumPerSecond };
    });
  return {
    ...original,
    requestedOutputPerSecond: outputPerSecond,
    effectiveOutputPerSecond: outputPerSecond,
    maximumOutputPerSecond: outputPerSecond,
    clamped: false,
    target: target.material,
    targetType: target.materialType,
    inputs,
    recipes: ordered,
    materialRates: Object.fromEntries(demand),
    unitInputRequirements: Object.fromEntries(inputs.map((input) => [input.name, input.requiredPerSecond / outputPerSecond])),
    constraints: [],
    limitingConstraints: [],
  };
}

function translateIsland(drafts: Draft[], island: Island): void {
  for (const draft of island.layout.drafts) {
    drafts.push({
      ...draft,
      position: { x: draft.position.x + island.x, y: draft.position.y + island.y },
    });
  }
}

function translatedInputs(island: Island): PortTap[] {
  return [...island.layout.inputPositions].map(([material, position]) => ({
    material,
    type: "item" as const,
    x: Math.floor(position.x) + island.x,
    y: Math.floor(position.y) + island.y,
  }));
}

function translatedOutput(island: Island): { x: number; y: number } {
  const position = floorPosition(island.layout.outputPosition);
  return { x: position.x + island.x, y: position.y + island.y };
}

function translateSourcePanel(
  targetDrafts: Draft[],
  panel: SourcePanel,
  x: number,
  y: number,
): { inputs: Map<string, { x: number; y: number }>; output: { x: number; y: number } } {
  panel.drafts.forEach((draft) => targetDrafts.push({
    ...draft,
    position: { x: draft.position.x + x, y: draft.position.y + y },
  }));
  return {
    inputs: new Map([...panel.inputPositions].map(([material, position]) => [material, {
      x: position.x + x,
      y: position.y + y,
    }])),
    output: {
      x: panel.outputPosition.x + x,
      y: panel.outputPosition.y + y,
    },
  };
}

interface PackedPanelGeometry {
  planned: PlannedRecipe;
  panel: SourcePanel;
  occupiedTiles: Array<{ x: number; y: number }>;
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
}

interface PackedPanelPlacement {
  geometry: PackedPanelGeometry;
  translateX: number;
  translateY: number;
}

interface PanelPackingState {
  occupancy: Set<string>;
  placements: PackedPanelPlacement[];
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
  score: number;
}

function occupiedDraftTiles(draft: Draft): Array<{ x: number; y: number }> {
  const half = draftHalfSize(draft);
  const tiles: Array<{ x: number; y: number }> = [];
  for (let x = Math.floor(draft.position.x - half.x); x <= Math.floor(draft.position.x + half.x); x += 1) {
    for (let y = Math.floor(draft.position.y - half.y); y <= Math.floor(draft.position.y + half.y); y += 1) {
      tiles.push({ x, y });
    }
  }
  return tiles;
}

function geometryForPanel(planned: PlannedRecipe, panel: SourcePanel): PackedPanelGeometry {
  const byKey = new Map<string, { x: number; y: number }>();
  panel.drafts.flatMap(occupiedDraftTiles).forEach((tile) => byKey.set(`${tile.x},${tile.y}`, tile));
  const occupiedTiles = [...byKey.values()];
  return {
    planned,
    panel,
    occupiedTiles,
    minimumX: Math.min(...occupiedTiles.map((tile) => tile.x)),
    maximumX: Math.max(...occupiedTiles.map((tile) => tile.x)),
    minimumY: Math.min(...occupiedTiles.map((tile) => tile.y)),
    maximumY: Math.max(...occupiedTiles.map((tile) => tile.y)),
  };
}

function panelPlacementCandidates(
  state: PanelPackingState,
  geometry: PackedPanelGeometry,
  virtualPort: { x: number; y: number },
  limit: number,
  preferWestOfPort = false,
): PanelPackingState[] {
  const candidates: Array<{ translateX: number; translateY: number; score: number;
    minimumX: number; maximumX: number; minimumY: number; maximumY: number }> = [];
  const minimumTranslateX = state.minimumX - geometry.maximumX - 2;
  const maximumTranslateX = state.maximumX - geometry.minimumX + 2;
  const minimumTranslateY = state.minimumY - geometry.maximumY - 2;
  const maximumTranslateY = state.maximumY - geometry.minimumY + 2;
  const localOutput = floorPosition(geometry.panel.outputPosition);
  const outputStep = geometry.panel.outputDirection === 12 ? -1 : 1;
  for (let translateX = minimumTranslateX; translateX <= maximumTranslateX; translateX += 1) {
    for (let translateY = minimumTranslateY; translateY <= maximumTranslateY; translateY += 1) {
      const panelMinimumX = geometry.minimumX + translateX;
      const panelMaximumX = geometry.maximumX + translateX;
      const panelMinimumY = geometry.minimumY + translateY;
      const panelMaximumY = geometry.maximumY + translateY;
      const minimumX = Math.min(state.minimumX, panelMinimumX);
      const maximumX = Math.max(state.maximumX, panelMaximumX);
      const minimumY = Math.min(state.minimumY, panelMinimumY);
      const maximumY = Math.max(state.maximumY, panelMaximumY);
      const width = maximumX - minimumX + 1;
      const height = maximumY - minimumY + 1;
      const outputX = localOutput.x + translateX;
      const outputY = localOutput.y + translateY;
      if (preferWestOfPort && outputX >= virtualPort.x - 1) continue;
      const distance = Math.abs(outputX - virtualPort.x) + Math.abs(outputY - virtualPort.y);
      const eastOverflow = preferWestOfPort ? Math.max(0, panelMaximumX - virtualPort.x + 2) : 0;
      const edgeDistance = geometry.panel.inputPositions.size === 0 ? 0 : Math.min(
        ...[...geometry.panel.inputPositions.values()].map((position) =>
          Math.max(0, floorPosition(position).x + translateX - minimumX)),
      );
      candidates.push({
        translateX,
        translateY,
        minimumX,
        maximumX,
        minimumY,
        maximumY,
        score: width * height * 100 + Math.max(width, height) * 18 + distance * 7 + edgeDistance * 2 +
          eastOverflow * 10_000,
      });
    }
  }
  candidates.sort((left, right) => left.score - right.score ||
    left.translateY - right.translateY || left.translateX - right.translateX);
  const accepted: PanelPackingState[] = [];
  for (const candidate of candidates) {
    if (accepted.length >= limit) break;
    const outputX = localOutput.x + candidate.translateX + outputStep;
    const outputY = localOutput.y + candidate.translateY;
    if (state.occupancy.has(`${outputX},${outputY}`)) continue;
    let collision = false;
    const outsideExistingBounds =
      candidate.maximumX < state.minimumX - 1 || candidate.minimumX > state.maximumX + 1 ||
      candidate.maximumY < state.minimumY - 1 || candidate.minimumY > state.maximumY + 1;
    if (!outsideExistingBounds) {
      collision = geometry.occupiedTiles.some((tile) => {
        const x = tile.x + candidate.translateX;
        const y = tile.y + candidate.translateY;
        return state.occupancy.has(`${x},${y}`) || state.occupancy.has(`${x - 1},${y}`) ||
          state.occupancy.has(`${x + 1},${y}`) || state.occupancy.has(`${x},${y - 1}`) ||
          state.occupancy.has(`${x},${y + 1}`);
      });
    }
    if (collision) continue;
    const occupancy = new Set(state.occupancy);
    geometry.occupiedTiles.forEach((tile) =>
      occupancy.add(`${tile.x + candidate.translateX},${tile.y + candidate.translateY}`));
    accepted.push({
      occupancy,
      placements: [...state.placements, {
        geometry,
        translateX: candidate.translateX,
        translateY: candidate.translateY,
      }],
      minimumX: candidate.minimumX,
      maximumX: candidate.maximumX,
      minimumY: candidate.minimumY,
      maximumY: candidate.maximumY,
      score: candidate.score,
    });
  }
  return accepted;
}

function searchPanelPackings(
  drafts: Draft[],
  panelGroups: Array<{ planned: PlannedRecipe; panels: SourcePanel[] }>,
  virtualPorts: Map<string, { x: number; y: number }>,
  reservedTiles: Set<string> = new Set(),
  candidateLimit = 4,
  beamWidth = 20,
  preferWestOfPorts = false,
): PanelPackingState[] {
  const occupancy = new Set<string>();
  drafts.flatMap(occupiedDraftTiles).forEach((tile) => occupancy.add(`${tile.x},${tile.y}`));
  const occupied = [...occupancy].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  });
  reservedTiles.forEach((tile) => occupancy.add(tile));
  let states: PanelPackingState[] = [{
    occupancy,
    placements: [],
    minimumX: Math.min(...occupied.map((tile) => tile.x)),
    maximumX: Math.max(...occupied.map((tile) => tile.x)),
    minimumY: Math.min(...occupied.map((tile) => tile.y)),
    maximumY: Math.max(...occupied.map((tile) => tile.y)),
    score: 0,
  }];
  const groups = panelGroups.map(({ planned, panels }) => ({
    planned,
    geometries: panels.map((panel) => geometryForPanel(planned, panel)),
  })).sort((left, right) => right.planned.machineCount - left.planned.machineCount ||
    left.planned.material.localeCompare(right.planned.material));
  for (const group of groups) {
    const virtualPort = virtualPorts.get(group.planned.material);
    if (!virtualPort) throw new Error(`Missing virtual leaf port for ${group.planned.material}.`);
    states = states.flatMap((state) => group.geometries.flatMap((geometry) =>
      panelPlacementCandidates(state, geometry, virtualPort, candidateLimit, preferWestOfPorts)))
      .sort((left, right) => left.score - right.score)
      .slice(0, beamWidth);
    if (states.length === 0) throw new Error(`No collision-free panel placement exists for ${group.planned.material}.`);
  }
  return states;
}

function directionVector(direction: CardinalDirection): { x: number; y: number } {
  if (direction === 0) return { x: 0, y: -1 };
  if (direction === 4) return { x: 1, y: 0 };
  if (direction === 8) return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

function undergroundEndpointReach(name: string): number {
  if (name === "underground-belt") return 6;
  if (name === "fast-underground-belt") return 8;
  return 10;
}

/**
 * Underground belts may cross at right angles, and different tiers may weave,
 * but two tunnels of the same tier cannot occupy the same collinear span. The
 * surface occupancy grid does not describe that hidden constraint, so expose
 * each already-paired tunnel as axis-qualified underground tiles for routing.
 */
function occupiedUndergroundTunnelTiles(drafts: Draft[]): Set<string> {
  const endpoints = drafts.filter((draft) => draft.undergroundType !== undefined && draft.direction !== undefined);
  const occupied = new Set<string>();
  for (const input of endpoints.filter((draft) => draft.undergroundType === "input")) {
    const vector = directionVector(input.direction!);
    const candidates = endpoints.filter((output) => {
      if (output.undergroundType !== "output" || output.name !== input.name ||
        output.direction !== input.direction) return false;
      const deltaX = Math.floor(output.position.x) - Math.floor(input.position.x);
      const deltaY = Math.floor(output.position.y) - Math.floor(input.position.y);
      const projection = deltaX * vector.x + deltaY * vector.y;
      const perpendicular = deltaX * vector.y - deltaY * vector.x;
      return perpendicular === 0 && projection > 0 && projection <= undergroundEndpointReach(input.name);
    }).sort((left, right) =>
      Math.abs(left.position.x - input.position.x) + Math.abs(left.position.y - input.position.y) -
      Math.abs(right.position.x - input.position.x) - Math.abs(right.position.y - input.position.y));
    const output = candidates[0];
    if (!output) continue;
    const inputTile = floorPosition(input.position);
    const outputTile = floorPosition(output.position);
    const axis = vector.x === 0 ? "v" : "h";
    const fixed = vector.x === 0 ? inputTile.x : inputTile.y;
    const minimum = vector.x === 0
      ? Math.min(inputTile.y, outputTile.y)
      : Math.min(inputTile.x, outputTile.x);
    const maximum = vector.x === 0
      ? Math.max(inputTile.y, outputTile.y)
      : Math.max(inputTile.x, outputTile.x);
    for (let coordinate = minimum; coordinate <= maximum; coordinate += 1) {
      occupied.add(`${input.name}:${axis}:${fixed}:${coordinate}`);
    }
  }
  return occupied;
}

function routePanelOutput(
  drafts: Draft[],
  material: string,
  outputPosition: { x: number; y: number },
  outputDirection: CardinalDirection,
  inputPosition: { x: number; y: number },
  beltName: string,
  reservedIngressTiles: Set<string>,
): boolean {
  const occupancy = new Set<string>();
  drafts.flatMap(occupiedDraftTiles).forEach((tile) => occupancy.add(`${tile.x},${tile.y}`));
  const incomingFeedForbidden = new Set<string>();
  drafts.filter((draft) =>
    draft.undergroundType !== "input" && draft.direction !== undefined &&
    (draft.name.includes("transport-belt") || draft.name.includes("underground-belt") ||
      draft.name.includes("splitter")))
    .forEach((draft) => {
      const vector = directionVector(draft.direction!);
      occupiedDraftTiles(draft).forEach((tile) =>
        incomingFeedForbidden.add(`${tile.x + vector.x},${tile.y + vector.y}`));
    });
  const output = floorPosition(outputPosition);
  const input = floorPosition(inputPosition);
  const inputDraft = drafts.find((draft) =>
    draft.material === material && draft.direction !== undefined &&
    Math.floor(draft.position.x) === input.x && Math.floor(draft.position.y) === input.y &&
    (draft.name.includes("transport-belt") || draft.name.includes("underground-belt") ||
      draft.name.includes("splitter")));
  if (!inputDraft || inputDraft.direction === undefined) return false;
  const inputDirection = inputDraft.direction;
  const inputVector = directionVector(inputDirection);
  const goal = { x: input.x - inputVector.x, y: input.y - inputVector.y };
  const initialVector = directionVector(outputDirection);
  const start = { x: output.x + initialVector.x, y: output.y + initialVector.y, direction: outputDirection };
  // The source output is expected to feed the first route tile; every other
  // pre-existing transport edge remains forbidden to prevent accidental
  // same-material T-junctions and loops.
  incomingFeedForbidden.delete(`${start.x},${start.y}`);
  if (occupancy.has(`${start.x},${start.y}`) || occupancy.has(`${goal.x},${goal.y}`)) return false;
  const occupied = [...occupancy].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  });
  const undergroundName = beltName === "transport-belt"
    ? "underground-belt"
    : beltName === "fast-transport-belt"
      ? "fast-underground-belt"
      : "express-underground-belt";
  const undergroundTunnelTiles = occupiedUndergroundTunnelTiles(drafts);
  const padding = 8;
  const minimumX = Math.min(start.x, goal.x, ...occupied.map((tile) => tile.x)) - padding;
  const maximumX = Math.max(start.x, goal.x, ...occupied.map((tile) => tile.x)) + padding;
  const minimumY = Math.min(start.y, goal.y, ...occupied.map((tile) => tile.y)) - padding;
  const maximumY = Math.max(start.y, goal.y, ...occupied.map((tile) => tile.y)) + padding;
  interface SearchNode {
    x: number;
    y: number;
    direction: CardinalDirection;
    arrivedUnderground: boolean;
    cost: number;
    estimate: number;
    key: string;
  }
  const nodes: SearchNode[] = [];
  const push = (node: SearchNode): void => {
    nodes.push(node);
    let index = nodes.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (nodes[parent].estimate <= node.estimate) break;
      nodes[index] = nodes[parent];
      index = parent;
    }
    nodes[index] = node;
  };
  const pop = (): SearchNode | undefined => {
    if (nodes.length === 0) return undefined;
    const first = nodes[0];
    const last = nodes.pop()!;
    if (nodes.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= nodes.length) break;
        const right = left + 1;
        const child = right < nodes.length && nodes[right].estimate < nodes[left].estimate ? right : left;
        if (nodes[child].estimate >= last.estimate) break;
        nodes[index] = nodes[child];
        index = child;
      }
      nodes[index] = last;
    }
    return first;
  };
  const keyFor = (x: number, y: number, direction: CardinalDirection, arrivedUnderground: boolean): string =>
    `${x},${y},${direction},${arrivedUnderground ? 1 : 0}`;
  const heuristic = (x: number, y: number): number => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  const startKey = keyFor(start.x, start.y, start.direction, false);
  const best = new Map([[startKey, 0]]);
  const previous = new Map<string, string>();
  const pointByKey = new Map([[startKey, { ...start, arrivedUnderground: false }]]);
  push({ ...start, arrivedUnderground: false, cost: 0, estimate: heuristic(start.x, start.y), key: startKey });
  const directions: CardinalDirection[] = [0, 4, 8, 12];
  let goalKey: string | undefined;
  while (nodes.length > 0) {
    const current = pop()!;
    if (current.cost !== best.get(current.key)) continue;
    if (current.x === goal.x && current.y === goal.y) {
      if (!current.arrivedUnderground || inputDirection === current.direction) {
        goalKey = current.key;
        break;
      }
    }
    for (const direction of directions) {
      if ((direction + 8) % 16 === current.direction) continue;
      const vector = directionVector(direction);
      const x = current.x + vector.x;
      const y = current.y + vector.y;
      if (x < minimumX || x > maximumX || y < minimumY || y > maximumY) continue;
      if (reservedIngressTiles.has(`${x},${y}`) && (x !== goal.x || y !== goal.y)) continue;
      if (!occupancy.has(`${x},${y}`) && !incomingFeedForbidden.has(`${x},${y}`)) {
        if (current.arrivedUnderground && direction !== current.direction) continue;
        const key = keyFor(x, y, direction, false);
        const cost = current.cost + 1 + (direction === current.direction ? 0 : 0.2);
        if (cost >= (best.get(key) ?? Number.POSITIVE_INFINITY)) continue;
        best.set(key, cost);
        previous.set(key, current.key);
        pointByKey.set(key, { x, y, direction, arrivedUnderground: false });
        push({ x, y, direction, arrivedUnderground: false, cost, estimate: cost + heuristic(x, y), key });
        continue;
      }
      // A belt can cross a congested channel by turning the current free tile
      // into an underground entrance and landing on the first viable tile up
      // to the tier's reach. Entrances cannot turn, and an underground output
      // cannot also be reused as another entrance on the same tile.
      if (current.arrivedUnderground || direction !== current.direction) continue;
      for (let distance = 2; distance <= undergroundEndpointReach(undergroundName); distance += 1) {
        const exitX = current.x + vector.x * distance;
        const exitY = current.y + vector.y * distance;
        if (exitX < minimumX || exitX > maximumX || exitY < minimumY || exitY > maximumY) break;
        if (reservedIngressTiles.has(`${exitX},${exitY}`) && (exitX !== goal.x || exitY !== goal.y)) continue;
        if (occupancy.has(`${exitX},${exitY}`) || incomingFeedForbidden.has(`${exitX},${exitY}`)) continue;
        const axis = vector.x === 0 ? "v" : "h";
        const fixed = vector.x === 0 ? current.x : current.y;
        let overlapsTunnel = false;
        for (let undergroundStep = 0; undergroundStep <= distance; undergroundStep += 1) {
          const coordinate = vector.x === 0
            ? current.y + vector.y * undergroundStep
            : current.x + vector.x * undergroundStep;
          if (undergroundTunnelTiles.has(`${undergroundName}:${axis}:${fixed}:${coordinate}`)) {
            overlapsTunnel = true;
            break;
          }
        }
        if (overlapsTunnel) break;
        const key = keyFor(exitX, exitY, direction, true);
        const cost = current.cost + distance + 2.5;
        if (cost >= (best.get(key) ?? Number.POSITIVE_INFINITY)) break;
        best.set(key, cost);
        previous.set(key, current.key);
        pointByKey.set(key, { x: exitX, y: exitY, direction, arrivedUnderground: true });
        push({
          x: exitX,
          y: exitY,
          direction,
          arrivedUnderground: true,
          cost,
          estimate: cost + heuristic(exitX, exitY),
          key,
        });
        break;
      }
    }
  }
  if (!goalKey) return false;
  const path: Array<{ x: number; y: number; direction: CardinalDirection; arrivedUnderground: boolean }> = [];
  let key: string | undefined = goalKey;
  while (key) {
    const point = pointByKey.get(key)!;
    path.push(point);
    key = previous.get(key);
  }
  path.reverse();
  const finalDirection = inputDirection;
  path.forEach((point, index) => {
    const previousPoint = index > 0 ? path[index - 1] : undefined;
    const nextPoint = path[index + 1];
    const jumpIn = previousPoint !== undefined &&
      Math.abs(previousPoint.x - point.x) + Math.abs(previousPoint.y - point.y) > 1;
    const jumpOut = nextPoint !== undefined &&
      Math.abs(nextPoint.x - point.x) + Math.abs(nextPoint.y - point.y) > 1;
    const direction = jumpOut
      ? point.direction
      : jumpIn
      ? previousPoint!.direction
      : nextPoint
        ? directionBetween(point, nextPoint)
        : finalDirection;
    drafts.push({
      role: jumpIn || jumpOut ? "underground-belt" : "material-bus",
      material,
      name: jumpIn || jumpOut ? undergroundName : beltName,
      position: tilePosition(point.x, point.y),
      direction,
      undergroundType: jumpOut ? "input" : jumpIn ? "output" : undefined,
    });
  });
  return true;
}

function crossMaterialTransportFeed(drafts: Draft[]): string | undefined {
  const transports = drafts.filter((draft) =>
    draft.name.includes("transport-belt") || draft.name.includes("underground-belt") ||
    draft.name.includes("splitter"));
  const byTile = new Map<string, Draft>();
  transports.forEach((draft) => occupiedDraftTiles(draft).forEach((tile) =>
    byTile.set(`${tile.x},${tile.y}`, draft)));
  for (const draft of transports) {
    if (draft.undergroundType === "input" || draft.direction === undefined) continue;
    const vector = directionVector(draft.direction);
    for (const tile of occupiedDraftTiles(draft)) {
      const next = byTile.get(`${tile.x + vector.x},${tile.y + vector.y}`);
      if (next !== undefined && next.material !== draft.material) {
        return `${draft.material} at ${draft.position.x},${draft.position.y} feeds ${next.material} at ${next.position.x},${next.position.y}`;
      }
    }
  }
  return undefined;
}

function connectPanelToVirtualPort(
  drafts: Draft[],
  material: string,
  outputPosition: { x: number; y: number },
  inputPosition: { x: number; y: number },
  beltName: string,
  outputDirection: CardinalDirection,
  approachY: number,
  crossingRows: number[],
  undergroundName: string,
  outerX?: number,
  crossingColumns: number[] = [],
): void {
  const output = floorPosition(outputPosition);
  const input = floorPosition(inputPosition);
  const naturalRouteX = output.x + (outputDirection === 12 ? -1 : 1);
  const routeX = outerX ?? naturalRouteX;
  if (routeX >= input.x - 1) throw new Error(`No west-side source corridor remains for ${material}.`);
  const path: Array<{ x: number; y: number }> = [];
  const initialStep = routeX >= naturalRouteX ? 1 : -1;
  for (let x = naturalRouteX; initialStep > 0 ? x <= routeX : x >= routeX; x += initialStep) {
    path.push({ x, y: output.y });
  }
  const verticalStep = approachY >= output.y ? 1 : -1;
  for (let y = output.y + verticalStep; verticalStep > 0 ? y <= approachY : y >= approachY; y += verticalStep) {
    path.push({ x: routeX, y });
  }
  const finalVerticalStep = input.y >= approachY ? 1 : -1;
  addBeltPath(drafts, "material-bus", material, beltName, path, 4);
  addHorizontalBeltCrossings(
    drafts,
    "material-bus",
    material,
    beltName,
    undergroundName,
    routeX + 1,
    input.x - 2,
    approachY,
    crossingColumns,
  );
  drafts.push({
    role: "material-bus",
    material,
    name: beltName,
    position: tilePosition(input.x - 1, approachY),
    direction: finalVerticalStep > 0 ? 8 : 0,
  });
  addVerticalBelt(
    drafts,
    material,
    beltName,
    undergroundName,
    input.x - 1,
    approachY + finalVerticalStep,
    input.y,
    crossingRows.filter((row) => row !== input.y),
    4,
  );
}

function connectShelfPanelToVirtualPort(
  drafts: Draft[],
  material: string,
  outputPosition: { x: number; y: number },
  outputDirection: CardinalDirection,
  inputPosition: { x: number; y: number },
  beltName: string,
  corridorY: number,
  outerX: number,
  crossingRows: number[],
  escapeColumns: number[],
  outerColumns: number[],
  undergroundName: string,
): void {
  const output = floorPosition(outputPosition);
  const input = floorPosition(inputPosition);
  const escapeX = output.x + (outputDirection === 12 ? -1 : 1);
  drafts.push({
    role: "material-bus",
    material,
    name: beltName,
    position: tilePosition(escapeX, output.y),
    direction: 0,
  });
  addVerticalBelt(
    drafts,
    material,
    beltName,
    undergroundName,
    escapeX,
    output.y - 1,
    corridorY,
    crossingRows,
    12,
  );
  addWestboundBeltCrossings(
    drafts,
    "material-bus",
    material,
    beltName,
    undergroundName,
    escapeX - 1,
    outerX,
    corridorY,
    escapeColumns.filter((column) => column !== escapeX),
    8,
  );
  addVerticalBelt(
    drafts,
    material,
    beltName,
    undergroundName,
    outerX,
    corridorY + 1,
    input.y,
    crossingRows.filter((row) => row !== corridorY),
    4,
  );
  addHorizontalBeltCrossings(
    drafts,
    "material-bus",
    material,
    beltName,
    undergroundName,
    outerX + 1,
    input.x - 1,
    input.y,
    outerColumns.filter((column) => column !== outerX),
  );
}

function draftHalfSize(draft: Draft): { x: number; y: number } {
  if (["assembling-machine-3", "electric-furnace", "chemical-plant"].includes(draft.name)) {
    return { x: 1.35, y: 1.35 };
  }
  if (draft.name === "substation") return { x: 0.85, y: 0.85 };
  if (draft.name.includes("splitter")) {
    return draft.direction === 0 || draft.direction === 8 ? { x: 0.85, y: 0.35 } : { x: 0.35, y: 0.85 };
  }
  return { x: 0.32, y: 0.32 };
}

function canPlace(drafts: Draft[], candidate: Draft): boolean {
  const half = draftHalfSize(candidate);
  return !drafts.some((draft) => {
    const other = draftHalfSize(draft);
    return Math.abs(draft.position.x - candidate.position.x) < half.x + other.x &&
      Math.abs(draft.position.y - candidate.position.y) < half.y + other.y;
  });
}

/** Connects independently compiled islands with a sparse, collision-aware
 * pole spine. Island internals remain responsible for machine coverage. */
function connectPowerComponents(drafts: Draft[]): void {
  const existing = drafts.filter((draft) => draft.role === "power-pole");
  if (existing.length === 0) return;
  const positions = existing.map((draft) => floorPosition(draft.position));
  const parent = positions.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const unite = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  positions.forEach((left, leftIndex) => positions.forEach((right, rightIndex) => {
    if (rightIndex <= leftIndex) return;
    if (Math.hypot(left.x - right.x, left.y - right.y) <= 9) unite(leftIndex, rightIndex);
  }));
  const components = new Map<number, Array<{ x: number; y: number }>>();
  positions.forEach((position, index) => {
    const entries = components.get(find(index)) ?? [];
    entries.push(position);
    components.set(find(index), entries);
  });
  if (components.size <= 1) return;

  const maximumOccupiedY = Math.ceil(Math.max(...drafts.map((draft) => draft.position.y + draftHalfSize(draft).y)));
  const backboneY = maximumOccupiedY + 1;
  const minimumX = Math.min(...positions.map((position) => position.x));
  const maximumX = Math.max(...positions.map((position) => position.x));
  const backboneXs: number[] = [];
  for (let x = minimumX; x < maximumX; x += 8) backboneXs.push(x);
  backboneXs.push(maximumX);
  backboneXs.forEach((x) => {
    const candidate: Draft = { role: "power-pole", name: "medium-electric-pole", position: tilePosition(x, backboneY) };
    if (canPlace(drafts, candidate)) drafts.push(candidate);
  });

  const offsets: ReadonlyArray<readonly [number, number]> = Array.from({ length: 49 }, (_, index) => {
    const offsetX = index % 7 - 3;
    const offsetY = Math.floor(index / 7) - 3;
    return [offsetX, offsetY] as const;
  }).sort((left, right) =>
    Math.abs(left[0]) + Math.abs(left[1]) - Math.abs(right[0]) - Math.abs(right[1]));
  for (const component of components.values()) {
    const representative = [...component].sort((left, right) =>
      right.y - left.y || Math.abs(left.x - minimumX) - Math.abs(right.x - minimumX))[0];
    const targetX = backboneXs.reduce((best, x) =>
      Math.abs(x - representative.x) < Math.abs(best - representative.x) ? x : best, backboneXs[0]);
    const target = { x: targetX, y: backboneY };
    const distance = Math.hypot(target.x - representative.x, target.y - representative.y);
    const segments = Math.ceil(distance / 8);
    let previous = representative;
    for (let segment = 1; segment < segments; segment += 1) {
      const ideal = {
        x: Math.round(representative.x + (target.x - representative.x) * segment / segments),
        y: Math.round(representative.y + (target.y - representative.y) * segment / segments),
      };
      const placed = offsets.map(([offsetX, offsetY]) => ({ x: ideal.x + offsetX, y: ideal.y + offsetY }))
        .find((position) => {
          if (Math.hypot(position.x - previous.x, position.y - previous.y) > 9) return false;
          const candidate: Draft = {
            role: "power-pole",
            name: "medium-electric-pole",
            position: tilePosition(position.x, position.y),
          };
          return canPlace(drafts, candidate);
        });
      if (!placed) throw new Error(`Could not connect the power island near ${ideal.x},${ideal.y}.`);
      drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(placed.x, placed.y) });
      previous = placed;
    }
    while (Math.hypot(target.x - previous.x, target.y - previous.y) > 9) {
      const remaining = Math.hypot(target.x - previous.x, target.y - previous.y);
      const ideal = {
        x: Math.round(previous.x + (target.x - previous.x) * 7 / remaining),
        y: Math.round(previous.y + (target.y - previous.y) * 7 / remaining),
      };
      const placed = offsets.map(([offsetX, offsetY]) => ({ x: ideal.x + offsetX, y: ideal.y + offsetY }))
        .find((position) => {
          if (Math.hypot(position.x - previous.x, position.y - previous.y) > 9 ||
            Math.hypot(target.x - position.x, target.y - position.y) >= remaining) return false;
          return canPlace(drafts, {
            role: "power-pole",
            name: "medium-electric-pole",
            position: tilePosition(position.x, position.y),
          });
        });
      if (!placed) throw new Error("Power-island spine exceeded medium-pole wire reach.");
      drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(placed.x, placed.y) });
      previous = placed;
    }
  }
}

function routeCanonicalOutput(
  drafts: Draft[],
  start: { x: number; y: number },
  side: Side,
  material: string,
  beltName: string,
): { x: number; y: number } {
  if (side === "east") return start;
  const minimumX = Math.floor(Math.min(...drafts.map((draft) => draft.position.x - draftHalfSize(draft).x))) - 6;
  const minimumY = Math.floor(Math.min(...drafts.map((draft) => draft.position.y - draftHalfSize(draft).y))) - 6;
  const maximumX = Math.ceil(Math.max(...drafts.map((draft) => draft.position.x + draftHalfSize(draft).x))) + 3;
  const maximumY = Math.ceil(Math.max(...drafts.map((draft) => draft.position.y + draftHalfSize(draft).y))) + 6;
  const outsideX = maximumX;
  const path: Array<{ x: number; y: number }> = Array.from(
    { length: outsideX - start.x },
    (_, index) => ({ x: start.x + index + 1, y: start.y }),
  );
  if (side === "north") {
    for (let y = start.y - 1; y >= minimumY; y -= 1) path.push({ x: outsideX, y });
  } else if (side === "south" || side === "west") {
    for (let y = start.y + 1; y <= maximumY; y += 1) path.push({ x: outsideX, y });
    if (side === "west") {
      for (let x = outsideX - 1; x >= minimumX; x -= 1) path.push({ x, y: maximumY });
    }
  }
  addBeltPath(
    drafts,
    "output-belt",
    material,
    beltName,
    path,
    side === "north" ? 0 : side === "south" ? 8 : side === "west" ? 12 : 4,
  );
  return path.at(-1)!;
}

function addBoundaryFanout(
  drafts: Draft[],
  taps: PortTap[],
  plan: ChainPlan,
  beltName: string,
  splitterName: string,
  undergroundName: string,
  protectedRows: number[] = [],
  requestedMaterialOrder?: string[],
  forceBoundaryTrunks = false,
): Map<string, { x: number; y: number }> {
  const inputPositions = new Map<string, { x: number; y: number }>();
  const materialOrder = requestedMaterialOrder ??
    plan.inputs.filter((input) => input.type === "item").map((input) => input.name);
  const tapsByMaterial = new Map(materialOrder.map((material) => [
    material,
    taps.filter((tap) => tap.material === material),
  ]));
  // A single feeder tap is already a complete one-belt boundary contract.
  // Eliminate those trunks independently; forcing singleton materials through
  // the splitter network of another material creates needless crossings and
  // can more than double the boundary envelope.
  const fanoutOrder: string[] = [];
  for (const material of materialOrder) {
    const materialTaps = tapsByMaterial.get(material) ?? [];
    if (materialTaps.length === 1 && !forceBoundaryTrunks) {
      inputPositions.set(material, tilePosition(materialTaps[0].x, materialTaps[0].y));
    } else if (materialTaps.length > 0) {
      fanoutOrder.push(material);
    }
  }
  if (fanoutOrder.length === 0) return inputPositions;
  const busPitch = fanoutOrder.length > 4 ? 4 : 3;
  // Keep two surface tiles between the outer bus stack and every terminal
  // tap. An underground output cannot turn on its emergence tile, so placing
  // a bus immediately beside a north-face feeder creates an unpairable final
  // crossing even though the geometric envelope is otherwise collision-free.
  const busBaseY = Math.min(
    -6,
    ...protectedRows.map((row) => row - 3),
    ...taps.map((tap) => tap.y - 4),
  );
  const boundaryBusRows = [
    -2, // shared fluid ingress; item branches tunnel beneath it
    ...protectedRows,
    ...fanoutOrder.flatMap((_, index) => [busBaseY - index * busPitch, busBaseY + 1 - index * busPitch]),
  ];
  const branchXByTap = new Map<PortTap, number>();
  let branchIndex = 0;
  fanoutOrder.forEach((material) => {
    taps.filter((tap) => tap.material === material)
      .sort((left, right) => left.y - right.y)
      .forEach((tap) => {
        branchXByTap.set(tap, -8 - branchIndex * 3);
        branchIndex += 1;
      });
  });
  const allBranchXs = [...branchXByTap.values()];
  const existingVerticalBeltXs = [...new Set(drafts
    .filter((draft) => (draft.direction === 0 || draft.direction === 8) &&
      (draft.name.includes("belt") || draft.name.includes("splitter")))
    .map((draft) => Math.floor(draft.position.x)))];
  const globalStartX = Math.min(...allBranchXs) - 3;
  fanoutOrder.forEach((material, materialIndex) => {
    const materialTaps = taps.filter((tap) => tap.material === material).sort((left, right) => left.y - right.y);
    if (materialTaps.length === 0) return;
    const busY = busBaseY - materialIndex * busPitch;
    const branchXs = materialTaps.map((tap) => branchXByTap.get(tap)!);
    const startX = globalStartX;
    const endX = Math.max(...branchXs);
    const splitterXs = new Set(branchXs.map((x) => x - 1));
    for (let x = startX; x <= endX; x += 1) {
      if (splitterXs.has(x)) continue;
      drafts.push({ role: "input-belt", material, name: beltName, position: tilePosition(x, busY), direction: 4 });
    }
    inputPositions.set(material, tilePosition(startX, busY));
    materialTaps.forEach((tap, tapIndex) => {
      const branchX = branchXs[tapIndex];
      drafts.push({
        role: "splitter",
        material,
        name: splitterName,
        position: { x: branchX - 0.5, y: busY + 1 },
        direction: 4,
      });
      addVerticalBelt(
        drafts,
        material,
        beltName,
        undergroundName,
        branchX,
        busY + 1,
        tap.y,
        boundaryBusRows.filter((row) => row !== tap.y && row !== busY && row !== busY + 1),
        4,
      );
      addHorizontalBeltCrossings(
        drafts,
        "input-belt",
        material,
        beltName,
        undergroundName,
        branchX + 1,
        tap.x - 1,
        tap.y,
        [
          ...allBranchXs.filter((candidate) => candidate !== branchX),
          ...existingVerticalBeltXs.filter((candidate) => candidate !== branchX),
        ],
      );
    });
  });
  return inputPositions;
}

/**
 * Distributes repeated radial-cell contracts with one vertical splitter spine
 * per material. The regular fanout intentionally gives every tap an isolated
 * branch column; that is ideal for short rows but grows quadratically when a
 * high-arity recipe has many machines. Spines keep the same one-belt contract
 * while reducing that network to O(materials × height + taps × width).
 */
function addRadialBoundaryFanout(
  drafts: Draft[],
  taps: PortTap[],
  plan: ChainPlan,
  beltName: string,
  splitterName: string,
  undergroundName: string,
  requestedMaterialOrder: string[],
): Map<string, { x: number; y: number }> {
  const inputPositions = new Map<string, { x: number; y: number }>();
  const materialOrder = requestedMaterialOrder.filter((material, index, all) =>
    all.indexOf(material) === index && taps.some((tap) => tap.material === material));
  const minimumTapY = Math.min(...taps.map((tap) => tap.y));
  const portRows = materialOrder.map((_, index) => minimumTapY - 8 - index * 4);
  const trunkXs = materialOrder.map((_, index) => -10 - index * 3);
  const startX = Math.min(...trunkXs) - 6;

  materialOrder.forEach((material, materialIndex) => {
    const trunkX = trunkXs[materialIndex];
    const portY = portRows[materialIndex];
    addBeltPath(
      drafts,
      "input-belt",
      material,
      beltName,
      horizontalPoints(startX, trunkX, portY),
      8,
    );
    inputPositions.set(material, tilePosition(startX, portY));

    const materialTaps = taps
      .filter((tap) => tap.material === material)
      .sort((left, right) => left.y - right.y);
    let cursorY = portY + 1;
    materialTaps.forEach((tap) => {
      if (cursorY <= tap.y - 2) {
        addVerticalBelt(
          drafts,
          material,
          beltName,
          undergroundName,
          trunkX,
          cursorY,
          tap.y - 2,
          portRows.filter((row) => row > cursorY && row < tap.y - 2),
          8,
        );
      }
      drafts.push({
        role: "splitter",
        material,
        name: splitterName,
        position: { x: trunkX + 1, y: tap.y - 0.5 },
        direction: 8,
      });
      drafts.push({
        role: "ingredient-branch",
        material,
        name: beltName,
        position: tilePosition(trunkX, tap.y),
        direction: 8,
      });
      addHorizontalBeltCrossings(
        drafts,
        "input-belt",
        material,
        beltName,
        undergroundName,
        trunkX + 1,
        tap.x - 1,
        tap.y,
        trunkXs.filter((candidate) => candidate !== trunkX),
      );
      cursorY = tap.y + 1;
    });
  });
  return inputPositions;
}

/** A congestion-aware version of the radial boundary spine. Splitter trunks
 * are floorplanned in a clear western channel, then every branch is handed to
 * the same A* router used for cell-to-cell edges. A failed branch rejects the
 * surrounding floorplan, providing routing feedback instead of stretching a
 * fixed Manhattan bus through occupied cells. */
function addRoutedBoundaryFanout(
  drafts: Draft[],
  taps: PortTap[],
  plan: ChainPlan,
  beltName: string,
  splitterName: string,
  undergroundName: string,
  requestedMaterialOrder: string[],
): Map<string, { x: number; y: number }> | undefined {
  const inputPositions = new Map<string, { x: number; y: number }>();
  const materialOrder = requestedMaterialOrder.filter((material, index, all) =>
    all.indexOf(material) === index && taps.some((tap) => tap.material === material));
  if (materialOrder.length === 0) return inputPositions;
  const minimumTapY = Math.min(...taps.map((tap) => tap.y));
  const portRows = materialOrder.map((_, index) => minimumTapY - 8 - index * 4);
  const trunkXs = materialOrder.map((_, index) => -10 - index * 3);
  const startX = Math.min(...trunkXs) - 6;
  const branches: Array<{ material: string; output: { x: number; y: number }; input: { x: number; y: number } }> = [];

  materialOrder.forEach((material, materialIndex) => {
    const trunkX = trunkXs[materialIndex];
    const portY = portRows[materialIndex];
    addBeltPath(drafts, "input-belt", material, beltName, horizontalPoints(startX, trunkX, portY), 8);
    inputPositions.set(material, tilePosition(startX, portY));
    const materialTaps = taps.filter((tap) => tap.material === material)
      .sort((left, right) => left.y - right.y || left.x - right.x);
    let cursorY = portY + 1;
    materialTaps.forEach((tap) => {
      const branchY = Math.max(tap.y, cursorY + 1);
      if (cursorY <= branchY - 2) {
        addVerticalBelt(
          drafts,
          material,
          beltName,
          undergroundName,
          trunkX,
          cursorY,
          branchY - 2,
          portRows.filter((row) => row > cursorY && row < branchY - 2),
          8,
        );
      }
      drafts.push({
        role: "splitter",
        material,
        name: splitterName,
        position: { x: trunkX + 1, y: branchY - 0.5 },
        direction: 8,
      });
      drafts.push({
        role: "ingredient-branch",
        material,
        name: beltName,
        position: tilePosition(trunkX, branchY),
        direction: 8,
      });
      drafts.push({
        role: "ingredient-branch",
        material,
        name: beltName,
        position: tilePosition(trunkX + 1, branchY),
        direction: 4,
      });
      branches.push({
        material,
        output: tilePosition(trunkX + 1, branchY),
        input: tilePosition(tap.x, tap.y),
      });
      cursorY = branchY + 1;
    });
  });

  const reservedIngressTiles = new Set<string>();
  branches.forEach(({ input }) => {
    const inputTile = floorPosition(input);
    const inputDraft = drafts.find((draft) =>
      Math.floor(draft.position.x) === inputTile.x && Math.floor(draft.position.y) === inputTile.y &&
      draft.direction !== undefined &&
      (draft.name.includes("transport-belt") || draft.name.includes("underground-belt") ||
        draft.name.includes("splitter")));
    if (!inputDraft || inputDraft.direction === undefined) return;
    const vector = directionVector(inputDraft.direction);
    reservedIngressTiles.add(`${inputTile.x - vector.x},${inputTile.y - vector.y}`);
  });
  const orderedBranches = branches.sort((left, right) =>
    Math.abs(right.output.x - right.input.x) + Math.abs(right.output.y - right.input.y) -
    Math.abs(left.output.x - left.input.x) - Math.abs(left.output.y - left.input.y));
  const routed = orderedBranches.every((branch) => routePanelOutput(
      drafts,
      branch.material,
      branch.output,
      4,
      branch.input,
      beltName,
      reservedIngressTiles,
    ));
  return routed ? inputPositions : undefined;
}

const SAFE_COUPLED_BULK_ITEMS_PER_SECOND = 2.31;
const SAFE_COUPLED_LONG_ITEMS_PER_SECOND = 0.5;

/**
 * Compiles an anonymous two-node item graph into two coupled machine rows.
 * The producer and consumer share the intermediate belt directly; external
 * contracts remain ordinary west-facing belts and target output exits east.
 * Eligibility depends only on graph adjacency, arity, rates, and physical
 * inserter capacity. Recipe and material identifiers never affect geometry.
 */
export function buildCoupledRowLayout(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): CanonicalLayout | undefined {
  if (plan.targetType !== "item" || plan.recipes.length !== 2) return undefined;
  const target = plan.recipes.find((planned) => planned.material === plan.target);
  const producer = plan.recipes.find((planned) => planned.material !== plan.target);
  if (!target || !producer || target.materialType !== "item" || producer.materialType !== "item") return undefined;
  if (target.recipe.ingredients.some((ingredient) => ingredient.type !== "item") ||
    producer.recipe.ingredients.some((ingredient) => ingredient.type !== "item")) return undefined;
  const intermediate = target.ingredientRates.find((ingredient) => ingredient.name === producer.material);
  if (!intermediate) return undefined;
  const boundaries = new Set(plan.inputs.map((input) => input.name));
  const producerInputs = [...producer.ingredientRates]
    .filter((ingredient) => boundaries.has(ingredient.name))
    .sort((left, right) => right.perSecond / producer.machineCount - left.perSecond / producer.machineCount ||
      left.name.localeCompare(right.name));
  const targetInputs = target.ingredientRates
    .filter((ingredient) => ingredient.name !== producer.material && boundaries.has(ingredient.name))
    .sort((left, right) => right.perSecond / target.machineCount - left.perSecond / target.machineCount ||
      left.name.localeCompare(right.name));
  if (producerInputs.length !== producer.recipe.ingredients.length ||
    targetInputs.length + 1 !== target.recipe.ingredients.length ||
    producerInputs.length > 2 || targetInputs.length > 2) return undefined;

  const belt = BELTS[beltTier];
  if (producer.outputPerSecond > belt.itemsPerSecond + 1e-9 ||
    intermediate.perSecond > belt.itemsPerSecond + 1e-9) return undefined;
  const inputArmCounts = (ingredients: typeof producerInputs, machineCount: number): number[] =>
    ingredients.map((ingredient, index) => Math.max(1, Math.ceil(
      ingredient.perSecond / machineCount /
        (index === 0 ? SAFE_COUPLED_BULK_ITEMS_PER_SECOND : SAFE_COUPLED_LONG_ITEMS_PER_SECOND) - 1e-12,
    )));
  let producerMachineCount = producer.machineCount;
  while (producerMachineCount < producer.machineCount + 64) {
    const inputArms = inputArmCounts(producerInputs, producerMachineCount);
    const outputArms = Math.ceil(
      producer.outputPerSecond / producerMachineCount / SAFE_COUPLED_BULK_ITEMS_PER_SECOND - 1e-12,
    );
    if (inputArms.reduce((sum, count) => sum + count, 0) <= 3 && outputArms <= 3) break;
    producerMachineCount += 1;
  }
  let targetMachineCount = target.machineCount;
  while (targetMachineCount < target.machineCount + 64) {
    const externalArms = inputArmCounts(targetInputs, targetMachineCount);
    const intermediateArms = Math.ceil(
      intermediate.perSecond / targetMachineCount / SAFE_COUPLED_BULK_ITEMS_PER_SECOND - 1e-12,
    );
    const outputRate = target.outputPerSecond / targetMachineCount;
    if (externalArms.reduce((sum, count) => sum + count, 0) <= 3 && intermediateArms <= 3 &&
      outputRate <= SAFE_COUPLED_BULK_ITEMS_PER_SECOND + 1e-9) break;
    targetMachineCount += 1;
  }
  const producerInputArms = inputArmCounts(producerInputs, producerMachineCount);
  const targetInputArms = inputArmCounts(targetInputs, targetMachineCount);
  const producerOutputArms = Math.ceil(
    producer.outputPerSecond / producerMachineCount / SAFE_COUPLED_BULK_ITEMS_PER_SECOND - 1e-12,
  );
  const targetIntermediateArms = Math.ceil(
    intermediate.perSecond / targetMachineCount / SAFE_COUPLED_BULK_ITEMS_PER_SECOND - 1e-12,
  );
  if (producerInputArms.reduce((sum, count) => sum + count, 0) > 3 || producerOutputArms > 3 ||
    targetInputArms.reduce((sum, count) => sum + count, 0) > 3 || targetIntermediateArms > 3 ||
    target.outputPerSecond / targetMachineCount > SAFE_COUPLED_BULK_ITEMS_PER_SECOND + 1e-9) return undefined;

  const undergroundName = beltTier === "yellow"
    ? "underground-belt"
    : beltTier === "red"
      ? "fast-underground-belt"
      : "express-underground-belt";
  const pitch = 6;
  const producerXs = Array.from({ length: producerMachineCount }, (_, index) => index * pitch);
  const targetXs = Array.from({ length: targetMachineCount }, (_, index) => index * pitch);
  const lastMachineX = Math.max(producerXs.at(-1) ?? 0, targetXs.at(-1) ?? 0);
  const producerY = 0;
  const intermediateY = 3;
  const targetY = 6;
  const collectorY = 12;
  const directTargetOutput = targetXs.length === 1;
  const drafts: Draft[] = [];
  const taps: PortTap[] = [];

  producerInputs.forEach((ingredient, index) => {
    const feederY = producerY - 3 - index;
    taps.push({ material: ingredient.name, type: "item", x: -4, y: feederY });
    addBeltPath(
      drafts,
      "ingredient-feeder",
      ingredient.name,
      belt.entityName,
      horizontalPoints(-4, (producerXs.at(-1) ?? 0) + 2, feederY),
      4,
    );
  });
  targetInputs.forEach((ingredient, index) => {
    const feederY = targetY + 3 + index;
    taps.push({ material: ingredient.name, type: "item", x: -4, y: feederY });
    addBeltPath(
      drafts,
      "ingredient-feeder",
      ingredient.name,
      belt.entityName,
      horizontalPoints(-4, (targetXs.at(-1) ?? 0) + 2, feederY),
      4,
    );
  });

  addBeltPath(
    drafts,
    "material-bus",
    producer.material,
    belt.entityName,
    horizontalPoints(-2, lastMachineX + 2, intermediateY),
    4,
  );

  producerXs.forEach((centerX) => {
    drafts.push({
      role: "machine",
      material: producer.material,
      recipe: producer.recipe.id,
      name: producer.recipe.machine.name,
      position: tilePosition(centerX, producerY),
      direction: 0,
      recipeSetting: producer.recipe.id,
    });
    let producerInputSlot = 0;
    producerInputs.forEach((ingredient, inputIndex) => {
      for (let arm = 0; arm < producerInputArms[inputIndex]; arm += 1) {
        drafts.push({
          role: "input-inserter",
          material: ingredient.name,
          recipe: producer.recipe.id,
          name: inputIndex === 0 ? "bulk-inserter" : "long-handed-inserter",
          position: tilePosition(centerX + [-1, 0, 1][producerInputSlot++], producerY - 2),
          direction: 0,
        });
      }
    });
    for (let arm = 0; arm < producerOutputArms; arm += 1) {
      drafts.push({
        role: "output-inserter",
        material: producer.material,
        recipe: producer.recipe.id,
        name: "bulk-inserter",
        position: tilePosition(centerX + [-1, 0, 1][arm], producerY + 2),
        direction: 0,
      });
    }
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(centerX + 2, producerY) });
  });

  targetXs.forEach((centerX) => {
    drafts.push({
      role: "machine",
      material: target.material,
      recipe: target.recipe.id,
      name: target.recipe.machine.name,
      position: tilePosition(centerX, targetY),
      direction: 0,
      recipeSetting: target.recipe.id,
    });
    for (let arm = 0; arm < targetIntermediateArms; arm += 1) {
      drafts.push({
        role: "input-inserter",
        material: producer.material,
        recipe: target.recipe.id,
        name: "bulk-inserter",
        position: tilePosition(centerX + [-1, 0, 1][arm], targetY - 2),
        direction: 0,
      });
    }
    let targetInputSlot = 0;
    targetInputs.forEach((ingredient, inputIndex) => {
      for (let arm = 0; arm < targetInputArms[inputIndex]; arm += 1) {
        drafts.push({
          role: "input-inserter",
          material: ingredient.name,
          recipe: target.recipe.id,
          name: inputIndex === 0 ? "bulk-inserter" : "long-handed-inserter",
          position: tilePosition(centerX + [-1, 0, 1][targetInputSlot++], targetY + 2),
          direction: 8,
        });
      }
    });
    drafts.push({
      role: "output-inserter",
      material: target.material,
      recipe: target.recipe.id,
      name: "bulk-inserter",
      position: tilePosition(centerX + 2, targetY),
      direction: 12,
    });
    if (directTargetOutput) {
      addBeltPath(drafts, "output-belt", target.material, belt.entityName,
        horizontalPoints(centerX + 3, centerX + 8, targetY), 4);
    } else {
      drafts.push({ role: "output-belt", material: target.material, name: belt.entityName, position: tilePosition(centerX + 3, targetY), direction: 8 });
      drafts.push({ role: "output-belt", material: target.material, name: belt.entityName, position: tilePosition(centerX + 3, targetY + 1), direction: 8 });
      drafts.push({ role: "underground-belt", material: target.material, name: undergroundName, position: tilePosition(centerX + 3, targetY + 2), direction: 8, undergroundType: "input" });
      drafts.push({ role: "underground-belt", material: target.material, name: undergroundName, position: tilePosition(centerX + 3, targetY + 5), direction: 8, undergroundType: "output" });
    }
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(centerX + 2, targetY - 2) });
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(centerX - 2, targetY + 2) });
  });
  if (!directTargetOutput) {
    for (let x = 3; x <= (targetXs.at(-1) ?? 0) + 8; x += 1) {
      drafts.push({ role: "output-belt", material: target.material, name: belt.entityName, position: tilePosition(x, collectorY), direction: 4 });
    }
  }

  const inputPositions = addBoundaryFanout(
    drafts,
    taps,
    plan,
    belt.entityName,
    belt.splitterEntityName,
    undergroundName,
    [],
    [...new Set(taps.map((tap) => tap.material))],
  );
  connectPowerComponents(drafts);
  const rotationQuarterTurns = (SIDE_INDEX[inputSide] - SIDE_INDEX.west + 4) % 4;
  const canonicalOutputSide = INDEX_SIDE[(SIDE_INDEX[outputSide] - rotationQuarterTurns + 4) % 4];
  const finalOutput = routeCanonicalOutput(
    drafts,
    { x: (targetXs.at(-1) ?? 0) + 8, y: directTargetOutput ? targetY : collectorY },
    canonicalOutputSide,
    target.material,
    belt.entityName,
  );
  return {
    drafts,
    inputPositions,
    outputPosition: tilePosition(finalOutput.x, finalOutput.y),
    canonicalOutputSide,
    rotationQuarterTurns,
  };
}

/** Dense row-stack for any anonymous linear item-production graph. Each
 * adjacent pair shares one belt; rate-derived arm counts decide whether a
 * stage fits and may add machines instead of weakening throughput. */
export function buildCoupledChainLayout(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): CanonicalLayout | undefined {
  if (plan.targetType !== "item" || plan.recipes.length < 3) return undefined;
  const stages = plan.recipes;
  const produced = new Set(stages.map((stage) => stage.material));
  const boundaries = new Set(plan.inputs.map((input) => input.name));
  if (stages.some((stage) => stage.materialType !== "item" ||
    stage.recipe.ingredients.some((ingredient) => ingredient.type !== "item"))) return undefined;
  const externals = stages.map((stage, index) => {
    const internal = stage.ingredientRates.filter((ingredient) => produced.has(ingredient.name));
    if (index === 0 ? internal.length !== 0 :
      internal.length !== 1 || internal[0].name !== stages[index - 1].material) return undefined;
    const external = stage.ingredientRates
      .filter((ingredient) => boundaries.has(ingredient.name))
      .sort((left, right) => right.perSecond - left.perSecond || left.name.localeCompare(right.name));
    if (external.length + internal.length !== stage.recipe.ingredients.length || external.length > 2) return undefined;
    return external;
  });
  if (externals.some((external) => external === undefined)) return undefined;
  for (let index = 0; index + 1 < stages.length; index += 1) {
    const consumers = stages.filter((stage) => stage.recipe.ingredients.some((ingredient) =>
      ingredient.name === stages[index].material));
    if (consumers.length !== 1 || consumers[0] !== stages[index + 1]) return undefined;
  }

  const belt = BELTS[beltTier];
  if (stages.slice(0, -1).some((stage) => stage.outputPerSecond > belt.itemsPerSecond + 1e-9)) return undefined;
  const arms = (rate: number, machines: number, capacity: number): number =>
    Math.max(1, Math.ceil(rate / machines / capacity - 1e-12));
  const machineCounts: number[] = [];
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const external = externals[index]!;
    const incoming = index === 0 ? undefined : stage.ingredientRates.find((ingredient) =>
      ingredient.name === stages[index - 1].material)!;
    let count = stage.machineCount;
    const fits = (): boolean => {
      const incomingArms = incoming ? arms(incoming.perSecond, count, SAFE_COUPLED_BULK_ITEMS_PER_SECOND) : 0;
      const outputArms = index + 1 < stages.length
        ? arms(stage.outputPerSecond, count, SAFE_COUPLED_BULK_ITEMS_PER_SECOND)
        : 0;
      if (incomingArms > 3 || outputArms > 3) return false;
      if (index === 0) {
        const inputArms = external.map((ingredient, ingredientIndex) => arms(
          ingredient.perSecond,
          count,
          ingredientIndex === 0 ? SAFE_COUPLED_BULK_ITEMS_PER_SECOND : SAFE_COUPLED_LONG_ITEMS_PER_SECOND,
        ));
        return inputArms.reduce((sum, value) => sum + value, 0) <= 3 && outputArms <= 3;
      }
      if (index + 1 === stages.length) {
        const inputArms = external.map((ingredient, ingredientIndex) => arms(
          ingredient.perSecond,
          count,
          ingredientIndex === 0 ? SAFE_COUPLED_BULK_ITEMS_PER_SECOND : SAFE_COUPLED_LONG_ITEMS_PER_SECOND,
        ));
        return incomingArms <= 3 && inputArms.reduce((sum, value) => sum + value, 0) <= 3 &&
          stage.outputPerSecond / count <= SAFE_COUPLED_BULK_ITEMS_PER_SECOND + 1e-9;
      }
      const northExternal = external[0]
        ? arms(external[0].perSecond, count, SAFE_COUPLED_LONG_ITEMS_PER_SECOND)
        : 0;
      const southExternal = external[1]
        ? arms(external[1].perSecond, count, SAFE_COUPLED_LONG_ITEMS_PER_SECOND)
        : 0;
      return incomingArms + northExternal <= 3 && outputArms + southExternal <= 3;
    };
    while (!fits() && count < stage.machineCount + 64) count += 1;
    if (!fits()) return undefined;
    machineCounts.push(count);
  }

  const undergroundName = beltTier === "yellow"
    ? "underground-belt"
    : beltTier === "red"
      ? "fast-underground-belt"
      : "express-underground-belt";
  const pitch = 6;
  // Eight tiles leave one long-handed feeder lane between adjacent stages.
  // The intermediate makes a two-row U-turn, keeping both machine faces
  // available without crossing the neighboring stage's inserters.
  const rowPitch = 8;
  const rowXs = machineCounts.map((count) => Array.from({ length: count }, (_, machine) => machine * pitch));
  const lastMachineX = Math.max(...rowXs.map((xs) => xs.at(-1) ?? 0));
  const drafts: Draft[] = [];
  const taps: PortTap[] = [];

  stages.forEach((stage, index) => {
    const y = index * rowPitch;
    const external = externals[index]!;
    const xs = rowXs[index];
    const count = machineCounts[index];
    const incoming = index === 0 ? undefined : stage.ingredientRates.find((ingredient) =>
      ingredient.name === stages[index - 1].material)!;
    const incomingArms = incoming ? arms(incoming.perSecond, count, SAFE_COUPLED_BULK_ITEMS_PER_SECOND) : 0;
    const outputArms = index + 1 < stages.length
      ? arms(stage.outputPerSecond, count, SAFE_COUPLED_BULK_ITEMS_PER_SECOND)
      : 0;

    const feederDefinitions = index === 0
      ? external.map((ingredient, ingredientIndex) => ({
          ingredient,
          y: y - 3 - ingredientIndex,
          capacity: ingredientIndex === 0 ? SAFE_COUPLED_BULK_ITEMS_PER_SECOND : SAFE_COUPLED_LONG_ITEMS_PER_SECOND,
          face: "north" as const,
        }))
      : index + 1 === stages.length
        ? external.map((ingredient, ingredientIndex) => ({
            ingredient,
            y: y + 3 + ingredientIndex,
            capacity: ingredientIndex === 0 ? SAFE_COUPLED_BULK_ITEMS_PER_SECOND : SAFE_COUPLED_LONG_ITEMS_PER_SECOND,
            face: "south" as const,
          }))
        : external.map((ingredient, ingredientIndex) => ({
            ingredient,
            y: y + (ingredientIndex === 0 ? -4 : 4),
            capacity: SAFE_COUPLED_LONG_ITEMS_PER_SECOND,
            face: ingredientIndex === 0 ? "north" as const : "south" as const,
          }));
    feederDefinitions.forEach((definition) => {
      taps.push({ material: definition.ingredient.name, type: "item", x: -4, y: definition.y });
      const occupiedColumns = drafts
        .filter((draft) => Math.floor(draft.position.y) === definition.y)
        .map((draft) => Math.floor(draft.position.x));
      addHorizontalBeltCrossings(
        drafts,
        "ingredient-feeder",
        definition.ingredient.name,
        belt.entityName,
        undergroundName,
        -4,
        (xs.at(-1) ?? 0) + 2,
        definition.y,
        occupiedColumns,
      );
    });

    if (index + 1 < stages.length) {
      const transferY = y + 3;
      const nextInputY = y + 5;
      const routeX = Math.max(xs.at(-1) ?? 0, rowXs[index + 1].at(-1) ?? 0) + 4;
      addBeltPath(
        drafts,
        "material-bus",
        stage.material,
        belt.entityName,
        [
          ...horizontalPoints(-2, routeX, transferY),
          { x: routeX, y: transferY + 1 },
          { x: routeX, y: nextInputY },
          ...Array.from({ length: routeX + 2 }, (_, offset) => ({ x: routeX - 1 - offset, y: nextInputY })),
        ],
        12,
      );
    }

    xs.forEach((centerX) => {
      drafts.push({
        role: "machine",
        material: stage.material,
        recipe: stage.recipe.id,
        name: stage.recipe.machine.name,
        position: tilePosition(centerX, y),
        direction: 0,
        recipeSetting: stage.recipe.id,
      });
      let northSlot = 0;
      let southSlot = 0;
      if (incoming) {
        for (let arm = 0; arm < incomingArms; arm += 1) {
          drafts.push({ role: "input-inserter", material: incoming.name, recipe: stage.recipe.id, name: "bulk-inserter", position: tilePosition(centerX + [-1, 0, 1][northSlot++], y - 2), direction: 0 });
        }
      }
      feederDefinitions.forEach((definition) => {
        const armCount = arms(definition.ingredient.perSecond, count, definition.capacity);
        for (let arm = 0; arm < armCount; arm += 1) {
          const slot = definition.face === "north" ? northSlot++ : southSlot++;
          drafts.push({
            role: "input-inserter",
            material: definition.ingredient.name,
            recipe: stage.recipe.id,
            name: definition.capacity === SAFE_COUPLED_BULK_ITEMS_PER_SECOND ? "bulk-inserter" : "long-handed-inserter",
            position: tilePosition(centerX + [-1, 0, 1][slot], y + (definition.face === "north" ? -2 : 2)),
            direction: definition.face === "north" ? 0 : 8,
          });
        }
      });
      if (index + 1 < stages.length) {
        for (let arm = 0; arm < outputArms; arm += 1) {
          drafts.push({ role: "output-inserter", material: stage.material, recipe: stage.recipe.id, name: "bulk-inserter", position: tilePosition(centerX + [-1, 0, 1][southSlot++], y + 2), direction: 0 });
        }
      }
      if (index + 1 === stages.length) {
        drafts.push({
          role: "power-pole",
          name: "medium-electric-pole",
          position: tilePosition(centerX + 2, y - 2),
        });
        drafts.push({
          role: "power-pole",
          name: "medium-electric-pole",
          position: tilePosition(centerX - 2, y + 2),
        });
      } else {
        drafts.push({
          role: "power-pole",
          name: "medium-electric-pole",
          position: tilePosition(centerX + 2, y),
        });
      }
    });
  });

  const target = stages.at(-1)!;
  const targetY = (stages.length - 1) * rowPitch;
  const targetXs = rowXs.at(-1)!;
  const collectorY = targetY + 6;
  const directTargetOutput = targetXs.length === 1;
  targetXs.forEach((centerX) => {
    drafts.push({ role: "output-inserter", material: target.material, recipe: target.recipe.id, name: "bulk-inserter", position: tilePosition(centerX + 2, targetY), direction: 12 });
    if (directTargetOutput) {
      addBeltPath(drafts, "output-belt", target.material, belt.entityName,
        horizontalPoints(centerX + 3, centerX + 8, targetY), 4);
    } else {
      drafts.push({ role: "output-belt", material: target.material, name: belt.entityName, position: tilePosition(centerX + 3, targetY), direction: 8 });
      drafts.push({ role: "output-belt", material: target.material, name: belt.entityName, position: tilePosition(centerX + 3, targetY + 1), direction: 8 });
      drafts.push({ role: "underground-belt", material: target.material, name: undergroundName, position: tilePosition(centerX + 3, targetY + 2), direction: 8, undergroundType: "input" });
      drafts.push({ role: "underground-belt", material: target.material, name: undergroundName, position: tilePosition(centerX + 3, targetY + 5), direction: 8, undergroundType: "output" });
    }
  });
  if (!directTargetOutput) {
    for (let x = 3; x <= (targetXs.at(-1) ?? 0) + 8; x += 1) {
      drafts.push({ role: "output-belt", material: target.material, name: belt.entityName, position: tilePosition(x, collectorY), direction: 4 });
    }
  }

  const inputPositions = addBoundaryFanout(
    drafts,
    taps,
    plan,
    belt.entityName,
    belt.splitterEntityName,
    undergroundName,
    [],
    [...new Set(taps.map((tap) => tap.material))],
  );
  connectPowerComponents(drafts);
  const rotationQuarterTurns = (SIDE_INDEX[inputSide] - SIDE_INDEX.west + 4) % 4;
  const canonicalOutputSide = INDEX_SIDE[(SIDE_INDEX[outputSide] - rotationQuarterTurns + 4) % 4];
  const finalOutput = routeCanonicalOutput(
    drafts,
    { x: (targetXs.at(-1) ?? 0) + 8, y: directTargetOutput ? targetY : collectorY },
    canonicalOutputSide,
    target.material,
    belt.entityName,
  );
  return {
    drafts,
    inputPositions,
    outputPosition: tilePosition(finalOutput.x, finalOutput.y),
    canonicalOutputSide,
    rotationQuarterTurns,
  };
}

/** Compiles an anonymous four-node fork/join DAG: one source feeds two
 * siblings, and both siblings feed the terminal. The motif is recognized by
 * graph shape and physical rates only. */
export function buildForkJoinLayout(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): CanonicalLayout | undefined {
  if (plan.targetType !== "item" || plan.recipes.length !== 4) return undefined;
  if (plan.recipes.some((stage) => stage.materialType !== "item" ||
    stage.recipe.ingredients.some((ingredient) => ingredient.type !== "item"))) return undefined;
  const target = plan.recipes.find((stage) => stage.material === plan.target);
  if (!target) return undefined;
  const byMaterial = new Map(plan.recipes.map((stage) => [stage.material, stage]));
  const terminalInternals = target.ingredientRates
    .map((ingredient) => byMaterial.get(ingredient.name))
    .filter((stage): stage is PlannedRecipe => stage !== undefined);
  if (terminalInternals.length !== 2) return undefined;
  const siblings = terminalInternals;
  const sourceCandidates = plan.recipes.filter((stage) => stage !== target && !siblings.includes(stage));
  if (sourceCandidates.length !== 1) return undefined;
  const source = sourceCandidates[0];
  if (siblings.some((sibling) => !sibling.recipe.ingredients.some((ingredient) =>
    ingredient.name === source.material))) return undefined;
  const sourceConsumers = plan.recipes.filter((stage) => stage.recipe.ingredients.some((ingredient) =>
    ingredient.name === source.material));
  if (sourceConsumers.length !== 2 || siblings.some((sibling) => !sourceConsumers.includes(sibling))) return undefined;
  const boundaries = new Set(plan.inputs.map((input) => input.name));
  const externalFor = (stage: PlannedRecipe, internalNames: Set<string>) => stage.ingredientRates
    .filter((ingredient) => !internalNames.has(ingredient.name) && boundaries.has(ingredient.name))
    .sort((left, right) => right.perSecond - left.perSecond || left.name.localeCompare(right.name));
  const sourceInputs = externalFor(source, new Set());
  const siblingInputs = siblings.map((sibling) => externalFor(sibling, new Set([source.material])));
  const targetInputs = externalFor(target, new Set(siblings.map((sibling) => sibling.material)));
  if (sourceInputs.length !== source.recipe.ingredients.length || sourceInputs.length > 2 ||
    siblings.some((sibling, index) => siblingInputs[index].length + 1 !== sibling.recipe.ingredients.length ||
      siblingInputs[index].length > 2) ||
    targetInputs.length + 2 !== target.recipe.ingredients.length || targetInputs.length > 2) return undefined;
  // Coalesce equal sibling-boundary contracts into common lanes. The lane
  // order is determined by fan-out first and total rate second, so renaming a
  // recipe cannot change the physical strategy. Two faces are available: the
  // adjacent bulk lane and one long-handed lane.
  const siblingExternalMaterials = [...new Set(siblingInputs.flat().map((ingredient) => ingredient.name))]
    .sort((left, right) => {
      const leftUses = siblingInputs.filter((ingredients) => ingredients.some((ingredient) => ingredient.name === left)).length;
      const rightUses = siblingInputs.filter((ingredients) => ingredients.some((ingredient) => ingredient.name === right)).length;
      const aggregateRate = (material: string): number => siblingInputs.flat()
        .filter((ingredient) => ingredient.name === material)
        .reduce((sum, ingredient) => sum + ingredient.perSecond, 0);
      return rightUses - leftUses || aggregateRate(right) - aggregateRate(left) || left.localeCompare(right);
    });
  if (siblingExternalMaterials.length > 2) return undefined;

  const belt = BELTS[beltTier];
  if (source.outputPerSecond > belt.itemsPerSecond + 1e-9 ||
    siblings.some((sibling) => sibling.outputPerSecond > belt.itemsPerSecond + 1e-9)) return undefined;
  const armCount = (rate: number, machines: number, capacity: number): number =>
    Math.max(1, Math.ceil(rate / machines / capacity - 1e-12));
  const fitExternalFace = (ingredients: typeof sourceInputs, machines: number): number[] =>
    ingredients.map((ingredient, index) => armCount(
      ingredient.perSecond,
      machines,
      index === 0 ? SAFE_COUPLED_BULK_ITEMS_PER_SECOND : SAFE_COUPLED_LONG_ITEMS_PER_SECOND,
    ));
  const fitSiblingExternalFace = (ingredients: typeof sourceInputs, machines: number): number[] =>
    ingredients.map((ingredient) => {
      const laneIndex = siblingExternalMaterials.indexOf(ingredient.name);
      return armCount(
        ingredient.perSecond,
        machines,
        laneIndex === 0 ? SAFE_COUPLED_BULK_ITEMS_PER_SECOND : SAFE_COUPLED_LONG_ITEMS_PER_SECOND,
      );
    });
  const chooseCount = (stage: PlannedRecipe, fits: (count: number) => boolean): number | undefined => {
    for (let count = stage.machineCount; count < stage.machineCount + 64; count += 1) {
      if (fits(count)) return count;
    }
    return undefined;
  };
  const sourceCount = chooseCount(source, (count) =>
    fitExternalFace(sourceInputs, count).reduce((sum, value) => sum + value, 0) <= 3 &&
    armCount(source.outputPerSecond, count, SAFE_COUPLED_BULK_ITEMS_PER_SECOND) <= 3);
  if (!sourceCount) return undefined;
  const siblingCounts = siblings.map((sibling, index) => chooseCount(sibling, (count) => {
    const incoming = sibling.ingredientRates.find((ingredient) => ingredient.name === source.material)!;
    return armCount(incoming.perSecond, count, SAFE_COUPLED_BULK_ITEMS_PER_SECOND) <= 3 &&
      fitSiblingExternalFace(siblingInputs[index], count).reduce((sum, value) => sum + value, 0) <= 3 &&
      sibling.outputPerSecond / count <= SAFE_COUPLED_BULK_ITEMS_PER_SECOND + 1e-9;
  }));
  if (siblingCounts.some((count) => count === undefined)) return undefined;
  const targetInternalRates = siblings.map((sibling) => target.ingredientRates.find((ingredient) =>
    ingredient.name === sibling.material)!);
  const targetCount = chooseCount(target, (count) => {
    const orderedInternalRates = [...targetInternalRates].sort((left, right) => right.perSecond - left.perSecond);
    const northArms = orderedInternalRates.map((ingredient, index) => armCount(
      ingredient.perSecond,
      count,
      index === 0 ? SAFE_COUPLED_BULK_ITEMS_PER_SECOND : SAFE_COUPLED_LONG_ITEMS_PER_SECOND,
    ));
    return northArms.reduce((sum, value) => sum + value, 0) <= 3 &&
      fitExternalFace(targetInputs, count).reduce((sum, value) => sum + value, 0) <= 3 &&
      target.outputPerSecond / count <= SAFE_COUPLED_BULK_ITEMS_PER_SECOND + 1e-9;
  });
  if (!targetCount) return undefined;

  const undergroundName = beltTier === "yellow"
    ? "underground-belt"
    : beltTier === "red"
      ? "fast-underground-belt"
      : "express-underground-belt";
  const pitch = 6;
  const sourceXs = Array.from({ length: sourceCount }, (_, index) => index * pitch);
  const siblingStarts = [0, siblingCounts[0]! * pitch + 6];
  const siblingXs = siblings.map((_, siblingIndex) => Array.from(
    { length: siblingCounts[siblingIndex]! },
    (_, machine) => siblingStarts[siblingIndex] + machine * pitch,
  ));
  const middleLastX = Math.max(...siblingXs.flat());
  // Align the terminal with the later sibling. Both sibling buses therefore
  // reach every terminal machine without serializing the two middle rows.
  // A sibling side-load reaches its eastbound bus three tiles to the east of
  // the assembler center. Start the terminal on that first live bus tile;
  // placing it at the sibling center would leave the first terminal pickup
  // upstream of all production.
  const targetStartX = siblingStarts[1] + 3;
  const targetXs = Array.from({ length: targetCount }, (_, index) => targetStartX + index * pitch);
  const sharedLastX = Math.max(sourceXs.at(-1) ?? 0, middleLastX);
  const targetLastX = targetXs.at(-1) ?? 0;
  const directTargetOutput = targetXs.length === 1;
  const sourceY = 0;
  const siblingY = 6;
  // The higher-rate terminal ingredient occupies the adjacent belt; the
  // lower-rate ingredient is reached with long-handed inserters.
  const siblingBusRows = [13, 12];
  const targetY = 16;
  const collectorY = 22;
  const drafts: Draft[] = [];
  const taps: PortTap[] = [];
  const addExternalFeeders = (
    ingredients: typeof sourceInputs,
    startX: number,
    endX: number,
    baseY: number,
  ): void => ingredients.forEach((ingredient, index) => {
    const y = baseY + index;
    taps.push({ material: ingredient.name, type: "item", x: startX - 4, y });
    addBeltPath(drafts, "ingredient-feeder", ingredient.name, belt.entityName,
      horizontalPoints(startX - 4, endX + 2, y), 4);
  });
  // The source reads northward, so the bulk lane is the adjacent lane and
  // the optional long-handed lane sits one tile farther away.
  sourceInputs.forEach((ingredient, inputIndex) => {
    const y = sourceY - 3 - inputIndex;
    taps.push({ material: ingredient.name, type: "item", x: -4, y });
    addBeltPath(drafts, "ingredient-feeder", ingredient.name, belt.entityName,
      horizontalPoints(-4, (sourceXs.at(-1) ?? 0) + 2, y), 4);
  });
  siblingExternalMaterials.forEach((material, laneIndex) => {
    const y = siblingY + 3 + laneIndex;
    taps.push({ material, type: "item", x: -4, y });
    addBeltPath(drafts, "ingredient-feeder", material, belt.entityName,
      horizontalPoints(-4, middleLastX + 2, y), 4);
  });
  addExternalFeeders(targetInputs, targetStartX, targetLastX, targetY + 3);
  addBeltPath(drafts, "material-bus", source.material, belt.entityName,
    horizontalPoints(-2, sharedLastX + 2, 3), 4);

  sourceXs.forEach((x) => {
    drafts.push({ role: "machine", material: source.material, recipe: source.recipe.id, name: source.recipe.machine.name, position: tilePosition(x, sourceY), direction: 0, recipeSetting: source.recipe.id });
    let slot = 0;
    fitExternalFace(sourceInputs, sourceCount).forEach((count, ingredientIndex) => {
      for (let arm = 0; arm < count; arm += 1) drafts.push({ role: "input-inserter", material: sourceInputs[ingredientIndex].name, recipe: source.recipe.id, name: ingredientIndex === 0 ? "bulk-inserter" : "long-handed-inserter", position: tilePosition(x + [-1, 0, 1][slot++], sourceY - 2), direction: 0 });
    });
    const outputs = armCount(source.outputPerSecond, sourceCount, SAFE_COUPLED_BULK_ITEMS_PER_SECOND);
    for (let arm = 0; arm < outputs; arm += 1) drafts.push({ role: "output-inserter", material: source.material, recipe: source.recipe.id, name: "bulk-inserter", position: tilePosition(x + [-1, 0, 1][arm], sourceY + 2), direction: 0 });
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(x + 2, sourceY) });
  });

  const terminalInternalOrder = [...targetInternalRates]
    .sort((left, right) => right.perSecond - left.perSecond || left.name.localeCompare(right.name));
  const adjacentSiblingIndex = siblings.findIndex((sibling) =>
    sibling.material === terminalInternalOrder[0].name);
  const adjacentBranchColumns = siblingXs[adjacentSiblingIndex].map((x) => x + 3);
  siblings.forEach((sibling, siblingIndex) => {
    const count = siblingCounts[siblingIndex]!;
    const externalArms = fitSiblingExternalFace(siblingInputs[siblingIndex], count);
    const incoming = sibling.ingredientRates.find((ingredient) => ingredient.name === source.material)!;
    const incomingArms = armCount(incoming.perSecond, count, SAFE_COUPLED_BULK_ITEMS_PER_SECOND);
    const busY = siblingBusRows[terminalInternalOrder.findIndex((ingredient) => ingredient.name === sibling.material)];
    siblingXs[siblingIndex].forEach((x) => {
      drafts.push({ role: "machine", material: sibling.material, recipe: sibling.recipe.id, name: sibling.recipe.machine.name, position: tilePosition(x, siblingY), direction: 0, recipeSetting: sibling.recipe.id });
      for (let arm = 0; arm < incomingArms; arm += 1) drafts.push({ role: "input-inserter", material: source.material, recipe: sibling.recipe.id, name: "bulk-inserter", position: tilePosition(x + [-1, 0, 1][arm], siblingY - 2), direction: 0 });
      let southSlot = 0;
      externalArms.forEach((armsForIngredient, ingredientIndex) => {
        const ingredient = siblingInputs[siblingIndex][ingredientIndex];
        const laneIndex = siblingExternalMaterials.indexOf(ingredient.name);
        for (let arm = 0; arm < armsForIngredient; arm += 1) drafts.push({ role: "input-inserter", material: ingredient.name, recipe: sibling.recipe.id, name: laneIndex === 0 ? "bulk-inserter" : "long-handed-inserter", position: tilePosition(x + [-1, 0, 1][southSlot++], siblingY + 2), direction: 8 });
      });
      drafts.push({ role: "output-inserter", material: sibling.material, recipe: sibling.recipe.id, name: "bulk-inserter", position: tilePosition(x + 2, siblingY), direction: 12 });
      drafts.push({ role: "output-belt", material: sibling.material, name: belt.entityName, position: tilePosition(x + 3, siblingY), direction: 8 });
      drafts.push({ role: "output-belt", material: sibling.material, name: belt.entityName, position: tilePosition(x + 3, siblingY + 1), direction: 8 });
      drafts.push({ role: "underground-belt", material: sibling.material, name: undergroundName, position: tilePosition(x + 3, siblingY + 2), direction: 8, undergroundType: "input" });
      drafts.push({ role: "underground-belt", material: sibling.material, name: undergroundName, position: tilePosition(x + 3, busY - 1), direction: 8, undergroundType: "output" });
      drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(x + 2, siblingY - 2) });
      drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(x - 2, siblingY + 2) });
    });
    const busStartX = siblingXs[siblingIndex][0] + 3;
    const busEndX = Math.max(middleLastX + 3, targetLastX + 2);
    if (busY === siblingBusRows[1]) {
      // Tunnel the farther bus underneath the adjacent bus's vertical output
      // branches. This is the same anonymous belt-braiding primitive used by
      // the general router, applied to a denser row pair.
      addHorizontalBeltCrossings(drafts, "material-bus", sibling.material, belt.entityName,
        undergroundName, busStartX, busEndX, busY, adjacentBranchColumns);
    } else {
      for (let x = busStartX; x <= busEndX; x += 1) {
        drafts.push({ role: "material-bus", material: sibling.material, name: belt.entityName,
          position: tilePosition(x, busY), direction: 4 });
      }
    }
  });

  targetXs.forEach((x) => {
    drafts.push({ role: "machine", material: target.material, recipe: target.recipe.id, name: target.recipe.machine.name, position: tilePosition(x, targetY), direction: 0, recipeSetting: target.recipe.id });
    let northSlot = 0;
    terminalInternalOrder.forEach((ingredient, ingredientIndex) => {
      const count = armCount(ingredient.perSecond, targetCount, ingredientIndex === 0 ? SAFE_COUPLED_BULK_ITEMS_PER_SECOND : SAFE_COUPLED_LONG_ITEMS_PER_SECOND);
      for (let arm = 0; arm < count; arm += 1) drafts.push({ role: "input-inserter", material: ingredient.name, recipe: target.recipe.id, name: ingredientIndex === 0 ? "bulk-inserter" : "long-handed-inserter", position: tilePosition(x + [-1, 0, 1][northSlot++], targetY - 2), direction: 0 });
    });
    let southSlot = 0;
    fitExternalFace(targetInputs, targetCount).forEach((count, ingredientIndex) => {
      for (let arm = 0; arm < count; arm += 1) drafts.push({ role: "input-inserter", material: targetInputs[ingredientIndex].name, recipe: target.recipe.id, name: ingredientIndex === 0 ? "bulk-inserter" : "long-handed-inserter", position: tilePosition(x + [-1, 0, 1][southSlot++], targetY + 2), direction: 8 });
    });
    drafts.push({ role: "output-inserter", material: target.material, recipe: target.recipe.id, name: "bulk-inserter", position: tilePosition(x + 2, targetY), direction: 12 });
    if (directTargetOutput) {
      addBeltPath(drafts, "output-belt", target.material, belt.entityName,
        horizontalPoints(x + 3, x + 8, targetY), 4);
    } else {
      drafts.push({ role: "output-belt", material: target.material, name: belt.entityName, position: tilePosition(x + 3, targetY), direction: 8 });
      drafts.push({ role: "output-belt", material: target.material, name: belt.entityName, position: tilePosition(x + 3, targetY + 1), direction: 8 });
      drafts.push({ role: "underground-belt", material: target.material, name: undergroundName, position: tilePosition(x + 3, targetY + 2), direction: 8, undergroundType: "input" });
      drafts.push({ role: "underground-belt", material: target.material, name: undergroundName, position: tilePosition(x + 3, targetY + 5), direction: 8, undergroundType: "output" });
    }
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(x + 2, targetY - 2) });
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(x - 2, targetY + 2) });
  });
  if (!directTargetOutput) {
    for (let x = 3; x <= targetLastX + 8; x += 1) drafts.push({ role: "output-belt", material: target.material, name: belt.entityName, position: tilePosition(x, collectorY), direction: 4 });
  }

  const protectedRows = [
    ...sourceInputs.map((_, index) => sourceY - 3 - index),
    ...siblingExternalMaterials.map((_, index) => siblingY + 3 + index),
    ...targetInputs.map((_, index) => targetY + 3 + index),
    3,
    ...siblingBusRows,
    ...(directTargetOutput ? [] : [collectorY]),
  ];
  const inputPositions = addBoundaryFanout(drafts, taps, plan, belt.entityName, belt.splitterEntityName,
    undergroundName, protectedRows, [...new Set(taps.map((tap) => tap.material))]);
  connectPowerComponents(drafts);
  const rotationQuarterTurns = (SIDE_INDEX[inputSide] - SIDE_INDEX.west + 4) % 4;
  const canonicalOutputSide = INDEX_SIDE[(SIDE_INDEX[outputSide] - rotationQuarterTurns + 4) % 4];
  const finalOutput = routeCanonicalOutput(drafts, { x: targetLastX + 8, y: directTargetOutput ? targetY : collectorY }, canonicalOutputSide,
    target.material, belt.entityName);
  return { drafts, inputPositions, outputPosition: tilePosition(finalOutput.x, finalOutput.y), canonicalOutputSide,
    rotationQuarterTurns };
}

function addTerminalRow(
  drafts: Draft[],
  pattern: HierarchicalPattern,
  greenOutputs: Array<{ x: number; y: number }>,
  secondaryOutput: { x: number; y: number },
  beltName: string,
  splitterName: string,
  undergroundName: string,
): { fluidPorts: PortTap[]; outputPosition: { x: number; y: number } } {
  const machineY = 13;
  const firstMachineX = Math.max(84, ...greenOutputs.map((port) => port.x + 12), secondaryOutput.x + 10);
  const machineXs = Array.from({ length: pattern.terminal.machineCount }, (_, index) => firstMachineX + index * 4);
  const lastMachineX = machineXs.at(-1)!;
  const primaryY = machineY + 3;
  const secondaryY = machineY + 4;
  const mergeX = firstMachineX - 6;

  const sortedGreen = [...greenOutputs].sort((left, right) => left.y - right.y);
  if (sortedGreen.length !== 2) throw new Error("The balanced hierarchical terminal requires two primary islands.");
  sortedGreen.forEach((port, index) => {
    const targetY = primaryY + index;
    const routeX = port.x + 1;
    const verticalDirection: CardinalDirection = targetY > port.y ? 8 : 0;
    drafts.push({
      role: "material-bus",
      material: pattern.primary.material,
      name: beltName,
      position: tilePosition(routeX, port.y),
      direction: verticalDirection,
    });
    addVerticalBelt(
      drafts,
      pattern.primary.material,
      beltName,
      undergroundName,
      routeX,
      port.y + (targetY > port.y ? 1 : -1),
      targetY,
      [],
      4,
    );
    addBeltPath(
      drafts,
      "material-bus",
      pattern.primary.material,
      beltName,
      horizontalPoints(routeX + 1, mergeX - 2, targetY),
      4,
    );
  });
  drafts.push({
    role: "splitter",
    material: pattern.primary.material,
    name: splitterName,
    position: { x: mergeX - 0.5, y: primaryY + 1 },
    direction: 4,
    outputPriority: "left",
  });
  addBeltPath(
    drafts,
    "ingredient-feeder",
    pattern.primary.material,
    beltName,
    horizontalPoints(mergeX, lastMachineX + 2, primaryY),
    4,
  );

  const secondaryRouteX = secondaryOutput.x + 1;
  drafts.push({
    role: "material-bus",
    material: pattern.secondary.material,
    name: beltName,
    position: tilePosition(secondaryRouteX, secondaryOutput.y),
    direction: secondaryY + 1 > secondaryOutput.y ? 8 : 0,
  });
  addVerticalBelt(
    drafts,
    pattern.secondary.material,
    beltName,
    undergroundName,
    secondaryRouteX,
    secondaryOutput.y + (secondaryY + 1 > secondaryOutput.y ? 1 : -1),
    secondaryY + 1,
    [],
    4,
  );
  addBeltPath(
    drafts,
    "material-bus",
    pattern.secondary.material,
    beltName,
    [
      ...horizontalPoints(secondaryRouteX + 1, firstMachineX - 3, secondaryY + 1),
      { x: firstMachineX - 2, y: secondaryY + 1 },
      { x: firstMachineX - 2, y: secondaryY },
      ...horizontalPoints(firstMachineX - 1, lastMachineX + 2, secondaryY),
    ],
    4,
  );

  const outputY = machineY - 3;
  const fluidHeaderY = machineY - 5;
  const fluidPorts: PortTap[] = [];
  pattern.terminalFluids.forEach((fluid, fluidIndex) => {
    if (fluidIndex > 0) throw new Error("The compact terminal currently accepts one fluid contract.");
    const startX = firstMachineX - 6;
    fluidPorts.push({ material: fluid.name, type: "fluid", x: startX, y: fluidHeaderY });
    for (let x = startX; x <= lastMachineX; x += 1) {
      drafts.push({ role: "pipe", material: fluid.name, name: "pipe", position: tilePosition(x, fluidHeaderY) });
    }
    machineXs.forEach((centerX) => {
      drafts.push({
        role: "pipe",
        material: fluid.name,
        recipe: pattern.terminal.recipe.id,
        name: "pipe",
        position: tilePosition(centerX, fluidHeaderY + 1),
      });
      drafts.push({
        role: "pipe",
        material: fluid.name,
        recipe: pattern.terminal.recipe.id,
        name: "pipe",
        position: tilePosition(centerX, fluidHeaderY + 2),
      });
      drafts.push({
        role: "pipe",
        material: fluid.name,
        recipe: pattern.terminal.recipe.id,
        name: "pipe",
        position: tilePosition(centerX, machineY - 2),
      });
    });
  });

  for (let x = firstMachineX - 2; x <= lastMachineX + 7; x += 1) {
    const terminalType = machineXs.some((centerX) => centerX - 1 === x)
      ? "input"
      : machineXs.some((centerX) => centerX + 1 === x)
        ? "output"
        : undefined;
    if (machineXs.includes(x)) continue;
    drafts.push({
      role: terminalType ? "underground-belt" : "output-belt",
      material: pattern.terminal.material,
      name: terminalType ? undergroundName : beltName,
      position: tilePosition(x, outputY),
      direction: 4,
      undergroundType: terminalType,
    });
  }

  machineXs.forEach((centerX, index) => {
    drafts.push({
      role: "machine",
      material: pattern.terminal.material,
      recipe: pattern.terminal.recipe.id,
      name: pattern.terminal.recipe.machine.name,
      position: tilePosition(centerX, machineY),
      direction: 0,
      recipeSetting: pattern.terminal.recipe.id,
    });
    drafts.push({
      role: "input-inserter",
      material: pattern.primary.material,
      recipe: pattern.terminal.recipe.id,
      name: "bulk-inserter",
      position: tilePosition(centerX - 1, machineY + 2),
      direction: 8,
    });
    drafts.push({
      role: "input-inserter",
      material: pattern.secondary.material,
      recipe: pattern.terminal.recipe.id,
      name: "long-handed-inserter",
      position: tilePosition(centerX + 1, machineY + 2),
      direction: 8,
    });
    drafts.push({
      role: "output-inserter",
      material: pattern.terminal.material,
      recipe: pattern.terminal.recipe.id,
      name: "bulk-inserter",
      position: tilePosition(centerX + 1, machineY - 2),
      direction: 8,
    });
    if (index % 2 === 0) {
      drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(centerX + 2, machineY) });
    }
  });
  return {
    fluidPorts,
    outputPosition: tilePosition(lastMachineX + 7, outputY),
  };
}

function addDirectInsertedTerminal(
  drafts: Draft[],
  pattern: HierarchicalPattern,
  primaryIsland: Island,
  secondaryOutput: { x: number; y: number; direction: CardinalDirection },
  beltName: string,
  undergroundName: string,
  rotationQuarterTurns: number,
): { fluidPorts: PortTap[]; outputPosition: { x: number; y: number } } {
  const primaryMachines = primaryIsland.layout.drafts
    .filter((draft) => draft.role === "machine" && draft.recipe === pattern.primary.recipe.id)
    .map((draft) => {
      const position = floorPosition(draft.position);
      return { x: position.x + primaryIsland.x, y: position.y + primaryIsland.y };
    })
    .sort((left, right) => left.x - right.x || left.y - right.y);
  if (primaryMachines.length < pattern.terminal.machineCount ||
    Math.abs(nominalOutputPerMachine(pattern.primary) -
      pattern.terminal.recipe.ingredients.find((ingredient) => ingredient.name === pattern.primary.material)!.amount *
      pattern.terminal.recipe.machine.craftingSpeed / pattern.terminal.recipe.energySeconds) > 1e-9) {
    throw new Error("The terminal edge is not a capacity-matched direct-insertion contract.");
  }

  // Remove the primary island's exported belt. Its result now crosses exactly
  // one inserter into the capacity-matched terminal assembler below it.
  const removablePrimaryDrafts = new Set(primaryIsland.layout.drafts
    .filter((draft) =>
      (draft.role === "output-inserter" && draft.recipe === pattern.primary.recipe.id) ||
      (draft.material === pattern.primary.material &&
        (draft.role === "output-belt" || draft.role === "underground-belt")))
    .map((draft) => [
      draft.role,
      draft.position.x + primaryIsland.x,
      draft.position.y + primaryIsland.y,
      draft.name,
      draft.material ?? "",
      draft.recipe ?? "",
    ].join("|")));
  for (let index = drafts.length - 1; index >= 0; index -= 1) {
    const draft = drafts[index];
    const key = [draft.role, draft.position.x, draft.position.y, draft.name, draft.material ?? "", draft.recipe ?? ""].join("|");
    if (removablePrimaryDrafts.has(key)) drafts.splice(index, 1);
  }

  const machineY = primaryMachines[0].y + 4;
  if (primaryMachines.some((machine) => machine.y !== primaryMachines[0].y)) {
    throw new Error("Direct terminal cells require a single primary machine row.");
  }
  const outputY = machineY + 3;
  const secondaryY = machineY + 4;
  const fluidHeaderY = primaryMachines[0].y - 6;
  const firstMachineX = primaryMachines[0].x;
  const lastMachineX = primaryMachines.at(-1)!.x;
  const connectorXs = primaryMachines.map((machine) => machine.x);

  primaryMachines.forEach((primaryMachine) => {
    const centerX = primaryMachine.x;
    drafts.push({
      role: "machine",
      material: pattern.terminal.material,
      recipe: pattern.terminal.recipe.id,
      name: pattern.terminal.recipe.machine.name,
      position: tilePosition(centerX, machineY),
      direction: 0,
      recipeSetting: pattern.terminal.recipe.id,
    });
    drafts.push({
      role: "input-inserter",
      material: pattern.primary.material,
      recipe: pattern.terminal.recipe.id,
      name: "bulk-inserter",
      position: tilePosition(centerX + (rotationQuarterTurns === 1 ? 1 : -1), machineY - 2),
      direction: 0,
    });
    drafts.push({
      role: "input-inserter",
      material: pattern.secondary.material,
      recipe: pattern.terminal.recipe.id,
      name: "long-handed-inserter",
      position: tilePosition(centerX + 1, machineY + 2),
      direction: 8,
    });
    drafts.push({
      role: "output-inserter",
      material: pattern.terminal.material,
      recipe: pattern.terminal.recipe.id,
      name: "bulk-inserter",
      position: tilePosition(centerX - 1, machineY + 2),
      direction: 0,
    });
    if (rotationQuarterTurns === 0) {
      drafts.push({
        role: "pipe-to-ground",
        material: pattern.terminalFluids[0].name,
        name: "pipe-to-ground",
        position: tilePosition(centerX, primaryMachine.y - 5),
        direction: 0,
      });
      drafts.push({
        role: "pipe-to-ground",
        material: pattern.terminalFluids[0].name,
        name: "pipe-to-ground",
        position: tilePosition(centerX, machineY - 2),
        direction: 8,
      });
    } else {
      const sideX = centerX + (rotationQuarterTurns === 1 ? -2 : 2);
      drafts.push({
        role: "pipe-to-ground",
        material: pattern.terminalFluids[0].name,
        recipe: pattern.terminal.recipe.id,
        name: "pipe-to-ground",
        position: tilePosition(sideX, fluidHeaderY + 1),
        direction: 0,
      });
      drafts.push({
        role: "pipe-to-ground",
        material: pattern.terminalFluids[0].name,
        recipe: pattern.terminal.recipe.id,
        name: "pipe-to-ground",
        position: tilePosition(sideX, machineY - 2),
        direction: 8,
      });
      drafts.push({ role: "pipe", material: pattern.terminalFluids[0].name, recipe: pattern.terminal.recipe.id, name: "pipe", position: tilePosition(sideX, machineY - 1) });
      drafts.push({ role: "pipe", material: pattern.terminalFluids[0].name, recipe: pattern.terminal.recipe.id, name: "pipe", position: tilePosition(sideX, machineY) });
    }
  });

  for (const [row, material] of [[outputY, pattern.terminal.material], [secondaryY, pattern.secondary.material]] as const) {
    for (let x = firstMachineX - 4; x <= lastMachineX + 8; x += 1) {
      drafts.push({
        role: material === pattern.terminal.material ? "output-belt" : "ingredient-feeder",
        material,
        name: beltName,
        position: tilePosition(x, row),
        direction: 4,
      });
    }
  }

  const fluidHeaderStartX = connectorXs[0] + (rotationQuarterTurns === 1 ? -2 : 0);
  const fluidHeaderEndX = connectorXs.at(-1)! + (rotationQuarterTurns === 3 ? 2 : 0);
  for (let x = fluidHeaderStartX; x <= fluidHeaderEndX; x += 1) {
    drafts.push({ role: "pipe", material: pattern.terminalFluids[0].name, name: "pipe", position: tilePosition(x, fluidHeaderY) });
  }

  const routeX = firstMachineX - 8;
  const secondaryCrossingRows = drafts
    .filter((draft) => Math.floor(draft.position.x) === routeX &&
      (draft.name.includes("belt") || draft.name.includes("splitter")) &&
      draft.material !== pattern.secondary.material)
    .map((draft) => Math.floor(draft.position.y));
  if (secondaryOutput.direction === 4) {
    const escapeX = secondaryOutput.x + 1;
    const corridorY = secondaryY + 1;
    drafts.push({
      role: "material-bus",
      material: pattern.secondary.material,
      name: beltName,
      position: tilePosition(escapeX, secondaryOutput.y),
      direction: 0,
    });
    addVerticalBelt(
      drafts,
      pattern.secondary.material,
      beltName,
      undergroundName,
      escapeX,
      secondaryOutput.y - 1,
      corridorY,
      secondaryCrossingRows,
      12,
    );
    addWestboundBeltCrossings(
      drafts,
      "material-bus",
      pattern.secondary.material,
      beltName,
      undergroundName,
      escapeX - 1,
      routeX,
      corridorY,
      [],
      0,
    );
    drafts.push({
      role: "material-bus",
      material: pattern.secondary.material,
      name: beltName,
      position: tilePosition(routeX, secondaryY),
      direction: 4,
    });
  } else {
    for (let x = secondaryOutput.x - 1; x > routeX; x -= 1) {
      drafts.push({
        role: "material-bus",
        material: pattern.secondary.material,
        name: beltName,
        position: tilePosition(x, secondaryOutput.y),
        direction: 12,
      });
    }
    for (let index = drafts.length - 1; index >= 0; index -= 1) {
      const draft = drafts[index];
      if (draft.material === pattern.secondary.material &&
        Math.floor(draft.position.x) === routeX && Math.floor(draft.position.y) === secondaryOutput.y &&
        (draft.name.includes("belt") || draft.name.includes("splitter"))) {
        drafts.splice(index, 1);
      }
    }
    drafts.push({
      role: "material-bus",
      material: pattern.secondary.material,
      name: beltName,
      position: tilePosition(routeX, secondaryOutput.y),
      direction: secondaryY < secondaryOutput.y ? 0 : 8,
    });
    addVerticalBelt(
      drafts,
      pattern.secondary.material,
      beltName,
      undergroundName,
      routeX,
      secondaryOutput.y + (secondaryY < secondaryOutput.y ? -1 : 1),
      secondaryY,
      secondaryCrossingRows,
      4,
    );
  }
  addBeltPath(
    drafts,
    "material-bus",
    pattern.secondary.material,
    beltName,
    horizontalPoints(routeX + 1, firstMachineX - 5, secondaryY),
    4,
  );

  // Route material first, then fit the terminal's substation comb into the
  // remaining holes. Doing this in the opposite order made otherwise valid
  // row remainders collide with a secondary-material escape lane.
  for (let x = firstMachineX + 4; x <= lastMachineX + 4; x += 16) {
    const candidates = [[x, machineY + 7], [x + 2, machineY + 7], [x, machineY + 8]] as const;
    const position = candidates.find(([candidateX, candidateY]) => canPlace(drafts, {
      role: "power-pole",
      name: "substation",
      position: tilePosition(candidateX, candidateY),
    }));
    if (!position) throw new Error(`Could not power the direct terminal near ${x},${machineY + 7}.`);
    drafts.push({ role: "power-pole", name: "substation", position: tilePosition(position[0], position[1]) });
  }

  return {
    fluidPorts: [{
      material: pattern.terminalFluids[0].name,
      type: "fluid",
      x: fluidHeaderStartX,
      y: fluidHeaderY,
    }],
    outputPosition: tilePosition(lastMachineX + 8, outputY),
  };
}

const SAFE_RADIAL_INSERTER_ITEMS_PER_SECOND = 2.31;

/**
 * Low-volume, high-arity equipment recipes need more contracts than two
 * parallel belt faces can expose. Compile them into repeated radial cells:
 * every ingredient keeps its own belt and bulk inserter, while additional
 * arms for a hot ingredient are derived from its flow rather than from the
 * recipe name. Eleven input positions remain after reserving the east-center
 * tile for product discharge.
 */
function buildRadialBoundaryRecipeLayout(
  plan: ChainPlan,
  planned: PlannedRecipe,
  itemIngredients: Array<CatalogAmount & { perSecond: number }>,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): CanonicalLayout | undefined {
  if (itemIngredients.length < 5 || itemIngredients.length > 8) return undefined;
  const belt = BELTS[beltTier];
  const undergroundName = beltTier === "yellow"
    ? "underground-belt"
    : beltTier === "red"
      ? "fast-underground-belt"
      : "express-underground-belt";
  let machineCount = planned.machineCount;
  const requiredArms = (count: number): number => itemIngredients.reduce(
    (sum, ingredient) => sum + Math.max(1, Math.ceil(
      ingredient.perSecond / count / SAFE_RADIAL_INSERTER_ITEMS_PER_SECOND - 1e-12,
    )),
    0,
  );
  while (requiredArms(machineCount) > 11 ||
    planned.outputPerSecond / machineCount > SAFE_RADIAL_INSERTER_ITEMS_PER_SECOND + 1e-12) {
    machineCount += 1;
  }
  const armMaterials = itemIngredients.flatMap((ingredient) => Array.from(
    { length: Math.max(1, Math.ceil(
      ingredient.perSecond / machineCount / SAFE_RADIAL_INSERTER_ITEMS_PER_SECOND - 1e-12,
    )) },
    () => ingredient,
  ));
  if (armMaterials.length > 11) throw new Error(`${planned.recipe.id} exceeds the radial input perimeter.`);

  const drafts: Draft[] = [];
  const taps: PortTap[] = [];
  const cellPitch = 40;
  const centerYs = Array.from({ length: machineCount }, (_, index) => index * cellPitch);
  const collectorX = 8;
  const topRouteOffsets = [-18, -14, -10];
  const bottomRouteOffsets = [10, 14, 18];

  centerYs.forEach((machineY) => {
    const localRouteRows = [
      ...topRouteOffsets.map((offset) => machineY + offset),
      ...bottomRouteOffsets.map((offset) => machineY + offset),
      machineY - 8,
      machineY + 8,
      machineY - 6,
      machineY,
      machineY + 6,
    ];
    armMaterials.forEach((ingredient, armIndex) => {
      if (armIndex < 3) {
        const pickupX = armIndex - 1;
        const routeY = machineY + topRouteOffsets[armIndex];
        taps.push({ material: ingredient.name, type: "item", x: -4, y: routeY });
        addBeltPath(
          drafts,
          "ingredient-feeder",
          ingredient.name,
          belt.entityName,
          horizontalPoints(-4, pickupX, routeY),
          8,
        );
        addVerticalBelt(
          drafts,
          ingredient.name,
          belt.entityName,
          undergroundName,
          pickupX,
          routeY + 1,
          machineY - 3,
          localRouteRows,
          8,
        );
        drafts.push({ role: "input-inserter", material: ingredient.name, recipe: planned.recipe.id, name: "bulk-inserter", position: tilePosition(pickupX, machineY - 2), direction: 0 });
      } else if (armIndex < 6) {
        const pickupX = armIndex - 4;
        const routeY = machineY + bottomRouteOffsets[armIndex - 3];
        taps.push({ material: ingredient.name, type: "item", x: -4, y: routeY });
        addBeltPath(
          drafts,
          "ingredient-feeder",
          ingredient.name,
          belt.entityName,
          horizontalPoints(-4, pickupX, routeY),
          0,
        );
        addVerticalBelt(
          drafts,
          ingredient.name,
          belt.entityName,
          undergroundName,
          pickupX,
          routeY - 1,
          machineY + 3,
          localRouteRows,
          0,
        );
        drafts.push({ role: "input-inserter", material: ingredient.name, recipe: planned.recipe.id, name: "bulk-inserter", position: tilePosition(pickupX, machineY + 2), direction: 8 });
      } else if (armIndex < 9) {
        const pickupY = machineY - 1 + (armIndex - 6);
        const routeY = machineY + [-6, 0, 6][armIndex - 6];
        taps.push({ material: ingredient.name, type: "item", x: -4, y: routeY });
        addBeltPath(
          drafts,
          "ingredient-feeder",
          ingredient.name,
          belt.entityName,
          horizontalPoints(-4, -3, routeY),
          routeY < pickupY ? 8 : routeY > pickupY ? 0 : 4,
        );
        if (routeY !== pickupY) {
          addVerticalBelt(
            drafts,
            ingredient.name,
            belt.entityName,
            undergroundName,
            -3,
            routeY + (routeY < pickupY ? 1 : -1),
            pickupY,
            localRouteRows,
            4,
          );
        }
        drafts.push({ role: "input-inserter", material: ingredient.name, recipe: planned.recipe.id, name: "bulk-inserter", position: tilePosition(-2, pickupY), direction: 12 });
      } else {
        const upper = armIndex === 9;
        const pickupY = machineY + (upper ? -1 : 1);
        const routeY = machineY + (upper ? -8 : 8);
        taps.push({ material: ingredient.name, type: "item", x: -4, y: routeY });
        addBeltPath(
          drafts,
          "ingredient-feeder",
          ingredient.name,
          belt.entityName,
          horizontalPoints(-4, 3, routeY),
          upper ? 8 : 0,
        );
        addVerticalBelt(
          drafts,
          ingredient.name,
          belt.entityName,
          undergroundName,
          3,
          routeY + (upper ? 1 : -1),
          pickupY,
          localRouteRows,
          4,
        );
        drafts.push({ role: "input-inserter", material: ingredient.name, recipe: planned.recipe.id, name: "bulk-inserter", position: tilePosition(2, pickupY), direction: 4 });
      }
    });
    drafts.push({
      role: "machine",
      material: planned.material,
      recipe: planned.recipe.id,
      name: planned.recipe.machine.name,
      position: tilePosition(0, machineY),
      direction: 0,
      recipeSetting: planned.recipe.id,
    });
    drafts.push({ role: "output-inserter", material: planned.material, recipe: planned.recipe.id, name: "bulk-inserter", position: tilePosition(2, machineY), direction: 12 });
    addBeltPath(
      drafts,
      "output-belt",
      planned.material,
      belt.entityName,
      horizontalPoints(3, collectorX - 1, machineY),
      4,
    );
    // Three perimeter poles cover all eleven possible radial inserter slots.
    // A single south-east pole reaches the machine but not the north or west
    // arms; that error is invisible to collision/import checks and is caught
    // only by the live Factorio starvation probe.
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(2, machineY - 2) });
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(-2, machineY + 2) });
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(2, machineY + 2) });
  });

  const firstOutputY = centerYs[0];
  const lastOutputY = centerYs.at(-1)!;
  for (let y = firstOutputY; y <= lastOutputY; y += 1) {
    drafts.push({
      role: "output-belt",
      material: planned.material,
      name: belt.entityName,
      position: tilePosition(collectorX, y),
      direction: y === lastOutputY ? 4 : 8,
    });
  }
  const inputPositions = addRadialBoundaryFanout(
    drafts,
    taps,
    plan,
    belt.entityName,
    belt.splitterEntityName,
    undergroundName,
    itemIngredients.map((ingredient) => ingredient.name),
  );
  connectPowerComponents(drafts);
  const rotationQuarterTurns = (SIDE_INDEX[inputSide] - SIDE_INDEX.west + 4) % 4;
  const canonicalOutputSide = INDEX_SIDE[(SIDE_INDEX[outputSide] - rotationQuarterTurns + 4) % 4];
  const finalOutput = routeCanonicalOutput(
    drafts,
    { x: collectorX, y: lastOutputY },
    canonicalOutputSide,
    planned.material,
    belt.entityName,
  );
  return {
    drafts,
    inputPositions,
    outputPosition: tilePosition(finalOutput.x, finalOutput.y),
    canonicalOutputSide,
    rotationQuarterTurns,
  };
}

/**
 * Compiles a single boundary-fed recipe as a set of short, parallel machine
 * rows.  The row count is chosen from entity geometry, while the existing
 * planner remains responsible for exact rate and inserter-capacity sizing.
 * This is deliberately recipe-name agnostic: it applies to any item recipe
 * with up to four solid contracts and one assembling-machine fluid contract.
 * Three- and four-input recipes use both machine faces and discharge through
 * short side branches, avoiding the full-factory bus that these recipes used
 * to fall back to.
 */
export function buildBoundaryRecipeLayout(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): CanonicalLayout | undefined {
  if (plan.targetType !== "item" || plan.recipes.length !== 1) return undefined;
  const planned = plan.recipes[0];
  if (planned.material !== plan.target || planned.materialType !== "item") return undefined;
  const boundaries = new Set(plan.inputs.map((input) => input.name));
  if (planned.recipe.ingredients.some((ingredient) => !boundaries.has(ingredient.name))) return undefined;
  const itemIngredients = [...planned.ingredientRates]
    .filter((ingredient) => ingredient.type === "item")
    .sort((left, right) => right.perSecond - left.perSecond ||
      planned.recipe.ingredients.findIndex((ingredient) => ingredient.name === left.name) -
        planned.recipe.ingredients.findIndex((ingredient) => ingredient.name === right.name));
  const fluidIngredients = planned.ingredientRates.filter((ingredient) => ingredient.type === "fluid");
  if (itemIngredients.length > 4 && fluidIngredients.length === 0) {
    return buildRadialBoundaryRecipeLayout(
      plan,
      planned,
      itemIngredients,
      inputSide,
      outputSide,
      beltTier,
    );
  }
  if (itemIngredients.length > 4 || fluidIngredients.length > 1) return undefined;
  if (fluidIngredients.length > 0 && itemIngredients.length > 3) return undefined;
  if (fluidIngredients.length > 0 &&
    planned.recipe.machine.name !== "assembling-machine-3" &&
    planned.recipe.machine.name !== "chemical-plant") return undefined;
  // Factorio's rotated crafting-with-fluid socket needs the legacy
  // rotation-aware bridge. Keep the compact row for its proven west-facing
  // orientation and let the established compiler handle other rotations.
  if (fluidIngredients.length > 0 && inputSide !== "west") return undefined;

  const belt = BELTS[beltTier];
  const undergroundName = beltTier === "yellow"
    ? "underground-belt"
    : beltTier === "red"
      ? "fast-underground-belt"
      : "express-underground-belt";
  const usesTwoFaces = itemIngredients.length > 2;
  const rowCapacity = 12;
  const rowCount = Math.max(1, Math.ceil(planned.machineCount / rowCapacity));
  const rowMachines = distributeMachines(planned.machineCount, rowCount);
  const machinePitch = usesTwoFaces ? 6 : 4;
  const rowPitch = fluidIngredients.length > 0 || usesTwoFaces ? 12 : 9;
  const rowYs = rowMachines.map((_, row) => row * rowPitch);
  const maximumColumns = Math.max(...rowMachines);
  const lastMachineX = (maximumColumns - 1) * machinePitch;
  const collectorX = lastMachineX + 7;
  const drafts: Draft[] = [];
  const taps: PortTap[] = [];
  const outputRows: number[] = [];
  const protectedRows: number[] = [];
  const pipeCrossingRows: number[] = [];

  rowMachines.forEach((machineCount, row) => {
    const machineY = rowYs[row];
    const machineXs = Array.from({ length: machineCount }, (_, index) => index * machinePitch);
    const rowLastMachineX = machineXs.at(-1)!;
    itemIngredients.forEach((ingredient, ingredientIndex) => {
      const feederY = ingredientIndex < 2
        ? machineY + 3 + ingredientIndex
        : machineY - 3 - (ingredientIndex - 2);
      pipeCrossingRows.push(feederY);
      taps.push({ material: ingredient.name, type: "item", x: -4, y: feederY });
      addHorizontalBeltCrossings(
        drafts,
        "ingredient-feeder",
        ingredient.name,
        belt.entityName,
        undergroundName,
        -4,
        rowLastMachineX + 2,
        feederY,
        usesTwoFaces ? machineXs.map((centerX) => centerX + 3) : [],
      );
    });

    const outputY = usesTwoFaces ? machineY + 6 : machineY - 3;
    outputRows.push(outputY);
    pipeCrossingRows.push(outputY);
    addHorizontalBeltCrossings(
      drafts,
      "output-belt",
      planned.material,
      belt.entityName,
      undergroundName,
      -3,
      collectorX - 1,
      outputY,
      !usesTwoFaces && fluidIngredients.length > 0 ? machineXs : [],
    );

    machineXs.forEach((centerX) => {
      drafts.push({
        role: "machine",
        material: planned.material,
        recipe: planned.recipe.id,
        name: planned.recipe.machine.name,
        position: tilePosition(centerX, machineY),
        direction: 0,
        recipeSetting: planned.recipe.id,
      });
      itemIngredients.forEach((ingredient, ingredientIndex) => {
        const north = ingredientIndex >= 2;
        const near = ingredientIndex % 2 === 0;
        drafts.push({
          role: "input-inserter",
          material: ingredient.name,
          recipe: planned.recipe.id,
          name: near ? "bulk-inserter" : "long-handed-inserter",
          position: tilePosition(centerX + (near ? 0 : 1), machineY + (north ? -2 : 2)),
          direction: north ? 0 : 8,
        });
      });
      drafts.push({
        role: "output-inserter",
        material: planned.material,
        recipe: planned.recipe.id,
        name: "bulk-inserter",
        position: usesTwoFaces
          ? tilePosition(centerX + 2, machineY)
          : tilePosition(centerX + 1, machineY - 2),
        direction: usesTwoFaces ? 12 : 8,
      });
      if (usesTwoFaces) {
        addVerticalBelt(
          drafts,
          planned.material,
          belt.entityName,
          undergroundName,
          centerX + 3,
          machineY,
          outputY - 1,
          itemIngredients
            .map((_, index) => index < 2
              ? machineY + 3 + index
              : machineY - 3 - (index - 2))
            .filter((crossingY) => crossingY > machineY),
          8,
        );
      }
      if (fluidIngredients.length > 0) {
        const fluid = fluidIngredients[0];
        const connectorX = planned.recipe.machine.name === "chemical-plant"
          ? centerX - 1
          : centerX;
        drafts.push({
          role: "pipe-to-ground",
          material: fluid.name,
          recipe: planned.recipe.id,
          name: "pipe-to-ground",
          position: tilePosition(connectorX, machineY - 4),
          direction: 0,
        });
        drafts.push({
          role: "pipe-to-ground",
          material: fluid.name,
          recipe: planned.recipe.id,
          name: "pipe-to-ground",
          position: tilePosition(connectorX, machineY - 2),
          direction: 8,
        });
      }
      drafts.push({
        role: "power-pole",
        name: "medium-electric-pole",
        position: tilePosition(centerX + 2, machineY + 1),
      });
    });

    if (fluidIngredients.length > 0) {
      const fluidY = machineY - 5;
      protectedRows.push(fluidY);
      for (let x = -2; x <= rowLastMachineX; x += 1) {
        drafts.push({ role: "pipe", material: fluidIngredients[0].name, name: "pipe", position: tilePosition(x, fluidY) });
      }
    }
  });

  // Same-material row outputs side-feed one collector. This is a lossless
  // merge because the planner already caps their combined rate at one belt.
  const minimumOutputY = Math.min(...outputRows);
  const maximumOutputY = Math.max(...outputRows);
  for (let y = minimumOutputY; y <= maximumOutputY; y += 1) {
    drafts.push({
      role: "output-belt",
      material: planned.material,
      name: belt.entityName,
      position: tilePosition(collectorX, y),
      direction: y === maximumOutputY ? 4 : 8,
    });
  }

  const inputPositions = addBoundaryFanout(
    drafts,
    taps,
    plan,
    belt.entityName,
    belt.splitterEntityName,
    undergroundName,
    protectedRows,
    itemIngredients.map((ingredient) => ingredient.name),
  );

  if (fluidIngredients.length > 0) {
    const fluid = fluidIngredients[0];
    const itemPortXs = [...inputPositions.values()].map((position) => Math.floor(position.x));
    const outerX = itemPortXs.length > 0 ? Math.min(...itemPortXs) : -12;
    const firstFluidY = rowYs[0] - 5;
    const lastFluidY = rowYs.at(-1)! - 5;
    addPumpFreeHorizontalPipe(drafts, fluid.name, outerX, -3, firstFluidY);
    if (lastFluidY !== firstFluidY) {
      addVerticalPipe(
        drafts,
        fluid.name,
        -2,
        firstFluidY + 1,
        lastFluidY - 1,
        pipeCrossingRows,
      );
    }
    inputPositions.set(fluid.name, tilePosition(outerX, firstFluidY));
  }

  connectPowerComponents(drafts);
  const rotationQuarterTurns = (SIDE_INDEX[inputSide] - SIDE_INDEX.west + 4) % 4;
  const canonicalOutputSide = INDEX_SIDE[(SIDE_INDEX[outputSide] - rotationQuarterTurns + 4) % 4];
  const finalOutput = routeCanonicalOutput(
    drafts,
    { x: collectorX, y: maximumOutputY },
    canonicalOutputSide,
    planned.material,
    belt.entityName,
  );
  return {
    drafts,
    inputPositions,
    outputPosition: tilePosition(finalOutput.x, finalOutput.y),
    canonicalOutputSide,
    rotationQuarterTurns,
  };
}

interface RecursiveCellCover {
  planned: PlannedRecipe;
  plan: ChainPlan;
  layout: CanonicalLayout;
}

function layoutEnvelope(layout: CanonicalLayout): { width: number; height: number; area: number } {
  const minimumX = Math.floor(Math.min(...layout.drafts.map((draft) => draft.position.x - draftHalfSize(draft).x)));
  const maximumX = Math.ceil(Math.max(...layout.drafts.map((draft) => draft.position.x + draftHalfSize(draft).x)));
  const minimumY = Math.floor(Math.min(...layout.drafts.map((draft) => draft.position.y - draftHalfSize(draft).y)));
  const maximumY = Math.ceil(Math.max(...layout.drafts.map((draft) => draft.position.y + draftHalfSize(draft).y)));
  const width = maximumX - minimumX;
  const height = maximumY - minimumY;
  return { width, height, area: width * height };
}

function collisionFreeDrafts(drafts: Draft[]): boolean {
  for (let index = 0; index < drafts.length; index += 1) {
    const left = drafts[index];
    const leftHalf = draftHalfSize(left);
    for (let otherIndex = index + 1; otherIndex < drafts.length; otherIndex += 1) {
      const right = drafts[otherIndex];
      const rightHalf = draftHalfSize(right);
      if (Math.abs(left.position.x - right.position.x) < leftHalf.x + rightHalf.x &&
        Math.abs(left.position.y - right.position.y) < leftHalf.y + rightHalf.y) return false;
    }
  }
  return true;
}

function undergroundPairingValid(drafts: Draft[]): boolean {
  const endpoints = drafts.filter((draft) => draft.undergroundType !== undefined);
  const claimedOutputs = new Set<Draft>();
  const claimedTunnelTiles = new Set<string>();
  for (const input of endpoints.filter((draft) => draft.undergroundType === "input")) {
    if (input.direction === undefined) return false;
    const vector = directionVector(input.direction);
    const candidates = endpoints.filter((candidate) => {
      if (candidate.undergroundType !== "output" || candidate.name !== input.name ||
        candidate.direction !== input.direction || candidate.material !== input.material ||
        claimedOutputs.has(candidate)) return false;
      const deltaX = candidate.position.x - input.position.x;
      const deltaY = candidate.position.y - input.position.y;
      const projection = deltaX * vector.x + deltaY * vector.y;
      const perpendicular = deltaX * vector.y - deltaY * vector.x;
      return Math.abs(perpendicular) < 1e-9 && projection > 0 &&
        projection <= undergroundEndpointReach(input.name);
    }).sort((left, right) =>
      Math.abs(left.position.x - input.position.x) + Math.abs(left.position.y - input.position.y) -
      Math.abs(right.position.x - input.position.x) - Math.abs(right.position.y - input.position.y));
    const output = candidates[0];
    if (!output) return false;
    claimedOutputs.add(output);
    const inputTile = floorPosition(input.position);
    const outputTile = floorPosition(output.position);
    const axis = vector.x === 0 ? "v" : "h";
    const fixed = vector.x === 0 ? inputTile.x : inputTile.y;
    const minimum = vector.x === 0
      ? Math.min(inputTile.y, outputTile.y)
      : Math.min(inputTile.x, outputTile.x);
    const maximum = vector.x === 0
      ? Math.max(inputTile.y, outputTile.y)
      : Math.max(inputTile.x, outputTile.x);
    for (let coordinate = minimum; coordinate <= maximum; coordinate += 1) {
      const key = `${input.name}:${axis}:${fixed}:${coordinate}`;
      if (claimedTunnelTiles.has(key)) return false;
      claimedTunnelTiles.add(key);
    }
  }
  return claimedOutputs.size === endpoints.filter((draft) => draft.undergroundType === "output").length;
}

function mirrorSourcePanelVertically(panel: SourcePanel): SourcePanel {
  const mirrorDirection = (direction: CardinalDirection | undefined): CardinalDirection | undefined => {
    if (direction === 0) return 8;
    if (direction === 8) return 0;
    return direction;
  };
  return {
    drafts: panel.drafts.map((draft) => ({
      ...draft,
      position: { x: draft.position.x, y: -draft.position.y },
      direction: mirrorDirection(draft.direction),
      ...(draft.outputPriority
        ? { outputPriority: draft.outputPriority === "left" ? "right" as const : "left" as const }
        : {}),
    })),
    inputPositions: new Map([...panel.inputPositions].map(([material, position]) => [material, {
      x: position.x,
      y: -position.y,
    }])),
    outputPosition: { x: panel.outputPosition.x, y: -panel.outputPosition.y },
    outputDirection: mirrorDirection(panel.outputDirection)!,
  };
}

function rotateSourcePanel(panel: SourcePanel, quarterTurns: number): SourcePanel {
  const normalizedTurns = ((quarterTurns % 4) + 4) % 4;
  const rotatePoint = (position: { x: number; y: number }): { x: number; y: number } => {
    let result = { ...position };
    for (let turn = 0; turn < normalizedTurns; turn += 1) {
      result = { x: -result.y, y: result.x };
    }
    return result;
  };
  const rotateDirection = (direction: CardinalDirection | undefined): CardinalDirection | undefined =>
    direction === undefined ? undefined : ((direction + normalizedTurns * 4) % 16) as CardinalDirection;
  return {
    drafts: panel.drafts.map((draft) => ({
      ...draft,
      position: rotatePoint(draft.position),
      direction: rotateDirection(draft.direction),
    })),
    inputPositions: new Map([...panel.inputPositions].map(([material, position]) => [material, rotatePoint(position)])),
    outputPosition: rotatePoint(panel.outputPosition),
    outputDirection: rotateDirection(panel.outputDirection)!,
  };
}

function compileRecursiveItemCell(
  plan: ChainPlan,
  depth: number,
  beltTier: keyof typeof BELTS,
): CanonicalLayout | undefined {
  if (depth > 12 || plan.recipes.length === 0) return undefined;
  const candidates: CanonicalLayout[] = [];
  const add = (factory: () => CanonicalLayout | undefined): void => {
    try {
      const candidate = factory();
      if (candidate && collisionFreeDrafts(candidate.drafts) &&
        undergroundPairingValid(candidate.drafts) && !crossMaterialTransportFeed(candidate.drafts)) {
        candidates.push(candidate);
      }
    } catch {
      // One failed exact-cover option must not discard the other anonymous
      // covers for this same subgraph.
    }
  };
  add(() => buildAnonymousCellLayout(plan, "west", "east", beltTier));
  add(() => buildBoundaryRecipeLayout(plan, "west", "east", beltTier));
  add(() => buildCoupledRowLayout(plan, "west", "east", beltTier));
  add(() => buildCoupledChainLayout(plan, "west", "east", beltTier));
  add(() => buildForkJoinLayout(plan, "west", "east", beltTier));
  add(() => buildRecursiveItemComposition(plan, "west", "east", beltTier, depth + 1));
  return candidates.sort((left, right) => {
    const leftEnvelope = layoutEnvelope(left);
    const rightEnvelope = layoutEnvelope(right);
    return leftEnvelope.area - rightEnvelope.area ||
      Math.max(leftEnvelope.width, leftEnvelope.height) - Math.max(rightEnvelope.width, rightEnvelope.height) ||
      left.drafts.length - right.drafts.length;
  })[0];
}

/**
 * Exact-covers an arbitrary item recipe DAG with anonymous compiler cells.
 * Each terminal ingredient becomes a recursively compiled subproblem; shared
 * intermediate nodes are duplicated only in proportion to the flow demanded
 * by that branch. A bounded beam search then packs the cells, while the belt
 * pathfinder feeds routing failures back into the search by rejecting that
 * placement and trying the next floorplan. No recipe or material identifier
 * participates in decomposition, packing, or scoring.
 */
function buildRecursiveItemComposition(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
  depth = 0,
): CanonicalLayout | undefined {
  if (depth > 12 || plan.targetType !== "item" || plan.recipes.length < 2 || plan.recipes.length > 8 ||
    plan.inputs.some((input) => input.type !== "item") ||
    plan.recipes.some((planned) => planned.materialType !== "item" ||
      planned.recipe.ingredients.some((ingredient) => ingredient.type !== "item")) ||
    plan.recipes.reduce((sum, planned) => sum + planned.machineCount, 0) > 40) return undefined;
  const target = plan.recipes.find((planned) => planned.material === plan.target);
  if (!target || target.recipe.ingredients.length === 0 || target.recipe.ingredients.length > 4) return undefined;
  const byMaterial = new Map(plan.recipes.map((planned) => [planned.material, planned]));
  const actualBoundaries = new Set(plan.inputs.map((input) => input.name));
  const internalIngredients = target.ingredientRates.filter((ingredient) => byMaterial.has(ingredient.name));
  if (internalIngredients.length === 0) return undefined;

  const terminalBoundaries = new Set(target.recipe.ingredients.map((ingredient) => ingredient.name));
  const terminalPlan = scaledSubplan(plan, target, target.outputPerSecond, terminalBoundaries);
  const terminalLayout = buildBoundaryRecipeLayout(terminalPlan, "west", "east", beltTier);
  if (!terminalLayout) return undefined;

  const covers: RecursiveCellCover[] = [];
  for (const ingredient of internalIngredients) {
    const planned = byMaterial.get(ingredient.name)!;
    const childPlan = scaledSubplan(plan, planned, ingredient.perSecond, actualBoundaries);
    // Craft-speed sizing alone is insufficient for high-consumption leaf
    // recipes (for example, stone walls): one assembler can craft faster than
    // one pickup arm can deliver the solid ingredient. Split the child cell
    // until every face stays within its live-tested inserter contract before
    // packing or routing it into the parent.
    sizeBoundaryCellMachines(childPlan);
    const layout = compileRecursiveItemCell(childPlan, depth, beltTier);
    if (!layout) return undefined;
    covers.push({ planned: childPlan.recipes.find((candidate) => candidate.material === childPlan.target)!, plan: childPlan, layout });
  }

  const belt = BELTS[beltTier];
  const undergroundName = beltTier === "yellow"
    ? "underground-belt"
    : beltTier === "red"
      ? "fast-underground-belt"
      : "express-underground-belt";
  const baseDrafts = terminalLayout.drafts.map((draft) => ({ ...draft, position: { ...draft.position } }));
  const terminalOutput = floorPosition(terminalLayout.outputPosition);
  const outputEscapeTiles = new Set<string>();
  for (let x = terminalOutput.x + 1; x <= terminalOutput.x + 192; x += 1) {
    outputEscapeTiles.add(`${x},${terminalOutput.y}`);
  }
  const panelGroups = covers.map((cover) => {
    const panel: SourcePanel = {
      drafts: cover.layout.drafts,
      inputPositions: cover.layout.inputPositions,
      outputPosition: cover.layout.outputPosition,
      outputDirection: 4,
    };
    return { planned: cover.planned, panels: [panel, mirrorSourcePanelVertically(panel)] };
  });
  const packingStates = searchPanelPackings(
    baseDrafts,
    panelGroups,
    terminalLayout.inputPositions,
    outputEscapeTiles,
    24,
    256,
    depth === 0,
  );
  const routedCandidates: CanonicalLayout[] = [];
  let routingFailures = 0;
  let isolationFailures = 0;
  let boundaryFailures = 0;
  let collisionFailures = 0;
  let powerFailures = 0;
  let lastBoundaryDetail = "";
  for (const state of packingStates) {
    const trialDrafts = baseDrafts.map((draft) => ({ ...draft, position: { ...draft.position } }));
    const externalTaps: PortTap[] = [...terminalLayout.inputPositions]
      .filter(([material]) => actualBoundaries.has(material))
      .map(([material, position]) => ({
        material,
        type: "item" as const,
        x: Math.floor(position.x),
        y: Math.floor(position.y),
      }));
    const connections = state.placements.map(({ geometry, translateX, translateY }) => {
      const virtualPort = terminalLayout.inputPositions.get(geometry.planned.material);
      if (!virtualPort) throw new Error(`Missing recursive virtual port for ${geometry.planned.material}.`);
      const placed = translateSourcePanel(trialDrafts, geometry.panel, translateX, translateY);
      placed.inputs.forEach((position, material) => externalTaps.push({
        material,
        type: "item",
        x: Math.floor(position.x),
        y: Math.floor(position.y),
      }));
      return { geometry, placed, virtualPort };
    }).sort((left, right) =>
      Math.abs(floorPosition(left.placed.output).x - floorPosition(left.virtualPort).x) +
        Math.abs(floorPosition(left.placed.output).y - floorPosition(left.virtualPort).y) -
      Math.abs(floorPosition(right.placed.output).x - floorPosition(right.virtualPort).x) -
        Math.abs(floorPosition(right.placed.output).y - floorPosition(right.virtualPort).y));
    const reservedIngressTiles = new Set(outputEscapeTiles);
    for (const { geometry, virtualPort } of connections) {
      const input = floorPosition(virtualPort);
      const inputDraft = trialDrafts.find((draft) =>
        draft.material === geometry.planned.material && draft.direction !== undefined &&
        Math.floor(draft.position.x) === input.x && Math.floor(draft.position.y) === input.y &&
        (draft.name.includes("transport-belt") || draft.name.includes("underground-belt") ||
          draft.name.includes("splitter")));
      if (!inputDraft || inputDraft.direction === undefined) continue;
      const vector = directionVector(inputDraft.direction);
      reservedIngressTiles.add(`${input.x - vector.x},${input.y - vector.y}`);
    }
    const routed = connections.every(({ geometry, placed, virtualPort }) => routePanelOutput(
      trialDrafts,
      geometry.planned.material,
      placed.output,
      geometry.panel.outputDirection,
      virtualPort,
      belt.entityName,
      reservedIngressTiles,
    ));
    if (!routed) {
      routingFailures += 1;
      continue;
    }
    if (crossMaterialTransportFeed(trialDrafts)) {
      isolationFailures += 1;
      continue;
    }

    const minimumOccupiedX = Math.floor(Math.min(...trialDrafts.map((draft) =>
      draft.position.x - draftHalfSize(draft).x), ...externalTaps.map((tap) => tap.x)));
    const translateX = 18 - minimumOccupiedX;
    trialDrafts.forEach((draft) => {
      draft.position = { ...draft.position, x: draft.position.x + translateX };
    });
    externalTaps.forEach((tap) => { tap.x += translateX; });
    const shiftedTerminalOutput = { x: terminalOutput.x + translateX, y: terminalOutput.y };
    const inputPositions = addRoutedBoundaryFanout(
      trialDrafts,
      externalTaps,
      plan,
      belt.entityName,
      belt.splitterEntityName,
      undergroundName,
      plan.inputs.map((input) => input.name),
    );
    if (!inputPositions || inputPositions.size !== plan.inputs.length) {
      boundaryFailures += 1;
      lastBoundaryDetail = ` expected=${plan.inputs.map((input) => input.name).join("+")}` +
        ` taps=${[...new Set(externalTaps.map((tap) => tap.material))].join("+")}` +
        ` ports=${inputPositions ? [...inputPositions.keys()].join("+") : "unroutable"}`;
      continue;
    }
    if (!collisionFreeDrafts(trialDrafts) || !undergroundPairingValid(trialDrafts)) {
      collisionFailures += 1;
      continue;
    }
    if (crossMaterialTransportFeed(trialDrafts)) {
      isolationFailures += 1;
      continue;
    }
    try {
      connectPowerComponents(trialDrafts);
    } catch {
      powerFailures += 1;
      continue;
    }
    if (!collisionFreeDrafts(trialDrafts) || !undergroundPairingValid(trialDrafts)) {
      collisionFailures += 1;
      continue;
    }

    const rotationQuarterTurns = (SIDE_INDEX[inputSide] - SIDE_INDEX.west + 4) % 4;
    const canonicalOutputSide = INDEX_SIDE[(SIDE_INDEX[outputSide] - rotationQuarterTurns + 4) % 4];
    let finalOutput = shiftedTerminalOutput;
    if (canonicalOutputSide === "east") {
      const easternEdge = Math.ceil(Math.max(...trialDrafts.map((draft) =>
        draft.position.x + draftHalfSize(draft).x))) + 3;
      if (easternEdge > finalOutput.x) {
        addBeltPath(
          trialDrafts,
          "output-belt",
          target.material,
          belt.entityName,
          horizontalPoints(finalOutput.x + 1, easternEdge, finalOutput.y),
          4,
        );
        finalOutput = { x: easternEdge, y: finalOutput.y };
      }
    } else {
      finalOutput = routeCanonicalOutput(
        trialDrafts,
        finalOutput,
        canonicalOutputSide,
        target.material,
        belt.entityName,
      );
    }
    const candidate: CanonicalLayout = {
      drafts: trialDrafts,
      inputPositions,
      outputPosition: tilePosition(finalOutput.x, finalOutput.y),
      canonicalOutputSide,
      rotationQuarterTurns,
    };
    if (!collisionFreeDrafts(candidate.drafts) || !undergroundPairingValid(candidate.drafts) ||
      crossMaterialTransportFeed(candidate.drafts)) continue;
    routedCandidates.push(candidate);
  }
  const selected = routedCandidates.sort((left, right) => {
    const leftEnvelope = layoutEnvelope(left);
    const rightEnvelope = layoutEnvelope(right);
    return leftEnvelope.area - rightEnvelope.area || left.drafts.length - right.drafts.length;
  })[0];
  if (!selected) throw new Error(
    `Recursive cell cover exhausted ${packingStates.length} floorplans ` +
      `(${routingFailures} routing, ${isolationFailures} isolation, ${boundaryFailures} boundary, ` +
      `${collisionFailures} collision, ${powerFailures} power).${lastBoundaryDetail}`,
  );
  return selected;
}

interface TreeCellNode {
  id: number;
  depth: number;
  planned: PlannedRecipe;
  layout: CanonicalLayout;
  width: number;
  height: number;
  children: Array<{ material: string; node: TreeCellNode }>;
  parent?: TreeCellNode;
}

function rejectTreePlacement(_reason: string): undefined {
  return undefined;
}

function normalizeCellLayout(layout: CanonicalLayout): CanonicalLayout & { width: number; height: number } {
  const minimumX = Math.floor(Math.min(...layout.drafts.map((draft) => draft.position.x - draftHalfSize(draft).x)));
  const maximumX = Math.ceil(Math.max(...layout.drafts.map((draft) => draft.position.x + draftHalfSize(draft).x)));
  const minimumY = Math.floor(Math.min(...layout.drafts.map((draft) => draft.position.y - draftHalfSize(draft).y)));
  const maximumY = Math.ceil(Math.max(...layout.drafts.map((draft) => draft.position.y + draftHalfSize(draft).y)));
  return {
    ...layout,
    drafts: layout.drafts.map((draft) => ({
      ...draft,
      position: { x: draft.position.x - minimumX, y: draft.position.y - minimumY },
    })),
    inputPositions: new Map([...layout.inputPositions].map(([material, position]) => [material, {
      x: position.x - minimumX,
      y: position.y - minimumY,
    }])),
    outputPosition: {
      x: layout.outputPosition.x - minimumX,
      y: layout.outputPosition.y - minimumY,
    },
    width: maximumX - minimumX,
    height: maximumY - minimumY,
  };
}

function sizeBoundaryCellMachines(plan: ChainPlan): void {
  const planned = plan.recipes[0];
  const ordered = [...planned.ingredientRates]
    .sort((left, right) => right.perSecond - left.perSecond ||
      planned.recipe.ingredients.findIndex((ingredient) => ingredient.name === left.name) -
        planned.recipe.ingredients.findIndex((ingredient) => ingredient.name === right.name));
  let machineCount = planned.machineCount;
  while (machineCount < planned.machineCount + 256) {
    const inputsFit = ordered.every((ingredient, index) =>
      ingredient.perSecond / machineCount <=
        (index % 2 === 0 ? SAFE_COUPLED_BULK_ITEMS_PER_SECOND : SAFE_COUPLED_LONG_ITEMS_PER_SECOND) + 1e-9);
    const outputFits = planned.outputPerSecond / machineCount <= SAFE_COUPLED_BULK_ITEMS_PER_SECOND + 1e-9;
    if (inputsFit && outputFits) break;
    machineCount += 1;
  }
  planned.machineCount = machineCount;
}

function buildAtomicTree(
  original: ChainPlan,
  template: PlannedRecipe,
  outputPerSecond: number,
  beltTier: keyof typeof BELTS,
  depth: number,
  nextId: { value: number },
): TreeCellNode | undefined {
  if (nextId.value >= 40 || depth > 12 || template.recipe.ingredients.length > 4 ||
    template.recipe.ingredients.some((ingredient) => ingredient.type !== "item")) return undefined;
  const immediateBoundaries = new Set(template.recipe.ingredients.map((ingredient) => ingredient.name));
  const atomicPlan = scaledSubplan(original, template, outputPerSecond, immediateBoundaries);
  sizeBoundaryCellMachines(atomicPlan);
  const rawLayout = buildBoundaryRecipeLayout(atomicPlan, "west", "east", beltTier);
  if (!rawLayout || !collisionFreeDrafts(rawLayout.drafts) || !undergroundPairingValid(rawLayout.drafts)) return undefined;
  const layout = normalizeCellLayout(rawLayout);
  const planned = atomicPlan.recipes[0];
  const node: TreeCellNode = {
    id: nextId.value++,
    depth,
    planned,
    layout,
    width: layout.width,
    height: layout.height,
    children: [],
  };
  const byMaterial = new Map(original.recipes.map((candidate) => [candidate.material, candidate]));
  for (const ingredient of planned.ingredientRates) {
    const producer = byMaterial.get(ingredient.name);
    if (!producer) continue;
    const child = buildAtomicTree(original, producer, ingredient.perSecond, beltTier, depth + 1, nextId);
    if (!child) return undefined;
    child.parent = node;
    node.children.push({ material: ingredient.name, node: child });
  }
  return node;
}

function flattenTree(root: TreeCellNode): TreeCellNode[] {
  const result: TreeCellNode[] = [];
  const visit = (node: TreeCellNode): void => {
    result.push(node);
    node.children.forEach(({ node: child }) => visit(child));
  };
  visit(root);
  return result;
}

function materializeTreePlacement(
  plan: ChainPlan,
  root: TreeCellNode,
  nodes: TreeCellNode[],
  placements: Map<TreeCellNode, { panel: SourcePanel; x: number; y: number }>,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): CanonicalLayout | undefined {
  const belt = BELTS[beltTier];
  const undergroundName = beltTier === "yellow"
    ? "underground-belt"
    : beltTier === "red"
      ? "fast-underground-belt"
      : "express-underground-belt";
  const drafts: Draft[] = [];
  const inputs = new Map<TreeCellNode, Map<string, { x: number; y: number }>>();
  const outputs = new Map<TreeCellNode, { x: number; y: number }>();
  const outputDirections = new Map<TreeCellNode, CardinalDirection>();
  nodes.forEach((node) => {
    const placement = placements.get(node)!;
    placement.panel.drafts.forEach((draft) => drafts.push({
      ...draft,
      position: { x: draft.position.x + placement.x, y: draft.position.y + placement.y },
    }));
    inputs.set(node, new Map([...placement.panel.inputPositions].map(([material, position]) => [material, {
      x: position.x + placement.x,
      y: position.y + placement.y,
    }])));
    outputs.set(node, {
      x: placement.panel.outputPosition.x + placement.x,
      y: placement.panel.outputPosition.y + placement.y,
    });
    outputDirections.set(node, placement.panel.outputDirection);
  });
  if (!collisionFreeDrafts(drafts)) return rejectTreePlacement("initial-collision");
  const externalTaps = nodes.flatMap((node) => {
    const childMaterials = new Set(node.children.map(({ material }) => material));
    return [...inputs.get(node)!]
      .filter(([material]) => !childMaterials.has(material))
      .map(([material, position]) => ({
        material,
        type: "item" as const,
        x: Math.floor(position.x),
        y: Math.floor(position.y),
      }));
  });
  const minimumOccupiedX = Math.floor(Math.min(...drafts.map((draft) =>
    draft.position.x - draftHalfSize(draft).x), ...externalTaps.map((tap) => tap.x)));
  const translateX = 18 - minimumOccupiedX;
  drafts.forEach((draft) => {
    draft.position = { ...draft.position, x: draft.position.x + translateX };
  });
  externalTaps.forEach((tap) => { tap.x += translateX; });
  inputs.forEach((nodeInputs) => nodeInputs.forEach((position, material) => nodeInputs.set(material, {
    x: position.x + translateX,
    y: position.y,
  })));
  outputs.forEach((position, node) => outputs.set(node, { x: position.x + translateX, y: position.y }));
  const inputPositions = addRoutedBoundaryFanout(
    drafts,
    externalTaps,
    plan,
    belt.entityName,
    belt.splitterEntityName,
    undergroundName,
    plan.inputs.map((input) => input.name),
  );
  if (!inputPositions) return rejectTreePlacement("boundary-routing");
  if (inputPositions.size !== plan.inputs.length || !collisionFreeDrafts(drafts) ||
    !undergroundPairingValid(drafts) || crossMaterialTransportFeed(drafts)) {
    return rejectTreePlacement("boundary-validation");
  }
  const rootOutput = outputs.get(root)!;
  const shiftedRootOutput = { x: Math.floor(rootOutput.x), y: Math.floor(rootOutput.y) };
  const reservedIngressTiles = new Set<string>();
  for (let x = Math.floor(rootOutput.x) + 1; x <= Math.floor(rootOutput.x) + 192; x += 1) {
    reservedIngressTiles.add(`${x},${Math.floor(rootOutput.y)}`);
  }
  const edges = nodes.flatMap((parent) => parent.children.map(({ material, node: child }) => ({
    material,
    input: inputs.get(parent)!.get(material)!,
    output: outputs.get(child)!,
    outputDirection: outputDirections.get(child)!,
  }))).sort((left, right) =>
    Math.abs(left.output.x - left.input.x) + Math.abs(left.output.y - left.input.y) -
    Math.abs(right.output.x - right.input.x) - Math.abs(right.output.y - right.input.y));
  edges.forEach(({ input }) => {
    const inputTile = floorPosition(input);
    const inputDraft = drafts.find((draft) =>
      Math.floor(draft.position.x) === inputTile.x && Math.floor(draft.position.y) === inputTile.y &&
      draft.direction !== undefined);
    if (!inputDraft || inputDraft.direction === undefined) return;
    const vector = directionVector(inputDraft.direction);
    reservedIngressTiles.add(`${inputTile.x - vector.x},${inputTile.y - vector.y}`);
  });
  if (!edges.every((edge) => routePanelOutput(
    drafts,
    edge.material,
    edge.output,
    edge.outputDirection,
    edge.input,
    belt.entityName,
    reservedIngressTiles,
  ))) return rejectTreePlacement("internal-routing");
  if (!collisionFreeDrafts(drafts) || !undergroundPairingValid(drafts) || crossMaterialTransportFeed(drafts)) {
    return rejectTreePlacement("internal-validation");
  }
  try {
    connectPowerComponents(drafts);
  } catch {
    return rejectTreePlacement("power-routing");
  }
  if (!collisionFreeDrafts(drafts) || !undergroundPairingValid(drafts)) {
    return rejectTreePlacement("power-validation");
  }
  const rotationQuarterTurns = (SIDE_INDEX[inputSide] - SIDE_INDEX.west + 4) % 4;
  const canonicalOutputSide = INDEX_SIDE[(SIDE_INDEX[outputSide] - rotationQuarterTurns + 4) % 4];
  let finalOutput = shiftedRootOutput;
  if (canonicalOutputSide === "east") {
    const easternEdge = Math.ceil(Math.max(...drafts.map((draft) =>
      draft.position.x + draftHalfSize(draft).x))) + 3;
    if (easternEdge > finalOutput.x) {
      addBeltPath(
        drafts,
        "output-belt",
        root.planned.material,
        belt.entityName,
        horizontalPoints(finalOutput.x + 1, easternEdge, finalOutput.y),
        4,
      );
      finalOutput = { x: easternEdge, y: finalOutput.y };
    }
  } else {
    finalOutput = routeCanonicalOutput(
      drafts,
      finalOutput,
      canonicalOutputSide,
      root.planned.material,
      belt.entityName,
    );
  }
  const candidate: CanonicalLayout = {
    drafts,
    inputPositions,
    outputPosition: tilePosition(finalOutput.x, finalOutput.y),
    canonicalOutputSide,
    rotationQuarterTurns,
  };
  return collisionFreeDrafts(candidate.drafts) && undergroundPairingValid(candidate.drafts) &&
    !crossMaterialTransportFeed(candidate.drafts) ? candidate : rejectTreePlacement("output-validation");
}

export function buildBeamPackedTreeCellLayout(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): CanonicalLayout | undefined {
  if (plan.targetType !== "item" || plan.recipes.length < 2 || plan.recipes.length > 4 ||
    plan.inputs.some((input) => input.type !== "item") ||
    plan.recipes.some((planned) => planned.materialType !== "item" ||
      planned.recipe.ingredients.some((ingredient) => ingredient.type !== "item")) ||
    plan.recipes.reduce((sum, planned) => sum + planned.machineCount, 0) > 24) return undefined;
  const target = plan.recipes.find((planned) => planned.material === plan.target);
  if (!target) return undefined;
  const root = buildAtomicTree(plan, target, target.outputPerSecond, beltTier, 0, { value: 0 });
  if (!root) return undefined;
  const nodes = flattenTree(root);
  const order = nodes.filter((node) => node !== root).sort((left, right) => left.depth - right.depth || left.id - right.id);
  const rootOccupancy = new Set<string>();
  root.layout.drafts.flatMap(occupiedDraftTiles).forEach((tile) => rootOccupancy.add(`${tile.x},${tile.y}`));
  const occupied = [...rootOccupancy].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  });
  let states: PanelPackingState[] = [{
    occupancy: rootOccupancy,
    placements: [],
    minimumX: Math.min(...occupied.map((tile) => tile.x)),
    maximumX: Math.max(...occupied.map((tile) => tile.x)),
    minimumY: Math.min(...occupied.map((tile) => tile.y)),
    maximumY: Math.max(...occupied.map((tile) => tile.y)),
    score: 0,
  }];
  const panelByNode = new Map(order.map((node) => [node, {
    drafts: node.layout.drafts,
    inputPositions: node.layout.inputPositions,
    outputPosition: node.layout.outputPosition,
    outputDirection: 4,
  } satisfies SourcePanel]));
  const geometriesByNode = new Map(order.map((node) => [node,
    [0, 1, 2, 3].map((quarterTurns) =>
      geometryForPanel(node.planned, rotateSourcePanel(panelByNode.get(node)!, quarterTurns))),
  ]));
  for (let orderIndex = 0; orderIndex < order.length; orderIndex += 1) {
    const node = order[orderIndex];
    const parentIndex = order.indexOf(node.parent!);
    states = states.flatMap((state) => {
      const parentTranslation = node.parent === root
        ? { x: 0, y: 0 }
        : {
          x: state.placements[parentIndex].translateX,
          y: state.placements[parentIndex].translateY,
        };
      const parentInputs = node.parent === root
        ? root.layout.inputPositions
        : state.placements[parentIndex].geometry.panel.inputPositions;
      const localPort = parentInputs.get(node.planned.material)!;
      const virtualPort = {
        x: Math.floor(localPort.x) + parentTranslation.x,
        y: Math.floor(localPort.y) + parentTranslation.y,
      };
      return geometriesByNode.get(node)!.flatMap((geometry) =>
        panelPlacementCandidates(state, geometry, virtualPort, 4, false));
    }).sort((left, right) => left.score - right.score).slice(0, 64);
    if (states.length === 0) return undefined;
  }
  const candidates: CanonicalLayout[] = [];
  for (const state of states.slice(0, 32)) {
    const rootPanel: SourcePanel = {
      drafts: root.layout.drafts,
      inputPositions: root.layout.inputPositions,
      outputPosition: root.layout.outputPosition,
      outputDirection: 4,
    };
    const placements = new Map<TreeCellNode, { panel: SourcePanel; x: number; y: number }>([[root, {
      panel: rootPanel,
      x: 0,
      y: 0,
    }]]);
    order.forEach((node, index) => placements.set(node, {
      panel: state.placements[index].geometry.panel,
      x: state.placements[index].translateX,
      y: state.placements[index].translateY,
    }));
    const candidate = materializeTreePlacement(plan, root, nodes, placements, inputSide, outputSide, beltTier);
    if (candidate) candidates.push(candidate);
  }
  return candidates.sort((left, right) => {
    const leftEnvelope = layoutEnvelope(left);
    const rightEnvelope = layoutEnvelope(right);
    return leftEnvelope.area - rightEnvelope.area || left.drafts.length - right.drafts.length;
  })[0];
}

export function buildFlattenedTreeCellLayout(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): CanonicalLayout | undefined {
  if (plan.targetType !== "item" || plan.recipes.length < 2 || plan.recipes.length > 8 ||
    plan.inputs.some((input) => input.type !== "item") ||
    plan.recipes.some((planned) => planned.materialType !== "item" ||
      planned.recipe.ingredients.some((ingredient) => ingredient.type !== "item")) ||
    plan.recipes.reduce((sum, planned) => sum + planned.machineCount, 0) > 40) return undefined;
  const target = plan.recipes.find((planned) => planned.material === plan.target);
  if (!target) return undefined;
  const root = buildAtomicTree(plan, target, target.outputPerSecond, beltTier, 0, { value: 0 });
  if (!root) return undefined;
  const nodes = flattenTree(root);
  const maximumDepth = Math.max(...nodes.map((node) => node.depth));
  const belt = BELTS[beltTier];
  const undergroundName = beltTier === "yellow"
    ? "underground-belt"
    : beltTier === "red"
      ? "fast-underground-belt"
      : "express-underground-belt";
  const candidates: CanonicalLayout[] = [];
  let floorplans = 0;

  for (const columnGap of [4, 6, 8, 10]) {
    for (const rowGap of [2, 4, 6]) {
      for (const reverseSiblings of [false, true]) {
        floorplans += 1;
        const maximumWidthByDepth = new Map<number, number>();
        for (let depth = 0; depth <= maximumDepth; depth += 1) {
          maximumWidthByDepth.set(depth, Math.max(...nodes.filter((node) => node.depth === depth)
            .map((node) => node.width)));
        }
        const xByDepth = new Map<number, number>([[maximumDepth, 0]]);
        for (let depth = maximumDepth - 1; depth >= 0; depth -= 1) {
          xByDepth.set(depth, xByDepth.get(depth + 1)! + maximumWidthByDepth.get(depth + 1)! + columnGap);
        }
        const yByNode = new Map<TreeCellNode, number>();
        yByNode.set(root, -Math.floor(root.height / 2));
        for (let depth = 1; depth <= maximumDepth; depth += 1) {
          const depthNodes = nodes.filter((node) => node.depth === depth).sort((left, right) => {
            const parentDelta = (yByNode.get(left.parent!) ?? 0) - (yByNode.get(right.parent!) ?? 0);
            if (parentDelta !== 0) return parentDelta;
            return reverseSiblings ? right.id - left.id : left.id - right.id;
          });
          const totalHeight = depthNodes.reduce((sum, node) => sum + node.height, 0) +
            Math.max(0, depthNodes.length - 1) * rowGap;
          const parentCenter = depthNodes.reduce((sum, node) =>
            sum + (yByNode.get(node.parent!) ?? 0) + node.parent!.height / 2, 0) / depthNodes.length;
          let cursorY = Math.round(parentCenter - totalHeight / 2);
          depthNodes.forEach((node) => {
            yByNode.set(node, cursorY);
            cursorY += node.height + rowGap;
          });
        }

        const placements = new Map<TreeCellNode, { panel: SourcePanel; x: number; y: number }>();
        nodes.forEach((node) => placements.set(node, {
          panel: {
            drafts: node.layout.drafts,
            inputPositions: node.layout.inputPositions,
            outputPosition: node.layout.outputPosition,
            outputDirection: 4,
          },
          x: xByDepth.get(node.depth)!,
          y: yByNode.get(node)!,
        }));
        const materialized = materializeTreePlacement(
          plan,
          root,
          nodes,
          placements,
          inputSide,
          outputSide,
          beltTier,
        );
        if (materialized) candidates.push(materialized);
      }
    }
  }
  const selected = candidates.sort((left, right) => {
    const leftEnvelope = layoutEnvelope(left);
    const rightEnvelope = layoutEnvelope(right);
    return leftEnvelope.area - rightEnvelope.area || left.drafts.length - right.drafts.length;
  })[0];
  if (!selected) throw new Error(
    `Flattened cell cover exhausted ${floorplans} congestion-feedback floorplans.`,
  );
  return selected;
}

export function buildRecursiveCellLayout(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): CanonicalLayout | undefined {
  if (plan.recipes.length < 5) return undefined;
  const terminal = plan.recipes.find((planned) => planned.material === plan.target);
  if (!terminal || terminal.recipe.ingredients.length > 4) return undefined;
  if (terminal.recipe.ingredients.length > 2) {
    return buildRecursiveItemComposition(plan, inputSide, outputSide, beltTier);
  }
  const candidates: CanonicalLayout[] = [];
  // The flattened tree router has live-engine proof for one- and two-contract
  // terminals. Wider terminal recipes use the recursive composition below:
  // it retains the complete, independently validated boundary-recipe cell and
  // connects each child at that cell's original input port. This avoids the
  // alternating-feeder starvation that occurs when a flat tree independently
  // routes into a three/four-contract terminal.
  const factories = [
    () => buildBeamPackedTreeCellLayout(plan, inputSide, outputSide, beltTier),
    () => buildFlattenedTreeCellLayout(plan, inputSide, outputSide, beltTier),
  ];
  for (const factory of factories) {
    try {
      const candidate = factory();
      if (candidate) candidates.push(candidate);
    } catch {
      // Every floorplanner is an independent exact-cover search coordinate.
    }
  }
  if (candidates.length === 0) {
    try {
      const candidate = buildRecursiveItemComposition(plan, inputSide, outputSide, beltTier);
      if (candidate) candidates.push(candidate);
    } catch {
      // The general production-graph compiler remains available as a separate
      // validated candidate if no recursive cover is routable.
    }
  }
  return candidates.sort((left, right) => {
    const leftEnvelope = layoutEnvelope(left);
    const rightEnvelope = layoutEnvelope(right);
    return leftEnvelope.area - rightEnvelope.area || left.drafts.length - right.drafts.length;
  })[0];
}

/**
 * Compiles a recursively recognized graph into balanced direct-insertion
 * islands plus a pitch-four fluid terminal. Immediate one-input and
 * item-plus-fluid leaf recipes are lowered into dense shelf-packed panels;
 * other graph shapes remain on the verified general compiler.
 */
export function buildHierarchicalLayout(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): CanonicalLayout | undefined {
  const pattern = detectHierarchicalPattern(plan);
  if (!pattern) return undefined;
  const requestedRotationQuarterTurns = (SIDE_INDEX[inputSide] - SIDE_INDEX.west + 4) % 4;
  // A horizontal reflection puts the western ingress on the east without
  // rotating Factorio's world-oriented assembler fluid socket. This also
  // preserves the dense north/south inserter contracts that a 180° rotation
  // would force onto the socket tile.
  const reflectX = requestedRotationQuarterTurns === 2;
  const rotationQuarterTurns = reflectX ? 0 : requestedRotationQuarterTurns;
  const requiredSolidBoundaries = new Set([
    pattern.sourceBoundary.name,
    pattern.primaryBoundary.name,
    pattern.secondaryBoundary.name,
  ]);
  const actualBoundaries = new Set(plan.inputs.map((input) => input.name));
  const plannedByMaterial = new Map(plan.recipes.map((planned) => [planned.material, planned]));
  const upstreamLeaves = [...requiredSolidBoundaries]
    .filter((material) => !actualBoundaries.has(material))
    .map((material) => plannedByMaterial.get(material));
  if (upstreamLeaves.some((planned) => !planned ||
    planned.recipe.ingredients.some((ingredient) => !actualBoundaries.has(ingredient.name))) ||
    pattern.terminalFluids.some((fluid) => !actualBoundaries.has(fluid.name))) return undefined;

  const belt = BELTS[beltTier];
  const undergroundName = beltTier === "yellow"
    ? "underground-belt"
    : beltTier === "red"
      ? "fast-underground-belt"
      : "express-underground-belt";
  const boundaries = requiredSolidBoundaries;
  const primaryPlan = scaledSubplan(
    plan,
    pattern.primary,
    pattern.primaryForTerminalPerSecond,
    new Set([pattern.sourceBoundary.name, pattern.primaryBoundary.name]),
  );
  const secondaryPlan = scaledSubplan(plan, pattern.secondary, pattern.secondaryForTerminalPerSecond, boundaries);
  const primaryLayout = buildAnonymousCellLayout(
    primaryPlan,
    "west",
    "east",
    beltTier,
    pattern.terminal.machineCount,
  );
  const secondaryLayout = buildAnonymousCellLayout(secondaryPlan, "west", "west", beltTier);
  if (!primaryLayout || !secondaryLayout) return undefined;

  const islands: Island[] = [
    { layout: primaryLayout, x: 0, y: 4 },
    { layout: secondaryLayout, x: 0, y: 22 },
  ];
  const drafts: Draft[] = [];
  islands.forEach((island) => translateIsland(drafts, island));
  const rawItemTaps = islands.flatMap(translatedInputs);
  const tapsByLine = new Map<string, PortTap[]>();
  rawItemTaps.forEach((tap) => {
    const key = `${tap.material}|${tap.y}`;
    const entries = tapsByLine.get(key) ?? [];
    entries.push(tap);
    tapsByLine.set(key, entries);
  });
  const itemTaps = [...tapsByLine.values()].map((entries) => {
    const ordered = [...entries].sort((left, right) => left.x - right.x);
    if (ordered.length > 1) {
      for (let x = ordered[0].x; x < ordered.at(-1)!.x; x += 1) {
        const occupied = drafts.some((draft) =>
          Math.floor(draft.position.x) === x && Math.floor(draft.position.y) === ordered[0].y);
        if (!occupied) drafts.push({
          role: "input-belt",
          material: ordered[0].material,
          name: belt.entityName,
          position: tilePosition(x, ordered[0].y),
          direction: 4,
        });
      }
    }
    return ordered[0];
  });
  const secondaryOutputInserters = drafts.filter((draft) =>
    draft.role === "output-inserter" && draft.recipe === pattern.secondary.recipe.id);
  const secondaryCollectorY = Math.max(...secondaryOutputInserters.map((draft) => Math.floor(draft.position.y))) + 2;
  const secondaryCollectorX = Math.max(...drafts
    .filter((draft) => draft.material === pattern.secondary.material &&
      draft.role === "output-belt" && Math.floor(draft.position.y) === secondaryCollectorY)
    .map((draft) => Math.floor(draft.position.x)));
  for (let index = drafts.length - 1; index >= 0; index -= 1) {
    const draft = drafts[index];
    if (draft.material === pattern.secondary.material &&
      (draft.role === "output-belt" || draft.role === "underground-belt") &&
      Math.floor(draft.position.y) > secondaryCollectorY) {
      drafts.splice(index, 1);
    }
  }
  const secondaryCollectorExit = drafts.find((draft) =>
    draft.material === pattern.secondary.material && draft.role === "output-belt" &&
    Math.floor(draft.position.x) === secondaryCollectorX && Math.floor(draft.position.y) === secondaryCollectorY);
  if (!secondaryCollectorExit) throw new Error("The secondary collector has no eastbound exit tile.");
  secondaryCollectorExit.direction = 4;
  const terminal = addDirectInsertedTerminal(
    drafts,
    pattern,
    islands[0],
    { x: secondaryCollectorX, y: secondaryCollectorY, direction: 4 },
    belt.entityName,
    undergroundName,
    rotationQuarterTurns,
  );
  const inputPositions = addBoundaryFanout(
    drafts,
    itemTaps,
    plan,
    belt.entityName,
    belt.splitterEntityName,
    undergroundName,
    terminal.fluidPorts.map((port) => port.y),
    [...requiredSolidBoundaries],
  );
  // Reserve final fluid ingress before floorplanning and routing solid source
  // panels so the pathfinder treats the pipe corridor as occupied geometry.
  terminal.fluidPorts.forEach((port) => {
    inputPositions.set(port.material, tilePosition(-18, port.y));
    addPumpFreeHorizontalPipe(drafts, port.material, -18, port.x - 1, port.y);
  });
  const terminalOutputTile = floorPosition(terminal.outputPosition);
  const outputEscapeMaximumX = terminalOutputTile.x + 128 +
    upstreamLeaves.reduce((sum, planned) => sum + planned!.machineCount * 4, 0);
  const outputEscapeTiles = new Set<string>();
  for (let x = terminalOutputTile.x + 1; x <= outputEscapeMaximumX; x += 1) {
    outputEscapeTiles.add(`${x},${terminalOutputTile.y}`);
  }

  const compiledPanels = upstreamLeaves.map((planned) => {
    const maximumRows = Math.min(8, planned!.machineCount);
    const minimumRows = 1;
    const oneInputPanels = Array.from({ length: maximumRows - minimumRows + 1 }, (_, index) => minimumRows + index)
      .filter((rows) => {
        const outputBranches = Math.ceil(rows / 2);
        return (outputBranches & (outputBranches - 1)) === 0;
      })
      .map((rows) => buildOneInputSourcePanel(planned!, belt.entityName, belt.splitterEntityName, rows))
      .filter((panel): panel is SourcePanel => panel !== undefined);
    const fluidPanel = buildItemFluidSourcePanel(planned!, belt.entityName);
    const panels = oneInputPanels.length > 0 ? oneInputPanels : fluidPanel ? [fluidPanel] : [];
    if (panels.length === 0) throw new Error(`No compact source-panel primitive matches ${planned!.recipe.id}.`);
    return { planned: planned!, panels };
  });
  const packingStates = searchPanelPackings(drafts, compiledPanels, inputPositions, outputEscapeTiles);
  let packedDrafts: Draft[] | undefined;
  let packedInputs: Map<string, { x: number; y: number }> | undefined;
  let routeFailures = 0;
  let isolationFailures = 0;
  let powerFailures = 0;
  let firstIsolationFailure: string | undefined;
  for (const state of packingStates) {
    const trialDrafts = [...drafts];
    const trialInputs = new Map(inputPositions);
    const connections = state.placements.map(({ geometry, translateX, translateY }) => {
      const virtualPort = trialInputs.get(geometry.planned.material);
      if (!virtualPort) throw new Error(`Missing virtual leaf port for ${geometry.planned.material}.`);
      const placed = translateSourcePanel(trialDrafts, geometry.panel, translateX, translateY);
      trialInputs.delete(geometry.planned.material);
      placed.inputs.forEach((position, material) => trialInputs.set(material, position));
      return { geometry, placed, virtualPort };
    }).sort((left, right) =>
      Math.abs(floorPosition(left.placed.output).x - floorPosition(left.virtualPort).x) +
        Math.abs(floorPosition(left.placed.output).y - floorPosition(left.virtualPort).y) -
      Math.abs(floorPosition(right.placed.output).x - floorPosition(right.virtualPort).x) -
        Math.abs(floorPosition(right.placed.output).y - floorPosition(right.virtualPort).y));
    const reservedIngressTiles = new Set(outputEscapeTiles);
    connections.forEach(({ geometry, virtualPort }) => {
      const input = floorPosition(virtualPort);
      const inputDraft = trialDrafts.find((draft) =>
        draft.material === geometry.planned.material && draft.direction !== undefined &&
        Math.floor(draft.position.x) === input.x && Math.floor(draft.position.y) === input.y &&
        (draft.name.includes("transport-belt") || draft.name.includes("underground-belt") ||
          draft.name.includes("splitter")));
      if (!inputDraft || inputDraft.direction === undefined) {
        throw new Error(`Missing typed belt ingress for ${geometry.planned.material}.`);
      }
      const vector = directionVector(inputDraft.direction);
      reservedIngressTiles.add(`${input.x - vector.x},${input.y - vector.y}`);
    });
    const routed = connections.every(({ geometry, placed, virtualPort }) => routePanelOutput(
      trialDrafts,
      geometry.planned.material,
      placed.output,
      geometry.panel.outputDirection,
      virtualPort,
      belt.entityName,
      reservedIngressTiles,
    ));
    if (!routed) {
      routeFailures += 1;
      continue;
    }
    const isolationFailure = crossMaterialTransportFeed(trialDrafts);
    if (isolationFailure) {
      isolationFailures += 1;
      firstIsolationFailure ??= isolationFailure;
      continue;
    }
    try {
      connectPowerComponents(trialDrafts);
    } catch {
      powerFailures += 1;
      continue;
    }
    packedDrafts = trialDrafts;
    packedInputs = trialInputs;
    break;
  }
  if (!packedDrafts || !packedInputs) throw new Error(
    `No routable compact source-panel packing was found (${routeFailures} routing, ${isolationFailures} isolation, ` +
      `${powerFailures} power` +
      `${firstIsolationFailure ? `; ${firstIsolationFailure}` : ""}).`,
  );
  drafts.splice(0, drafts.length, ...packedDrafts);
  inputPositions.clear();
  packedInputs.forEach((position, material) => inputPositions.set(material, position));
  const canonicalOutputSide = reflectX
    ? outputSide === "east" ? "west" : outputSide === "west" ? "east" : outputSide
    : INDEX_SIDE[(SIDE_INDEX[outputSide] - rotationQuarterTurns + 4) % 4];
  const finalOutput = routeCanonicalOutput(
    drafts,
    floorPosition(terminal.outputPosition),
    canonicalOutputSide,
    pattern.terminal.material,
    belt.entityName,
  );
  const result: CanonicalLayout = {
    drafts,
    inputPositions,
    outputPosition: tilePosition(finalOutput.x, finalOutput.y),
    canonicalOutputSide,
    rotationQuarterTurns,
  };
  if (!reflectX) return result;
  const reflectedDirection = (direction: CardinalDirection | undefined): CardinalDirection | undefined => {
    if (direction === 4) return 12;
    if (direction === 12) return 4;
    return direction;
  };
  return {
    drafts: result.drafts.map((draft) => ({
      ...draft,
      position: { x: -draft.position.x, y: draft.position.y },
      direction: reflectedDirection(draft.direction),
      ...(draft.outputPriority
        ? { outputPriority: draft.outputPriority === "left" ? "right" as const : "left" as const }
        : {}),
    })),
    inputPositions: new Map([...result.inputPositions].map(([material, position]) => [material, {
      x: -position.x,
      y: position.y,
    }])),
    outputPosition: { x: -result.outputPosition.x, y: result.outputPosition.y },
    canonicalOutputSide: outputSide,
    rotationQuarterTurns: 0,
  };
}
