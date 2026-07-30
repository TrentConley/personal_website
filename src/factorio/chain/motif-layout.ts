import { BELTS } from "../core/throughput";
import type { CardinalDirection, Side } from "../core/types";
import type { CanonicalLayout, Draft } from "./layout";
import type { ChainEntityRole, ChainPlan, PlannedRecipe } from "./types";

const SIDE_INDEX: Record<Side, number> = { north: 0, east: 1, south: 2, west: 3 };
const INDEX_SIDE: Side[] = ["north", "east", "south", "west"];
interface AnonymousCellPattern {
  source: PlannedRecipe;
  cell: PlannedRecipe;
  downstream?: PlannedRecipe;
  sourceInput: string;
  cellInput: string;
  downstreamInput?: string;
  cellCapacity: number;
}

function nominalOutputPerMachine(planned: PlannedRecipe): number {
  return planned.recipe.result.amount * planned.recipe.machine.craftingSpeed / planned.recipe.energySeconds;
}

function detectAnonymousCellPattern(plan: ChainPlan): AnonymousCellPattern | undefined {
  if (plan.targetType !== "item" || plan.recipes.some((planned) =>
    planned.materialType !== "item" ||
    planned.recipe.machine.name !== "assembling-machine-3" ||
    planned.recipe.ingredients.some((ingredient) => ingredient.type !== "item"))) return undefined;
  const boundaries = new Set(plan.inputs.map((input) => input.name));
  const target = plan.recipes.find((planned) => planned.material === plan.target);
  if (!target) return undefined;

  for (const source of plan.recipes) {
    if (source.recipe.ingredients.length !== 1 || !boundaries.has(source.recipe.ingredients[0].name)) continue;
    for (const cell of plan.recipes) {
      const sourceIngredient = cell.recipe.ingredients.find((ingredient) => ingredient.name === source.material);
      const otherIngredients = cell.recipe.ingredients.filter((ingredient) => ingredient.name !== source.material);
      if (!sourceIngredient || otherIngredients.length !== 1 || !boundaries.has(otherIngredients[0].name)) continue;
      const sourceMachinesPerCellMachine =
        sourceIngredient.amount * cell.recipe.machine.craftingSpeed / cell.recipe.energySeconds /
        nominalOutputPerMachine(source);
      // The alternating P-C-P-C-P cell is a geometry primitive selected from
      // the flow ratio, never a recipe or material identity.
      if (Math.abs(sourceMachinesPerCellMachine - 1.5) > 1e-9) continue;
      if (target.material === cell.material) {
        return {
          source,
          cell,
          sourceInput: source.recipe.ingredients[0].name,
          cellInput: otherIngredients[0].name,
          cellCapacity: nominalOutputPerMachine(cell) * 2,
        };
      }
      const targetSource = target.recipe.ingredients.find((ingredient) => ingredient.name === source.material);
      const targetCell = target.recipe.ingredients.find((ingredient) => ingredient.name === cell.material);
      const targetOther = target.recipe.ingredients.filter((ingredient) =>
        ingredient.name !== source.material && ingredient.name !== cell.material);
      if (targetSource && targetCell && targetOther.length === 1 && boundaries.has(targetOther[0].name)) {
        return {
          source,
          cell,
          downstream: target,
          sourceInput: source.recipe.ingredients[0].name,
          cellInput: otherIngredients[0].name,
          downstreamInput: targetOther[0].name,
          cellCapacity: nominalOutputPerMachine(cell) * 2,
        };
      }
    }
  }
  return undefined;
}

function tilePosition(x: number, y: number): { x: number; y: number } {
  return { x: x + 0.5, y: y + 0.5 };
}

function directionBetween(from: { x: number; y: number }, to: { x: number; y: number }): CardinalDirection {
  if (to.x === from.x && to.y === from.y - 1) return 0;
  if (to.x === from.x + 1 && to.y === from.y) return 4;
  if (to.x === from.x && to.y === from.y + 1) return 8;
  if (to.x === from.x - 1 && to.y === from.y) return 12;
  throw new Error("Motif belt paths must use one-tile cardinal steps.");
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
      direction: index + 1 < path.length ? directionBetween(point, path[index + 1]) : finalDirection,
    });
  });
}

function horizontalPoints(fromX: number, toX: number, y: number): Array<{ x: number; y: number }> {
  if (toX < fromX) return [];
  return Array.from({ length: toX - fromX + 1 }, (_, index) => ({ x: fromX + index, y }));
}

function addHorizontalWithHoles(
  drafts: Draft[],
  role: ChainEntityRole,
  material: string,
  beltName: string,
  undergroundName: string,
  fromX: number,
  toX: number,
  y: number,
  holes: number[],
): void {
  const skipped = new Set<number>();
  const endpoints = new Map<number, "input" | "output">();
  const clusters: Array<{ minimum: number; maximum: number }> = [];
  for (const hole of [...new Set(holes)].sort((left, right) => left - right)) {
    if (hole <= fromX || hole >= toX) continue;
    const cluster = clusters.at(-1);
    if (cluster && hole <= cluster.maximum + 2) cluster.maximum = hole;
    else clusters.push({ minimum: hole, maximum: hole });
  }
  for (const cluster of clusters) {
    endpoints.set(cluster.minimum - 1, "input");
    endpoints.set(cluster.maximum + 1, "output");
    for (let hole = cluster.minimum; hole <= cluster.maximum; hole += 1) skipped.add(hole);
  }
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

function addMachine(
  drafts: Draft[],
  material: string,
  recipe: string,
  machineName: "assembling-machine-3" | "electric-furnace" | "chemical-plant",
  x: number,
  y: number,
): void {
  drafts.push({
    role: "machine",
    material,
    recipe,
    name: machineName,
    position: tilePosition(x, y),
    recipeSetting: recipe,
    direction: 0,
  });
}

function addInserter(
  drafts: Draft[],
  role: "input-inserter" | "output-inserter",
  material: string,
  recipe: string,
  name: "bulk-inserter" | "long-handed-inserter",
  x: number,
  y: number,
  direction: CardinalDirection,
): void {
  drafts.push({ role, material, recipe, name, position: tilePosition(x, y), direction });
}

function addPole(drafts: Draft[], x: number, y: number): void {
  drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(x, y) });
}

function buildRatioCell(
  drafts: Draft[],
  pattern: AnonymousCellPattern,
  startX: number,
  outputRow: 3 | 4,
): void {
  const cableXs = [startX, startX + 8, startX + 16];
  const greenXs = [startX + 4, startX + 12];
  cableXs.forEach((x) => {
    addMachine(drafts, pattern.source.material, pattern.source.recipe.id, pattern.source.recipe.machine.name, x, 0);
    addInserter(drafts, "input-inserter", pattern.sourceInput, pattern.source.recipe.id, "bulk-inserter", x - 1, -2, 0);
    addInserter(drafts, "input-inserter", pattern.sourceInput, pattern.source.recipe.id, "bulk-inserter", x + 1, -2, 0);
  });
  greenXs.forEach((x) => {
    addMachine(drafts, pattern.cell.material, pattern.cell.recipe.id, pattern.cell.recipe.machine.name, x, 0);
    for (const offset of [-1, 0, 1]) {
      addInserter(
        drafts,
        "input-inserter",
        pattern.cellInput,
        pattern.cell.recipe.id,
        "long-handed-inserter",
        x + offset,
        -2,
        0,
      );
    }
    const outputOffsets = pattern.downstream
      ? [-1]
      : outputRow === 3 ? [-1, 1] : [-1, 0, 1];
    for (const offset of outputOffsets) {
      addInserter(
        drafts,
        "output-inserter",
        pattern.cell.material,
        pattern.cell.recipe.id,
        outputRow === 3 ? "bulk-inserter" : "long-handed-inserter",
        x + offset,
        2,
        0,
      );
    }
  });

  // The outside cable machines each feed one green assembler. The middle
  // cable machine splits evenly between both, giving the exact vanilla 3:2
  // assembler ratio without putting 15 cable/s onto a belt.
  for (const y of [-1, 1]) {
    addInserter(drafts, "output-inserter", pattern.source.material, pattern.source.recipe.id, "bulk-inserter", startX + 2, y, 12);
    addInserter(drafts, "output-inserter", pattern.source.material, pattern.source.recipe.id, "bulk-inserter", startX + 14, y, 4);
  }
  addInserter(drafts, "output-inserter", pattern.source.material, pattern.source.recipe.id, "bulk-inserter", startX + 6, 0, 4);
  addInserter(drafts, "output-inserter", pattern.source.material, pattern.source.recipe.id, "bulk-inserter", startX + 10, 0, 12);
  // Poles live in the one-tile direct-insertion gaps. Four are needed to
  // cover both the long-handed iron loaders and every lateral cable arm.
  for (const [offsetX, y] of [[2, 0], [6, -1], [10, -1], [14, 0]] as const) {
    addPole(drafts, startX + offsetX, y);
  }
}

function buildDownstreamCell(
  drafts: Draft[],
  pattern: AnonymousCellPattern,
  startX: number,
  machineCount: number,
  beltName: string,
  minimumSourceX: number,
): number {
  const downstream = pattern.downstream!;
  const redXs = Array.from({ length: machineCount }, (_, index) => startX + index * 4);
  redXs.forEach((x) => {
    addMachine(drafts, downstream.material, downstream.recipe.id, downstream.recipe.machine.name, x, 6);
    addInserter(drafts, "input-inserter", pattern.cell.material, downstream.recipe.id, "bulk-inserter", x - 1, 4, 0);
    addInserter(drafts, "input-inserter", pattern.downstreamInput!, downstream.recipe.id, "long-handed-inserter", x + 1, 4, 0);
    addInserter(drafts, "input-inserter", pattern.source.material, downstream.recipe.id, "bulk-inserter", x - 1, 8, 8);
    addInserter(drafts, "output-inserter", downstream.material, downstream.recipe.id, "long-handed-inserter", x + 1, 8, 0);
  });
  const lastRedX = redXs.at(-1)!;
  const cableX = Math.max(lastRedX, minimumSourceX);
  const crossingX = cableX + 2;
  // The last inter-machine pole in an odd-sized row can land exactly on the
  // vertical cable feeder. Slide that pole one tile outward; it remains
  // within supply range of the final assembler and keeps the transport lane
  // collision-free for every row remainder (1 through 6).
  for (let x = startX + 2; x <= lastRedX + 2; x += 8) {
    addPole(drafts, x === crossingX ? x + 1 : x, 6);
  }

  addMachine(drafts, pattern.source.material, pattern.source.recipe.id, pattern.source.recipe.machine.name, cableX, -2);
  for (const offset of [-1, 1]) {
    addInserter(drafts, "input-inserter", pattern.sourceInput, pattern.source.recipe.id, "bulk-inserter", cableX + offset, -4, 0);
  }
  for (const offset of [-1, 0, 1]) {
    addInserter(drafts, "output-inserter", pattern.source.material, pattern.source.recipe.id, "bulk-inserter", cableX + offset, 0, 0);
  }
  addPole(drafts, cableX - 2, -2);
  addPole(drafts, cableX - 2, 4);

  addBeltPath(
    drafts,
    "ingredient-feeder",
    pattern.source.material,
    beltName,
    [
      ...horizontalPoints(cableX - 1, crossingX, 1),
      ...Array.from({ length: 8 }, (_, index) => ({ x: crossingX, y: index + 2 })),
      ...Array.from({ length: crossingX - startX + 1 }, (_, index) => ({ x: crossingX - 1 - index, y: 9 })),
    ],
    12,
  );
  return crossingX;
}

function outputPath(
  routeX: number,
  targetY: number,
  canonicalOutputSide: Side,
  topY: number,
  bottomY: number,
): Array<{ x: number; y: number }> {
  if (canonicalOutputSide === "east") return [{ x: routeX, y: targetY }];
  if (canonicalOutputSide === "north") {
    return Array.from({ length: targetY - (topY - 6) + 1 }, (_, index) => ({ x: routeX, y: targetY - index }));
  }
  const southY = bottomY + 6;
  const vertical = Array.from({ length: southY - targetY + 1 }, (_, index) => ({ x: routeX, y: targetY + index }));
  if (canonicalOutputSide === "south") return vertical;
  return [
    ...vertical,
    ...Array.from({ length: routeX + 6 }, (_, index) => ({ x: routeX - 1 - index, y: southY })),
  ];
}

/**
 * Compiles any recipe graph containing the anonymous 3:2 producer/consumer
 * flow primitive into a direct-insertion cell. Detection uses rates, arity,
 * boundaries, and graph adjacency only; recipe and material names are opaque.
 */
export function buildAnonymousCellLayout(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
  minimumCellMachines = 0,
): CanonicalLayout | undefined {
  const pattern = detectAnonymousCellPattern(plan);
  if (!pattern) return undefined;
  const boundaries = new Set(plan.inputs.map((input) => input.name));
  const cellTarget = plan.target === pattern.cell.material;
  const downstreamTarget = pattern.downstream?.material === plan.target;
  const expectedBoundaries = new Set([
    pattern.sourceInput,
    pattern.cellInput,
    ...(pattern.downstreamInput ? [pattern.downstreamInput] : []),
  ]);
  if ((!cellTarget && !downstreamTarget) || boundaries.size !== expectedBoundaries.size ||
    [...boundaries].some((name) => !expectedBoundaries.has(name))) return undefined;

  const belt = BELTS[beltTier];
  const undergroundName = beltTier === "yellow"
    ? "underground-belt"
    : beltTier === "red"
      ? "fast-underground-belt"
      : "express-underground-belt";
  const rotationQuarterTurns = (SIDE_INDEX[inputSide] - SIDE_INDEX.west + 4) % 4;
  const canonicalOutputSide = INDEX_SIDE[(SIDE_INDEX[outputSide] - rotationQuarterTurns + 4) % 4];
  const drafts: Draft[] = [];
  const inputPositions = new Map<string, { x: number; y: number }>();
  const cellRate = pattern.cell.outputPerSecond;
  // Standalone cells remain nominal-capacity sized (their measured designs
  // already meet throughput). A direct-insertion parent can require a larger
  // paired row so every terminal machine has its capacity-matched producer.
  const greenCells = Math.max(
    1,
    Math.ceil(cellRate / pattern.cellCapacity - 1e-12),
    Math.ceil(minimumCellMachines / 2),
  );
  const redMachineCount = downstreamTarget
    ? pattern.downstream!.machineCount
    : 0;
  const secondaryGreenCell = cellTarget && greenCells > 1 ? Math.ceil(greenCells / 2) : greenCells;
  for (let cell = 0; cell < greenCells; cell += 1) {
    buildRatioCell(drafts, pattern, cell * 20, cell >= secondaryGreenCell ? 4 : 3);
  }

  const greenEndX = greenCells > 0 ? (greenCells - 1) * 20 + 17 : -6;
  // Independent rows share their horizontal span. The router tunnels boundary
  // belts under the sparse source machines when an overlap is profitable.
  const redStartX = 4;
  const redCrossings: number[] = [];
  let remainingRedMachines = redMachineCount;
  let redCursorX = redStartX;
  while (remainingRedMachines > 0) {
    const cellMachines = Math.min(6, remainingRedMachines);
    const crossingX = buildDownstreamCell(
      drafts,
      pattern,
      redCursorX,
      cellMachines,
      belt.entityName,
      greenEndX + 7,
    );
    redCrossings.push(crossingX);
    redCursorX = crossingX + 2;
    remainingRedMachines -= cellMachines;
  }
  // Leave two tiles beyond the final cable drop so every shared horizontal
  // line can cross it with a complete underground pair.
  const redEndX = redMachineCount > 0 ? redCursorX : greenEndX;

  if (greenCells > 0) {
    if (downstreamTarget) {
      const transitionX = greenEndX + 2;
      const sourceMachineXs = redCrossings.map((crossing) => crossing - 2);
      addHorizontalWithHoles(
        drafts,
        "input-belt",
        pattern.sourceInput,
        belt.entityName,
        undergroundName,
        -6,
        transitionX - 1,
        -3,
        sourceMachineXs.flatMap((x) => [x - 1, x, x + 1]),
      );
      const lowerMinimum = Math.min(...sourceMachineXs.map((x) => x - 1));
      const lowerMaximum = Math.max(...sourceMachineXs.map((x) => x + 1));
      const lowerEndX = transitionX < lowerMinimum ? lowerMaximum : lowerMinimum;
      const lowerStep = Math.sign(lowerEndX - transitionX);
      addBeltPath(
        drafts,
        "input-belt",
        pattern.sourceInput,
        belt.entityName,
        [
          { x: transitionX, y: -3 },
          { x: transitionX, y: -4 },
          { x: transitionX, y: -5 },
          ...Array.from(
            { length: Math.abs(lowerEndX - transitionX) },
            (_, index) => ({ x: transitionX + lowerStep * (index + 1), y: -5 }),
          ),
        ],
        lowerStep < 0 ? 12 : 4,
      );
    } else {
      addBeltPath(
        drafts,
        "input-belt",
        pattern.sourceInput,
        belt.entityName,
        horizontalPoints(-6, greenEndX, -3),
        4,
      );
    }
    inputPositions.set(pattern.sourceInput, tilePosition(-6, -3));

    addBeltPath(
      drafts,
      "input-belt",
      pattern.cellInput,
      belt.entityName,
      horizontalPoints(-6, greenEndX, -4),
      4,
    );
    inputPositions.set(pattern.cellInput, tilePosition(-6, -4));
  }

  const greenLineStartX = greenCells > 0 ? 3 : -6;
  const greenLineEndX = downstreamTarget ? redEndX : greenEndX;
  const plasticTransitionX = undefined;
  const greenMergeCrossingX = cellTarget && secondaryGreenCell < greenCells ? greenEndX + 6 : undefined;
  addHorizontalWithHoles(
    drafts,
    downstreamTarget ? "material-bus" : "output-belt",
    pattern.cell.material,
    belt.entityName,
    undergroundName,
    greenLineStartX,
    greenMergeCrossingX === undefined ? greenLineEndX : greenEndX + 9,
    3,
    [
      ...redCrossings,
      ...(plasticTransitionX === undefined ? [] : [plasticTransitionX]),
      ...(greenMergeCrossingX === undefined ? [] : [greenMergeCrossingX]),
    ],
  );
  if (downstreamTarget) {
    const ratioOutputInserters = drafts
      .filter((draft) => draft.role === "output-inserter" && draft.recipe === pattern.cell.recipe.id)
      .map((draft) => Math.floor(draft.position.x));
    addHorizontalWithHoles(
      drafts,
      "input-belt",
      pattern.downstreamInput!,
      belt.entityName,
      undergroundName,
      -6,
      redEndX,
      2,
      [...redCrossings, ...ratioOutputInserters],
    );
    inputPositions.set(pattern.downstreamInput!, tilePosition(-6, 2));
  }

  const targetY = cellTarget ? 3 : 10;
  const collectorStartX = cellTarget ? 4 : redStartX;
  const sectionEndX = cellTarget ? greenEndX : redEndX;
  const routeX = sectionEndX + (greenMergeCrossingX === undefined ? 6 : 10);
  const collectorEndX = routeX - 1;
  if (downstreamTarget) {
    addBeltPath(
      drafts,
      "output-belt",
      pattern.downstream!.material,
      belt.entityName,
      horizontalPoints(collectorStartX, collectorEndX, targetY),
      4,
    );
  } else if (greenMergeCrossingX === undefined && collectorEndX > greenLineEndX) {
    addBeltPath(
      drafts,
      "output-belt",
      pattern.cell.material,
      belt.entityName,
      horizontalPoints(greenLineEndX + 1, collectorEndX, targetY),
      4,
    );
  }
  if (cellTarget && secondaryGreenCell < greenCells) {
    const crossingX = greenMergeCrossingX!;
    addBeltPath(
      drafts,
      "output-belt",
      pattern.cell.material,
      belt.entityName,
      [
        ...horizontalPoints(secondaryGreenCell * 20 + 4, crossingX, 4),
        { x: crossingX, y: 3 },
        { x: crossingX, y: 2 },
        { x: crossingX, y: 1 },
        { x: crossingX - 1, y: 1 },
        { x: crossingX - 2, y: 1 },
        { x: crossingX - 2, y: 2 },
      ],
      8,
    );
  }
  const routedOutput = outputPath(routeX, targetY, canonicalOutputSide, downstreamTarget ? -5 : -4, downstreamTarget ? 10 : 3);
  addBeltPath(drafts, "output-belt", plan.target, belt.entityName, routedOutput, canonicalOutputSide === "west" ? 12 : canonicalOutputSide === "north" ? 0 : canonicalOutputSide === "south" ? 8 : 4);
  const final = routedOutput.at(-1)!;
  return {
    drafts,
    inputPositions,
    outputPosition: tilePosition(final.x, final.y),
    canonicalOutputSide,
    rotationQuarterTurns,
  };
}
