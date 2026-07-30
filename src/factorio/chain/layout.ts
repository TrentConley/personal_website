import { BELTS } from "../core/throughput";
import type { CardinalDirection, Side } from "../core/types";
import { groupSolidIngredients } from "./ingredient-groups";
import type {
  ChainEntityRole,
  ChainPlan,
  ChainPlannedEntity,
  MaterialType,
  PlannedRecipe,
} from "./types";

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
}

interface Tap {
  material: string;
  type: MaterialType;
  rate: number;
  branchX: number;
  targetY: number;
  finalDirection?: CardinalDirection;
  crossingRows?: number[];
}

interface BlockGeometry {
  plan: PlannedRecipe;
  startX: number;
  machineX: number;
  lastMachineX: number;
  outputX: number;
  endX: number;
}

export interface CanonicalLayout {
  drafts: Draft[];
  inputPositions: Map<string, { x: number; y: number }>;
  outputPosition: { x: number; y: number };
  canonicalOutputSide: Side;
  rotationQuarterTurns: number;
}

const SIDE_INDEX: Record<Side, number> = { north: 0, east: 1, south: 2, west: 3 };
const INDEX_SIDE: Side[] = ["north", "east", "south", "west"];

function tilePosition(x: number, y: number): { x: number; y: number } {
  return { x: x + 0.5, y: y + 0.5 };
}

function directionBetween(from: { x: number; y: number }, to: { x: number; y: number }): CardinalDirection {
  if (to.x === from.x && to.y === from.y - 1) return 0;
  if (to.x === from.x + 1 && to.y === from.y) return 4;
  if (to.x === from.x && to.y === from.y + 1) return 8;
  if (to.x === from.x - 1 && to.y === from.y) return 12;
  throw new Error("A routed belt path must use cardinal one-tile steps.");
}

function addBeltPath(
  drafts: Draft[],
  role: ChainEntityRole,
  material: string,
  name: string,
  path: Array<{ x: number; y: number }>,
  finalDirection: CardinalDirection,
): void {
  path.forEach((tile, index) => {
    drafts.push({
      role,
      material,
      name,
      position: tilePosition(tile.x, tile.y),
      direction: index + 1 < path.length ? directionBetween(tile, path[index + 1]) : finalDirection,
    });
  });
}

export function addVerticalBelt(
  drafts: Draft[],
  material: string,
  beltName: string,
  undergroundName: string,
  x: number,
  fromY: number,
  toY: number,
  crossingRows: number[],
  finalDirection: CardinalDirection,
): void {
  const south = toY > fromY;
  const direction: CardinalDirection = south ? 8 : 0;
  const minimum = Math.min(fromY, toY);
  const maximum = Math.max(fromY, toY);
  const crossings = [...new Set(crossingRows)]
    .filter((row) => row > minimum && row < maximum)
    .sort((left, right) => left - right);
  const clusters: Array<{ start: number; end: number }> = [];
  for (const row of crossings) {
    const cluster = clusters.at(-1);
    if (cluster && row <= cluster.end + 2) cluster.end = row;
    else clusters.push({ start: row, end: row });
  }
  const undergroundTiles = new Map<number, "input" | "output">();
  const skippedTiles = new Set<number>();
  for (const cluster of clusters) {
    const entrance = south ? cluster.start - 1 : cluster.end + 1;
    const exit = south ? cluster.end + 1 : cluster.start - 1;
    undergroundTiles.set(entrance, "input");
    undergroundTiles.set(exit, "output");
    for (let y = cluster.start; y <= cluster.end; y += 1) skippedTiles.add(y);
  }
  for (let y = fromY; south ? y <= toY : y >= toY; y += south ? 1 : -1) {
    if (skippedTiles.has(y)) continue;
    drafts.push({
      role: undergroundTiles.has(y) ? "underground-belt" : "ingredient-branch",
      material,
      name: undergroundTiles.has(y) ? undergroundName : beltName,
      position: tilePosition(x, y),
      direction: y === toY ? finalDirection : direction,
      undergroundType: undergroundTiles.get(y),
    });
  }
}

function addHorizontalBeltWithCrossings(
  drafts: Draft[],
  material: string,
  beltName: string,
  undergroundName: string,
  fromX: number,
  toX: number,
  y: number,
  crossingColumns: number[],
  finalDirection: CardinalDirection,
): void {
  if (toX < fromX) throw new Error("Internal material routes must run west to east.");
  const columns = [...new Set(crossingColumns)]
    .filter((column) => column > fromX && column < toX)
    .sort((left, right) => left - right);
  const clusters: Array<{ start: number; end: number }> = [];
  for (const column of columns) {
    const cluster = clusters.at(-1);
    if (cluster && column - cluster.start <= 8 && column <= cluster.end + 2) cluster.end = column;
    else clusters.push({ start: column, end: column });
  }
  const underground = new Map<number, "input" | "output">();
  const skipped = new Set<number>();
  for (const cluster of clusters) {
    const entrance = cluster.start - 1;
    const exit = cluster.end + 1;
    underground.set(entrance, "input");
    underground.set(exit, "output");
    for (let x = entrance + 1; x < exit; x += 1) skipped.add(x);
  }
  for (let x = fromX; x <= toX; x += 1) {
    if (skipped.has(x)) continue;
    const undergroundType = underground.get(x);
    drafts.push({
      role: undergroundType ? "underground-belt" : "ingredient-branch",
      material,
      name: undergroundType ? undergroundName : beltName,
      position: tilePosition(x, y),
      direction: x === toX ? finalDirection : 4,
      undergroundType,
    });
  }
}

export function addVerticalPipe(
  drafts: Draft[],
  material: string,
  x: number,
  fromY: number,
  toY: number,
  crossingRows: number[],
): void {
  const south = toY > fromY;
  const minimum = Math.min(fromY, toY);
  const maximum = Math.max(fromY, toY);
  const crossings = crossingRows.filter((row) => row > minimum && row < maximum);
  const entrance = new Map<number, CardinalDirection>();
  const skipped = new Set(crossings);
  for (const row of crossings) {
    entrance.set(row - 1, 0);
    entrance.set(row + 1, 8);
  }
  for (let y = fromY; south ? y <= toY : y >= toY; y += south ? 1 : -1) {
    if (skipped.has(y)) continue;
    const direction = entrance.get(y);
    drafts.push({
      role: direction === undefined ? "pipe" : "pipe-to-ground",
      material,
      name: direction === undefined ? "pipe" : "pipe-to-ground",
      position: tilePosition(x, y),
      direction,
    });
  }
}

export function addHorizontalPipeBus(
  drafts: Draft[],
  material: string,
  startX: number,
  endX: number,
  y: number,
  requiredSurfaceXs: number[],
  role: ChainEntityRole,
): void {
  const required = new Set([startX, endX, ...requiredSurfaceXs]);
  const pumpCenters: number[] = [];
  for (let candidate = startX + 72; candidate < endX - 4; candidate += 72) {
    while ([...required].some((requiredX) => Math.abs(requiredX - candidate) <= 2)) candidate += 4;
    if (candidate < endX - 4) pumpCenters.push(candidate);
  }

  function addSegment(segmentStartX: number, segmentEndX: number): void {
    let x = segmentStartX;
    drafts.push({ role, material, name: "pipe", position: tilePosition(x, y) });
    while (x < segmentEndX) {
      const nextRequired = [...required]
        .filter((candidate) => candidate > x && candidate <= segmentEndX)
        .sort((a, b) => a - b)[0] ?? segmentEndX;
      const available = nextRequired - x;
      if (available >= 5) {
        const entranceX = x + 1;
        const exitX = Math.min(x + 9, nextRequired - 1);
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
        drafts.push({ role, material, name: "pipe", position: tilePosition(x, y) });
      }
    }
  }

  let segmentStartX = startX;
  for (const pumpCenterX of pumpCenters) {
    addSegment(segmentStartX, pumpCenterX - 2);
    drafts.push({
      role: "pipe",
      material,
      name: "pump",
      position: { x: pumpCenterX, y: y + 0.5 },
      direction: 4,
    });
    segmentStartX = pumpCenterX + 1;
  }
  addSegment(segmentStartX, endX);
}

function splitItemGroups(recipe: PlannedRecipe): Array<Array<{ name: string; perSecond: number }>> {
  const designScale = recipe.designedOutputPerSecond / recipe.outputPerSecond;
  return groupSolidIngredients(recipe.ingredientRates
    .filter((ingredient) => ingredient.type === "item")
    .map(({ name, perSecond }) => ({ name, perSecond: perSecond * designScale })));
}

function buildItemFeeder(
  drafts: Draft[],
  taps: Tap[],
  busRows: number[],
  beltName: string,
  undergroundName: string,
  group: Array<{ name: string; perSecond: number }>,
  loaderX: number,
  feederY: number,
  endX: number,
  localCrossings: number[] = [],
  loadingY: number = feederY,
): void {
  const transitionX = loadingY === feederY ? loaderX : loaderX + 3;
  const feederPath = [
    ...Array.from({ length: transitionX - loaderX + 1 }, (_, index) => ({ x: loaderX + index, y: loadingY })),
    ...(loadingY === feederY ? [] : [{ x: transitionX, y: feederY }]),
    ...Array.from({ length: endX - transitionX }, (_, index) => ({ x: transitionX + index + 1, y: feederY })),
  ];
  addBeltPath(
    drafts,
    "ingredient-feeder",
    group.map((ingredient) => ingredient.name).join("+"),
    beltName,
    feederPath,
    4,
  );
  if (group[0]) {
    taps.push({
      material: group[0].name,
      type: "item",
      rate: group[0].perSecond,
      branchX: loaderX,
      targetY: loadingY - 1,
      crossingRows: [...busRows, ...localCrossings],
    });
  }
  if (group[1]) {
    const branchX = loaderX - 2;
    taps.push({
      material: group[1].name,
      type: "item",
      rate: group[1].perSecond,
      branchX,
      targetY: loadingY + 1,
      finalDirection: 4,
      crossingRows: [...busRows, ...localCrossings],
    });
    drafts.push({
      role: "ingredient-branch",
      material: group[1].name,
      name: beltName,
      position: tilePosition(branchX + 1, loadingY + 1),
      direction: 4,
    });
    drafts.push({
      role: "ingredient-branch",
      material: group[1].name,
      name: beltName,
      position: tilePosition(loaderX, loadingY + 1),
      direction: 0,
    });
  }
}

function buildComplexSolidInputs(
  drafts: Draft[],
  taps: Tap[],
  busRows: number[],
  beltName: string,
  undergroundName: string,
  recipePlan: PlannedRecipe,
  startX: number,
  machineX: number,
  machineY: number,
): void {
  const designScale = recipePlan.designedOutputPerSecond / recipePlan.outputPerSecond;
  const ingredients = recipePlan.ingredientRates
    .filter((ingredient) => ingredient.type === "item")
    .map((ingredient) => ({
      name: ingredient.name,
      perSecond: ingredient.perSecond * designScale,
    }));
  if (ingredients.length < 5 || ingredients.length > 8) {
    throw new Error(`${recipePlan.recipe.id} needs five to eight direct solid inputs.`);
  }

  const top = ingredients.slice(0, 3);
  const bottom = ingredients.slice(3, 6);
  const left = ingredients.slice(6, 8);
  const topRouteRows = top.map((_, index) => machineY - 5 - index * 4);
  const bottomRouteRows = bottom.map((_, index) => machineY + 5 + index * 4);
  const leftRows = left.map((_, index) => machineY - 1 + index * 2);
  const routeRows = [...topRouteRows, ...bottomRouteRows, ...leftRows];

  top.forEach((ingredient, index) => {
    const branchX = startX + 8 + index * 4;
    const pickupX = machineX - 1 + index;
    const routeY = topRouteRows[index];
    taps.push({
      material: ingredient.name,
      type: "item",
      rate: ingredient.perSecond,
      branchX,
      targetY: routeY,
      crossingRows: [...busRows, ...routeRows.filter((row) => row !== routeY)],
      finalDirection: 4,
    });
    for (let x = branchX + 1; x < pickupX; x += 1) {
      drafts.push({
        role: "ingredient-feeder",
        material: ingredient.name,
        recipe: recipePlan.recipe.id,
        name: beltName,
        position: tilePosition(x, routeY),
        direction: 4,
      });
    }
    addVerticalBelt(
      drafts,
      ingredient.name,
      beltName,
      undergroundName,
      pickupX,
      routeY,
      machineY - 3,
      topRouteRows.filter((row) => row !== routeY),
      8,
    );
    drafts.push({
      role: "input-inserter",
      material: ingredient.name,
      recipe: recipePlan.recipe.id,
      name: "bulk-inserter",
      position: tilePosition(pickupX, machineY - 2),
      direction: 0,
    });
  });

  bottom.forEach((ingredient, index) => {
    const branchX = startX + 20 + index * 4;
    const pickupX = machineX - 1 + index;
    const routeY = bottomRouteRows[index];
    taps.push({
      material: ingredient.name,
      type: "item",
      rate: ingredient.perSecond,
      branchX,
      targetY: routeY,
      crossingRows: [...busRows, ...routeRows.filter((row) => row !== routeY)],
      finalDirection: 4,
    });
    for (let x = branchX + 1; x < pickupX; x += 1) {
      drafts.push({
        role: "ingredient-feeder",
        material: ingredient.name,
        recipe: recipePlan.recipe.id,
        name: beltName,
        position: tilePosition(x, routeY),
        direction: 4,
      });
    }
    addVerticalBelt(
      drafts,
      ingredient.name,
      beltName,
      undergroundName,
      pickupX,
      routeY,
      machineY + 3,
      bottomRouteRows.filter((row) => row !== routeY),
      0,
    );
    drafts.push({
      role: "input-inserter",
      material: ingredient.name,
      recipe: recipePlan.recipe.id,
      name: "bulk-inserter",
      position: tilePosition(pickupX, machineY + 2),
      direction: 8,
    });
  });

  left.forEach((ingredient, index) => {
    const branchX = startX + 32 + index * 4;
    const pickupY = leftRows[index];
    const pickupX = machineX - 3;
    taps.push({
      material: ingredient.name,
      type: "item",
      rate: ingredient.perSecond,
      branchX,
      targetY: pickupY,
      crossingRows: [
        ...busRows,
        ...routeRows.filter((row) => row !== pickupY),
      ],
      finalDirection: 4,
    });
    for (let x = branchX + 1; x <= pickupX; x += 1) {
      drafts.push({
        role: "ingredient-feeder",
        material: ingredient.name,
        recipe: recipePlan.recipe.id,
        name: beltName,
        position: tilePosition(x, pickupY),
        direction: 4,
      });
    }
    drafts.push({
      role: "input-inserter",
      material: ingredient.name,
      recipe: recipePlan.recipe.id,
      name: "bulk-inserter",
      position: tilePosition(machineX - 2, pickupY),
      direction: 12,
    });
  });
}

function addMachineOutputBelts(
  drafts: Draft[],
  plan: PlannedRecipe,
  geometry: BlockGeometry,
  machineY: number,
  beltName: string,
  undergroundName: string,
  crossingRows: number[],
): void {
  const outputY = machineY + 6;
  for (let x = geometry.machineX + 3; x < geometry.outputX; x += 1) {
    drafts.push({
      role: "output-belt",
      material: plan.material,
      recipe: plan.recipe.id,
      name: beltName,
      position: tilePosition(x, outputY),
      direction: 4,
    });
  }
  for (let index = 0; index < plan.machineCount; index += 1) {
    const centerX = geometry.machineX + index * 6;
    const branchX = centerX + 3;
    const outputInserterCount = Math.min(
      3,
      Math.max(1, Math.ceil(plan.designedOutputPerSecond / plan.machineCount / 2)),
    );
    const offsets = [0, -1, 1].slice(0, outputInserterCount);
    for (const offset of offsets) {
      drafts.push({
        role: "output-inserter",
        material: plan.material,
        recipe: plan.recipe.id,
        name: "bulk-inserter",
        position: tilePosition(centerX + 2, machineY + offset),
        direction: 12,
      });
    }
    addVerticalBelt(
      drafts,
      plan.material,
      beltName,
      undergroundName,
      branchX,
      machineY + Math.min(...offsets),
      outputY - 1,
      crossingRows,
      8,
    );
  }
}

function collisionHalfSize(draft: Draft): { x: number; y: number } {
  if (["assembling-machine-3", "electric-furnace", "chemical-plant"].includes(draft.name)) return { x: 1.35, y: 1.35 };
  if (draft.name === "substation") return { x: 0.85, y: 0.85 };
  if (draft.name.includes("splitter")) {
    return draft.direction === 0 || draft.direction === 8 ? { x: 0.85, y: 0.35 } : { x: 0.35, y: 0.85 };
  }
  if (draft.name === "pump") {
    return draft.direction === 0 || draft.direction === 8 ? { x: 0.35, y: 0.85 } : { x: 0.85, y: 0.35 };
  }
  return { x: 0.32, y: 0.32 };
}

function collides(drafts: Draft[], candidate: Draft): boolean {
  const candidateSize = collisionHalfSize(candidate);
  return drafts.some((draft) => {
    const size = collisionHalfSize(draft);
    return Math.abs(draft.position.x - candidate.position.x) < size.x + candidateSize.x
      && Math.abs(draft.position.y - candidate.position.y) < size.y + candidateSize.y;
  });
}

function addPower(drafts: Draft[], factoryStartX: number, factoryEndX: number, machineY: number): void {
  const rows: number[] = [];
  for (let y = 2; y < machineY - 12; y += 16) rows.push(y);
  rows.push(machineY - 8, machineY + 9);
  const uniqueRows = [...new Set(rows)].sort((left, right) => left - right);
  for (const row of uniqueRows) {
    for (let x = factoryStartX; x <= factoryEndX + 8; x += 16) {
      let placed = false;
      for (const offsetY of [0, 1, -1, 2, -2]) {
        for (const offsetX of [0, 1, -1, 2, -2, 3, -3]) {
          const candidate: Draft = {
            role: "power-pole",
            name: "substation",
            position: { x: x + offsetX, y: row + offsetY },
          };
          if (!collides(drafts, candidate)) {
            drafts.push(candidate);
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (!placed) throw new Error(`Could not route the connected substation grid near ${x},${row}.`);
    }
  }
}

function routeOutput(
  drafts: Draft[],
  target: string,
  type: MaterialType,
  side: Side,
  start: { x: number; y: number },
  factoryEndX: number,
  busRows: number[],
  machineY: number,
  beltName: string,
  undergroundName: string,
): { x: number; y: number } {
  if (side === "east") return tilePosition(start.x, start.y);
  const outsideX = factoryEndX + 7;
  const northY = Math.min(...busRows) - 6;
  const southY = machineY + 14;
  if (type === "item") {
    if (side === "north" || side === "south") {
      const finalY = side === "north" ? northY : southY;
      addVerticalBelt(
        drafts,
        target,
        beltName,
        undergroundName,
        outsideX,
        start.y,
        finalY,
        busRows.filter((row) => row !== start.y),
        side === "north" ? 0 : 8,
      );
      return tilePosition(outsideX, finalY);
    }
    addVerticalBelt(
      drafts,
      target,
      beltName,
      undergroundName,
      outsideX,
      start.y,
      southY,
      busRows.filter((row) => row !== start.y),
      12,
    );
    const path = Array.from({ length: outsideX + 13 }, (_, index) => ({ x: outsideX - index, y: southY }));
    addBeltPath(drafts, "output-belt", target, beltName, path.slice(1), 12);
    return tilePosition(-6, southY);
  }
  if (side === "north" || side === "south") {
    const finalY = side === "north" ? northY : southY;
    addVerticalPipe(drafts, target, outsideX, start.y, finalY, busRows.filter((row) => row !== start.y));
    return tilePosition(outsideX, finalY);
  }
  addVerticalPipe(drafts, target, outsideX, start.y, southY, busRows.filter((row) => row !== start.y));
  for (let x = outsideX - 1; x >= -6; x -= 1) {
    drafts.push({ role: "pipe", material: target, name: "pipe", position: tilePosition(x, southY) });
  }
  return tilePosition(-6, southY);
}

export function buildCanonicalLayout(plan: ChainPlan, inputSide: Side, outputSide: Side, beltTier: keyof typeof BELTS): CanonicalLayout {
  const drafts: Draft[] = [];
  const taps: Tap[] = [];
  const belt = BELTS[beltTier];
  const undergroundName =
    beltTier === "yellow" ? "underground-belt" : beltTier === "red" ? "fast-underground-belt" : "express-underground-belt";
  const rotationQuarterTurns = (SIDE_INDEX[inputSide] - SIDE_INDEX.west + 4) % 4;
  const canonicalOutputSide = INDEX_SIDE[(SIDE_INDEX[outputSide] - rotationQuarterTurns + 4) % 4];
  const orderedMaterials = [
    ...plan.inputs.map((input) => input.name),
    ...plan.recipes.map((recipe) => recipe.material),
  ];
  const uniqueMaterials = [...new Set(orderedMaterials)];
  const busY = new Map(uniqueMaterials.map((material, index) => [material, index * 4]));
  const busRows = [...busY.values()];
  const machineY = uniqueMaterials.length * 4 + 12;
  const blocks: BlockGeometry[] = [];
  let cursorX = 8;

  for (const recipePlan of plan.recipes) {
    const startX = cursorX;
    const itemGroups = splitItemGroups(recipePlan);
    const fluidInputs = recipePlan.ingredientRates.filter((ingredient) => ingredient.type === "fluid");
    const hasFluid = fluidInputs.length > 0 || recipePlan.materialType === "fluid";
    const solidIngredientCount = recipePlan.ingredientRates.filter((ingredient) => ingredient.type === "item").length;
    const complexSolidRecipe = solidIngredientCount > 4 && !hasFluid;
    if (hasFluid && itemGroups.length > 2) {
      throw new Error(`${recipePlan.recipe.id} has more than four solid ingredients alongside fluids.`);
    }
    const extraFeederGroups = hasFluid
      ? Math.max(0, itemGroups.length - 1)
      : Math.max(0, itemGroups.length - 2);
    const machineX = complexSolidRecipe ? startX + 50 : startX + 22 + extraFeederGroups * 6;
    const lastMachineX = machineX + (recipePlan.machineCount - 1) * 6;
    const outputX = lastMachineX + 7;
    const geometry = { plan: recipePlan, startX, machineX, lastMachineX, outputX, endX: outputX + 5 };
    blocks.push(geometry);
    const feederPlacements = hasFluid
      ? [
          { loaderX: startX + 14, feederY: machineY + 3, loadingY: machineY + 3, inserterY: machineY + 2, direction: 8 as const, inserter: "bulk-inserter", offsetX: 0 },
          { loaderX: startX + 20, feederY: machineY + 4, loadingY: machineY + 5, inserterY: machineY + 2, direction: 8 as const, inserter: "long-handed-inserter", offsetX: 1 },
        ]
      : [
          { loaderX: startX + 8, feederY: machineY - 3, loadingY: machineY - 3, inserterY: machineY - 2, direction: 0 as const, inserter: "bulk-inserter", offsetX: -1 },
          { loaderX: startX + 14, feederY: machineY + 3, loadingY: machineY + 3, inserterY: machineY + 2, direction: 8 as const, inserter: "bulk-inserter", offsetX: -1 },
          { loaderX: startX + 20, feederY: machineY - 4, loadingY: machineY - 5, inserterY: machineY - 2, direction: 0 as const, inserter: "long-handed-inserter", offsetX: 1 },
          { loaderX: startX + 26, feederY: machineY + 4, loadingY: machineY + 5, inserterY: machineY + 2, direction: 8 as const, inserter: "long-handed-inserter", offsetX: 1 },
        ];
    const feederCrossingRows = complexSolidRecipe
      ? []
      : feederPlacements
          .slice(0, itemGroups.length)
          .flatMap((placement) => [
            placement.feederY,
            placement.loadingY - 1,
            placement.loadingY + 1,
          ]);

    const designScale = recipePlan.designedOutputPerSecond / recipePlan.outputPerSecond;
    recipePlan.ingredientRates
      .filter((ingredient) => ingredient.type === "item")
      .forEach((ingredient) => {
        if (ingredient.perSecond * designScale > plan.beltCapacityPerSecond + 1e-8) {
          throw new Error(
            `${recipePlan.recipe.id} needs ${(ingredient.perSecond * designScale).toFixed(3)} ${ingredient.name}/s on an internal feeder, ` +
              `above one ${beltTier} belt. Reduce the target until a future multi-belt layout is available.`,
          );
        }
      });

    if (complexSolidRecipe) {
      if (recipePlan.machineCount !== 1) {
        throw new Error(`${recipePlan.recipe.id} exceeded its single-cell complex recipe capacity.`);
      }
      buildComplexSolidInputs(
        drafts,
        taps,
        busRows,
        belt.entityName,
        undergroundName,
        recipePlan,
        startX,
        machineX,
        machineY,
      );
    } else itemGroups.forEach((group, groupIndex) => {
      const placement = feederPlacements[groupIndex];
      buildItemFeeder(
        drafts,
        taps,
        busRows,
        belt.entityName,
        undergroundName,
        group,
        placement.loaderX,
        placement.feederY,
        lastMachineX + 1,
        [
          ...feederCrossingRows.filter((row) => row !== placement.feederY),
          ...fluidInputs.map((_, fluidIndex) => machineY - 5 - fluidIndex * 2),
        ],
        placement.loadingY,
      );
    });

    fluidInputs.forEach((ingredient, fluidIndex) => {
      const headerY = machineY - 5 - fluidIndex * 2;
      const branchX = startX + 4 + fluidIndex * 3;
      taps.push({
        material: ingredient.name,
        type: "fluid",
        rate: ingredient.perSecond * designScale,
        branchX,
        targetY: headerY,
      });
      for (let x = branchX + 1; x <= lastMachineX + 1; x += 1) {
        drafts.push({ role: "pipe", material: ingredient.name, recipe: recipePlan.recipe.id, name: "pipe", position: tilePosition(x, headerY) });
      }
      for (let machine = 0; machine < recipePlan.machineCount; machine += 1) {
        const centerX = machineX + machine * 6;
        const connectorX = recipePlan.recipe.machine.name === "chemical-plant"
          ? centerX + (fluidIndex === 0 ? -1 : 1)
          : centerX;
        if (fluidIndex === 0) {
          for (let y = headerY + 1; y <= machineY - 2; y += 1) {
            drafts.push({
              role: "pipe",
              material: ingredient.name,
              recipe: recipePlan.recipe.id,
              name: "pipe",
              position: tilePosition(connectorX, y),
            });
          }
        } else {
          drafts.push({
            role: "pipe-to-ground",
            material: ingredient.name,
            recipe: recipePlan.recipe.id,
            name: "pipe-to-ground",
            position: tilePosition(connectorX, headerY + 1),
            direction: 0,
          });
          drafts.push({
            role: "pipe-to-ground",
            material: ingredient.name,
            recipe: recipePlan.recipe.id,
            name: "pipe-to-ground",
            position: tilePosition(connectorX, headerY + 3),
            direction: 8,
          });
          for (let y = headerY + 4; y <= machineY - 2; y += 1) {
            drafts.push({
              role: "pipe",
              material: ingredient.name,
              recipe: recipePlan.recipe.id,
              name: "pipe",
              position: tilePosition(connectorX, y),
            });
          }
        }
        if (recipePlan.recipe.machine.name === "assembling-machine-3" && rotationQuarterTurns === 1) {
          for (const [offsetX, offsetY] of [[-1, -2], [-2, -2], [-2, -1], [-2, 0]] as const) {
            drafts.push({
              role: "pipe",
              material: ingredient.name,
              recipe: recipePlan.recipe.id,
              name: "pipe",
              position: tilePosition(centerX + offsetX, machineY + offsetY),
            });
          }
        }
      }
    });

    for (let machine = 0; machine < recipePlan.machineCount; machine += 1) {
      const centerX = machineX + machine * 6;
      drafts.push({
        role: "machine",
        material: recipePlan.material,
        recipe: recipePlan.recipe.id,
        name: recipePlan.recipe.machine.name,
        position: tilePosition(centerX, machineY),
        recipeSetting: recipePlan.recipe.id,
        direction: 0,
      });
      if (!complexSolidRecipe) itemGroups.forEach((group, groupIndex) => {
        const placement = feederPlacements[groupIndex];
        drafts.push({
          role: "input-inserter",
          material: group.map((ingredient) => ingredient.name).join("+"),
          recipe: recipePlan.recipe.id,
          name: placement.inserter,
          position: tilePosition(centerX + placement.offsetX, placement.inserterY),
          direction: placement.direction,
        });
      });
    }

    if (recipePlan.materialType === "item") {
      addMachineOutputBelts(
        drafts,
        recipePlan,
        geometry,
        machineY,
        belt.entityName,
        undergroundName,
        feederCrossingRows.filter((row) => row > machineY),
      );
    } else {
      const headerY = machineY + 5;
      for (let machine = 0; machine < recipePlan.machineCount; machine += 1) {
        const centerX = machineX + machine * 6;
        const connectorX = recipePlan.recipe.machine.name === "chemical-plant" ? centerX - 1 : centerX;
        drafts.push({
          role: "pipe-to-ground",
          material: recipePlan.material,
          recipe: recipePlan.recipe.id,
          name: "pipe-to-ground",
          position: tilePosition(connectorX, machineY + 2),
          direction: 0,
        });
        drafts.push({
          role: "pipe-to-ground",
          material: recipePlan.material,
          recipe: recipePlan.recipe.id,
          name: "pipe-to-ground",
          position: tilePosition(connectorX, machineY + 4),
          direction: 8,
        });
      }
      for (let x = machineX - 1; x < outputX; x += 1) {
        drafts.push({ role: "pipe", material: recipePlan.material, name: "pipe", position: tilePosition(x, headerY) });
      }
    }
    cursorX = geometry.endX;
  }

  const factoryEndX = cursorX + 4;
  const sourceX = new Map<string, number>();
  for (const input of plan.inputs) sourceX.set(input.name, -6);
  for (const block of blocks) sourceX.set(block.plan.material, block.outputX);

  for (const tap of taps) {
    const sourceY = busY.get(tap.material)!;
    if (tap.type === "item") {
      const splitterX = tap.branchX - 1;
      drafts.push({
        role: "splitter",
        material: tap.material,
        name: belt.splitterEntityName,
        position: { x: splitterX + 0.5, y: sourceY + 1 },
        direction: 4,
      });
      addVerticalBelt(
        drafts,
        tap.material,
        belt.entityName,
        undergroundName,
        tap.branchX,
        sourceY + 1,
        tap.targetY,
        tap.crossingRows ?? busRows,
        tap.finalDirection ?? 8,
      );
    } else {
      addVerticalPipe(drafts, tap.material, tap.branchX, sourceY + 1, tap.targetY, busRows);
    }
  }

  for (const material of uniqueMaterials) {
    const y = busY.get(material)!;
    const startX = sourceX.get(material)!;
    const materialTaps = taps.filter((tap) => tap.material === material);
    const endX = material === plan.target
      ? factoryEndX + 6
      : Math.max(
          startX,
          ...materialTaps.map((tap) => tap.branchX + (tap.type === "item" ? 0 : 1)),
        );
    if ((plan.inputs.find((input) => input.name === material)?.type ?? plan.recipes.find((recipe) => recipe.material === material)?.materialType) === "item") {
      const splitters = new Set(
        materialTaps.filter((tap) => tap.type === "item").map((tap) => tap.branchX - 1),
      );
      for (let x = startX; x <= endX; x += 1) {
        if (splitters.has(x)) continue;
        drafts.push({ role: startX === -6 ? "input-belt" : "material-bus", material, name: belt.entityName, position: tilePosition(x, y), direction: 4 });
      }
    } else {
      addHorizontalPipeBus(
        drafts,
        material,
        startX,
        endX,
        y,
        materialTaps.map((tap) => tap.branchX),
        startX === -6 ? "pipe" : "material-bus",
      );
    }
  }

  for (const block of blocks) {
    const targetY = busY.get(block.plan.material)!;
    const localY = block.plan.materialType === "item" ? machineY + 6 : machineY + 5;
    if (block.plan.materialType === "item") {
      addVerticalBelt(
        drafts,
        block.plan.material,
        belt.entityName,
        undergroundName,
        block.outputX,
        localY,
        targetY + 1,
        busRows.filter((row) => row !== targetY),
        0,
      );
    } else {
      addVerticalPipe(drafts, block.plan.material, block.outputX, localY, targetY + 1, busRows.filter((row) => row !== targetY));
    }
  }

  const inputPositions = new Map(
    plan.inputs.map((input) => [input.name, tilePosition(-6, busY.get(input.name)!)]),
  );
  const targetStart = { x: factoryEndX + 6, y: busY.get(plan.target)! };
  const outputPosition = routeOutput(
    drafts,
    plan.target,
    plan.targetType,
    canonicalOutputSide,
    targetStart,
    factoryEndX,
    busRows,
    machineY,
    belt.entityName,
    undergroundName,
  );
  addPower(drafts, 8, factoryEndX, machineY);
  return { drafts, inputPositions, outputPosition, canonicalOutputSide, rotationQuarterTurns };
}

function rotatePosition(position: { x: number; y: number }, turns: number): { x: number; y: number } {
  let result = position;
  for (let index = 0; index < turns; index += 1) result = { x: -result.y, y: result.x };
  return result;
}

export function finalizeLayout(layout: CanonicalLayout): {
  entities: ChainPlannedEntity[];
  inputPositions: Map<string, { x: number; y: number }>;
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
      [...layout.inputPositions].map(([material, position]) => [material, rotatePosition(position, layout.rotationQuarterTurns)]),
    ),
    outputPosition: rotatePosition(layout.outputPosition, layout.rotationQuarterTurns),
  };
}
