import { BELTS } from "../core/throughput";
import type { CardinalDirection, Side } from "../core/types";
import {
  addHorizontalPipeBus,
  type CanonicalLayout,
  type Draft,
} from "./layout";
import {
  optimizeProductionTopology,
  type PhysicalIngredientFlow,
  type ProductionBlockContract,
} from "./optimizer";
import { buildAnonymousCellLayout } from "./motif-layout";
import {
  buildBoundaryRecipeLayout,
  buildCoupledChainLayout,
  buildCoupledRowLayout,
  buildForkJoinLayout,
  buildHierarchicalLayout,
  buildRecursiveCellLayout,
} from "./hierarchical-layout";
import type { ChainPlan, ChainEntityRole, MaterialType } from "./types";

export type SpatialLayoutPolicyId =
  | "anonymous-cell"
  | "boundary-recipe"
  | "coupled-rows"
  | "coupled-chain"
  | "fork-join"
  | "recursive-cell-cover"
  | "hierarchical-islands"
  | "adaptive-production-graph";

interface InputTap {
  materialId: string;
  material: string;
  type: MaterialType;
  rate: number;
  x: number;
  targetY: number;
  finalDirection?: CardinalDirection;
}

interface ProducerTap {
  materialId: string;
  material: string;
  type: MaterialType;
  rate: number;
  x: number;
  startY: number;
}

interface PlacedBlock {
  contract: ProductionBlockContract;
  machineStartX: number;
  baseY: number;
  inputTracks: number[];
  outputTracks: number[];
}

export interface SpatialLayoutPolicy {
  busPitch: number;
  busToMachineGap: number;
  trackPitch: number;
  ingressPadding: number;
  machineOutputGap: number;
  outputPadding: number;
  blockGap: number;
  depthGap: number;
  factoryEndGap: number;
}

export interface SpatialLayoutMetrics {
  policy: SpatialLayoutPolicyId;
  width: number;
  height: number;
  area: number;
  entityCount: number;
  transportEntities: number;
  undergroundEntities: number;
  score: number;
}

// These are search coordinates for one production-graph compiler, not a
// policy ladder. Every coordinate is independently routed and validated; the
// lowest measured spatial cost wins. A coordinate is accepted only on its own
// routing and physical-validation result.
const ADAPTIVE_GEOMETRY_SEARCH: readonly SpatialLayoutPolicy[] = [
  {
    busPitch: 3,
    busToMachineGap: 6,
    trackPitch: 1,
    ingressPadding: 6,
    machineOutputGap: 4,
    outputPadding: 4,
    blockGap: 1,
    depthGap: 4,
    factoryEndGap: 2,
  },
  {
    busPitch: 3,
    busToMachineGap: 6,
    trackPitch: 2,
    ingressPadding: 6,
    machineOutputGap: 3,
    outputPadding: 3,
    blockGap: 1,
    depthGap: 2,
    factoryEndGap: 2,
  },
  {
    busPitch: 3,
    busToMachineGap: 4,
    trackPitch: 2,
    ingressPadding: 4,
    machineOutputGap: 1,
    outputPadding: 1,
    blockGap: 1,
    depthGap: 2,
    factoryEndGap: 1,
  },
  {
    busPitch: 3,
    busToMachineGap: 5,
    trackPitch: 2,
    ingressPadding: 5,
    machineOutputGap: 2,
    outputPadding: 2,
    blockGap: 2,
    depthGap: 3,
    factoryEndGap: 2,
  },
  {
    busPitch: 4,
    busToMachineGap: 8,
    trackPitch: 2,
    ingressPadding: 6,
    machineOutputGap: 3,
    outputPadding: 3,
    blockGap: 4,
    depthGap: 6,
    factoryEndGap: 4,
  },
  {
    busPitch: 4,
    busToMachineGap: 10,
    trackPitch: 2,
    ingressPadding: 8,
    machineOutputGap: 4,
    outputPadding: 4,
    blockGap: 4,
    depthGap: 6,
    factoryEndGap: 6,
  },
  {
    busPitch: 3,
    busToMachineGap: 10,
    trackPitch: 2,
    ingressPadding: 10,
    machineOutputGap: 4,
    outputPadding: 3,
    blockGap: 6,
    depthGap: 8,
    factoryEndGap: 6,
  },
  {
    busPitch: 4,
    busToMachineGap: 10,
    trackPitch: 2,
    ingressPadding: 10,
    machineOutputGap: 4,
    outputPadding: 3,
    blockGap: 6,
    depthGap: 8,
    factoryEndGap: 6,
  },
] as const;

const SIDE_INDEX: Record<Side, number> = { north: 0, east: 1, south: 2, west: 3 };
const INDEX_SIDE: Side[] = ["north", "east", "south", "west"];
const SAFE_BULK_INSERTER_ITEMS_PER_SECOND = 2.31;
const SAFE_LONG_HANDED_INSERTER_ITEMS_PER_SECOND = 0.5;

function undergroundReach(name: string): number {
  if (name === "underground-belt") return 6;
  if (name === "fast-underground-belt") return 8;
  return 10;
}

function addVerticalBelt(
  drafts: Draft[],
  material: string,
  beltName: string,
  undergroundName: string,
  x: number,
  fromY: number,
  toY: number,
  reservedRows: number[],
  finalDirection: CardinalDirection,
): void {
  const south = toY > fromY;
  const step = south ? 1 : -1;
  const direction: CardinalDirection = south ? 8 : 0;
  const minimum = Math.min(fromY, toY);
  const maximum = Math.max(fromY, toY);
  const occupied = new Set(
    drafts
      .filter((draft) =>
        Math.abs(draft.position.x - (x + 0.5)) < 1e-9 &&
        draft.position.y >= minimum + 0.5 &&
        draft.position.y <= maximum + 0.5)
      .map((draft) => Math.floor(draft.position.y)),
  );
  for (const row of reservedRows) {
    if (row > minimum && row < maximum) occupied.add(row);
  }

  const blockedRows = [...occupied]
    .filter((row) => row > minimum && row < maximum)
    .sort((left, right) => left - right);
  const clusters: Array<{ minimum: number; maximum: number }> = [];
  for (const row of blockedRows) {
    const cluster = clusters.at(-1);
    if (cluster && row <= cluster.maximum + 2) cluster.maximum = row;
    else clusters.push({ minimum: row, maximum: row });
  }

  const underground = new Map<number, "input" | "output">();
  const skipped = new Set<number>();
  for (const cluster of clusters) {
    const entrance = south ? cluster.minimum - 1 : cluster.maximum + 1;
    const exit = south ? cluster.maximum + 1 : cluster.minimum - 1;
    if (Math.abs(exit - entrance) > undergroundReach(undergroundName)) {
      throw new Error(`No ${undergroundName} route can cross the occupied corridor at ${x},${cluster.minimum}.`);
    }
    underground.set(entrance, "input");
    underground.set(exit, "output");
    for (let skippedY = entrance + step; skippedY !== exit; skippedY += step) skipped.add(skippedY);
  }

  for (let routeY = fromY; south ? routeY <= toY : routeY >= toY; routeY += step) {
    if (skipped.has(routeY)) continue;
    const type = underground.get(routeY);
    drafts.push({
      role: type ? "underground-belt" : "ingredient-branch",
      material,
      name: type ? undergroundName : beltName,
      position: tilePosition(x, routeY),
      direction: routeY === toY ? finalDirection : direction,
      undergroundType: type,
    });
  }
}

function addVerticalPipe(
  drafts: Draft[],
  material: string,
  x: number,
  fromY: number,
  toY: number,
  reservedRows: number[],
): void {
  const minimum = Math.min(fromY, toY);
  const maximum = Math.max(fromY, toY);
  const occupied = new Set(
    drafts
      .filter((draft) =>
        Math.abs(draft.position.x - (x + 0.5)) < 1e-9 &&
        draft.position.y >= minimum + 0.5 &&
        draft.position.y <= maximum + 0.5)
      .map((draft) => Math.floor(draft.position.y)),
  );
  for (const row of reservedRows) {
    if (row > minimum && row < maximum) occupied.add(row);
  }
  const blockedRows = [...occupied]
    .filter((row) => row > minimum && row < maximum)
    .sort((left, right) => left - right);
  const clusters: Array<{ minimum: number; maximum: number }> = [];
  for (const row of blockedRows) {
    const cluster = clusters.at(-1);
    if (cluster && row <= cluster.maximum + 2) cluster.maximum = row;
    else clusters.push({ minimum: row, maximum: row });
  }
  const endpoints = new Map<number, CardinalDirection>();
  const skipped = new Set<number>();
  for (const cluster of clusters) {
    const top = cluster.minimum - 1;
    const bottom = cluster.maximum + 1;
    if (bottom - top > 10) {
      throw new Error(`No pipe-to-ground route can cross the occupied corridor at ${x},${cluster.minimum}.`);
    }
    endpoints.set(top, 0);
    endpoints.set(bottom, 8);
    for (let row = top + 1; row < bottom; row += 1) skipped.add(row);
  }
  const step = toY > fromY ? 1 : -1;
  for (let y = fromY; step > 0 ? y <= toY : y >= toY; y += step) {
    if (skipped.has(y)) continue;
    const direction = endpoints.get(y);
    drafts.push({
      role: direction === undefined ? "pipe" : "pipe-to-ground",
      material,
      name: direction === undefined ? "pipe" : "pipe-to-ground",
      position: tilePosition(x, y),
      direction,
    });
  }
}

function tilePosition(x: number, y: number): { x: number; y: number } {
  return { x: x + 0.5, y: y + 0.5 };
}

function beltDirection(
  from: { x: number; y: number },
  to: { x: number; y: number },
): CardinalDirection {
  if (to.x === from.x + 1 && to.y === from.y) return 4;
  if (to.x === from.x - 1 && to.y === from.y) return 12;
  if (to.x === from.x && to.y === from.y + 1) return 8;
  if (to.x === from.x && to.y === from.y - 1) return 0;
  throw new Error("Optimized belt routes must use one-tile cardinal steps.");
}

function addBeltPath(
  drafts: Draft[],
  role: ChainEntityRole,
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
      direction: index + 1 < path.length ? beltDirection(point, path[index + 1]) : finalDirection,
    });
  });
}

function addHorizontalBelt(
  drafts: Draft[],
  role: ChainEntityRole,
  material: string,
  beltName: string,
  fromX: number,
  toX: number,
  y: number,
  finalDirection: CardinalDirection = 4,
): void {
  if (toX < fromX) throw new Error(`Invalid horizontal route for ${material}.`);
  addBeltPath(
    drafts,
    role,
    material,
    beltName,
    Array.from({ length: toX - fromX + 1 }, (_, index) => ({ x: fromX + index, y })),
    finalDirection,
  );
}

function addHorizontalBeltAvoidingDrafts(
  drafts: Draft[],
  role: ChainEntityRole,
  material: string,
  beltName: string,
  undergroundName: string,
  fromX: number,
  toX: number,
  y: number,
  finalDirection: CardinalDirection,
): void {
  const occupied = new Set(
    drafts
      .filter((draft) =>
        Math.abs(draft.position.y - (y + 0.5)) < 1e-9 &&
        draft.position.x >= fromX + 0.5 &&
        draft.position.x <= toX + 0.5)
      .map((draft) => Math.floor(draft.position.x)),
  );
  const underground = new Map<number, "input" | "output">();
  const skipped = new Set<number>();
  let x = fromX;
  while (x <= toX) {
    if (!occupied.has(x)) {
      x += 1;
      continue;
    }
    let first = x;
    let last = x;
    while (occupied.has(last + 1) || occupied.has(last + 2)) {
      last += occupied.has(last + 1) ? 1 : 2;
    }
    let entrance = first - 1;
    while (occupied.has(entrance)) entrance -= 1;
    let exit = last + 1;
    while (occupied.has(exit)) exit += 1;
    if (entrance < fromX || exit > toX || exit - entrance > undergroundReach(undergroundName)) {
      throw new Error(`No ${undergroundName} route can cross the occupied row at ${first},${y}.`);
    }
    underground.set(entrance, "input");
    underground.set(exit, "output");
    for (let skippedX = entrance + 1; skippedX < exit; skippedX += 1) skipped.add(skippedX);
    x = exit + 1;
  }
  for (let routeX = fromX; routeX <= toX; routeX += 1) {
    if (skipped.has(routeX)) continue;
    const type = underground.get(routeX);
    drafts.push({
      role: type ? "underground-belt" : role,
      material,
      name: type ? undergroundName : beltName,
      position: tilePosition(routeX, y),
      direction: routeX === toX ? finalDirection : 4,
      undergroundType: type,
    });
  }
}

function groupIngredients(ingredients: PhysicalIngredientFlow[]): PhysicalIngredientFlow[][] {
  // A machine-side inserter cannot reliably consume both lanes of a mixed
  // belt at sustained rates. Keep physical feeder contracts single-material;
  // multi-item recipes use the near and long-handed feeder rows separately.
  return ingredients.map((ingredient) => [ingredient]);
}

function distributeMachines(machineCount: number, rows: number): number[] {
  const base = Math.floor(machineCount / rows);
  const remainder = machineCount % rows;
  return Array.from({ length: rows }, (_, index) => base + (index < remainder ? 1 : 0));
}

function addFeeder(
  drafts: Draft[],
  taps: InputTap[],
  horizontalRows: Set<number>,
  beltName: string,
  group: PhysicalIngredientFlow[],
  tracks: number[],
  feederY: number,
  endX: number,
  loadingY: number = feederY,
): number {
  const entryX = Math.max(...tracks) + 3;
  const undergroundName = beltName === "transport-belt"
    ? "underground-belt"
    : beltName === "fast-transport-belt"
      ? "fast-underground-belt"
      : "express-underground-belt";
  horizontalRows.add(feederY);
  horizontalRows.add(loadingY);
  const transitionX = loadingY === feederY ? entryX : entryX + 3;
  const verticalStep = feederY > loadingY ? 1 : -1;
  const feederPath = [
    ...Array.from({ length: transitionX - entryX + 1 }, (_, index) => ({ x: entryX + index, y: loadingY })),
    ...(loadingY === feederY
      ? []
      : Array.from(
          { length: Math.abs(feederY - loadingY) },
          (_, index) => ({ x: transitionX, y: loadingY + verticalStep * (index + 1) }),
        )),
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

  const first = group[0];
  horizontalRows.add(loadingY - 1);
  if (tracks[0] < entryX) {
    addHorizontalBeltAvoidingDrafts(
      drafts,
      "ingredient-branch",
      first.name,
      beltName,
      undergroundName,
      tracks[0],
      entryX,
      loadingY - 1,
      8,
    );
  }
  taps.push({
    materialId: first.materialId,
    material: first.name,
    type: first.type,
    rate: first.perSecond,
    x: tracks[0],
    targetY: loadingY - 2,
    finalDirection: 8,
  });

  const second = group[1];
  if (second) {
    horizontalRows.add(loadingY + 1);
    addHorizontalBeltAvoidingDrafts(
      drafts,
      "ingredient-branch",
      second.name,
      beltName,
      undergroundName,
      tracks[1],
      entryX + 1,
      loadingY + 1,
      0,
    );
    taps.push({
      materialId: second.materialId,
      material: second.name,
      type: second.type,
      rate: second.perSecond,
      x: tracks[1],
      targetY: loadingY,
      finalDirection: 8,
    });
  }
  return entryX;
}

function solidInputTrackCount(block: ProductionBlockContract): number {
  return block.machineRows * block.ingredients.filter((ingredient) => ingredient.type === "item").length;
}

function outputTrackCount(block: ProductionBlockContract): number {
  return block.kind === "solid-panel" ? Math.ceil(block.machineRows / 2) : block.machineRows;
}

function addMediumPole(drafts: Draft[], x: number, y: number): void {
  const candidate: Draft = {
    role: "power-pole",
    name: "medium-electric-pole",
    position: tilePosition(x, y),
  };
  if (!collides(drafts, candidate)) drafts.push(candidate);
}

function addSubstation(drafts: Draft[], x: number, y: number): void {
  const candidate: Draft = {
    role: "power-pole",
    name: "substation",
    position: tilePosition(x, y),
  };
  if (!collides(drafts, candidate)) drafts.push(candidate);
}

function buildSolidBlock(
  drafts: Draft[],
  inputTaps: InputTap[],
  producerTaps: ProducerTap[],
  horizontalRows: Set<number>,
  placement: PlacedBlock,
  beltName: string,
): void {
  const { contract, machineStartX, baseY } = placement;
  const solidIngredients = contract.ingredients.filter((ingredient) => ingredient.type === "item");
  const groups = groupIngredients(solidIngredients);
  if (groups.length > 2) throw new Error(`${contract.recipe.id} needs the complex-cell layout.`);
  const rowMachines = distributeMachines(contract.machineCount, contract.machineRows);
  let trackCursor = 0;

  for (let panel = 0; panel < Math.ceil(contract.machineRows / 2); panel += 1) {
    const panelTopY = baseY + panel * 16;
    const outputY = panelTopY + 6;
    const outputTrackX = placement.outputTracks[panel];
    const panelRows = [panel * 2, panel * 2 + 1].filter((row) => row < contract.machineRows);
    const panelRate = panelRows.reduce(
      (sum, row) => sum + contract.outputPerSecond * rowMachines[row] / contract.machineCount,
      0,
    );
    horizontalRows.add(outputY);
    addHorizontalBelt(
      drafts,
      "output-belt",
      contract.material,
      beltName,
      machineStartX - 2,
      outputTrackX - 1,
      outputY,
    );

    for (const row of panelRows) {
      const top = row % 2 === 0;
      const machineY = top ? panelTopY + 3 : panelTopY + 9;
      const rowFraction = rowMachines[row] / contract.machineCount;
      const rowGroups = groups.map((group) => group.map((ingredient) => ({
        ...ingredient,
        perSecond: ingredient.perSecond * rowFraction,
      })));
      const groupTracks: number[][] = Array.from({ length: rowGroups.length }, () => []);
      for (let groupIndex = rowGroups.length - 1; groupIndex >= 0; groupIndex -= 1) {
        groupTracks[groupIndex] = placement.inputTracks.slice(
          trackCursor,
          trackCursor + rowGroups[groupIndex].length,
        );
        trackCursor += rowGroups[groupIndex].length;
      }
      let slotCursor = 0;
      const slots = [-1, 0, 1];

      rowGroups.forEach((group, groupIndex) => {
        const tracks = groupTracks[groupIndex];
        const feederY = top
          ? machineY - (groupIndex === 0 ? 3 : 4)
          : machineY + (groupIndex === 0 ? 3 : 4);
        const loadingY = groupIndex === 0
          ? feederY
          : top
            ? machineY - 6
            : machineY + 6;
        addFeeder(
          drafts,
          inputTaps,
          horizontalRows,
          beltName,
          group,
          tracks,
          feederY,
          machineStartX + (rowMachines[row] - 1) * 4 + 2,
          loadingY,
        );
        const groupRate = group.reduce((sum, ingredient) => sum + ingredient.perSecond, 0);
        const inserters = Math.max(
          1,
          Math.ceil(
            groupRate /
              rowMachines[row] /
              (groupIndex === 0
                ? SAFE_BULK_INSERTER_ITEMS_PER_SECOND
                : SAFE_LONG_HANDED_INSERTER_ITEMS_PER_SECOND) -
              1e-12,
          ),
        );
        for (let inserter = 0; inserter < inserters; inserter += 1) {
          if (slotCursor >= slots.length) {
            throw new Error(`${contract.recipe.id} needs more than three solid-input inserters per machine side.`);
          }
          const offset = slots[slotCursor++];
          for (let machine = 0; machine < rowMachines[row]; machine += 1) {
            drafts.push({
              role: "input-inserter",
              material: group.map((ingredient) => ingredient.name).join("+"),
              recipe: contract.recipe.id,
              name: groupIndex === 0 ? "bulk-inserter" : "long-handed-inserter",
              position: tilePosition(machineStartX + machine * 4 + offset, top ? machineY - 2 : machineY + 2),
              direction: top ? 0 : 8,
            });
          }
        }
      });

      const perMachineOutput = contract.outputPerSecond * rowFraction / rowMachines[row];
      const outputInserters = Math.min(
        3,
        Math.max(1, Math.ceil(perMachineOutput / SAFE_BULK_INSERTER_ITEMS_PER_SECOND - 1e-12)),
      );
      for (let machine = 0; machine < rowMachines[row]; machine += 1) {
        const centerX = machineStartX + machine * 4;
        drafts.push({
          role: "machine",
          material: contract.material,
          recipe: contract.recipe.id,
          name: contract.recipe.machine.name,
          position: tilePosition(centerX, machineY),
          recipeSetting: contract.recipe.id,
          direction: 0,
        });
        for (let inserter = 0; inserter < outputInserters; inserter += 1) {
          drafts.push({
            role: "output-inserter",
            material: contract.material,
            recipe: contract.recipe.id,
            name: "bulk-inserter",
            position: tilePosition(centerX + [-1, 0, 1][inserter], top ? machineY + 2 : machineY - 2),
            direction: top ? 0 : 8,
          });
        }
      }

      for (let machine = 0; machine + 1 < rowMachines[row]; machine += 2) {
        addMediumPole(drafts, machineStartX + machine * 4 + 2, machineY);
      }
      if (rowMachines[row] % 2 === 1) {
        addMediumPole(drafts, machineStartX + (rowMachines[row] - 1) * 4 + 2, machineY);
      }
    }

    producerTaps.push({
      materialId: contract.materialId,
      material: contract.material,
      type: "item",
      rate: panelRate,
      x: outputTrackX,
      startY: outputY,
    });
  }
}

function buildMultiInputBlock(
  drafts: Draft[],
  inputTaps: InputTap[],
  producerTaps: ProducerTap[],
  horizontalRows: Set<number>,
  placement: PlacedBlock,
  beltName: string,
): void {
  const { contract, machineStartX, baseY } = placement;
  const ingredients = contract.ingredients.filter((ingredient) => ingredient.type === "item");
  if (ingredients.length !== 3) throw new Error(`${contract.recipe.id} needs exactly three solid feeder rows.`);
  const rowMachines = distributeMachines(contract.machineCount, contract.machineRows);
  let trackCursor = 0;

  for (let row = 0; row < contract.machineRows; row += 1) {
    const machineY = baseY + row * 16 + 6;
    const rowFraction = rowMachines[row] / contract.machineCount;
    const scaled = ingredients.map((ingredient) => ({
      ...ingredient,
      perSecond: ingredient.perSecond * rowFraction,
    }));
    const tracks = placement.inputTracks.slice(trackCursor, trackCursor + ingredients.length);
    trackCursor += ingredients.length;
    const lastMachineX = machineStartX + (rowMachines[row] - 1) * 4;
    const outputTrackX = placement.outputTracks[row];

    addFeeder(drafts, inputTaps, horizontalRows, beltName, [scaled[0]], [tracks[0]], machineY - 3, lastMachineX + 2);
    addFeeder(drafts, inputTaps, horizontalRows, beltName, [scaled[1]], [tracks[1]], machineY - 4, lastMachineX + 2);
    addFeeder(drafts, inputTaps, horizontalRows, beltName, [scaled[2]], [tracks[2]], machineY + 4, lastMachineX + 2);

    const northSlots = [-1, 0, 1];
    let northCursor = 0;
    for (const groupIndex of [0, 1]) {
      const speed = groupIndex === 0
        ? SAFE_BULK_INSERTER_ITEMS_PER_SECOND
        : SAFE_LONG_HANDED_INSERTER_ITEMS_PER_SECOND;
      const inserterCount = Math.max(
        1,
        Math.ceil(scaled[groupIndex].perSecond / rowMachines[row] / speed - 1e-12),
      );
      for (let inserter = 0; inserter < inserterCount; inserter += 1) {
        if (northCursor >= northSlots.length) throw new Error(`${contract.recipe.id} exceeds its north inserter slots.`);
        const offset = northSlots[northCursor++];
        for (let machine = 0; machine < rowMachines[row]; machine += 1) {
          drafts.push({
            role: "input-inserter",
            material: scaled[groupIndex].name,
            recipe: contract.recipe.id,
            name: groupIndex === 0 ? "bulk-inserter" : "long-handed-inserter",
            position: tilePosition(machineStartX + machine * 4 + offset, machineY - 2),
            direction: 0,
          });
        }
      }
    }

    const southInputCount = Math.max(
      1,
      Math.ceil(
        scaled[2].perSecond /
          rowMachines[row] /
          SAFE_LONG_HANDED_INSERTER_ITEMS_PER_SECOND -
          1e-12,
      ),
    );
    const perMachineOutput = contract.outputPerSecond * rowFraction / rowMachines[row];
    const outputInserterCount = Math.max(
      1,
      Math.ceil(perMachineOutput / SAFE_BULK_INSERTER_ITEMS_PER_SECOND - 1e-12),
    );
    if (southInputCount + outputInserterCount > 3) {
      throw new Error(`${contract.recipe.id} exceeds its south inserter slots.`);
    }

    const outputY = machineY + 3;
    horizontalRows.add(outputY);
    addHorizontalBelt(
      drafts,
      "output-belt",
      contract.material,
      beltName,
      machineStartX - 2,
      outputTrackX - 1,
      outputY,
    );
    for (let machine = 0; machine < rowMachines[row]; machine += 1) {
      const centerX = machineStartX + machine * 4;
      drafts.push({
        role: "machine",
        material: contract.material,
        recipe: contract.recipe.id,
        name: contract.recipe.machine.name,
        position: tilePosition(centerX, machineY),
        recipeSetting: contract.recipe.id,
        direction: 0,
      });
      for (let inserter = 0; inserter < southInputCount; inserter += 1) {
        drafts.push({
          role: "input-inserter",
          material: scaled[2].name,
          recipe: contract.recipe.id,
          name: "long-handed-inserter",
          position: tilePosition(centerX + [-1, 0, 1][inserter], machineY + 2),
          direction: 8,
        });
      }
      for (let inserter = 0; inserter < outputInserterCount; inserter += 1) {
        drafts.push({
          role: "output-inserter",
          material: contract.material,
          recipe: contract.recipe.id,
          name: "bulk-inserter",
          position: tilePosition(centerX + [-1, 0, 1][southInputCount + inserter], machineY + 2),
          direction: 0,
        });
      }
    }
    for (let machine = 0; machine + 1 < rowMachines[row]; machine += 2) {
      addMediumPole(drafts, machineStartX + machine * 4 + 2, machineY);
    }
    if (rowMachines[row] % 2 === 1) {
      addMediumPole(drafts, machineStartX + (rowMachines[row] - 1) * 4 + 2, machineY);
    }
    producerTaps.push({
      materialId: contract.materialId,
      material: contract.material,
      type: "item",
      rate: contract.outputPerSecond * rowFraction,
      x: outputTrackX,
      startY: outputY,
    });
  }
}

function buildFluidBlock(
  drafts: Draft[],
  inputTaps: InputTap[],
  producerTaps: ProducerTap[],
  horizontalRows: Set<number>,
  placement: PlacedBlock,
  beltName: string,
  rotationQuarterTurns: number,
): void {
  const { contract, machineStartX, baseY } = placement;
  const rowMachines = distributeMachines(contract.machineCount, contract.machineRows);
  const solidIngredients = contract.ingredients.filter((ingredient) => ingredient.type === "item");
  const fluidIngredients = contract.ingredients.filter((ingredient) => ingredient.type === "fluid");
  const groups = groupIngredients(solidIngredients);
  if (groups.length > 4) throw new Error(`${contract.recipe.id} has too many solid groups alongside fluids.`);
  let trackCursor = 0;

  for (let row = 0; row < contract.machineRows; row += 1) {
    const machineY = baseY + row * 20 + 8;
    const rowFraction = rowMachines[row] / contract.machineCount;
    const lastMachineX = machineStartX + (rowMachines[row] - 1) * 6;
    const outputTrackX = placement.outputTracks[row];
    groups.forEach((group, groupIndex) => {
      const scaled = group.map((ingredient) => ({ ...ingredient, perSecond: ingredient.perSecond * rowFraction }));
      const tracks = placement.inputTracks.slice(trackCursor, trackCursor + group.length);
      trackCursor += group.length;
      const feederY = groupIndex >= 2
        ? machineY - (groupIndex === 2 ? 3 : 4)
        : machineY + (groupIndex === 0 ? 3 : 4);
      addFeeder(
        drafts,
        inputTaps,
        horizontalRows,
        beltName,
        scaled,
        tracks,
        feederY,
        lastMachineX + 2,
        groupIndex === 0 || groupIndex >= 2 ? feederY : machineY + 6,
      );
      if (groupIndex >= 2) {
        const undergroundName = beltName === "transport-belt"
          ? "underground-belt"
          : beltName === "fast-transport-belt"
            ? "fast-underground-belt"
            : "express-underground-belt";
        for (let machine = 0; machine < rowMachines[row]; machine += 1) {
          const centerX = machineStartX + machine * 6;
          for (const beltX of [centerX - 1, centerX, centerX + 1]) {
            const existing = drafts.findIndex((draft) =>
              draft.role === "ingredient-feeder" &&
              Math.abs(draft.position.x - (beltX + 0.5)) < 1e-9 &&
              Math.abs(draft.position.y - (feederY + 0.5)) < 1e-9);
            if (existing >= 0) drafts.splice(existing, 1);
          }
          drafts.push({
            role: "underground-belt",
            material: group[0].name,
            name: undergroundName,
            position: tilePosition(centerX - 1, feederY),
            direction: 4,
            undergroundType: "input",
          });
          drafts.push({
            role: "underground-belt",
            material: group[0].name,
            name: undergroundName,
            position: tilePosition(centerX + 1, feederY),
            direction: 4,
            undergroundType: "output",
          });
        }
      }
    });

    fluidIngredients.forEach((ingredient, fluidIndex) => {
      const trackX = placement.inputTracks[trackCursor++];
      const headerY = machineY - 5 - fluidIndex * 2;
      horizontalRows.add(headerY);
      inputTaps.push({
        materialId: ingredient.materialId,
        material: ingredient.name,
        type: "fluid",
        rate: ingredient.perSecond * rowFraction,
        x: trackX,
        targetY: headerY,
      });
      for (let x = trackX + 1; x <= lastMachineX + 1; x += 1) {
        drafts.push({ role: "pipe", material: ingredient.name, name: "pipe", position: tilePosition(x, headerY) });
      }
    });

    for (let machine = 0; machine < rowMachines[row]; machine += 1) {
      const centerX = machineStartX + machine * 6;
      drafts.push({
        role: "machine",
        material: contract.material,
        recipe: contract.recipe.id,
        name: contract.recipe.machine.name,
        position: tilePosition(centerX, machineY),
        recipeSetting: contract.recipe.id,
        direction: 0,
      });
      groups.forEach((group, groupIndex) => {
        drafts.push({
          role: "input-inserter",
          material: group.map((ingredient) => ingredient.name).join("+"),
          recipe: contract.recipe.id,
          name: groupIndex % 2 === 1 ? "long-handed-inserter" : "bulk-inserter",
          position: groupIndex >= 2
            ? tilePosition(centerX + (groupIndex === 2 ? 1 : -1), machineY - 2)
            : tilePosition(centerX + (groupIndex === 0 ? -1 : 1), machineY + 2),
          direction: groupIndex >= 2 ? 0 : 8,
        });
      });
      fluidIngredients.forEach((ingredient, fluidIndex) => {
        const headerY = machineY - 5 - fluidIndex * 2;
        const connectorX = contract.recipe.machine.name === "chemical-plant"
          ? centerX + (fluidIndex === 0 ? -1 : 1)
          : centerX;
        if (fluidIndex === 0) {
          for (let y = headerY + 1; y <= machineY - 2; y += 1) {
            drafts.push({ role: "pipe", material: ingredient.name, name: "pipe", position: tilePosition(connectorX, y) });
          }
        } else {
          drafts.push({
            role: "pipe-to-ground",
            material: ingredient.name,
            name: "pipe-to-ground",
            position: tilePosition(connectorX, headerY + 1),
            direction: 0,
          });
          drafts.push({
            role: "pipe-to-ground",
            material: ingredient.name,
            name: "pipe-to-ground",
            position: tilePosition(connectorX, headerY + 3),
            direction: 8,
          });
          for (let y = headerY + 4; y <= machineY - 2; y += 1) {
            drafts.push({ role: "pipe", material: ingredient.name, name: "pipe", position: tilePosition(connectorX, y) });
          }
        }
        if (contract.recipe.machine.name === "assembling-machine-3" && rotationQuarterTurns === 1) {
          for (const [offsetX, offsetY] of [[-1, -2], [-2, -2], [-2, -1], [-2, 0]] as const) {
            drafts.push({ role: "pipe", material: ingredient.name, name: "pipe", position: tilePosition(centerX + offsetX, machineY + offsetY) });
          }
        }
      });
    }

    if (contract.recipe.result.type === "item") {
      const outputY = machineY + 6;
      horizontalRows.add(outputY);
      addHorizontalBelt(drafts, "output-belt", contract.material, beltName, machineStartX + 3, outputTrackX - 1, outputY);
      for (let machine = 0; machine < rowMachines[row]; machine += 1) {
        const centerX = machineStartX + machine * 6;
        drafts.push({
          role: "output-inserter",
          material: contract.material,
          recipe: contract.recipe.id,
          name: "bulk-inserter",
          position: tilePosition(centerX + 2, machineY),
          direction: 12,
        });
        addVerticalBelt(
          drafts,
          contract.material,
          beltName,
          beltName === "transport-belt"
            ? "underground-belt"
            : beltName === "fast-transport-belt"
              ? "fast-underground-belt"
              : "express-underground-belt",
          centerX + 3,
          machineY,
          outputY - 1,
          groups.map((_, groupIndex) => machineY + (groupIndex === 0 ? 3 : 4)),
          8,
        );
      }
      producerTaps.push({
        materialId: contract.materialId,
        material: contract.material,
        type: "item",
        rate: contract.outputPerSecond * rowFraction,
        x: outputTrackX,
        startY: outputY,
      });
    } else {
      const outputY = machineY + 5;
      horizontalRows.add(outputY);
      for (let x = machineStartX - 1; x < outputTrackX; x += 1) {
        drafts.push({ role: "pipe", material: contract.material, name: "pipe", position: tilePosition(x, outputY) });
      }
      for (let machine = 0; machine < rowMachines[row]; machine += 1) {
        const centerX = machineStartX + machine * 6;
        const connectorX = contract.recipe.machine.name === "chemical-plant" ? centerX - 1 : centerX;
        drafts.push({ role: "pipe-to-ground", material: contract.material, name: "pipe-to-ground", position: tilePosition(connectorX, machineY + 2), direction: 0 });
        drafts.push({ role: "pipe-to-ground", material: contract.material, name: "pipe-to-ground", position: tilePosition(connectorX, machineY + 4), direction: 8 });
      }
      producerTaps.push({
        materialId: contract.materialId,
        material: contract.material,
        type: "fluid",
        rate: contract.outputPerSecond * rowFraction,
        x: outputTrackX,
        startY: outputY,
      });
    }

    const powerY = groups.length >= 3 ? machineY - 8 : machineY - 3;
    for (let x = machineStartX + 3; x <= lastMachineX + 3; x += 12) {
      addSubstation(drafts, x, powerY);
      if (groups.length >= 3) addSubstation(drafts, x, machineY + 8);
    }
    addSubstation(drafts, lastMachineX + 9, powerY);
    if (groups.length >= 3) addSubstation(drafts, lastMachineX + 9, machineY + 8);
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
    return Math.abs(draft.position.x - candidate.position.x) < size.x + candidateSize.x &&
      Math.abs(draft.position.y - candidate.position.y) < size.y + candidateSize.y;
  });
}

function connectSolidPowerNetwork(
  drafts: Draft[],
  placements: PlacedBlock[],
  backboneY: number,
): void {
  const depthColumns = new Map<number, Array<{ y: number; lastPoleX: number }>>();
  for (const placement of placements.filter((candidate) =>
    candidate.contract.kind === "solid-panel" || candidate.contract.kind === "multi-input-row")) {
    const rowMachines = distributeMachines(placement.contract.machineCount, placement.contract.machineRows);
    const rows = Array.from({ length: placement.contract.machineRows }, (_, row) =>
      placement.contract.kind === "solid-panel"
        ? placement.baseY + Math.floor(row / 2) * 16 + (row % 2 === 0 ? 3 : 9)
        : placement.baseY + row * 16 + 6);
    const existing = depthColumns.get(placement.machineStartX) ?? [];
    rows.forEach((y, row) => {
      const machines = rowMachines[row];
      const lastPoleX = placement.machineStartX + (machines % 2 === 0 ? machines - 2 : machines - 1) * 4 + 2;
      existing.push({ y, lastPoleX });
    });
    depthColumns.set(placement.machineStartX, existing);
  }

  const backboneXs: number[] = [];
  for (const entries of depthColumns.values()) {
    const x = Math.max(...entries.map((entry) => entry.lastPoleX));
    backboneXs.push(x);
    for (const entry of entries) {
      const segments = Math.ceil((x - entry.lastPoleX) / 8);
      for (let segment = 1; segment <= segments; segment += 1) {
        addMediumPole(
          drafts,
          Math.round(entry.lastPoleX + (x - entry.lastPoleX) * segment / segments),
          entry.y,
        );
      }
    }
    const rows = [...new Set(entries.map((entry) => entry.y))].sort((left, right) => left - right);
    for (let index = 1; index < rows.length; index += 1) {
      const from = rows[index - 1];
      const to = rows[index];
      const segments = Math.ceil((to - from) / 8);
      for (let segment = 1; segment < segments; segment += 1) {
        addMediumPole(drafts, x, Math.round(from + (to - from) * segment / segments));
      }
    }
    const last = rows.at(-1)!;
    const segments = Math.ceil((backboneY - last) / 8);
    for (let segment = 1; segment <= segments; segment += 1) {
      addMediumPole(drafts, x, Math.round(last + (backboneY - last) * segment / segments));
    }
  }


  const fluidColumns = new Map<number, number[]>();
  for (const placement of placements.filter((candidate) => candidate.contract.kind === "fluid-row")) {
    const rowMachines = distributeMachines(placement.contract.machineCount, placement.contract.machineRows);
    rowMachines.forEach((machines, row) => {
      const x = placement.machineStartX + (machines - 1) * 6 + 9;
      const y = placement.baseY + row * 20 + 5;
      const rows = fluidColumns.get(x) ?? [];
      rows.push(y);
      fluidColumns.set(x, rows);
    });
  }
  for (const [x, rawRows] of fluidColumns) {
    backboneXs.push(x);
    const rows = [...new Set(rawRows)].sort((left, right) => left - right);
    for (let index = 1; index < rows.length; index += 1) {
      const from = rows[index - 1];
      const to = rows[index];
      const segments = Math.ceil((to - from) / 16);
      for (let segment = 1; segment < segments; segment += 1) {
        addSubstation(drafts, x, Math.round(from + (to - from) * segment / segments));
      }
    }
    let y = rows.at(-1)!;
    while (backboneY - y > 9) {
      y += Math.min(16, backboneY - y - 8);
      addSubstation(drafts, x, y);
    }
    addMediumPole(drafts, x, backboneY);
  }

  const xs = [...new Set(backboneXs)].sort((left, right) => left - right);
  for (let index = 1; index < xs.length; index += 1) {
    const from = xs[index - 1];
    const to = xs[index];
    const segments = Math.ceil((to - from) / 8);
    for (let segment = 1; segment < segments; segment += 1) {
      addMediumPole(drafts, Math.round(from + (to - from) * segment / segments), backboneY);
    }
  }
}

function addSubstationNear(
  drafts: Draft[],
  preferredX: number,
  preferredY: number,
  offsets: ReadonlyArray<readonly [number, number]>,
): { x: number; y: number } {
  for (const [offsetX, offsetY] of offsets) {
    const x = preferredX + offsetX;
    const y = preferredY + offsetY;
    const candidate: Draft = {
      role: "power-pole",
      name: "substation",
      position: tilePosition(x, y),
    };
    if (!collides(drafts, candidate)) {
      drafts.push(candidate);
      return { x, y };
    }
  }
  throw new Error(`Could not place a connected substation near ${preferredX},${preferredY}.`);
}

/**
 * Pumps inserted into long Factorio 2 fluid lines are active machines, so a
 * blueprint is not valid merely because its crafting machines are powered.
 * Build a collision-aware substation comb above the buses, drop one powered
 * column beside every pump, and join that comb to the machine backbone.
 */
function connectFluidPumpNetwork(
  drafts: Draft[],
  backboneY: number,
  factoryEndX: number,
  busRows: number[],
): void {
  const pumps = drafts.filter((draft) => draft.name === "pump");
  if (pumps.length === 0) return;

  // Capture the existing machine-backbone anchor before adding the pump comb;
  // otherwise a new substation landing on the same y-coordinate can be
  // mistaken for an already-connected backbone pole.
  const backbonePoles = drafts.filter((draft) =>
    draft.role === "power-pole" && Math.abs(draft.position.y - (backboneY + 0.5)) < 1e-9);
  if (backbonePoles.length === 0) throw new Error("The machine power backbone has no connection point.");
  const anchorX = Math.max(...backbonePoles.map((pole) => Math.floor(pole.position.x)));

  const topY = Math.min(...busRows) - 2;
  const rightX = factoryEndX + 16;
  const columnOffsets = [0, 2, -2, 4, -4, 6, -6, 8, -8].map((offset) => [offset, 0] as const);
  const pumpColumns: number[] = [];

  for (const pump of pumps) {
    const preferredX = Math.floor(pump.position.x);
    const pumpY = pump.position.y;
    const nearestStep = Math.max(0, Math.round((pumpY - (topY + 0.5)) / 16));
    const ys = Array.from({ length: nearestStep + 1 }, (_, index) => topY + index * 16);
    let chosenX: number | undefined;
    for (const [offsetX] of columnOffsets) {
      const candidateX = preferredX + offsetX;
      const candidates = ys.map((y) => ({
        role: "power-pole" as const,
        name: "substation",
        position: tilePosition(candidateX, y),
      }));
      if (candidates.every((candidate) => !collides(drafts, candidate))) {
        candidates.forEach((candidate) => drafts.push(candidate));
        chosenX = candidateX;
        break;
      }
    }
    if (chosenX === undefined) {
      throw new Error(`Could not route power to the fluid pump at ${pump.position.x},${pump.position.y}.`);
    }
    pumpColumns.push(chosenX);
  }

  const topColumns = [...new Set([...pumpColumns, rightX])].sort((left, right) => left - right);
  const topOffsets = [
    [0, 0], [0, -2], [0, 2], [-2, 0], [2, 0], [0, -4], [0, 4],
  ] as const;
  addSubstationNear(drafts, rightX, topY, topOffsets);
  for (let index = 1; index < topColumns.length; index += 1) {
    const from = topColumns[index - 1];
    const to = topColumns[index];
    const segments = Math.ceil((to - from) / 16);
    for (let segment = 1; segment < segments; segment += 1) {
      addSubstationNear(
        drafts,
        Math.round(from + (to - from) * segment / segments),
        topY,
        topOffsets,
      );
    }
  }

  let rightY = topY;
  // The last hop terminates at a medium pole, whose nine-tile wire reach is
  // smaller than a substation's. Allow the substation column to overshoot the
  // backbone so that final edge is always within the medium-pole limit.
  while (backboneY - rightY > 8) {
    rightY += 16;
    addSubstationNear(drafts, rightX, rightY, columnOffsets);
  }

  const segments = Math.ceil((rightX - anchorX) / 8);
  for (let segment = 1; segment <= segments; segment += 1) {
    addMediumPole(
      drafts,
      Math.round(anchorX + (rightX - anchorX) * segment / segments),
      backboneY,
    );
  }
}

function routeOutput(
  drafts: Draft[],
  target: string,
  type: MaterialType,
  side: Side,
  start: { x: number; y: number },
  outsideX: number,
  northY: number,
  southY: number,
  crossings: number[],
  beltName: string,
  undergroundName: string,
): { x: number; y: number } {
  if (side === "east") return tilePosition(start.x, start.y);
  const existingStart = drafts.findIndex((draft) =>
    Math.abs(draft.position.x - (start.x + 0.5)) < 1e-9 &&
    Math.abs(draft.position.y - (start.y + 0.5)) < 1e-9);
  if (existingStart >= 0) drafts.splice(existingStart, 1);
  if (type === "item") {
    if (side === "north" || side === "south") {
      const finalY = side === "north" ? northY : southY;
      addVerticalBelt(drafts, target, beltName, undergroundName, outsideX, start.y, finalY, crossings, side === "north" ? 0 : 8);
      return tilePosition(outsideX, finalY);
    }
    addVerticalBelt(drafts, target, beltName, undergroundName, outsideX, start.y, southY, crossings, 12);
    addBeltPath(
      drafts,
      "output-belt",
      target,
      beltName,
      Array.from({ length: outsideX + 6 }, (_, index) => ({ x: outsideX - 1 - index, y: southY })),
      12,
    );
    return tilePosition(-6, southY);
  }
  if (side === "north" || side === "south") {
    const finalY = side === "north" ? northY : southY;
    addVerticalPipe(drafts, target, outsideX, start.y, finalY, crossings);
    return tilePosition(outsideX, finalY);
  }
  addVerticalPipe(drafts, target, outsideX, start.y, southY, crossings);
  for (let x = outsideX - 1; x >= -6; x -= 1) drafts.push({ role: "pipe", material: target, name: "pipe", position: tilePosition(x, southY) });
  return tilePosition(-6, southY);
}

function buildCanonicalLayoutCandidate(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
  policy: SpatialLayoutPolicy,
): CanonicalLayout {
  const topology = optimizeProductionTopology(plan);
  if (topology.blocks.some((block) => block.kind === "complex-cell")) {
    throw new Error("The optimized complex-cell template is not available for this recipe yet.");
  }
  const drafts: Draft[] = [];
  const inputTaps: InputTap[] = [];
  const producerTaps: ProducerTap[] = [];
  const horizontalRows = new Set<number>();
  const belt = BELTS[beltTier];
  const laneCapacity = belt.itemsPerSecond / 2;
  const undergroundName = beltTier === "yellow"
    ? "underground-belt"
    : beltTier === "red"
      ? "fast-underground-belt"
      : "express-underground-belt";
  const rotationQuarterTurns = (SIDE_INDEX[inputSide] - SIDE_INDEX.west + 4) % 4;
  const canonicalOutputSide = INDEX_SIDE[(SIDE_INDEX[outputSide] - rotationQuarterTurns + 4) % 4];
  const orderedMaterialIds = [
    ...plan.inputs.map((input) => input.name),
    ...topology.blocks.map((block) => block.materialId),
  ].filter((material, index, all) => all.indexOf(material) === index);
  const materialById = new Map(topology.materials.map((material) => [material.id, material]));
  let busY = new Map(orderedMaterialIds.map((material, index) => [material, index * policy.busPitch]));
  let busRows = [...busY.values()];
  const machineRegionY = orderedMaterialIds.length * policy.busPitch + policy.busToMachineGap;
  const placements: PlacedBlock[] = [];
  let cursorX = 8;
  let lastColumnEndX = cursorX;
  let maximumBottomY = machineRegionY;

  for (const depth of topology.depths) {
    const blocks = topology.blocks.filter((block) => block.depth === depth);
    const inputTrackTotal = blocks.reduce((sum, block) => sum + block.machineRows * block.ingredients.length, 0);
    const outputTrackTotal = blocks.reduce((sum, block) => sum + outputTrackCount(block), 0);
    const ingressWidth = inputTrackTotal * policy.trackPitch + policy.ingressPadding;
    // `columns * pitch + 2` covers the last machine, its side inserters, and
    // the feeder endpoint. The former extra eight tiles were inherited from
    // an early fixed corridor and multiplied once per graph depth.
    const maximumMachineWidth = Math.max(...blocks.map((block) =>
      block.kind === "fluid-row" ? block.columns * 6 + 2 : block.columns * 4 + 2));
    const machineStartX = cursorX + ingressWidth;
    const outputStartX = machineStartX + maximumMachineWidth + policy.machineOutputGap;
    const columnEndX = outputStartX + outputTrackTotal * policy.trackPitch + policy.outputPadding;
    let inputTrackCursor = 0;
    let outputTrackCursor = 0;
    let stackY = machineRegionY;

    for (const block of blocks) {
      const inputCount = block.machineRows * block.ingredients.length;
      const outputs = outputTrackCount(block);
      const inputTracks = Array.from(
        { length: inputCount },
        (_, index) => cursorX + 2 + (inputTrackCursor + index) * policy.trackPitch,
      );
      const outputTracks = Array.from(
        { length: outputs },
        (_, index) => outputStartX + (outputTrackCursor + index) * policy.trackPitch,
      );
      placements.push({ contract: block, machineStartX, baseY: stackY, inputTracks, outputTracks });
      inputTrackCursor += inputCount;
      outputTrackCursor += outputs;
      stackY += block.estimatedHeight + policy.blockGap;
    }
    maximumBottomY = Math.max(maximumBottomY, stackY);
    lastColumnEndX = columnEndX;
    cursorX = columnEndX + policy.depthGap;
  }

  for (const placement of placements) {
    if (placement.contract.kind === "solid-panel") {
      buildSolidBlock(drafts, inputTaps, producerTaps, horizontalRows, placement, belt.entityName);
    } else if (placement.contract.kind === "multi-input-row") {
      buildMultiInputBlock(drafts, inputTaps, producerTaps, horizontalRows, placement, belt.entityName);
    } else {
      buildFluidBlock(
        drafts,
        inputTaps,
        producerTaps,
        horizontalRows,
        placement,
        belt.entityName,
        rotationQuarterTurns,
      );
    }
  }

  const factoryEndX = lastColumnEndX + policy.factoryEndGap;
  const hasNearCapacityItemStream = topology.materials.some((material) =>
    material.type === "item" && material.perSecond > laneCapacity * 0.8);
  const deepSharedNetwork = topology.depths.length >= 5 && topology.blocks.length >= 10;
  const intervalPackingIsSafe = !deepSharedNetwork || !hasNearCapacityItemStream;
  if (intervalPackingIsSafe) {
    const boundaryIds = new Set(plan.inputs.map((input) => input.name));
    const intervals = orderedMaterialIds.map((materialId) => {
      const producerXs = producerTaps
        .filter((tap) => tap.materialId === materialId)
        .map((tap) => tap.x);
      const consumerXs = inputTaps
        .filter((tap) => tap.materialId === materialId)
        .map((tap) => tap.x);
      const start = boundaryIds.has(materialId)
        ? -6
        : producerXs.length > 0
          ? Math.min(...producerXs)
          : -6;
      const end = materialId === plan.target
        ? factoryEndX + 6
        : Math.max(start, ...consumerXs);
      return { materialId, start, end };
    }).sort((left, right) => left.start - right.start || right.end - left.end ||
      left.materialId.localeCompare(right.materialId));
    const laneEnds: number[] = [];
    const laneByMaterial = new Map<string, number>();
    for (const interval of intervals) {
      let lane = laneEnds.findIndex((end) => end + 2 < interval.start);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(interval.end);
      } else {
        laneEnds[lane] = interval.end;
      }
      laneByMaterial.set(interval.materialId, lane);
    }
    busY = new Map(orderedMaterialIds.map((material) => [
      material,
      laneByMaterial.get(material)! * policy.busPitch,
    ]));
    busRows = [...new Set(busY.values())].sort((left, right) => left - right);
    const packedMachineRegionY = laneEnds.length * policy.busPitch + policy.busToMachineGap;
    const verticalShift = packedMachineRegionY - machineRegionY;
    if (verticalShift !== 0) {
      drafts.forEach((draft) => {
        draft.position = { ...draft.position, y: draft.position.y + verticalShift };
      });
      placements.forEach((placement) => {
        placement.baseY += verticalShift;
      });
      inputTaps.forEach((tap) => {
        tap.targetY += verticalShift;
      });
      producerTaps.forEach((tap) => {
        tap.startY += verticalShift;
      });
      const shiftedRows = [...horizontalRows].map((row) => row + verticalShift);
      horizontalRows.clear();
      shiftedRows.forEach((row) => horizontalRows.add(row));
      maximumBottomY += verticalShift;
    }
  }
  busRows.forEach((row) => horizontalRows.add(row));

  connectSolidPowerNetwork(drafts, placements, maximumBottomY + 6);

  const crossings = [...horizontalRows];
  const producedBusStartX = new Map<string, number>();
  for (const materialId of orderedMaterialIds) {
    const materialProducers = producerTaps.filter((tap) => tap.materialId === materialId && tap.type === "item");
    const targetY = busY.get(materialId)!;
    const totalProducerRate = materialProducers.reduce((sum, tap) => sum + tap.rate, 0);
    if (materialProducers.length > 0 && totalProducerRate <= laneCapacity + 1e-8) {
      for (const tap of materialProducers) {
        addVerticalBelt(
          drafts,
          tap.material,
          belt.entityName,
          undergroundName,
          tap.x,
          tap.startY,
          targetY + 1,
          busRows.filter((row) => row !== targetY),
          0,
        );
      }
      producedBusStartX.set(materialId, Math.min(...materialProducers.map((tap) => tap.x)));
    } else if (materialProducers.length === 1) {
      const tap = materialProducers[0];
      addVerticalBelt(
        drafts,
        tap.material,
        belt.entityName,
        undergroundName,
        tap.x,
        tap.startY,
        targetY,
        busRows.filter((row) => row !== targetY),
        4,
      );
      producedBusStartX.set(materialId, tap.x);
    } else if (materialProducers.length === 2) {
      const mergeX = Math.max(...materialProducers.map((tap) => tap.x)) + 3;
      materialProducers.forEach((tap, index) => {
        const laneY = targetY + index;
        addVerticalBelt(
          drafts,
          tap.material,
          belt.entityName,
          undergroundName,
          tap.x,
          tap.startY,
          laneY,
          busRows.filter((row) => row !== targetY),
          4,
        );
        if (tap.x + 1 <= mergeX - 1) {
          addHorizontalBelt(drafts, "material-bus", tap.material, belt.entityName, tap.x + 1, mergeX - 1, laneY);
        }
      });
      drafts.push({
        role: "splitter",
        material: materialProducers[0].material,
        name: belt.splitterEntityName,
        position: { x: mergeX + 0.5, y: targetY + 1 },
        direction: 4,
        outputPriority: "left",
      });
      producedBusStartX.set(materialId, mergeX + 1);
    } else if (materialProducers.length > 2) {
      throw new Error(`${materialProducers[0].material} needs more than two optimized producer lanes.`);
    }
    for (const tap of producerTaps.filter((candidate) => candidate.materialId === materialId && candidate.type === "fluid")) {
      addVerticalPipe(drafts, tap.material, tap.x, tap.startY, targetY + 1, busRows.filter((row) => row !== targetY));
    }
  }

  for (const tap of inputTaps) {
    const sourceY = busY.get(tap.materialId);
    if (sourceY === undefined) throw new Error(`Missing optimized material bus ${tap.materialId}.`);
    if (tap.type === "item") {
      drafts.push({
        role: "splitter",
        material: tap.material,
        name: belt.splitterEntityName,
        position: { x: tap.x - 0.5, y: sourceY + 1 },
        direction: 4,
      });
      addVerticalBelt(
        drafts,
        tap.material,
        belt.entityName,
        undergroundName,
        tap.x,
        sourceY + 1,
        tap.targetY,
        busRows.filter((row) => row !== sourceY),
        tap.finalDirection ?? (tap.targetY > sourceY ? 8 : 0),
      );
    } else {
      addVerticalPipe(drafts, tap.material, tap.x, sourceY + 1, tap.targetY, busRows.filter((row) => row !== sourceY));
    }
  }

  for (const materialId of orderedMaterialIds) {
    const material = materialById.get(materialId);
    if (!material) throw new Error(`Missing material contract ${materialId}.`);
    const y = busY.get(materialId)!;
    const boundary = plan.inputs.some((input) => input.name === materialId);
    const producers = producerTaps.filter((tap) => tap.materialId === materialId);
    const consumers = inputTaps.filter((tap) => tap.materialId === materialId);
    const startX = boundary
      ? -6
      : producedBusStartX.get(materialId) ?? Math.min(...producers.map((tap) => tap.x));
    const endX = materialId === plan.target
      ? factoryEndX + 6
      : Math.max(startX, ...consumers.map((tap) => tap.x));
    if (material.type === "item") {
      const splitterXs = new Set(consumers.map((tap) => tap.x - 1));
      for (let x = startX; x <= endX; x += 1) {
        if (splitterXs.has(x)) continue;
        drafts.push({
          role: boundary ? "input-belt" : "material-bus",
          material: material.name,
          name: belt.entityName,
          position: tilePosition(x, y),
          direction: 4,
        });
      }
    } else {
      addHorizontalPipeBus(
        drafts,
        material.name,
        startX,
        endX,
        y,
        consumers.map((tap) => tap.x),
        boundary ? "pipe" : "material-bus",
      );
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
    factoryEndX + 6,
    Math.min(...busRows) - 6,
    maximumBottomY + 10,
    [],
    belt.entityName,
    undergroundName,
  );
  connectFluidPumpNetwork(drafts, maximumBottomY + 6, factoryEndX, busRows);
  return { drafts, inputPositions, outputPosition, canonicalOutputSide, rotationQuarterTurns };
}

const TRANSPORT_ROLES = new Set<ChainEntityRole>([
  "input-belt",
  "material-bus",
  "ingredient-branch",
  "ingredient-feeder",
  "output-belt",
  "splitter",
  "underground-belt",
  "pipe",
  "pipe-to-ground",
]);

function assertCollisionFreeCandidate(layout: CanonicalLayout): void {
  const buckets = new Map<string, Draft[]>();
  for (const draft of layout.drafts) {
    const half = collisionHalfSize(draft);
    const minimumX = Math.floor(draft.position.x - half.x);
    const maximumX = Math.floor(draft.position.x + half.x);
    const minimumY = Math.floor(draft.position.y - half.y);
    const maximumY = Math.floor(draft.position.y + half.y);
    const nearby = new Set<Draft>();
    for (let x = minimumX - 1; x <= maximumX + 1; x += 1) {
      for (let y = minimumY - 1; y <= maximumY + 1; y += 1) {
        for (const candidate of buckets.get(`${x},${y}`) ?? []) nearby.add(candidate);
      }
    }
    const collision = [...nearby].find((candidate) => {
      const candidateHalf = collisionHalfSize(candidate);
      return Math.abs(candidate.position.x - draft.position.x) < candidateHalf.x + half.x &&
        Math.abs(candidate.position.y - draft.position.y) < candidateHalf.y + half.y;
    });
    if (collision) {
      throw new Error(
        `${draft.name} (${draft.role}:${draft.material ?? "-"}) at ${draft.position.x},${draft.position.y} overlaps ` +
          `${collision.name} (${collision.role}:${collision.material ?? "-"}) at ` +
          `${collision.position.x},${collision.position.y}.`,
      );
    }
    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let y = minimumY; y <= maximumY; y += 1) {
        const key = `${x},${y}`;
        const entries = buckets.get(key) ?? [];
        entries.push(draft);
        buckets.set(key, entries);
      }
    }
  }
}

function assertUndergroundPairing(layout: CanonicalLayout): void {
  const endpoints = layout.drafts.filter((draft) => draft.undergroundType !== undefined);
  const claimedOutputs = new Set<Draft>();
  const claimedTunnelTiles = new Map<string, Draft>();
  const directionVector = (direction: CardinalDirection | undefined): { x: number; y: number } => {
    if (direction === 0) return { x: 0, y: -1 };
    if (direction === 4) return { x: 1, y: 0 };
    if (direction === 8) return { x: 0, y: 1 };
    if (direction === 12) return { x: -1, y: 0 };
    throw new Error("Underground belts require a cardinal direction.");
  };
  for (const input of endpoints.filter((draft) => draft.undergroundType === "input")) {
    const vector = directionVector(input.direction);
    const reach = undergroundReach(input.name);
    const candidates = endpoints
      .filter((candidate) => {
        if (candidate.undergroundType !== "output" || candidate.name !== input.name ||
          candidate.direction !== input.direction) return false;
        const deltaX = candidate.position.x - input.position.x;
        const deltaY = candidate.position.y - input.position.y;
        const projection = deltaX * vector.x + deltaY * vector.y;
        const perpendicular = deltaX * vector.y - deltaY * vector.x;
        return Math.abs(perpendicular) < 1e-9 && projection > 0 && projection <= reach;
      })
      .sort((left, right) =>
        Math.abs(left.position.x - input.position.x) + Math.abs(left.position.y - input.position.y) -
        Math.abs(right.position.x - input.position.x) - Math.abs(right.position.y - input.position.y));
    const output = candidates[0];
    if (!output) {
      throw new Error(`Unpaired ${input.name} input at ${input.position.x},${input.position.y}.`);
    }
    if (output.material !== input.material) {
      throw new Error(
        `${input.material} underground belt at ${input.position.x},${input.position.y} would pair with ` +
          `${output.material} at ${output.position.x},${output.position.y}.`,
      );
    }
    if (claimedOutputs.has(output)) {
      throw new Error(`Multiple underground inputs would claim the output at ${output.position.x},${output.position.y}.`);
    }
    claimedOutputs.add(output);
    const inputX = Math.floor(input.position.x);
    const inputY = Math.floor(input.position.y);
    const outputX = Math.floor(output.position.x);
    const outputY = Math.floor(output.position.y);
    const axis = vector.x === 0 ? "v" : "h";
    const fixed = vector.x === 0 ? inputX : inputY;
    const minimum = vector.x === 0 ? Math.min(inputY, outputY) : Math.min(inputX, outputX);
    const maximum = vector.x === 0 ? Math.max(inputY, outputY) : Math.max(inputX, outputX);
    for (let coordinate = minimum; coordinate <= maximum; coordinate += 1) {
      const key = `${input.name}:${axis}:${fixed}:${coordinate}`;
      const conflict = claimedTunnelTiles.get(key);
      if (conflict) {
        throw new Error(
          `${input.name} tunnel from ${input.position.x},${input.position.y} overlaps the collinear tunnel from ` +
            `${conflict.position.x},${conflict.position.y}.`,
        );
      }
      claimedTunnelTiles.set(key, input);
    }
  }
  const outputs = endpoints.filter((draft) => draft.undergroundType === "output");
  if (claimedOutputs.size !== outputs.length) {
    throw new Error(`${outputs.length - claimedOutputs.size} underground outputs are not paired by their intended route.`);
  }
}

function assertMaterialIsolation(layout: CanonicalLayout): void {
  const isItemTransport = (draft: Draft): boolean =>
    draft.name.includes("transport-belt") || draft.name.includes("underground-belt") ||
    draft.name.includes("splitter");
  const vector = (direction: CardinalDirection | undefined): { x: number; y: number } => {
    if (direction === 0) return { x: 0, y: -1 };
    if (direction === 4) return { x: 1, y: 0 };
    if (direction === 8) return { x: 0, y: 1 };
    if (direction === 12) return { x: -1, y: 0 };
    throw new Error("Item transport entities require a cardinal direction.");
  };
  const occupied = (draft: Draft): Array<{ x: number; y: number }> => {
    if (!draft.name.includes("splitter")) {
      return [{ x: Math.floor(draft.position.x), y: Math.floor(draft.position.y) }];
    }
    if (draft.direction === 4 || draft.direction === 12) {
      const x = Math.floor(draft.position.x);
      const topY = Math.floor(draft.position.y) - 1;
      return [{ x, y: topY }, { x, y: topY + 1 }];
    }
    const leftX = Math.floor(draft.position.x) - 1;
    const y = Math.floor(draft.position.y);
    return [{ x: leftX, y }, { x: leftX + 1, y }];
  };
  const transports = layout.drafts.filter(isItemTransport);
  const byTile = new Map<string, Draft>();
  for (const draft of transports) {
    for (const tile of occupied(draft)) byTile.set(`${tile.x},${tile.y}`, draft);
  }
  for (const draft of transports) {
    if (draft.undergroundType === "input") continue;
    const step = vector(draft.direction);
    for (const tile of occupied(draft)) {
      const next = byTile.get(`${tile.x + step.x},${tile.y + step.y}`);
      if (next && next.material !== draft.material) {
        throw new Error(
          `${draft.material} transport at ${draft.position.x},${draft.position.y} would feed ` +
            `${next.material} at ${next.position.x},${next.position.y}.`,
        );
      }
    }
  }
}

function measureSpatialLayout(
  layout: CanonicalLayout,
  policy: SpatialLayoutPolicyId,
): SpatialLayoutMetrics {
  const extents = layout.drafts.map((draft) => {
    const half = collisionHalfSize(draft);
    return {
      minimumX: draft.position.x - half.x,
      maximumX: draft.position.x + half.x,
      minimumY: draft.position.y - half.y,
      maximumY: draft.position.y + half.y,
    };
  });
  const width = Math.ceil(
    Math.max(...extents.map((extent) => extent.maximumX)) -
      Math.min(...extents.map((extent) => extent.minimumX)),
  );
  const height = Math.ceil(
    Math.max(...extents.map((extent) => extent.maximumY)) -
      Math.min(...extents.map((extent) => extent.minimumY)),
  );
  const area = width * height;
  const transportEntities = layout.drafts.filter((draft) => TRANSPORT_ROLES.has(draft.role)).length;
  const undergroundEntities = layout.drafts.filter((draft) => draft.role === "underground-belt" ||
    draft.role === "pipe-to-ground").length;
  return {
    policy,
    width,
    height,
    area,
    entityCount: layout.drafts.length,
    transportEntities,
    undergroundEntities,
    score:
      area * 10 +
      transportEntities * 2 +
      undergroundEntities * 8 +
      Math.max(width, height) * 25,
  };
}

export function buildSpatialLayoutCandidates(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): Array<{ layout: CanonicalLayout; metrics: SpatialLayoutMetrics }> {
  const candidates: Array<{ layout: CanonicalLayout; metrics: SpatialLayoutMetrics }> = [];
  const errors: string[] = [];
  try {
    const boundaryLayout = buildBoundaryRecipeLayout(plan, inputSide, outputSide, beltTier);
    if (boundaryLayout) {
      assertCollisionFreeCandidate(boundaryLayout);
      assertUndergroundPairing(boundaryLayout);
      assertMaterialIsolation(boundaryLayout);
      candidates.push({
        layout: boundaryLayout,
        metrics: measureSpatialLayout(boundaryLayout, "boundary-recipe"),
      });
    }
  } catch (error) {
    errors.push(`boundary-recipe: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const coupledLayout = buildCoupledRowLayout(plan, inputSide, outputSide, beltTier);
    if (coupledLayout) {
      assertCollisionFreeCandidate(coupledLayout);
      assertUndergroundPairing(coupledLayout);
      assertMaterialIsolation(coupledLayout);
      candidates.push({ layout: coupledLayout, metrics: measureSpatialLayout(coupledLayout, "coupled-rows") });
    }
  } catch (error) {
    errors.push(`coupled-rows: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const chainLayout = buildCoupledChainLayout(plan, inputSide, outputSide, beltTier);
    if (chainLayout) {
      assertCollisionFreeCandidate(chainLayout);
      assertUndergroundPairing(chainLayout);
      assertMaterialIsolation(chainLayout);
      candidates.push({ layout: chainLayout, metrics: measureSpatialLayout(chainLayout, "coupled-chain") });
    }
  } catch (error) {
    errors.push(`coupled-chain: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const forkLayout = buildForkJoinLayout(plan, inputSide, outputSide, beltTier);
    if (forkLayout) {
      assertCollisionFreeCandidate(forkLayout);
      assertUndergroundPairing(forkLayout);
      assertMaterialIsolation(forkLayout);
      candidates.push({ layout: forkLayout, metrics: measureSpatialLayout(forkLayout, "fork-join") });
    }
  } catch (error) {
    errors.push(`fork-join: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const cellLayout = buildAnonymousCellLayout(plan, inputSide, outputSide, beltTier);
    if (cellLayout) {
      assertCollisionFreeCandidate(cellLayout);
      assertUndergroundPairing(cellLayout);
      assertMaterialIsolation(cellLayout);
      candidates.push({ layout: cellLayout, metrics: measureSpatialLayout(cellLayout, "anonymous-cell") });
    }
  } catch (error) {
    errors.push(`anonymous-cell: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const recursiveLayout = buildRecursiveCellLayout(plan, inputSide, outputSide, beltTier);
    if (recursiveLayout) {
      assertCollisionFreeCandidate(recursiveLayout);
      assertUndergroundPairing(recursiveLayout);
      assertMaterialIsolation(recursiveLayout);
      candidates.push({
        layout: recursiveLayout,
        metrics: measureSpatialLayout(recursiveLayout, "recursive-cell-cover"),
      });
    }
  } catch (error) {
    errors.push(`recursive-cell-cover: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const hierarchicalLayout = buildHierarchicalLayout(plan, inputSide, outputSide, beltTier);
    if (hierarchicalLayout) {
      assertCollisionFreeCandidate(hierarchicalLayout);
      assertUndergroundPairing(hierarchicalLayout);
      assertMaterialIsolation(hierarchicalLayout);
      candidates.push({
        layout: hierarchicalLayout,
        metrics: measureSpatialLayout(hierarchicalLayout, "hierarchical-islands"),
      });
    }
  } catch (error) {
    errors.push(`hierarchical-islands: ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const [variantIndex, policy] of ADAPTIVE_GEOMETRY_SEARCH.entries()) {
    try {
      const layout = buildCanonicalLayoutCandidate(plan, inputSide, outputSide, beltTier, policy);
      assertCollisionFreeCandidate(layout);
      assertUndergroundPairing(layout);
      assertMaterialIsolation(layout);
      candidates.push({
        layout,
        metrics: measureSpatialLayout(layout, "adaptive-production-graph"),
      });
    } catch (error) {
      errors.push(`adaptive-production-graph[${variantIndex + 1}]: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (candidates.length === 0) {
    throw new Error(`No collision-free spatial layout candidate was found. ${errors.join(" ")}`);
  }
  return candidates.sort((left, right) =>
    left.metrics.score - right.metrics.score || left.metrics.policy.localeCompare(right.metrics.policy));
}

export function diagnoseSpatialLayoutPolicies(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): Array<{ policy: SpatialLayoutPolicyId; metrics?: SpatialLayoutMetrics; error?: string }> {
  const diagnostics: Array<{ policy: SpatialLayoutPolicyId; metrics?: SpatialLayoutMetrics; error?: string }> = [];
  try {
    const boundaryLayout = buildBoundaryRecipeLayout(plan, inputSide, outputSide, beltTier);
    if (boundaryLayout) {
      assertCollisionFreeCandidate(boundaryLayout);
      assertUndergroundPairing(boundaryLayout);
      assertMaterialIsolation(boundaryLayout);
      diagnostics.push({
        policy: "boundary-recipe",
        metrics: measureSpatialLayout(boundaryLayout, "boundary-recipe"),
      });
    }
  } catch (error) {
    diagnostics.push({
      policy: "boundary-recipe",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const coupledLayout = buildCoupledRowLayout(plan, inputSide, outputSide, beltTier);
    if (coupledLayout) {
      assertCollisionFreeCandidate(coupledLayout);
      assertUndergroundPairing(coupledLayout);
      assertMaterialIsolation(coupledLayout);
      diagnostics.push({
        policy: "coupled-rows",
        metrics: measureSpatialLayout(coupledLayout, "coupled-rows"),
      });
    }
  } catch (error) {
    diagnostics.push({
      policy: "coupled-rows",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const chainLayout = buildCoupledChainLayout(plan, inputSide, outputSide, beltTier);
    if (chainLayout) {
      assertCollisionFreeCandidate(chainLayout);
      assertUndergroundPairing(chainLayout);
      assertMaterialIsolation(chainLayout);
      diagnostics.push({
        policy: "coupled-chain",
        metrics: measureSpatialLayout(chainLayout, "coupled-chain"),
      });
    }
  } catch (error) {
    diagnostics.push({
      policy: "coupled-chain",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const forkLayout = buildForkJoinLayout(plan, inputSide, outputSide, beltTier);
    if (forkLayout) {
      assertCollisionFreeCandidate(forkLayout);
      assertUndergroundPairing(forkLayout);
      assertMaterialIsolation(forkLayout);
      diagnostics.push({
        policy: "fork-join",
        metrics: measureSpatialLayout(forkLayout, "fork-join"),
      });
    }
  } catch (error) {
    diagnostics.push({
      policy: "fork-join",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const hierarchicalLayout = buildHierarchicalLayout(plan, inputSide, outputSide, beltTier);
    if (hierarchicalLayout) {
      assertCollisionFreeCandidate(hierarchicalLayout);
      assertUndergroundPairing(hierarchicalLayout);
      assertMaterialIsolation(hierarchicalLayout);
      diagnostics.push({
        policy: "hierarchical-islands",
        metrics: measureSpatialLayout(hierarchicalLayout, "hierarchical-islands"),
      });
    }
  } catch (error) {
    diagnostics.push({
      policy: "hierarchical-islands",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const recursiveLayout = buildRecursiveCellLayout(plan, inputSide, outputSide, beltTier);
    if (recursiveLayout) {
      assertCollisionFreeCandidate(recursiveLayout);
      assertUndergroundPairing(recursiveLayout);
      assertMaterialIsolation(recursiveLayout);
      diagnostics.push({
        policy: "recursive-cell-cover",
        metrics: measureSpatialLayout(recursiveLayout, "recursive-cell-cover"),
      });
    }
  } catch (error) {
    diagnostics.push({
      policy: "recursive-cell-cover",
      error: error instanceof Error ? error.message : String(error),
    });
  }
  try {
    const cellLayout = buildAnonymousCellLayout(plan, inputSide, outputSide, beltTier);
    if (cellLayout) {
      assertCollisionFreeCandidate(cellLayout);
      assertUndergroundPairing(cellLayout);
      assertMaterialIsolation(cellLayout);
      diagnostics.push({ policy: "anonymous-cell", metrics: measureSpatialLayout(cellLayout, "anonymous-cell") });
    }
  } catch (error) {
    diagnostics.push({ policy: "anonymous-cell", error: error instanceof Error ? error.message : String(error) });
  }
  const adaptiveDiagnostics = ADAPTIVE_GEOMETRY_SEARCH.map((policy) => {
    try {
      const layout = buildCanonicalLayoutCandidate(plan, inputSide, outputSide, beltTier, policy);
      assertCollisionFreeCandidate(layout);
      assertUndergroundPairing(layout);
      assertMaterialIsolation(layout);
      return {
        policy: "adaptive-production-graph" as const,
        metrics: measureSpatialLayout(layout, "adaptive-production-graph"),
      };
    } catch (error) {
      return {
        policy: "adaptive-production-graph" as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const acceptedAdaptive = adaptiveDiagnostics
    .filter((diagnostic) => diagnostic.metrics !== undefined)
    .sort((left, right) => left.metrics!.score - right.metrics!.score);
  diagnostics.push(acceptedAdaptive[0] ?? {
    policy: "adaptive-production-graph",
    error: adaptiveDiagnostics.map((diagnostic) => diagnostic.error).filter(Boolean).join(" "),
  });
  return diagnostics;
}

export function diagnoseAdaptiveGeometrySearch(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): Array<{ variant: number; policy: SpatialLayoutPolicy; metrics?: SpatialLayoutMetrics; error?: string }> {
  return ADAPTIVE_GEOMETRY_SEARCH.map((policy, index) => {
    try {
      const layout = buildCanonicalLayoutCandidate(plan, inputSide, outputSide, beltTier, policy);
      assertCollisionFreeCandidate(layout);
      assertUndergroundPairing(layout);
      assertMaterialIsolation(layout);
      return {
        variant: index + 1,
        policy,
        metrics: measureSpatialLayout(layout, "adaptive-production-graph"),
      };
    } catch (error) {
      return {
        variant: index + 1,
        policy,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

export function buildOptimizedCanonicalLayout(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): CanonicalLayout {
  return buildSpatialLayoutCandidates(plan, inputSide, outputSide, beltTier)[0].layout;
}
