import { BELTS } from "../core/throughput";
import type { CardinalDirection, Side } from "../core/types";
import type { CanonicalLayout, Draft } from "./layout";
import type { ChainEntityRole, ChainPlan } from "./types";

const SIDE_INDEX: Record<Side, number> = { north: 0, east: 1, south: 2, west: 3 };
const INDEX_SIDE: Side[] = ["north", "east", "south", "west"];
const GREEN_CELL_CAPACITY = 5;

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
  for (const hole of [...new Set(holes)].sort((left, right) => left - right)) {
    if (hole <= fromX || hole >= toX) continue;
    endpoints.set(hole - 1, "input");
    endpoints.set(hole + 1, "output");
    skipped.add(hole);
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

function addMachine(drafts: Draft[], material: string, recipe: string, x: number, y: number): void {
  drafts.push({
    role: "machine",
    material,
    recipe,
    name: "assembling-machine-3",
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

function buildGreenCell(drafts: Draft[], startX: number, outputRow: 3 | 4): void {
  const cableXs = [startX, startX + 8, startX + 16];
  const greenXs = [startX + 4, startX + 12];
  cableXs.forEach((x) => {
    addMachine(drafts, "copper-cable", "copper-cable", x, 0);
    addInserter(drafts, "input-inserter", "copper-plate", "copper-cable", "bulk-inserter", x - 1, -2, 0);
    addInserter(drafts, "input-inserter", "copper-plate", "copper-cable", "bulk-inserter", x + 1, -2, 0);
  });
  greenXs.forEach((x) => {
    addMachine(drafts, "electronic-circuit", "electronic-circuit", x, 0);
    for (const offset of [-1, 0, 1]) {
      addInserter(
        drafts,
        "input-inserter",
        "iron-plate",
        "electronic-circuit",
        "long-handed-inserter",
        x + offset,
        -2,
        0,
      );
    }
    const outputOffsets = outputRow === 3 ? [-1, 1] : [-1, 0, 1];
    for (const offset of outputOffsets) {
      addInserter(
        drafts,
        "output-inserter",
        "electronic-circuit",
        "electronic-circuit",
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
    addInserter(drafts, "output-inserter", "copper-cable", "copper-cable", "bulk-inserter", startX + 2, y, 12);
    addInserter(drafts, "output-inserter", "copper-cable", "copper-cable", "bulk-inserter", startX + 14, y, 4);
  }
  addInserter(drafts, "output-inserter", "copper-cable", "copper-cable", "bulk-inserter", startX + 6, 0, 4);
  addInserter(drafts, "output-inserter", "copper-cable", "copper-cable", "bulk-inserter", startX + 10, 0, 12);
  // Poles live in the one-tile direct-insertion gaps. Four are needed to
  // cover both the long-handed iron loaders and every lateral cable arm.
  for (const [offsetX, y] of [[2, 0], [6, -1], [10, -1], [14, 0]] as const) {
    addPole(drafts, startX + offsetX, y);
  }
}

function buildRedCell(drafts: Draft[], startX: number, machineCount: number, beltName: string): number {
  const redXs = Array.from({ length: machineCount }, (_, index) => startX + index * 4);
  redXs.forEach((x) => {
    addMachine(drafts, "advanced-circuit", "advanced-circuit", x, 6);
    addInserter(drafts, "input-inserter", "electronic-circuit", "advanced-circuit", "bulk-inserter", x - 1, 4, 0);
    addInserter(drafts, "input-inserter", "plastic-bar", "advanced-circuit", "long-handed-inserter", x + 1, 4, 0);
    addInserter(drafts, "input-inserter", "copper-cable", "advanced-circuit", "bulk-inserter", x - 1, 8, 8);
    addInserter(drafts, "output-inserter", "advanced-circuit", "advanced-circuit", "long-handed-inserter", x + 1, 8, 0);
  });
  const lastRedX = redXs.at(-1)!;
  for (let x = startX + 2; x <= lastRedX + 2; x += 8) addPole(drafts, x, 6);

  const cableX = lastRedX;
  const crossingX = cableX + 2;
  addMachine(drafts, "copper-cable", "copper-cable", cableX, -2);
  for (const offset of [-1, 1]) {
    addInserter(drafts, "input-inserter", "copper-plate", "copper-cable", "bulk-inserter", cableX + offset, -4, 0);
  }
  for (const offset of [-1, 0, 1]) {
    addInserter(drafts, "output-inserter", "copper-cable", "copper-cable", "bulk-inserter", cableX + offset, 0, 0);
  }
  addPole(drafts, cableX - 2, -2);

  addBeltPath(
    drafts,
    "ingredient-feeder",
    "copper-cable",
    beltName,
    [
      ...horizontalPoints(startX + 19, crossingX, 1),
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
 * Compiles the high-volume vanilla circuit subgraph into production islands.
 * This deliberately targets the two circuit chains whose cable intermediates
 * benefit most from direct insertion. Other recipe graphs stay on the general
 * staged layout until they have their own verified motifs.
 */
export function buildCircuitMotifLayout(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): CanonicalLayout | undefined {
  const boundaries = new Set(plan.inputs.map((input) => input.name));
  const greenTarget = plan.target === "electronic-circuit";
  const redTarget = plan.target === "advanced-circuit";
  const producesGreen = plan.recipes.some((recipe) => recipe.material === "electronic-circuit");
  const allowedRecipes = new Set(["copper-cable", "electronic-circuit", "advanced-circuit"]);
  if ((!greenTarget && !redTarget) || plan.recipes.some((recipe) => !allowedRecipes.has(recipe.material))) return undefined;
  if (plan.inputs.some((input) => input.type !== "item")) return undefined;
  if (!boundaries.has("copper-plate")) return undefined;
  if (greenTarget && (!boundaries.has("iron-plate") || boundaries.size !== 2)) return undefined;
  if (redTarget) {
    if (!boundaries.has("plastic-bar")) return undefined;
    if (producesGreen && !boundaries.has("iron-plate")) return undefined;
    if (!producesGreen && !boundaries.has("electronic-circuit")) return undefined;
    const expected = producesGreen
      ? new Set(["iron-plate", "copper-plate", "plastic-bar"])
      : new Set(["electronic-circuit", "copper-plate", "plastic-bar"]);
    if (boundaries.size !== expected.size || [...boundaries].some((name) => !expected.has(name))) return undefined;
  }

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
  const greenRate = plan.recipes.find((recipe) => recipe.material === "electronic-circuit")?.outputPerSecond ?? 0;
  const greenCells = producesGreen ? Math.max(1, Math.ceil(greenRate / GREEN_CELL_CAPACITY - 1e-12)) : 0;
  const redMachineCount = redTarget
    ? plan.recipes.find((recipe) => recipe.material === "advanced-circuit")!.machineCount
    : 0;
  const secondaryGreenCell = greenTarget && greenCells > 1 ? Math.ceil(greenCells / 2) : greenCells;
  for (let cell = 0; cell < greenCells; cell += 1) {
    buildGreenCell(drafts, cell * 20, cell >= secondaryGreenCell ? 4 : 3);
  }

  const greenEndX = greenCells > 0 ? (greenCells - 1) * 20 + 17 : -6;
  const redStartX = greenCells > 0 ? greenCells * 20 + 6 : 0;
  const redCrossings: number[] = [];
  let remainingRedMachines = redMachineCount;
  let redCursorX = redStartX;
  while (remainingRedMachines > 0) {
    const cellMachines = Math.min(6, remainingRedMachines);
    const crossingX = buildRedCell(drafts, redCursorX, cellMachines, belt.entityName);
    redCrossings.push(crossingX);
    redCursorX = crossingX + 2;
    remainingRedMachines -= cellMachines;
  }
  // Leave two tiles beyond the final cable drop so every shared horizontal
  // line can cross it with a complete underground pair.
  const redEndX = redMachineCount > 0 ? redCursorX : greenEndX;

  if (greenCells > 0) {
    const copperTransitionX = redTarget ? redStartX - 4 : greenEndX;
    const copperPath = redTarget
      ? [
          ...horizontalPoints(-6, copperTransitionX, -3),
          { x: copperTransitionX, y: -4 },
          { x: copperTransitionX, y: -5 },
          ...horizontalPoints(copperTransitionX + 1, redEndX, -5),
        ]
      : horizontalPoints(-6, greenEndX, -3);
    addBeltPath(drafts, "input-belt", "copper-plate", belt.entityName, copperPath, 4);
    inputPositions.set("copper-plate", tilePosition(-6, -3));

    addBeltPath(
      drafts,
      "input-belt",
      "iron-plate",
      belt.entityName,
      horizontalPoints(-6, greenEndX, -4),
      4,
    );
    inputPositions.set("iron-plate", tilePosition(-6, -4));
  } else {
    addBeltPath(drafts, "input-belt", "copper-plate", belt.entityName, horizontalPoints(-6, redEndX, -5), 4);
    inputPositions.set("copper-plate", tilePosition(-6, -5));
  }

  const greenLineStartX = greenCells > 0 ? 4 : -6;
  const greenLineEndX = redTarget ? redEndX : greenEndX;
  const plasticTransitionX = greenCells > 0 && redTarget ? redStartX - 2 : undefined;
  const greenMergeCrossingX = greenTarget && secondaryGreenCell < greenCells ? greenEndX + 6 : undefined;
  addHorizontalWithHoles(
    drafts,
    redTarget ? "material-bus" : "output-belt",
    "electronic-circuit",
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
  if (!producesGreen && redTarget) inputPositions.set("electronic-circuit", tilePosition(-6, 3));

  if (redTarget) {
    const plasticPath = plasticTransitionX === undefined
      ? horizontalPoints(-6, redEndX, 2)
      : [
          ...horizontalPoints(-6, plasticTransitionX, 5),
          { x: plasticTransitionX, y: 4 },
          { x: plasticTransitionX, y: 3 },
          { x: plasticTransitionX, y: 2 },
          ...horizontalPoints(plasticTransitionX + 1, redEndX, 2),
        ];
    // The red cable drops cross the two shared input rows. Route those rows
    // underground for one tile at every crossing rather than reserving lanes.
    if (plasticTransitionX === undefined) {
      addHorizontalWithHoles(
        drafts,
        "input-belt",
        "plastic-bar",
        belt.entityName,
        undergroundName,
        -6,
        redEndX,
        2,
        redCrossings,
      );
    } else {
      addBeltPath(
        drafts,
        "input-belt",
        "plastic-bar",
        belt.entityName,
        plasticPath.slice(0, plasticPath.findIndex((point) => point.y === 2) + 1),
        4,
      );
      addHorizontalWithHoles(
        drafts,
        "input-belt",
        "plastic-bar",
        belt.entityName,
        undergroundName,
        plasticTransitionX + 1,
        redEndX,
        2,
        redCrossings,
      );
    }
    inputPositions.set("plastic-bar", tilePosition(-6, plasticTransitionX === undefined ? 2 : 5));
    addPole(drafts, redStartX, 0);
    if (greenCells > 0) addPole(drafts, redStartX - 4, 0);
  }

  const targetY = greenTarget ? 3 : 10;
  const collectorStartX = greenTarget ? 4 : redStartX;
  const sectionEndX = greenTarget ? greenEndX : redEndX;
  const routeX = sectionEndX + (greenMergeCrossingX === undefined ? 6 : 10);
  const collectorEndX = routeX - 1;
  if (redTarget) {
    addBeltPath(
      drafts,
      "output-belt",
      "advanced-circuit",
      belt.entityName,
      horizontalPoints(collectorStartX, collectorEndX, targetY),
      4,
    );
  } else if (greenMergeCrossingX === undefined && collectorEndX > greenLineEndX) {
    addBeltPath(
      drafts,
      "output-belt",
      "electronic-circuit",
      belt.entityName,
      horizontalPoints(greenLineEndX + 1, collectorEndX, targetY),
      4,
    );
  }
  if (greenTarget && secondaryGreenCell < greenCells) {
    const crossingX = greenMergeCrossingX!;
    addBeltPath(
      drafts,
      "output-belt",
      "electronic-circuit",
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
  const routedOutput = outputPath(routeX, targetY, canonicalOutputSide, redTarget ? -5 : -4, redTarget ? 10 : 3);
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
