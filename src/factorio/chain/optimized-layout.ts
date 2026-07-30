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
import type { ChainPlan, ChainEntityRole, MaterialType } from "./types";

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
  if (draft.name.includes("splitter")) return { x: 0.85, y: 0.35 };
  if (draft.name === "pump") return { x: 0.35, y: 0.85 };
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

export function buildOptimizedCanonicalLayout(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
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
  const busY = new Map(orderedMaterialIds.map((material, index) => [material, index * 4]));
  const busRows = [...busY.values()];
  busRows.forEach((row) => horizontalRows.add(row));
  const machineRegionY = orderedMaterialIds.length * 4 + 12;
  const placements: PlacedBlock[] = [];
  let cursorX = 8;
  let maximumBottomY = machineRegionY;

  for (const depth of topology.depths) {
    const blocks = topology.blocks.filter((block) => block.depth === depth);
    const inputTrackTotal = blocks.reduce((sum, block) => sum + block.machineRows * block.ingredients.length, 0);
    const outputTrackTotal = blocks.reduce((sum, block) => sum + outputTrackCount(block), 0);
    const ingressWidth = inputTrackTotal * 2 + 10;
    const maximumMachineWidth = Math.max(...blocks.map((block) =>
      block.kind === "fluid-row" ? block.columns * 6 + 8 : block.columns * 4 + 8));
    const machineStartX = cursorX + ingressWidth;
    const outputStartX = machineStartX + maximumMachineWidth + 4;
    const columnEndX = outputStartX + outputTrackTotal * 2 + 4;
    let inputTrackCursor = 0;
    let outputTrackCursor = 0;
    let stackY = machineRegionY;

    for (const block of blocks) {
      const inputCount = block.machineRows * block.ingredients.length;
      const outputs = outputTrackCount(block);
      const inputTracks = Array.from(
        { length: inputCount },
        (_, index) => cursorX + 2 + (inputTrackCursor + index) * 2,
      );
      const outputTracks = Array.from(
        { length: outputs },
        (_, index) => outputStartX + (outputTrackCursor + index) * 2,
      );
      placements.push({ contract: block, machineStartX, baseY: stackY, inputTracks, outputTracks });
      inputTrackCursor += inputCount;
      outputTrackCursor += outputs;
      stackY += block.estimatedHeight + 6;
    }
    maximumBottomY = Math.max(maximumBottomY, stackY);
    cursorX = columnEndX + 24;
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

  const factoryEndX = cursorX + 4;
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
