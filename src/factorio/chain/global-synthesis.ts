import { BELTS } from "../core/throughput";
import type { CardinalDirection, Side } from "../core/types";
import type { CanonicalLayout, Draft } from "./layout";
import type { ChainPlan, MaterialType, PlannedRecipe } from "./types";

// Sustained belt-to-assembler transfer is lower than a free-swing inserter's
// headline rate because recipe-controlled buffers pause pickup. A live 2.0.77
// dense-cell calibration bottoms out near 2.73 items/s per base-capacity bulk
// inserter; retain margin for belt phase and orientation. Long-handed pickup
// is likewise kept below its ideal free-swing rate.
// Vanilla 2.0, maximum inserter-capacity research. The official-wiki
// measurements put a bulk inserter's least-favorable express-belt pickup at
// 7.5 items/s. Long-handed pickup is much more geometry-sensitive in our
// two-rail faces; 0.9/s is the bound sustained by the live science suite.
const SAFE_BULK_ITEMS_PER_SECOND = 7.5;
const SAFE_LONG_ITEMS_PER_SECOND = 0.9;

interface Tile {
  x: number;
  y: number;
}

interface Rail {
  material: string;
  type: MaterialType;
  start: Tile;
  end: Tile;
  direction: CardinalDirection;
  demandPerSecond?: number;
  supplyPerSecond?: number;
  criticalDistance?: number;
  consumerOrdinal?: number;
}

interface MachineRack {
  planned: PlannedRecipe;
  drafts: Draft[];
  inputs: Map<string, Rail>;
  output: Rail;
  additionalInputs: Map<string, Rail[]>;
  additionalOutputs: Rail[];
  occupied: Tile[];
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
  rotatable: boolean;
}

interface RackPlacement {
  rack: MachineRack;
  x: number;
  y: number;
}

interface PlacementState {
  placements: Map<string, RackPlacement>;
  occupied: Set<string>;
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
  score: number;
}

function rackInputRails(rack: MachineRack, material?: string): Rail[] {
  if (material !== undefined) {
    const primary = rack.inputs.get(material);
    return [...(primary ? [primary] : []), ...(rack.additionalInputs.get(material) ?? [])];
  }
  return [...rack.inputs.values(), ...[...rack.additionalInputs.values()].flat()];
}

function rackOutputRails(rack: MachineRack): Rail[] {
  return [rack.output, ...rack.additionalOutputs];
}

export interface GlobalSynthesisMetrics {
  policy: "global-physical-synthesis";
  width: number;
  height: number;
  area: number;
  entityCount: number;
  transportEntities: number;
  undergroundEntities: number;
  score: number;
}

export interface GlobalSynthesisCandidate {
  layout: CanonicalLayout;
  metrics: GlobalSynthesisMetrics;
}

function tilePosition(x: number, y: number): Tile {
  return { x: x + 0.5, y: y + 0.5 };
}

function floorPosition(position: Tile): Tile {
  return { x: Math.floor(position.x), y: Math.floor(position.y) };
}

function directionVector(direction: CardinalDirection): Tile {
  if (direction === 0) return { x: 0, y: -1 };
  if (direction === 4) return { x: 1, y: 0 };
  if (direction === 8) return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

function directionBetween(from: Tile, to: Tile): CardinalDirection {
  if (to.x === from.x && to.y === from.y - 1) return 0;
  if (to.x === from.x + 1 && to.y === from.y) return 4;
  if (to.x === from.x && to.y === from.y + 1) return 8;
  if (to.x === from.x - 1 && to.y === from.y) return 12;
  throw new Error(`Non-cardinal route edge ${from.x},${from.y} -> ${to.x},${to.y}.`);
}

function draftHalfSize(draft: Draft): Tile {
  if (["assembling-machine-3", "electric-furnace", "chemical-plant"].includes(draft.name)) {
    return { x: 1.35, y: 1.35 };
  }
  if (draft.name === "substation") return { x: 0.85, y: 0.85 };
  if (draft.name === "pump") {
    return draft.direction === 0 || draft.direction === 8
      ? { x: 0.35, y: 0.85 }
      : { x: 0.85, y: 0.35 };
  }
  if (draft.name.includes("splitter")) {
    return draft.direction === 0 || draft.direction === 8
      ? { x: 0.85, y: 0.35 }
      : { x: 0.35, y: 0.85 };
  }
  return { x: 0.32, y: 0.32 };
}

function occupiedDraftTiles(draft: Draft): Tile[] {
  const center = floorPosition(draft.position);
  if (["assembling-machine-3", "electric-furnace", "chemical-plant"].includes(draft.name)) {
    const tiles: Tile[] = [];
    for (let y = center.y - 1; y <= center.y + 1; y += 1) {
      for (let x = center.x - 1; x <= center.x + 1; x += 1) tiles.push({ x, y });
    }
    return tiles;
  }
  if (draft.name === "substation") {
    return [center, { x: center.x + 1, y: center.y }, { x: center.x, y: center.y + 1 }, { x: center.x + 1, y: center.y + 1 }];
  }
  if (draft.name === "pump") {
    return draft.direction === 0 || draft.direction === 8
      ? [{ x: center.x, y: center.y - 1 }, center]
      : [{ x: center.x - 1, y: center.y }, center];
  }
  if (draft.name.includes("splitter")) {
    return draft.direction === 0 || draft.direction === 8
      ? [{ x: center.x - 1, y: center.y }, center]
      : [{ x: center.x, y: center.y - 1 }, center];
  }
  return [center];
}

function addHorizontalRail(
  drafts: Draft[],
  role: Draft["role"],
  material: string,
  beltName: string,
  fromX: number,
  toX: number,
  y: number,
): Rail {
  for (let x = fromX; x <= toX; x += 1) {
    drafts.push({ role, material, name: beltName, position: tilePosition(x, y), direction: 4 });
  }
  return { material, type: "item", start: { x: fromX, y }, end: { x: toX, y }, direction: 4 };
}

function armsFor(rate: number, machines: number, capacity: number): number {
  return Math.max(1, Math.ceil(rate / machines / capacity - 1e-12));
}

/**
 * Finds the smallest machine count whose inserters fit on real three-tile
 * machine faces. This is deliberately a face-packing constraint, not the old
 * one-arm-per-ingredient approximation: adding a whole assembler is only
 * justified when the perimeter is actually saturated.
 */
function transportSizedMachineCount(planned: PlannedRecipe, itemIngredients: PlannedRecipe["ingredientRates"]): number {
  let count = planned.machineCount;
  while (count < planned.machineCount + 512) {
    const outputArms = planned.materialType === "item"
      ? armsFor(planned.outputPerSecond, count, SAFE_BULK_ITEMS_PER_SECOND)
      : 0;
    let inputsFit = false;
    if (itemIngredients.length === 0) inputsFit = true;
    else if (itemIngredients.length === 1) {
      inputsFit = armsFor(itemIngredients[0].perSecond, count, SAFE_BULK_ITEMS_PER_SECOND) <= 3;
    } else if (itemIngredients.length === 2) {
      // Each ingredient owns a near-inserter face; the third face is output.
      inputsFit = itemIngredients.every((ingredient) =>
        armsFor(ingredient.perSecond, count, SAFE_BULK_ITEMS_PER_SECOND) <= 3);
    } else {
      // Three/four-input machines share each north/south face between a near
      // and a long-handed rail. The search sizes the pair jointly.
      const faceArms = [0, 1].map((face) => {
        const near = itemIngredients[face];
        const far = itemIngredients[face + 2];
        return (near ? armsFor(near.perSecond, count, SAFE_BULK_ITEMS_PER_SECOND) : 0) +
          (far ? armsFor(far.perSecond, count, SAFE_LONG_ITEMS_PER_SECOND) : 0);
      });
      inputsFit = faceArms.every((arms) => arms <= 3);
    }
    if (inputsFit && outputArms <= 3) return count;
    count += 1;
  }
  throw new Error(`${planned.recipe.id} exceeds the integrated inserter perimeter.`);
}

function rackFromDrafts(
  planned: PlannedRecipe,
  drafts: Draft[],
  inputs: Map<string, Rail>,
  output: Rail,
  rotatable = true,
  additionalInputs = new Map<string, Rail[]>(),
  additionalOutputs: Rail[] = [],
): MachineRack {
  const byKey = new Map<string, Tile>();
  drafts.flatMap(occupiedDraftTiles).forEach((tile) => byKey.set(`${tile.x},${tile.y}`, tile));
  inputs.forEach((rail) => {
    const vector = directionVector(rail.direction);
    for (let distance = 1; distance <= 1; distance += 1) {
      const ingress = { x: rail.start.x - vector.x * distance, y: rail.start.y - vector.y * distance };
      byKey.set(`${ingress.x},${ingress.y}`, ingress);
      const egress = { x: rail.end.x + vector.x * distance, y: rail.end.y + vector.y * distance };
      byKey.set(`${egress.x},${egress.y}`, egress);
    }
  });
  additionalInputs.forEach((rails) => rails.forEach((rail) => {
    const vector = directionVector(rail.direction);
    const ingress = { x: rail.start.x - vector.x, y: rail.start.y - vector.y };
    const egress = { x: rail.end.x + vector.x, y: rail.end.y + vector.y };
    byKey.set(`${ingress.x},${ingress.y}`, ingress);
    byKey.set(`${egress.x},${egress.y}`, egress);
  }));
  const vector = directionVector(output.direction);
  for (let distance = 1; distance <= 1; distance += 1) {
    const escape = { x: output.end.x + vector.x * distance, y: output.end.y + vector.y * distance };
    byKey.set(`${escape.x},${escape.y}`, escape);
  }
  additionalOutputs.forEach((rail) => {
    const railVector = directionVector(rail.direction);
    const escape = { x: rail.end.x + railVector.x, y: rail.end.y + railVector.y };
    byKey.set(`${escape.x},${escape.y}`, escape);
  });
  const occupied = [...byKey.values()];
  return {
    planned,
    drafts,
    inputs,
    output,
    additionalInputs,
    additionalOutputs,
    occupied,
    minimumX: Math.min(...occupied.map((tile) => tile.x)),
    maximumX: Math.max(...occupied.map((tile) => tile.x)),
    minimumY: Math.min(...occupied.map((tile) => tile.y)),
    maximumY: Math.max(...occupied.map((tile) => tile.y)),
    rotatable,
  };
}

function rackTerminalsDoNotConflict(rack: MachineRack): boolean {
  const owners = new Map<string, Set<string>>();
  const claim = (tile: Tile, material: string): void => {
    const key = `${tile.x},${tile.y}`;
    const materials = owners.get(key) ?? new Set<string>();
    materials.add(material);
    owners.set(key, materials);
  };
  for (const rail of rackInputRails(rack)) {
    const vector = directionVector(rail.direction);
    claim({ x: rail.start.x - vector.x, y: rail.start.y - vector.y }, rail.material);
    claim({ x: rail.end.x + vector.x, y: rail.end.y + vector.y }, rail.material);
  }
  for (const rail of rackOutputRails(rack)) {
    const vector = directionVector(rail.direction);
    claim({ x: rail.end.x + vector.x, y: rail.end.y + vector.y }, rail.material);
  }
  return [...owners.values()].every((materials) => materials.size === 1);
}

function buildFaceMachineRack(
  planned: PlannedRecipe,
  items: PlannedRecipe["ingredientRates"],
  beltName: string,
): MachineRack | undefined {
  if (planned.machineCount !== 1 || items.length !== 3 || planned.materialType !== "item" ||
    planned.outputPerSecond > SAFE_BULK_ITEMS_PER_SECOND + 1e-9) return undefined;
  const ordered = [...items].sort((left, right) => right.perSecond - left.perSecond);
  if (ordered.some((ingredient) => armsFor(ingredient.perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND) > 3)) {
    return undefined;
  }
  const drafts: Draft[] = [{
    role: "machine", material: planned.material, recipe: planned.recipe.id,
    name: planned.recipe.machine.name, position: tilePosition(0, 0), direction: 0,
    recipeSetting: planned.recipe.id,
  }];
  const inputs = new Map<string, Rail>();
  const north = addHorizontalRail(drafts, "ingredient-feeder", ordered[0].name, beltName, -1, 1, -3);
  const south = addHorizontalRail(drafts, "ingredient-feeder", ordered[1].name, beltName, -1, 1, 3);
  for (let y = -1; y <= 1; y += 1) {
    drafts.push({ role: "ingredient-feeder", material: ordered[2].name, name: beltName,
      position: tilePosition(-3, y), direction: 8 });
  }
  const west: Rail = { material: ordered[2].name, type: "item",
    start: { x: -3, y: -1 }, end: { x: -3, y: 1 }, direction: 8 };
  inputs.set(ordered[0].name, { ...north, demandPerSecond: ordered[0].perSecond });
  inputs.set(ordered[1].name, { ...south, demandPerSecond: ordered[1].perSecond });
  inputs.set(ordered[2].name, { ...west, demandPerSecond: ordered[2].perSecond });
  const faces = [
    { ingredient: ordered[0], positions: [-1, 0, 1].map((x) => ({ x, y: -2 })), direction: 0 as CardinalDirection },
    { ingredient: ordered[1], positions: [-1, 0, 1].map((x) => ({ x, y: 2 })), direction: 8 as CardinalDirection },
    { ingredient: ordered[2], positions: [-1, 0, 1].map((y) => ({ x: -2, y })), direction: 12 as CardinalDirection },
  ];
  faces.forEach(({ ingredient, positions, direction }) => {
    const armCount = armsFor(ingredient.perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND);
    positions.slice(0, armCount).forEach((position) => drafts.push({
      role: "input-inserter", material: ingredient.name, recipe: planned.recipe.id,
      name: "bulk-inserter", position: tilePosition(position.x, position.y), direction,
    }));
  });
  drafts.push({ role: "output-inserter", material: planned.material, recipe: planned.recipe.id,
    name: "bulk-inserter", position: tilePosition(2, 0), direction: 12 });
  drafts.push({ role: "output-belt", material: planned.material, name: beltName,
    position: tilePosition(3, 0), direction: 4 });
  drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(2, -2) });
  drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(-2, 2) });
  return rackFromDrafts(planned, drafts, inputs, {
    material: planned.material, type: "item", start: { x: 3, y: 0 }, end: { x: 3, y: 0 }, direction: 4,
    supplyPerSecond: planned.outputPerSecond,
  });
}

function buildRadialMachineRack(
  planned: PlannedRecipe,
  items: PlannedRecipe["ingredientRates"],
  beltName: string,
): MachineRack | undefined {
  if (planned.machineCount !== 1 || items.length < 3 || items.length > 8) return undefined;
  const face = buildFaceMachineRack(planned, items, beltName);
  if (face) return face;
  const outputArms = planned.materialType === "item"
    ? armsFor(planned.outputPerSecond, 1, SAFE_BULK_ITEMS_PER_SECOND)
    : 0;
  const required = items.map((ingredient) => ({
    ingredient,
    arms: armsFor(ingredient.perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND),
  }));
  if (outputArms > 1 || required.some((entry) => entry.arms !== 1)) return undefined;
  const drafts: Draft[] = [{
    role: "machine",
    material: planned.material,
    recipe: planned.recipe.id,
    name: planned.recipe.machine.name,
    position: tilePosition(0, 0),
    direction: 0,
    recipeSetting: planned.recipe.id,
  }];
  const slots: Array<{
    inserter: Tile;
    belt: Tile;
    direction: CardinalDirection;
    inserterDirection: CardinalDirection;
  }> = [
    { inserter: { x: -1, y: -2 }, belt: { x: -1, y: -3 }, direction: 8, inserterDirection: 0 },
    { inserter: { x: 0, y: -2 }, belt: { x: 0, y: -3 }, direction: 8, inserterDirection: 0 },
    { inserter: { x: 1, y: -2 }, belt: { x: 1, y: -3 }, direction: 8, inserterDirection: 0 },
    { inserter: { x: -1, y: 2 }, belt: { x: -1, y: 3 }, direction: 0, inserterDirection: 8 },
    { inserter: { x: 0, y: 2 }, belt: { x: 0, y: 3 }, direction: 0, inserterDirection: 8 },
    { inserter: { x: 1, y: 2 }, belt: { x: 1, y: 3 }, direction: 0, inserterDirection: 8 },
    { inserter: { x: -2, y: -1 }, belt: { x: -3, y: -1 }, direction: 4, inserterDirection: 12 },
    { inserter: { x: -2, y: 0 }, belt: { x: -3, y: 0 }, direction: 4, inserterDirection: 12 },
    { inserter: { x: -2, y: 1 }, belt: { x: -3, y: 1 }, direction: 4, inserterDirection: 12 },
    { inserter: { x: 2, y: -1 }, belt: { x: 3, y: -1 }, direction: 12, inserterDirection: 4 },
    { inserter: { x: 2, y: 1 }, belt: { x: 3, y: 1 }, direction: 12, inserterDirection: 4 },
  ];
  // Array.sort is stable. Preserve the recipe's ingredient order when rates
  // tie so physical synthesis is independent of Factorio prototype names.
  const inputs = new Map<string, Rail>();
  const additionalInputs = new Map<string, Rail[]>();
  let slotIndex = 0;
  for (const { ingredient, arms } of required.sort((left, right) => right.arms - left.arms)) {
    for (let arm = 0; arm < arms; arm += 1) {
      const slot = slots[slotIndex++];
      drafts.push({
        role: "input-inserter",
        material: ingredient.name,
        recipe: planned.recipe.id,
        name: "bulk-inserter",
        position: tilePosition(slot.inserter.x, slot.inserter.y),
        direction: slot.inserterDirection,
      });
      drafts.push({ role: "ingredient-feeder", material: ingredient.name, name: beltName,
        position: tilePosition(slot.belt.x, slot.belt.y), direction: slot.direction });
      const rail: Rail = {
        material: ingredient.name,
        type: "item",
        start: slot.belt,
        end: slot.belt,
        direction: slot.direction,
        demandPerSecond: ingredient.perSecond / arms,
      };
      if (!inputs.has(ingredient.name)) inputs.set(ingredient.name, rail);
      else additionalInputs.set(ingredient.name, [...(additionalInputs.get(ingredient.name) ?? []), rail]);
    }
  }
  drafts.push({ role: "output-inserter", material: planned.material, recipe: planned.recipe.id,
    name: "bulk-inserter", position: tilePosition(2, 0), direction: 12 });
  drafts.push({ role: "output-belt", material: planned.material, name: beltName,
    position: tilePosition(3, 0), direction: 4 });
  // Radial racks deliberately use several small poles. A single pole beside a
  // 3x3 machine does not cover the diagonal long-handed inserter slots.
  for (const pole of [{ x: 2, y: -2 }, { x: -2, y: 2 }, { x: 2, y: 2 }]) {
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(pole.x, pole.y) });
  }
  const output: Rail = {
    material: planned.material,
    type: "item",
    start: { x: 3, y: 0 },
    end: { x: 3, y: 0 },
    direction: 4,
  };
  return rackFromDrafts(planned, drafts, inputs, output, true, additionalInputs);
}

function buildFluidMachineRack(
  planned: PlannedRecipe,
  items: PlannedRecipe["ingredientRates"],
  fluids: PlannedRecipe["ingredientRates"],
  beltName: string,
): MachineRack | undefined {
  if (items.length > 3 || fluids.length > 2 ||
    (fluids.length > 1 && planned.recipe.machine.name !== "chemical-plant") ||
    (planned.materialType === "fluid" && planned.recipe.machine.name !== "chemical-plant")) return undefined;
  const undergroundName = beltName === "transport-belt" ? "underground-belt" :
    beltName === "fast-transport-belt" ? "fast-underground-belt" : "express-underground-belt";
  let machineCount = planned.machineCount;
  while (machineCount < planned.machineCount + 256) {
    const itemFits = items.every((ingredient, index) => ingredient.perSecond / machineCount <=
      (index === 0 ? SAFE_BULK_ITEMS_PER_SECOND : SAFE_LONG_ITEMS_PER_SECOND) + 1e-9);
    const outputFits = planned.materialType === "fluid" ||
      planned.outputPerSecond / machineCount <= SAFE_BULK_ITEMS_PER_SECOND + 1e-9;
    if (itemFits && outputFits) break;
    machineCount += 1;
  }
  const machineXs = Array.from({ length: machineCount }, (_, index) => index * 6);
  const lastMachineX = machineXs.at(-1)!;
  const drafts: Draft[] = [];
  const inputs = new Map<string, Rail>();
  items.forEach((ingredient, index) => {
    inputs.set(ingredient.name, addHorizontalRail(
      drafts,
      "ingredient-feeder",
      ingredient.name,
      beltName,
      -2,
      lastMachineX + 3,
      index < 2 ? 3 + index : -4,
    ));
  });
  fluids.forEach((fluid, fluidIndex) => {
    const y = -5 - (items.length >= 3 ? 2 : 0) - fluidIndex * 2;
    for (let x = -2 - fluidIndex * 2; x <= lastMachineX + (planned.recipe.machine.name === "chemical-plant"
      ? fluidIndex === 0 ? -1 : 1 : 0); x += 1) {
      drafts.push({ role: "pipe", material: fluid.name, name: "pipe", position: tilePosition(x, y) });
    }
    inputs.set(fluid.name, {
      material: fluid.name,
      type: "fluid",
      start: { x: -2 - fluidIndex * 2, y },
      end: { x: lastMachineX + (planned.recipe.machine.name === "chemical-plant"
        ? fluidIndex === 0 ? -1 : 1 : 0), y },
      direction: 4,
    });
  });
  let output: Rail;
  if (planned.materialType === "item") {
    output = addHorizontalRail(drafts, "output-belt", planned.material, beltName, 3, lastMachineX + 3, 6);
  } else {
    for (let x = -1; x <= lastMachineX + 3; x += 1) {
      drafts.push({ role: "pipe", material: planned.material, recipe: planned.recipe.id,
        name: "pipe", position: tilePosition(x, 7) });
    }
    output = {
      material: planned.material,
      type: "fluid",
      start: { x: -1, y: 7 },
      end: { x: lastMachineX + 3, y: 7 },
      direction: 4,
    };
  }
  for (const x of machineXs) {
    drafts.push({ role: "machine", material: planned.material, recipe: planned.recipe.id,
      name: planned.recipe.machine.name, position: tilePosition(x, 0), direction: 0,
      recipeSetting: planned.recipe.id });
    items.forEach((ingredient, index) => drafts.push({
      role: "input-inserter",
      material: ingredient.name,
      recipe: planned.recipe.id,
      name: index === 0 ? "bulk-inserter" : "long-handed-inserter",
      position: index < 2 ? tilePosition(x + index, 2) : tilePosition(x + 1, -2),
      direction: index < 2 ? 8 : 0,
    }));
    fluids.forEach((fluid, fluidIndex) => {
      const connectorX = planned.recipe.machine.name === "chemical-plant"
        ? x + (fluidIndex === 0 ? -1 : 1)
        : x;
      if (planned.recipe.machine.name !== "chemical-plant" && fluids.length === 1) {
        // An assembling machine's north fluid socket is only three surface
        // tiles from this rack's header. A short pipe branch is both smaller
        // in fluid-system complexity and unambiguous about which side of a
        // pipe-to-ground is exposed to the machine.
        const headerY = -5 - (items.length >= 3 ? 2 : 0) - fluidIndex * 2;
        if (items.length >= 3) {
          drafts.push({ role: "pipe-to-ground", material: fluid.name, recipe: planned.recipe.id,
            name: "pipe-to-ground", position: tilePosition(connectorX, headerY + 1), direction: 0 });
          drafts.push({ role: "pipe-to-ground", material: fluid.name, recipe: planned.recipe.id,
            name: "pipe-to-ground", position: tilePosition(connectorX, -3), direction: 8 });
          drafts.push({ role: "pipe", material: fluid.name, recipe: planned.recipe.id,
            name: "pipe", position: tilePosition(connectorX, -2) });
        } else {
          for (let branchY = headerY + 1; branchY <= -2; branchY += 1) {
            drafts.push({ role: "pipe", material: fluid.name, recipe: planned.recipe.id,
              name: "pipe", position: tilePosition(connectorX, branchY) });
          }
        }
      } else {
        drafts.push({ role: "pipe-to-ground", material: fluid.name, recipe: planned.recipe.id,
          name: "pipe-to-ground", position: tilePosition(
            connectorX,
            -4 - (items.length >= 3 ? 2 : 0) - fluidIndex * 2,
          ), direction: 0 });
        drafts.push({ role: "pipe-to-ground", material: fluid.name, recipe: planned.recipe.id,
          name: "pipe-to-ground", position: tilePosition(connectorX, -2), direction: 8 });
      }
    });
    if (planned.materialType === "item") {
      drafts.push({ role: "output-inserter", material: planned.material, recipe: planned.recipe.id,
        name: "bulk-inserter", position: tilePosition(x + 2, 0), direction: 12 });
      drafts.push({ role: "output-belt", material: planned.material, name: beltName,
        position: tilePosition(x + 3, 0), direction: 8 });
      drafts.push({ role: "output-belt", material: planned.material, name: beltName,
        position: tilePosition(x + 3, 1), direction: 8 });
      drafts.push({ role: "underground-belt", material: planned.material, name: undergroundName,
        position: tilePosition(x + 3, 2), direction: 8, undergroundType: "input" });
      drafts.push({ role: "underground-belt", material: planned.material, name: undergroundName,
        position: tilePosition(x + 3, 5), direction: 8, undergroundType: "output" });
    } else {
      drafts.push({ role: "pipe-to-ground", material: planned.material, recipe: planned.recipe.id,
        name: "pipe-to-ground", position: tilePosition(x - 1, 2), direction: 0 });
      drafts.push({ role: "pipe-to-ground", material: planned.material, recipe: planned.recipe.id,
        name: "pipe-to-ground", position: tilePosition(x - 1, 6), direction: 8 });
    }
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(x + 2, 1) });
  }
  return rackFromDrafts(planned, drafts, inputs, output, false);
}

/**
 * Packs two low-rate ingredients onto opposite lanes of one belt. The two
 * material-specific stubs side-load from opposite sides, so a boundary belt
 * carrying items on both lanes cannot contaminate the other ingredient's
 * lane. This is selected from rates and port geometry only.
 */
function buildMixedLaneMachineRack(
  planned: PlannedRecipe,
  items: PlannedRecipe["ingredientRates"],
  beltName: string,
): MachineRack | undefined {
  if (items.length !== 2 || planned.materialType !== "item") return undefined;
  const beltCapacity = Object.values(BELTS).find((belt) => belt.entityName === beltName)?.itemsPerSecond ?? 45;
  const machineCount = planned.machineCount;
  const perMachineInput = (items[0].perSecond + items[1].perSecond) / machineCount;
  const perMachineOutput = planned.outputPerSecond / machineCount;
  if (items.some((ingredient) => ingredient.perSecond > beltCapacity / 2 + 1e-9) ||
    perMachineInput > SAFE_BULK_ITEMS_PER_SECOND + 1e-9 ||
    perMachineOutput > SAFE_BULK_ITEMS_PER_SECOND + 1e-9) return undefined;

  const pitch = 3;
  const lastMachineX = (machineCount - 1) * pitch;
  const drafts: Draft[] = [];
  const mix = `mix:${[items[0].name, items[1].name].sort().join("|")}`;
  for (let x = -4; x <= lastMachineX + 2; x += 1) {
    drafts.push({ role: "ingredient-feeder", material: mix, name: beltName,
      position: tilePosition(x, -3), direction: 4 });
  }
  // Opposite side loads populate opposite lanes of the shared belt.
  for (const y of [-5, -4]) {
    drafts.push({ role: "ingredient-feeder", material: items[0].name, name: beltName,
      position: tilePosition(-4, y), direction: 8 });
  }
  for (const y of [0, -1, -2]) {
    drafts.push({ role: "ingredient-feeder", material: items[1].name, name: beltName,
      position: tilePosition(-4, y), direction: 0 });
  }
  const inputs = new Map<string, Rail>([
    [items[0].name, { material: items[0].name, type: "item", start: { x: -4, y: -5 },
      end: { x: -4, y: -4 }, direction: 8 }],
    [items[1].name, { material: items[1].name, type: "item", start: { x: -4, y: 0 },
      end: { x: -4, y: -2 }, direction: 0 }],
  ]);
  const output = addHorizontalRail(
    drafts,
    "output-belt",
    planned.material,
    beltName,
    -2,
    lastMachineX + 2,
    3,
  );
  for (let machine = 0; machine < machineCount; machine += 1) {
    const x = machine * pitch;
    drafts.push({ role: "machine", material: planned.material, recipe: planned.recipe.id,
      name: planned.recipe.machine.name, position: tilePosition(x, 0), direction: 0,
      recipeSetting: planned.recipe.id });
    drafts.push({ role: "input-inserter", material: mix, recipe: planned.recipe.id,
      name: "bulk-inserter", position: tilePosition(x, -2), direction: 0 });
    drafts.push({ role: "output-inserter", material: planned.material, recipe: planned.recipe.id,
      name: "bulk-inserter", position: tilePosition(x, 2), direction: 0 });
  }
  for (let x = 6; x <= lastMachineX + 1; x += 16) {
    drafts.push({ role: "power-pole", name: "substation", position: tilePosition(x, -5) });
  }
  if (!drafts.some((draft) => draft.role === "power-pole")) {
    drafts.push({ role: "power-pole", name: "substation",
      position: tilePosition(Math.floor(lastMachineX / 2), -5) });
  }
  return rackFromDrafts(planned, drafts, inputs, output);
}

function buildDirectPairRack(
  source: PlannedRecipe,
  consumer: PlannedRecipe,
  beltName: string,
): MachineRack | undefined {
  const sourceInputs = source.ingredientRates.filter((ingredient) => ingredient.type === "item");
  const consumerInputs = consumer.ingredientRates.filter((ingredient) => ingredient.type === "item");
  const other = consumerInputs.filter((ingredient) => ingredient.name !== source.material);
  const direct = consumerInputs.find((ingredient) => ingredient.name === source.material);
  if (source.materialType !== "item" || consumer.materialType !== "item" ||
    source.ingredientRates.some((ingredient) => ingredient.type !== "item") ||
    consumer.ingredientRates.some((ingredient) => ingredient.type !== "item") ||
    sourceInputs.length !== 1 || consumerInputs.length !== 2 || other.length !== 1 || !direct ||
    source.machineCount !== 1 || consumer.machineCount !== 1) return undefined;
  const sourceInputArms = armsFor(sourceInputs[0].perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND);
  const directArms = armsFor(direct.perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND);
  const otherArms = armsFor(other[0].perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND);
  const outputArms = armsFor(consumer.outputPerSecond, 1, SAFE_BULK_ITEMS_PER_SECOND);
  if (sourceInputArms > 3 || directArms > 3 || otherArms > 3 || outputArms > 3) return undefined;

  const drafts: Draft[] = [];
  const inputs = new Map<string, Rail>();
  inputs.set(sourceInputs[0].name, addHorizontalRail(
    drafts, "ingredient-feeder", sourceInputs[0].name, beltName, -2, 2, -3,
  ));
  inputs.set(other[0].name, addHorizontalRail(
    drafts, "ingredient-feeder", other[0].name, beltName, 2, 6, 3,
  ));
  drafts.push({ role: "machine", material: source.material, recipe: source.recipe.id,
    name: source.recipe.machine.name, position: tilePosition(0, 0), direction: 0,
    recipeSetting: source.recipe.id });
  drafts.push({ role: "machine", material: consumer.material, recipe: consumer.recipe.id,
    name: consumer.recipe.machine.name, position: tilePosition(4, 0), direction: 0,
    recipeSetting: consumer.recipe.id });
  for (let arm = 0; arm < sourceInputArms; arm += 1) {
    drafts.push({ role: "input-inserter", material: sourceInputs[0].name, recipe: source.recipe.id,
      name: "bulk-inserter", position: tilePosition([-1, 0, 1][arm], -2), direction: 0 });
  }
  for (let arm = 0; arm < directArms; arm += 1) {
    drafts.push({ role: "output-inserter", material: source.material, recipe: source.recipe.id,
      name: "bulk-inserter", position: tilePosition(2, [-1, 0, 1][arm]), direction: 12 });
  }
  for (let arm = 0; arm < otherArms; arm += 1) {
    drafts.push({ role: "input-inserter", material: other[0].name, recipe: consumer.recipe.id,
      name: "bulk-inserter", position: tilePosition(4 + [-1, 0, 1][arm], 2), direction: 8 });
  }
  for (let y = -1; y <= 1; y += 1) {
    drafts.push({ role: "output-belt", material: consumer.material, name: beltName,
      position: tilePosition(7, y), direction: 8 });
  }
  for (let arm = 0; arm < outputArms; arm += 1) {
    drafts.push({ role: "output-inserter", material: consumer.material, recipe: consumer.recipe.id,
      name: "bulk-inserter", position: tilePosition(6, [-1, 0, 1][arm]), direction: 12 });
  }
  drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(-2, 0) });
  drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(2, 2) });
  drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(6, 2) });
  return rackFromDrafts(consumer, drafts, inputs, {
    material: consumer.material,
    type: "item",
    start: { x: 7, y: -1 },
    end: { x: 7, y: 1 },
    direction: 8,
  }, false);
}

/**
 * Packs a one-machine producer directly against a one-machine consumer while
 * allocating every remaining machine face from rate-derived inserter counts.
 * This covers the common human "mall stack" topology without knowing which
 * products happen to use it.
 */
function buildGeneralDirectPairRack(
  source: PlannedRecipe,
  consumer: PlannedRecipe,
  beltName: string,
): MachineRack | undefined {
  const sourceInputs = source.ingredientRates.filter((ingredient) => ingredient.type === "item");
  const consumerInputs = consumer.ingredientRates.filter((ingredient) => ingredient.type === "item");
  const other = consumerInputs.filter((ingredient) => ingredient.name !== source.material);
  const direct = consumerInputs.find((ingredient) => ingredient.name === source.material);
  const sharedExternal = sourceInputs.some((ingredient) =>
    other.some((candidate) => candidate.name === ingredient.name));
  if (source.materialType !== "item" || consumer.materialType !== "item" ||
    source.ingredientRates.some((ingredient) => ingredient.type !== "item") ||
    consumer.ingredientRates.some((ingredient) => ingredient.type !== "item") ||
    source.machineCount !== 1 || consumer.machineCount !== 1 || !direct ||
    !sharedExternal ||
    sourceInputs.length < 1 || sourceInputs.length > 3 || other.length < 1 || other.length > 3 ||
    armsFor(direct.perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND) > 3 ||
    armsFor(consumer.outputPerSecond, 1, SAFE_BULK_ITEMS_PER_SECOND) > 1 ||
    sourceInputs.some((ingredient) => armsFor(ingredient.perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND) > 3) ||
    other.some((ingredient) => armsFor(ingredient.perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND) > 3)) return undefined;

  const drafts: Draft[] = [];
  const inputs = new Map<string, Rail>();
  const additionalInputs = new Map<string, Rail[]>();
  const register = (ingredient: typeof sourceInputs[number], rail: Rail): void => {
    const withDemand = { ...rail, demandPerSecond: ingredient.perSecond };
    if (!inputs.has(ingredient.name)) inputs.set(ingredient.name, withDemand);
    else additionalInputs.set(ingredient.name,
      [...(additionalInputs.get(ingredient.name) ?? []), withDemand]);
  };
  const addFace = (centerX: number, ingredient: typeof sourceInputs[number],
    face: "north" | "south" | "west"): void => {
    const armCount = armsFor(ingredient.perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND);
    if (face === "north" || face === "south") {
      const y = face === "north" ? -3 : 3;
      const rail = addHorizontalRail(drafts, "ingredient-feeder", ingredient.name, beltName,
        centerX - 1, centerX + 1, y);
      register(ingredient, { ...rail, demandPerSecond: ingredient.perSecond });
      [-1, 0, 1].slice(0, armCount).forEach((offset) => drafts.push({
        role: "input-inserter", material: ingredient.name, recipe: centerX === 0 ? source.recipe.id : consumer.recipe.id,
        name: "bulk-inserter", position: tilePosition(centerX + offset, face === "north" ? -2 : 2),
        direction: face === "north" ? 0 : 8,
      }));
      return;
    }
    for (let y = -1; y <= 1; y += 1) drafts.push({
      role: "ingredient-feeder", material: ingredient.name, name: beltName,
      position: tilePosition(centerX - 3, y), direction: 8,
    });
    register(ingredient, { material: ingredient.name, type: "item",
      start: { x: centerX - 3, y: -1 }, end: { x: centerX - 3, y: 1 }, direction: 8 });
    [-1, 0, 1].slice(0, armCount).forEach((offset) => drafts.push({
      role: "input-inserter", material: ingredient.name, recipe: centerX === 0 ? source.recipe.id : consumer.recipe.id,
      name: "bulk-inserter", position: tilePosition(centerX - 2, offset), direction: 12,
    }));
  };

  const sourceFaces = ["north", "south", "west"] as const;
  const sourceFaceByMaterial = new Map<string, typeof sourceFaces[number]>();
  const orderedSourceInputs = [...sourceInputs].sort((left, right) => {
    const leftShared = other.some((ingredient) => ingredient.name === left.name);
    const rightShared = other.some((ingredient) => ingredient.name === right.name);
    return Number(rightShared) - Number(leftShared);
  });
  orderedSourceInputs.forEach((ingredient, index) => {
    const face = sourceFaces[index];
    sourceFaceByMaterial.set(ingredient.name, face);
    addFace(0, ingredient, face);
  });
  const consumerAssignments = new Map<typeof other[number], "north" | "south" | "east">();
  const usedConsumerFaces = new Set<"north" | "south" | "east">();
  // Preserve shared lanes straight across both machines whenever the source
  // already uses a horizontal face. This is an integrated graph decision: it
  // removes two external branches and their splitter without product names.
  for (const ingredient of other) {
    const sourceFace = sourceFaceByMaterial.get(ingredient.name);
    if ((sourceFace === "north" || sourceFace === "south") && !usedConsumerFaces.has(sourceFace)) {
      consumerAssignments.set(ingredient, sourceFace);
      usedConsumerFaces.add(sourceFace);
    }
  }
  const remainingOther = other.filter((ingredient) => !consumerAssignments.has(ingredient))
    .sort((left, right) => armsFor(right.perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND) -
      armsFor(left.perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND));
  for (const ingredient of remainingOther) {
    const regularFace = (["north", "south"] as const).find((face) => !usedConsumerFaces.has(face));
    if (regularFace) {
      consumerAssignments.set(ingredient, regularFace);
      usedConsumerFaces.add(regularFace);
      continue;
    }
    if (!usedConsumerFaces.has("east") &&
      armsFor(ingredient.perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND) === 1) {
      consumerAssignments.set(ingredient, "east");
      usedConsumerFaces.add("east");
      continue;
    }
    return undefined;
  }
  for (const [ingredient, face] of consumerAssignments) {
    if (face !== "east") {
      addFace(4, ingredient, face);
      const sourceFace = sourceFaceByMaterial.get(ingredient.name);
      if (sourceFace === face) {
        const y = face === "north" ? -3 : 3;
        drafts.push({ role: "ingredient-feeder", material: ingredient.name, name: beltName,
          position: tilePosition(2, y), direction: 4 });
        const primary = inputs.get(ingredient.name)!;
        primary.end = { x: 5, y };
        primary.demandPerSecond = (sourceInputs.find((entry) => entry.name === ingredient.name)?.perSecond ?? 0) +
          ingredient.perSecond;
        additionalInputs.delete(ingredient.name);
      }
      continue;
    }
    drafts.push({ role: "ingredient-feeder", material: ingredient.name, name: beltName,
      position: tilePosition(7, -1), direction: 12 });
    drafts.push({ role: "input-inserter", material: ingredient.name, recipe: consumer.recipe.id,
      name: "bulk-inserter", position: tilePosition(6, -1), direction: 4 });
    register(ingredient, { material: ingredient.name, type: "item", start: { x: 7, y: -1 },
      end: { x: 7, y: -1 }, direction: 12 });
  }
  drafts.push({ role: "machine", material: source.material, recipe: source.recipe.id,
    name: source.recipe.machine.name, position: tilePosition(0, 0), direction: 0,
    recipeSetting: source.recipe.id });
  drafts.push({ role: "machine", material: consumer.material, recipe: consumer.recipe.id,
    name: consumer.recipe.machine.name, position: tilePosition(4, 0), direction: 0,
    recipeSetting: consumer.recipe.id });
  const directArms = armsFor(direct.perSecond, 1, SAFE_BULK_ITEMS_PER_SECOND);
  [-1, 0, 1].slice(0, directArms).forEach((offset) => drafts.push({
    role: "output-inserter", material: source.material, recipe: source.recipe.id,
    name: "bulk-inserter", position: tilePosition(2, offset), direction: 12,
  }));
  drafts.push({ role: "output-inserter", material: consumer.material, recipe: consumer.recipe.id,
    name: "bulk-inserter", position: tilePosition(6, 0), direction: 12 });
  drafts.push({ role: "output-belt", material: consumer.material, name: beltName,
    position: tilePosition(7, 0), direction: 4 });
  for (const pole of [{ x: -2, y: 2 }, { x: 2, y: -2 }, { x: 6, y: 2 }]) {
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(pole.x, pole.y) });
  }
  const rack = rackFromDrafts(consumer, drafts, inputs, {
    material: consumer.material, type: "item", start: { x: 7, y: 0 }, end: { x: 7, y: 0 }, direction: 4,
    supplyPerSecond: consumer.outputPerSecond,
  }, false, additionalInputs);
  return rackTerminalsDoNotConflict(rack) ? rack : undefined;
}

/**
 * Builds only the physical ports immediately surrounding individual machine
 * instances. It deliberately has no boundary trunks, child interfaces, output
 * escape, or independently meaningful envelope: all of those belong to the
 * single factory-wide material state below.
 */
function buildSingleMachineRack(
  planned: PlannedRecipe,
  beltName: string,
  terminalMaterials: ReadonlySet<string>,
  compactInternalTopologies: boolean,
): MachineRack | undefined {
  const fluids = planned.ingredientRates.filter((ingredient) => ingredient.type === "fluid");
  const items = [...planned.ingredientRates]
    .filter((ingredient) => ingredient.type === "item")
    .sort((left, right) => right.perSecond - left.perSecond);
  if (fluids.length > 0 || planned.materialType === "fluid") {
    return buildFluidMachineRack(planned, items, fluids, beltName);
  }
  if (planned.materialType !== "item") return undefined;
  if (items.length >= 3) {
    const radial = compactInternalTopologies || items.every((ingredient) => terminalMaterials.has(ingredient.name))
      ? buildRadialMachineRack(planned, items, beltName)
      : undefined;
    if (radial) return radial;
  }
  if (items.length > 4) return undefined;
  // Mixed lanes are deliberately limited to boundary-fed recipes. When both
  // lane materials are produced inside the same graph, independent fan-out
  // routes can fill one lane while starving the other at a downstream pickup;
  // a geometrically connected belt is not then a live-throughput guarantee.
  const mixed = items.every((ingredient) => terminalMaterials.has(ingredient.name))
    ? buildMixedLaneMachineRack(planned, items, beltName)
    : undefined;
  if (mixed) return mixed;

  const machineCount = transportSizedMachineCount(planned, items);
  const sideOutput = items.length >= 2;
  const machinePitch = sideOutput ? 6 : 4;
  const lastMachineX = (machineCount - 1) * machinePitch;
  const railStartX = -2;
  const railEndX = lastMachineX + (sideOutput ? 3 : 2);
  const drafts: Draft[] = [];
  const inputs = new Map<string, Rail>();
  const inputYs = items.length === 2 ? [-3, 3] : sideOutput ? [-3, 3, -4, 4] : [-3];
  items.forEach((ingredient, index) => {
    inputs.set(ingredient.name, addHorizontalRail(
      drafts,
      "ingredient-feeder",
      ingredient.name,
      beltName,
      railStartX,
      railEndX,
      inputYs[index],
    ));
  });
  const output = addHorizontalRail(
    drafts,
    "output-belt",
    planned.material,
    beltName,
    sideOutput ? 3 : railStartX,
    railEndX,
    sideOutput ? 6 : 3,
  );

  for (let machine = 0; machine < machineCount; machine += 1) {
    const x = machine * machinePitch;
    drafts.push({
      role: "machine",
      material: planned.material,
      recipe: planned.recipe.id,
      name: planned.recipe.machine.name,
      position: tilePosition(x, 0),
      direction: 0,
      recipeSetting: planned.recipe.id,
    });
    const northSlots = [-1, 0, 1];
    const southSlots = [-1, 0, 1];
    items.forEach((ingredient, index) => {
      const south = items.length === 2 ? index === 1 : sideOutput ? index === 1 || index === 3 : false;
      const long = items.length >= 3 && index >= 2;
      const slots = south ? southSlots : northSlots;
      const capacity = long ? SAFE_LONG_ITEMS_PER_SECOND : SAFE_BULK_ITEMS_PER_SECOND;
      const armCount = armsFor(ingredient.perSecond, machineCount, capacity);
      for (let arm = 0; arm < armCount; arm += 1) {
        const offset = slots.shift();
        if (offset === undefined) throw new Error(`${planned.recipe.id} overflowed an input face.`);
        drafts.push({
          role: "input-inserter",
          material: ingredient.name,
          recipe: planned.recipe.id,
          name: long ? "long-handed-inserter" : "bulk-inserter",
          position: tilePosition(x + offset, south ? 2 : -2),
          direction: south ? 8 : 0,
        });
      }
    });
    const outputArms = armsFor(planned.outputPerSecond, machineCount, SAFE_BULK_ITEMS_PER_SECOND);
    for (let arm = 0; arm < outputArms; arm += 1) {
      drafts.push({
        role: "output-inserter",
        material: planned.material,
        recipe: planned.recipe.id,
        name: "bulk-inserter",
        position: sideOutput ? tilePosition(x + 2, [-1, 0, 1][arm]) : tilePosition(x + [-1, 0, 1][arm], 2),
        direction: sideOutput ? 12 : 0,
      });
    }
    if (sideOutput) {
      drafts.push({ role: "output-belt", material: planned.material, name: beltName,
        position: tilePosition(x + 3, -1), direction: 8 });
      drafts.push({ role: "output-belt", material: planned.material, name: beltName,
        position: tilePosition(x + 3, 0), direction: 8 });
      drafts.push({ role: "output-belt", material: planned.material, name: beltName,
        position: tilePosition(x + 3, 1), direction: 8 });
      drafts.push({ role: "underground-belt", material: planned.material, name: beltName === "transport-belt"
        ? "underground-belt" : beltName === "fast-transport-belt" ? "fast-underground-belt" : "express-underground-belt",
      position: tilePosition(x + 3, 2), direction: 8, undergroundType: "input" });
      drafts.push({ role: "underground-belt", material: planned.material, name: beltName === "transport-belt"
        ? "underground-belt" : beltName === "fast-transport-belt" ? "fast-underground-belt" : "express-underground-belt",
      position: tilePosition(x + 3, 5), direction: 8, undergroundType: "output" });
    }
    drafts.push({ role: "power-pole", name: "medium-electric-pole",
      position: sideOutput ? tilePosition(x - 2, 0) : tilePosition(x + 2, 1) });
    if (sideOutput) {
      // A medium pole on the input side cannot reach the far-face output
      // arms (four tiles away). A second pole closes that real supply gap.
      drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(x + 2, 2) });
    }
  }

  return rackFromDrafts(planned, drafts, inputs, output);
}

/**
 * Partitions a rate-heavy recipe into independently routed machine rows. A
 * conventional one-sided inserter manifold can reliably populate one belt
 * lane, not an entire belt; using that physical limit here prevents the
 * planner from promising throughput which the placed entities cannot carry.
 *
 * The partition is derived solely from rates, machine counts, and the chosen
 * belt. No recipe identities or pre-authored layouts participate.
 */
function buildMachineRack(
  planned: PlannedRecipe,
  beltName: string,
  terminalMaterials: ReadonlySet<string>,
  compactInternalTopologies: boolean,
): MachineRack | undefined {
  const beltCapacity = Object.values(BELTS)
    .find((candidate) => candidate.entityName === beltName)?.itemsPerSecond ?? 45;
  const laneCapacity = beltCapacity / 2;
  // Inserters can draw from both lanes of an input belt, while inserters
  // dropping from one machine face populate one output lane. Keep those two
  // physical capacities distinct instead of duplicating every input row at
  // half-belt throughput.
  const inputChannels = Math.max(1, ...planned.ingredientRates
    .filter((ingredient) => ingredient.type === "item")
    .map((ingredient) => Math.ceil(ingredient.perSecond / beltCapacity - 1e-12)));
  const outputChannels = planned.materialType === "item"
    ? Math.max(1, Math.ceil(planned.outputPerSecond / laneCapacity - 1e-12))
    : 1;
  const channelCount = Math.max(inputChannels, outputChannels);
  if (channelCount === 1 || planned.machineCount === 1 ||
    planned.ingredientRates.some((ingredient) => ingredient.type === "fluid") ||
    planned.materialType === "fluid") {
    return buildSingleMachineRack(planned, beltName, terminalMaterials, compactInternalTopologies);
  }

  const actualChannels = Math.min(channelCount, planned.machineCount);
  const base = Math.floor(planned.machineCount / actualChannels);
  const remainder = planned.machineCount % actualChannels;
  const shards: MachineRack[] = [];
  for (let index = 0; index < actualChannels; index += 1) {
    const machineCount = base + (index < remainder ? 1 : 0);
    const fraction = machineCount / planned.machineCount;
    const shardPlan: PlannedRecipe = {
      ...planned,
      machineCount,
      outputPerSecond: planned.outputPerSecond * fraction,
      designedOutputPerSecond: planned.designedOutputPerSecond * fraction,
      craftsPerSecond: planned.craftsPerSecond * fraction,
      ingredientRates: planned.ingredientRates.map((ingredient) => ({
        ...ingredient,
        perSecond: ingredient.perSecond * fraction,
      })),
    };
    // Parallel rows need directional bundle ports. Compact point/radial
    // feeders are excellent for one row but force long detours when several
    // rows share a full-belt channel, so derive the shard seam from the plain
    // face rack and let the rate coalescer build the common manifolds.
    const shard = buildSingleMachineRack(shardPlan, beltName, new Set(), compactInternalTopologies);
    if (!shard) return undefined;
    // Alternate which physical side feeds each output belt. Splitters preserve
    // lane identity, so this gives a later merger both lanes instead of
    // collapsing several nominal channels onto one 22.5 item/s lane.
    shards.push(index % 2 === 0 ? shard : mirrorRackVertically(shard));
  }

  const drafts: Draft[] = [];
  const inputs = new Map<string, Rail>();
  const additionalInputs = new Map<string, Rail[]>();
  const outputs: Rail[] = [];
  let nextMinimumY = 0;
  for (const [index, shard] of shards.entries()) {
    const offsetY = nextMinimumY - shard.minimumY;
    const translateRail = (rail: Rail): Rail => ({
      ...rail,
      start: { x: rail.start.x, y: rail.start.y + offsetY },
      end: { x: rail.end.x, y: rail.end.y + offsetY },
    });
    drafts.push(...shard.drafts.map((draft) => ({
      ...draft,
      position: { x: draft.position.x, y: draft.position.y + offsetY },
    })));
    for (const ingredient of shard.planned.ingredientRates) {
      const rail = shard.inputs.get(ingredient.name);
      if (!rail) continue;
      const translated = {
        ...translateRail(rail),
        demandPerSecond: ingredient.perSecond,
      };
      if (!inputs.has(ingredient.name)) inputs.set(ingredient.name, translated);
      else {
        const extras = additionalInputs.get(ingredient.name) ?? [];
        extras.push(translated);
        additionalInputs.set(ingredient.name, extras);
      }
    }
    const output = {
      ...translateRail(shard.output),
      supplyPerSecond: shard.planned.outputPerSecond,
    };
    outputs.push(output);
    nextMinimumY += shard.maximumY - shard.minimumY + 3;
    // Keep the first port selection stable and spatial, never name-based.
    if (index === 0) outputs[0] = output;
  }
  const inputMaterials = [...inputs.keys()];
  const baseRackLeftEdge = Math.min(...drafts.flatMap(occupiedDraftTiles).map((tile) => tile.x));
  const localReserved = new Set<string>();
  const localReservedOwners = new Map<string, Set<string>>();
  const reserveLocal = (tile: Tile, material: string): void => {
    const key = `${tile.x},${tile.y}`;
    localReserved.add(key);
    const owners = localReservedOwners.get(key) ?? new Set<string>();
    owners.add(material);
    localReservedOwners.set(key, owners);
  };
  for (const material of inputMaterials) {
    for (const rail of [inputs.get(material)!, ...(additionalInputs.get(material) ?? [])]) {
      const vector = directionVector(rail.direction);
      reserveLocal({ x: rail.start.x - vector.x, y: rail.start.y - vector.y }, material);
      reserveLocal({ x: rail.end.x + vector.x, y: rail.end.y + vector.y }, material);
    }
  }
  for (const rail of outputs) {
    const vector = directionVector(rail.direction);
    reserveLocal({ x: rail.end.x + vector.x, y: rail.end.y + vector.y }, rail.material);
  }
  for (const [materialIndex, material] of inputMaterials.entries()) {
    const rails = [inputs.get(material)!, ...(additionalInputs.get(material) ?? [])]
      .sort((left, right) => left.start.y - right.start.y);
    const totalDemand = rails.reduce((sum, rail) => sum + (rail.demandPerSecond ?? 0), 0);
    const minimumInputChannels = Math.max(1, Math.ceil(totalDemand / beltCapacity - 1e-12));
    if (rails.length <= minimumInputChannels) continue;
    const groups = Array.from({ length: minimumInputChannels }, (_, groupIndex) => {
      const from = Math.floor(groupIndex * rails.length / minimumInputChannels);
      const to = Math.floor((groupIndex + 1) * rails.length / minimumInputChannels);
      return rails.slice(from, Math.max(from + 1, to));
    });
    const exposed: Rail[] = [];
    for (const group of groups) {
      if (group.length === 1) {
        exposed.push(group[0]);
        continue;
      }
      const centerY = Math.round(group.reduce((sum, rail) => sum + rail.start.y, 0) / group.length);
      const baseline = drafts.length;
      let inlet: Rail | undefined;
      for (const yOffset of [0, -4, 4, -8, 8, -12, 12]) {
        drafts.length = baseline;
        const point = {
          x: baseRackLeftEdge - 14 - (group.length - 1) * 3 - materialIndex * 4,
          y: centerY + yOffset,
        };
        const candidate: Rail = {
          material,
          type: "item",
          start: point,
          end: point,
          direction: 4,
          demandPerSecond: group.reduce((sum, rail) => sum + (rail.demandPerSecond ?? 0), 0),
        };
        drafts.push({ role: "ingredient-feeder", material, name: beltName,
          position: tilePosition(point.x, point.y), direction: 4 });
        if (!routeItemFanout(drafts, material, beltName,
          { point, direction: 4 }, group, localReserved, localReservedOwners)) continue;
        inlet = candidate;
        break;
      }
      if (!inlet) {
        drafts.length = baseline;
        return undefined;
      }
      exposed.push(inlet);
      const inletVector = directionVector(inlet.direction);
      reserveLocal({ x: inlet.start.x - inletVector.x, y: inlet.start.y - inletVector.y }, material);
      reserveLocal({ x: inlet.end.x + inletVector.x, y: inlet.end.y + inletVector.y }, material);
    }
    inputs.set(material, exposed[0]);
    if (exposed.length > 1) additionalInputs.set(material, exposed.slice(1));
    else additionalInputs.delete(material);
  }
  const minimumOutputChannels = planned.materialType === "item"
    ? Math.max(1, Math.ceil(planned.outputPerSecond / beltCapacity - 1e-12))
    : outputs.length;
  if (outputs.length > minimumOutputChannels) {
    // Pack half-lane production shards into the minimum number of full belts.
    // This is a rate-derived channel coalescing pass: it applies equally to
    // every recipe and exposes only the transport capacity the graph needs.
    const orderedOutputs = [...outputs].sort((left, right) => left.end.y - right.end.y);
    const rightEdge = Math.max(...drafts.flatMap(occupiedDraftTiles).map((tile) => tile.x));
    const groups = Array.from({ length: minimumOutputChannels }, (_, groupIndex) => {
      const from = Math.floor(groupIndex * orderedOutputs.length / minimumOutputChannels);
      const to = Math.floor((groupIndex + 1) * orderedOutputs.length / minimumOutputChannels);
      return orderedOutputs.slice(from, Math.max(from + 1, to));
    });
    const mergedOutputs: Rail[] = [];
    for (const [groupIndex, group] of groups.entries()) {
      if (group.length === 1) {
        mergedOutputs.push(group[0]);
        continue;
      }
      const centerY = Math.round(group.reduce((sum, rail) => sum + rail.end.y, 0) / group.length);
      const baseline = drafts.length;
      let merged: Rail | undefined;
      for (const yOffset of [0, -4, 4, -8, 8, -12, 12]) {
        drafts.length = baseline;
        const point = {
          x: rightEdge + 14 + (group.length - 1) * 3 + groupIndex * 2,
          y: centerY + yOffset,
        };
        const supplyPerSecond = group.reduce((sum, rail) => sum + (rail.supplyPerSecond ?? 0), 0);
        const target: Rail = {
          material: planned.material,
          type: "item",
          start: point,
          end: point,
          direction: 4,
          supplyPerSecond,
        };
        drafts.push({ role: "output-belt", material: planned.material, name: beltName,
          position: tilePosition(point.x, point.y), direction: 4 });
        if (!routeItemMerge(drafts, planned.material, beltName,
          group.map((rail) => ({ point: rail.end, direction: rail.direction })),
          target, new Set(), new Map())) continue;
        merged = target;
        break;
      }
      if (!merged) {
        drafts.length = baseline;
        return undefined;
      }
      mergedOutputs.push(merged);
    }
    return rackFromDrafts(
      planned,
      drafts,
      inputs,
      mergedOutputs[0],
      true,
      additionalInputs,
      mergedOutputs.slice(1),
    );
  }
  return rackFromDrafts(
    planned,
    drafts,
    inputs,
    outputs[0],
    true,
    additionalInputs,
    outputs.slice(1),
  );
}

function rotateTileClockwise(tile: Tile): Tile {
  return { x: -tile.y, y: tile.x };
}

function rotateRackClockwise(rack: MachineRack): MachineRack {
  const drafts = rack.drafts.map((draft) => {
    const tile = rotateTileClockwise(floorPosition(draft.position));
    return {
      ...draft,
      position: tilePosition(tile.x, tile.y),
      direction: draft.direction === undefined ? undefined : ((draft.direction + 4) % 16) as CardinalDirection,
    };
  });
  const rotateRail = (rail: Rail): Rail => ({
    ...rail,
    start: rotateTileClockwise(rail.start),
    end: rotateTileClockwise(rail.end),
    direction: ((rail.direction + 4) % 16) as CardinalDirection,
  });
  const inputs = new Map([...rack.inputs].map(([material, rail]) => [material, rotateRail(rail)]));
  const output = rotateRail(rack.output);
  const additionalInputs = new Map([...rack.additionalInputs]
    .map(([material, rails]) => [material, rails.map(rotateRail)]));
  const additionalOutputs = rack.additionalOutputs.map(rotateRail);
  const byKey = new Map<string, Tile>();
  drafts.flatMap(occupiedDraftTiles).forEach((tile) => byKey.set(`${tile.x},${tile.y}`, tile));
  inputs.forEach((rail) => {
    const vector = directionVector(rail.direction);
    for (let distance = 1; distance <= 1; distance += 1) {
      const ingress = { x: rail.start.x - vector.x * distance, y: rail.start.y - vector.y * distance };
      byKey.set(`${ingress.x},${ingress.y}`, ingress);
      const egress = { x: rail.end.x + vector.x * distance, y: rail.end.y + vector.y * distance };
      byKey.set(`${egress.x},${egress.y}`, egress);
    }
  });
  additionalInputs.forEach((rails) => rails.forEach((rail) => {
    const vector = directionVector(rail.direction);
    const ingress = { x: rail.start.x - vector.x, y: rail.start.y - vector.y };
    const egress = { x: rail.end.x + vector.x, y: rail.end.y + vector.y };
    byKey.set(`${ingress.x},${ingress.y}`, ingress);
    byKey.set(`${egress.x},${egress.y}`, egress);
  }));
  const outputVector = directionVector(output.direction);
  for (let distance = 1; distance <= 1; distance += 1) {
    const escape = { x: output.end.x + outputVector.x * distance, y: output.end.y + outputVector.y * distance };
    byKey.set(`${escape.x},${escape.y}`, escape);
  }
  additionalOutputs.forEach((rail) => {
    const vector = directionVector(rail.direction);
    const escape = { x: rail.end.x + vector.x, y: rail.end.y + vector.y };
    byKey.set(`${escape.x},${escape.y}`, escape);
  });
  const occupied = [...byKey.values()];
  return {
    ...rack,
    drafts,
    inputs,
    output,
    additionalInputs,
    additionalOutputs,
    occupied,
    minimumX: Math.min(...occupied.map((tile) => tile.x)),
    maximumX: Math.max(...occupied.map((tile) => tile.x)),
    minimumY: Math.min(...occupied.map((tile) => tile.y)),
    maximumY: Math.max(...occupied.map((tile) => tile.y)),
  };
}

function mirrorRackHorizontally(rack: MachineRack): MachineRack {
  const mirrorDirection = (direction: CardinalDirection): CardinalDirection =>
    direction === 4 ? 12 : direction === 12 ? 4 : direction;
  const drafts = rack.drafts.map((draft) => {
    const tile = floorPosition(draft.position);
    return {
      ...draft,
      position: tilePosition(-tile.x, tile.y),
      direction: draft.direction === undefined ? undefined : mirrorDirection(draft.direction),
    };
  });
  const mirrorRail = (rail: Rail): Rail => ({
    ...rail,
    start: { x: -rail.start.x, y: rail.start.y },
    end: { x: -rail.end.x, y: rail.end.y },
    direction: mirrorDirection(rail.direction),
  });
  const inputs = new Map([...rack.inputs].map(([material, rail]) => [material, mirrorRail(rail)]));
  const output = mirrorRail(rack.output);
  const additionalInputs = new Map([...rack.additionalInputs]
    .map(([material, rails]) => [material, rails.map(mirrorRail)]));
  const additionalOutputs = rack.additionalOutputs.map(mirrorRail);
  const byKey = new Map<string, Tile>();
  drafts.flatMap(occupiedDraftTiles).forEach((tile) => byKey.set(`${tile.x},${tile.y}`, tile));
  inputs.forEach((rail) => {
    const vector = directionVector(rail.direction);
    const ingress = { x: rail.start.x - vector.x, y: rail.start.y - vector.y };
    const egress = { x: rail.end.x + vector.x, y: rail.end.y + vector.y };
    byKey.set(`${ingress.x},${ingress.y}`, ingress);
    byKey.set(`${egress.x},${egress.y}`, egress);
  });
  additionalInputs.forEach((rails) => rails.forEach((rail) => {
    const vector = directionVector(rail.direction);
    const ingress = { x: rail.start.x - vector.x, y: rail.start.y - vector.y };
    const egress = { x: rail.end.x + vector.x, y: rail.end.y + vector.y };
    byKey.set(`${ingress.x},${ingress.y}`, ingress);
    byKey.set(`${egress.x},${egress.y}`, egress);
  }));
  const outputVector = directionVector(output.direction);
  const escape = { x: output.end.x + outputVector.x, y: output.end.y + outputVector.y };
  byKey.set(`${escape.x},${escape.y}`, escape);
  additionalOutputs.forEach((rail) => {
    const vector = directionVector(rail.direction);
    const additionalEscape = { x: rail.end.x + vector.x, y: rail.end.y + vector.y };
    byKey.set(`${additionalEscape.x},${additionalEscape.y}`, additionalEscape);
  });
  const occupied = [...byKey.values()];
  return {
    ...rack,
    drafts,
    inputs,
    output,
    additionalInputs,
    additionalOutputs,
    occupied,
    minimumX: Math.min(...occupied.map((tile) => tile.x)),
    maximumX: Math.max(...occupied.map((tile) => tile.x)),
    minimumY: Math.min(...occupied.map((tile) => tile.y)),
    maximumY: Math.max(...occupied.map((tile) => tile.y)),
  };
}

function mirrorRackVertically(rack: MachineRack): MachineRack {
  const mirrorDirection = (direction: CardinalDirection): CardinalDirection =>
    direction === 0 ? 8 : direction === 8 ? 0 : direction;
  const drafts = rack.drafts.map((draft) => {
    const tile = floorPosition(draft.position);
    return {
      ...draft,
      position: tilePosition(tile.x, -tile.y),
      direction: draft.direction === undefined ? undefined : mirrorDirection(draft.direction),
    };
  });
  const mirrorRail = (rail: Rail): Rail => ({
    ...rail,
    start: { x: rail.start.x, y: -rail.start.y },
    end: { x: rail.end.x, y: -rail.end.y },
    direction: mirrorDirection(rail.direction),
  });
  const inputs = new Map([...rack.inputs].map(([material, rail]) => [material, mirrorRail(rail)]));
  const output = mirrorRail(rack.output);
  const additionalInputs = new Map([...rack.additionalInputs]
    .map(([material, rails]) => [material, rails.map(mirrorRail)]));
  const additionalOutputs = rack.additionalOutputs.map(mirrorRail);
  return rackFromDrafts(
    rack.planned,
    drafts,
    inputs,
    output,
    rack.rotatable,
    additionalInputs,
    additionalOutputs,
  );
}

function translatedRail(rail: Rail, placement: RackPlacement): Rail {
  return {
    ...rail,
    start: { x: rail.start.x + placement.x, y: rail.start.y + placement.y },
    end: { x: rail.end.x + placement.x, y: rail.end.y + placement.y },
  };
}

/**
 * Machine racks expose directional transport terminals. The tile immediately
 * before an input and after an output is not occupied by the rack itself, but
 * it must remain empty or no physical route can ever attach to that terminal.
 * Treat those access tiles as placement keep-outs so the floorplanner cannot
 * create a compact-looking but unroutable packing.
 */
function rackPlacementTiles(rack: MachineRack): Tile[] {
  const tiles = new Map(rack.occupied.map((tile) => [`${tile.x},${tile.y}`, tile]));
  for (const rail of rackInputRails(rack)) {
    const vector = directionVector(rail.direction);
    const tile = { x: rail.start.x - vector.x, y: rail.start.y - vector.y };
    tiles.set(`${tile.x},${tile.y}`, tile);
  }
  for (const rail of rackOutputRails(rack)) {
    const vector = directionVector(rail.direction);
    const tile = { x: rail.end.x + vector.x, y: rail.end.y + vector.y };
    tiles.set(`${tile.x},${tile.y}`, tile);
  }
  return [...tiles.values()];
}

function placementCollides(state: PlacementState, rack: MachineRack, x: number, y: number): boolean {
  return rackPlacementTiles(rack).some((tile) => state.occupied.has(`${tile.x + x},${tile.y + y}`));
}

function rackTopologySignature(rack: MachineRack): string {
  return rack.drafts
    .map((draft) => {
      const tile = floorPosition(draft.position);
      return `${draft.role}:${draft.name}:${draft.material ?? ""}:${tile.x},${tile.y}:` +
        `${draft.direction ?? "x"}:${draft.undergroundType ?? ""}`;
    })
    .sort()
    .join("|");
}

function materialConnections(
  racks: MachineRack[],
  plan: ChainPlan,
): Array<{ producer?: string; consumer: string; material: string; rate: number }> {
  const producers = new Set(racks.map((rack) => rack.planned.material));
  return racks.flatMap((consumer) => [...consumer.inputs].map(([material]) => ({
    producer: producers.has(material) ? material : undefined,
    consumer: consumer.planned.material,
    material,
    rate: plan.materialRates[material] ?? 0,
  })));
}

function placementObjective(
  state: Omit<PlacementState, "score">,
  connections: ReturnType<typeof materialConnections>,
): number {
  const width = state.maximumX - state.minimumX + 1;
  const height = state.maximumY - state.minimumY + 1;
  let wire = 0;
  for (const edge of connections) {
    if (!edge.producer) continue;
    const producer = state.placements.get(edge.producer);
    const consumer = state.placements.get(edge.consumer);
    if (!producer || !consumer) continue;
    const outputs = rackOutputRails(producer.rack).map((rail) => translatedRail(rail, producer));
    const inputs = rackInputRails(consumer.rack, edge.material)
      .map((rail) => translatedRail(rail, consumer));
    if (inputs.length === 0) continue;
    const matchedInputs = outputs.length === inputs.length
      ? assignRailsToSources(outputs.map((rail) => ({ point: rail.end, direction: rail.direction })), inputs)
      : inputs;
    const channelWire = outputs.length === matchedInputs.length
      ? outputs.reduce((sum, output, index) => sum +
        Math.abs(output.end.x - matchedInputs[index].start.x) +
        Math.abs(output.end.y - matchedInputs[index].start.y), 0)
      : outputs.reduce((sum, output) => sum + Math.min(...matchedInputs.map((input) =>
        Math.abs(output.end.x - input.start.x) + Math.abs(output.end.y - input.start.y))), 0);
    wire += channelWire * Math.max(0.25, Math.sqrt(edge.rate));
  }
  const inputTapXs: number[] = [];
  for (const input of planBoundaryNames(connections)) {
    for (const placement of state.placements.values()) {
      const rail = placement.rack.inputs.get(input);
      if (rail) inputTapXs.push(translatedRail(rail, placement).start.x);
    }
  }
  const boundarySpread = inputTapXs.length > 1 ? Math.max(...inputTapXs) - Math.min(...inputTapXs) : 0;
  return width * height * 100 + Math.max(width, height) * 80 + wire * 90 + boundarySpread * 60;
}

function planBoundaryNames(connections: ReturnType<typeof materialConnections>): Set<string> {
  return new Set(connections.filter((edge) => edge.producer === undefined).map((edge) => edge.material));
}

function addPlacement(state: PlacementState, rack: MachineRack, x: number, y: number,
  connections: ReturnType<typeof materialConnections>): PlacementState {
  const placements = new Map(state.placements);
  placements.set(rack.planned.material, { rack, x, y });
  const occupied = new Set(state.occupied);
  rackPlacementTiles(rack).forEach((tile) => occupied.add(`${tile.x + x},${tile.y + y}`));
  const next = {
    placements,
    occupied,
    minimumX: Math.min(state.minimumX, rack.minimumX + x),
    maximumX: Math.max(state.maximumX, rack.maximumX + x),
    minimumY: Math.min(state.minimumY, rack.minimumY + y),
    maximumY: Math.max(state.maximumY, rack.maximumY + y),
  };
  return { ...next, score: placementObjective(next, connections) };
}

function candidateTranslations(state: PlacementState, rack: MachineRack,
  connections: ReturnType<typeof materialConnections>): Tile[] {
  const candidates = new Map<string, Tile>();
  const add = (x: number, y: number): void => {
    const rounded = { x: Math.round(x), y: Math.round(y) };
    candidates.set(`${rounded.x},${rounded.y}`, rounded);
  };
  const width = rack.maximumX - rack.minimumX + 1;
  const height = rack.maximumY - rack.minimumY + 1;
  const centerX = Math.round((state.minimumX + state.maximumX - rack.minimumX - rack.maximumX) / 2);
  const centerY = Math.round((state.minimumY + state.maximumY - rack.minimumY - rack.maximumY) / 2);
  for (const gap of [0, 1, 2, 4]) {
    add(centerX, state.minimumY - rack.maximumY - 1 - gap);
    add(centerX, state.maximumY - rack.minimumY + 1 + gap);
    add(state.minimumX - rack.maximumX - 1 - gap, centerY);
    add(state.maximumX - rack.minimumX + 1 + gap, centerY);
  }
  for (const edge of connections) {
    const producesForPlaced = edge.producer === rack.planned.material && state.placements.has(edge.consumer);
    const consumesFromPlaced = edge.consumer === rack.planned.material && edge.producer && state.placements.has(edge.producer);
    if (!producesForPlaced && !consumesFromPlaced) continue;
    const related = state.placements.get(producesForPlaced ? edge.consumer : edge.producer!)!;
    const localRail = producesForPlaced ? rack.output : rack.inputs.get(edge.material);
    const relatedRail = producesForPlaced ? related.rack.inputs.get(edge.material) : related.rack.output;
    if (!localRail || !relatedRail) continue;
    const localPoint = producesForPlaced ? localRail.end : localRail.start;
    const relatedTranslated = translatedRail(relatedRail, related);
    const relatedPoint = producesForPlaced ? relatedTranslated.start : relatedTranslated.end;
    for (const vertical of [-height - 2, -height, -2, 0, 2, height, height + 2]) {
      for (const horizontal of [-width - 2, -2, 2, width + 2]) {
        add(relatedPoint.x - localPoint.x + horizontal, relatedPoint.y - localPoint.y + vertical);
      }
    }
    const localRails = producesForPlaced
      ? rackOutputRails(rack)
      : rackInputRails(rack, edge.material);
    const relatedRails = producesForPlaced
      ? rackInputRails(related.rack, edge.material).map((rail) => translatedRail(rail, related))
      : rackOutputRails(related.rack).map((rail) => translatedRail(rail, related));
    for (const localChannel of localRails) {
      for (const relatedChannel of relatedRails) {
        const localTerminal = producesForPlaced ? localChannel.end : localChannel.start;
        const relatedTerminal = producesForPlaced ? relatedChannel.start : relatedChannel.end;
        const direction = producesForPlaced ? localChannel.direction : relatedChannel.direction;
        const vector = directionVector(direction);
        // Port-aligned candidates let a whole parallel channel bundle become
        // the floorplanner's seam. The router still validates every path; the
        // placement search merely gets compact, human-like adjacency options.
        for (const separation of [2, 4, 8]) {
          const sign = producesForPlaced ? -1 : 1;
          add(
            relatedTerminal.x - localTerminal.x + vector.x * separation * sign,
            relatedTerminal.y - localTerminal.y + vector.y * separation * sign,
          );
        }
      }
    }
  }
  return [...candidates.values()];
}

function chooseRackOrder(racks: MachineRack[], plan: ChainPlan): MachineRack[] {
  const byMaterial = new Map(racks.map((rack) => [rack.planned.material, rack]));
  const target = byMaterial.get(plan.target);
  if (!target) throw new Error(`Missing target rack ${plan.target}.`);
  const result = [target];
  const remaining = new Set(racks.filter((rack) => rack !== target));
  const connections = materialConnections(racks, plan);
  const recipeOrder = new Map(plan.recipes.map((planned, index) => [planned.material, index]));
  while (remaining.size > 0) {
    const next = [...remaining].sort((left, right) => {
      const linked = (rack: MachineRack): number => connections.filter((edge) =>
        (edge.producer === rack.planned.material && result.some((placed) => placed.planned.material === edge.consumer)) ||
        (edge.consumer === rack.planned.material && edge.producer && result.some((placed) => placed.planned.material === edge.producer)))
        .reduce((sum, edge) => sum + edge.rate, 0);
      return linked(right) - linked(left) || right.occupied.length - left.occupied.length ||
        (recipeOrder.get(left.planned.material) ?? 0) - (recipeOrder.get(right.planned.material) ?? 0);
    })[0];
    remaining.delete(next);
    result.push(next);
  }
  return result;
}

function searchPlacements(
  racks: MachineRack[],
  plan: ChainPlan,
  beamWidth = 72,
  allowRotation = true,
  topologyVariants: ReadonlyMap<string, MachineRack[]> = new Map(),
  reportSearch?: (detail: string) => void,
): PlacementState[] {
  const order = chooseRackOrder(racks, plan);
  const variants = new Map<string, MachineRack[]>(racks.map((rack): [string, MachineRack[]] => {
    const topologies = topologyVariants.get(rack.planned.material) ?? [rack];
    const expanded = topologies.flatMap((topology) => {
      if (!allowRotation || !topology.rotatable) return [topology];
      const mirrored = mirrorRackHorizontally(topology);
      return [topology, rotateRackClockwise(topology), mirrored, rotateRackClockwise(mirrored)];
    });
    const seen = new Set<string>();
    return [rack.planned.material, expanded.filter((candidate) => {
      const signature = rackTopologySignature(candidate);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })];
  }));
  const root = order[0];
  const connections = materialConnections(racks, plan);
  const recipeOrder = new Map(plan.recipes.map((planned, index) => [planned.material, index]));
  let states: PlacementState[] = variants.get(root.planned.material)!.map((rootVariant) => ({
    placements: new Map([[root.planned.material, { rack: rootVariant, x: 0, y: 0 }]]),
    occupied: new Set(rackPlacementTiles(rootVariant).map((tile) => `${tile.x},${tile.y}`)),
    minimumX: rootVariant.minimumX,
    maximumX: rootVariant.maximumX,
    minimumY: rootVariant.minimumY,
    maximumY: rootVariant.maximumY,
    score: 0,
  }));
  for (const [rackIndex, baseRack] of order.slice(1).entries()) {
    const expanded: PlacementState[] = [];
    for (const state of states) {
      for (const rack of variants.get(baseRack.planned.material)!) {
        const candidates = candidateTranslations(state, rack, connections)
          .filter((position) => !placementCollides(state, rack, position.x, position.y))
          .map((position) => addPlacement(state, rack, position.x, position.y, connections))
          .sort((left, right) => left.score - right.score)
          .slice(0, 24);
        expanded.push(...candidates);
      }
    }
    const signatures = new Set<string>();
    const unique = expanded.sort((left, right) => left.score - right.score).filter((state) => {
      const signature = [...state.placements]
        .sort(([left], [right]) => (recipeOrder.get(left) ?? 0) - (recipeOrder.get(right) ?? 0))
        .map(([material, placement]) => `${recipeOrder.get(material) ?? -1}:${placement.x},${placement.y}:` +
          rackTopologySignature(placement.rack)).join("|");
      if (signatures.has(signature)) return false;
      signatures.add(signature);
      return true;
    });
    if (!allowRotation) {
      states = unique.slice(0, beamWidth);
      if (states.length === 0) throw new Error(`No global machine placement exists after ${baseRack.planned.material}.`);
      reportSearch?.(`Packing machine neighborhoods ${rackIndex + 2}/${order.length}; ` +
        `${states.length} floorplan candidates retained`);
      continue;
    }
    const width = (state: PlacementState): number => state.maximumX - state.minimumX + 1;
    const height = (state: PlacementState): number => state.maximumY - state.minimumY + 1;
    const rankings = [
      [...unique].sort((left, right) => left.score - right.score),
      [...unique].sort((left, right) => width(left) * height(left) - width(right) * height(right) || left.score - right.score),
      [...unique].sort((left, right) => Math.max(width(left), height(left)) - Math.max(width(right), height(right)) || left.score - right.score),
      [...unique].sort((left, right) => width(left) - width(right) || left.score - right.score),
      [...unique].sort((left, right) => height(left) - height(right) || left.score - right.score),
    ];
    const selected = new Set<PlacementState>();
    for (const state of rankings[0].slice(0, Math.ceil(beamWidth / 2))) selected.add(state);
    for (let rank = 0; selected.size < beamWidth && rank < unique.length; rank += 1) {
      for (const ranking of rankings) {
        if (ranking[rank]) selected.add(ranking[rank]);
        if (selected.size >= beamWidth) break;
      }
    }
    states = [...selected];
    if (states.length === 0) throw new Error(`No global machine placement exists after ${baseRack.planned.material}.`);
    reportSearch?.(`Packing machine neighborhoods ${rackIndex + 2}/${order.length}; ` +
      `${states.length} floorplan candidates retained`);
  }
  return states;
}

function seededPlacement(
  racks: MachineRack[],
  plan: ChainPlan,
  mode: "horizontal" | "vertical" | "shelf" | "diagonal",
): PlacementState {
  const order = chooseRackOrder(racks, plan);
  const connections = materialConnections(racks, plan);
  const first = order[0];
  let state: PlacementState = {
    placements: new Map([[first.planned.material, { rack: first, x: -first.minimumX, y: -first.minimumY }]]),
    occupied: new Set(rackPlacementTiles(first).map((tile) => `${tile.x - first.minimumX},${tile.y - first.minimumY}`)),
    minimumX: 0,
    maximumX: first.maximumX - first.minimumX,
    minimumY: 0,
    maximumY: first.maximumY - first.minimumY,
    score: 0,
  };
  let cursorX = state.maximumX + 9;
  let cursorY = state.maximumY + 9;
  const targetWidth = Math.max(48, Math.ceil(Math.sqrt(
    racks.reduce((sum, rack) => sum +
      (rack.maximumX - rack.minimumX + 1) * (rack.maximumY - rack.minimumY + 1), 0),
  ) * 2));
  let shelfY = 0;
  let shelfHeight = state.maximumY + 1;
  for (const rack of order.slice(1)) {
    let x: number;
    let y: number;
    if (mode === "horizontal") {
      x = cursorX - rack.minimumX;
      y = -rack.minimumY;
      cursorX += rack.maximumX - rack.minimumX + 10;
    } else if (mode === "vertical") {
      x = -rack.minimumX;
      y = cursorY - rack.minimumY;
      cursorY += rack.maximumY - rack.minimumY + 10;
    } else if (mode === "shelf") {
      const width = rack.maximumX - rack.minimumX + 1;
      const height = rack.maximumY - rack.minimumY + 1;
      if (cursorX + width > targetWidth) {
        cursorX = 0;
        shelfY += shelfHeight + 9;
        shelfHeight = 0;
      }
      x = cursorX - rack.minimumX;
      y = shelfY - rack.minimumY;
      cursorX += width + 9;
      shelfHeight = Math.max(shelfHeight, height);
    } else {
      x = cursorX - rack.minimumX;
      y = cursorY - rack.minimumY;
      cursorX += rack.maximumX - rack.minimumX + 24;
      cursorY += rack.maximumY - rack.minimumY + 24;
    }
    state = addPlacement(state, rack, x, y, connections);
  }
  return state;
}

/**
 * Places the entire production DAG at once: boundary-near producers occupy
 * the left layers and the target occupies the rightmost layer. Column widths
 * and row packing come from the physical rack envelopes, while recipe edges
 * determine depth. This is a global floorplan seed, not a collection of
 * independently routed factory blocks.
 */
function layeredPlacement(
  racks: MachineRack[],
  plan: ChainPlan,
  corridor: number,
  reverseRows = false,
): PlacementState {
  const byMaterial = new Map(racks.map((rack) => [rack.planned.material, rack]));
  const depthMemo = new Map<string, number>();
  const depthOf = (material: string, visiting = new Set<string>()): number => {
    const memo = depthMemo.get(material);
    if (memo !== undefined) return memo;
    if (visiting.has(material)) return 0;
    const rack = byMaterial.get(material);
    if (!rack) return 0;
    const nextVisiting = new Set(visiting).add(material);
    const producerDepths = rack.planned.ingredientRates
      .filter((ingredient) => byMaterial.has(ingredient.name))
      .map((ingredient) => depthOf(ingredient.name, nextVisiting) + 1);
    const depth = producerDepths.length === 0 ? 0 : Math.max(...producerDepths);
    depthMemo.set(material, depth);
    return depth;
  };
  racks.forEach((rack) => depthOf(rack.planned.material));
  const layers = new Map<number, MachineRack[]>();
  racks.forEach((rack) => {
    const depth = depthMemo.get(rack.planned.material)!;
    const layer = layers.get(depth) ?? [];
    layer.push(rack);
    layers.set(depth, layer);
  });
  const connections = materialConnections(racks, plan);
  const downstreamWeight = (rack: MachineRack): number => connections
    .filter((edge) => edge.producer === rack.planned.material)
    .reduce((sum, edge) => sum + edge.rate, 0);
  const orderedLayers = [...layers].sort(([left], [right]) => left - right);
  const recipeOrder = new Map(plan.recipes.map((planned, index) => [planned.material, index]));
  const placements: Array<{ rack: MachineRack; x: number; y: number }> = [];
  let columnX = 0;
  for (const [, layer] of orderedLayers) {
    const ordered = [...layer].sort((left, right) =>
      downstreamWeight(right) - downstreamWeight(left) ||
      (recipeOrder.get(left.planned.material) ?? 0) - (recipeOrder.get(right.planned.material) ?? 0));
    if (reverseRows) ordered.reverse();
    const heights = ordered.map((rack) => rack.maximumY - rack.minimumY + 1);
    const totalHeight = heights.reduce((sum, height) => sum + height, 0) +
      Math.max(0, ordered.length - 1) * corridor;
    let rowY = -Math.floor(totalHeight / 2);
    let columnWidth = 0;
    ordered.forEach((rack, index) => {
      placements.push({ rack, x: columnX - rack.minimumX, y: rowY - rack.minimumY });
      rowY += heights[index] + corridor;
      columnWidth = Math.max(columnWidth, rack.maximumX - rack.minimumX + 1);
    });
    columnX += columnWidth + corridor;
  }
  const first = placements[0];
  let state: PlacementState = {
    placements: new Map([[first.rack.planned.material, first]]),
    occupied: new Set(rackPlacementTiles(first.rack).map((tile) => `${tile.x + first.x},${tile.y + first.y}`)),
    minimumX: first.rack.minimumX + first.x,
    maximumX: first.rack.maximumX + first.x,
    minimumY: first.rack.minimumY + first.y,
    maximumY: first.rack.maximumY + first.y,
    score: 0,
  };
  for (const placement of placements.slice(1)) {
    state = addPlacement(state, placement.rack, placement.x, placement.y, connections);
  }
  return state;
}

function undergroundReach(name: string): number {
  // Factorio's prototype max_distance is the endpoint-to-endpoint tile
  // distance accepted by the engine (5 / 7 / 9), not the number of hidden
  // tiles plus one.
  if (name === "underground-belt") return 5;
  if (name === "fast-underground-belt") return 7;
  return 9;
}

function existingTunnelTiles(drafts: Draft[]): Set<string> {
  const endpoints = drafts.filter((draft) => draft.undergroundType !== undefined && draft.direction !== undefined);
  const claimed = new Set<Draft>();
  const result = new Set<string>();
  for (const input of endpoints.filter((draft) => draft.undergroundType === "input")) {
    const vector = directionVector(input.direction!);
    const start = floorPosition(input.position);
    const output = endpoints.filter((candidate) => {
      if (candidate.undergroundType !== "output" || candidate.name !== input.name ||
        candidate.direction !== input.direction || claimed.has(candidate)) return false;
      const end = floorPosition(candidate.position);
      const projection = (end.x - start.x) * vector.x + (end.y - start.y) * vector.y;
      const perpendicular = (end.x - start.x) * vector.y - (end.y - start.y) * vector.x;
      return perpendicular === 0 && projection > 0 && projection <= undergroundReach(input.name);
    }).sort((left, right) => {
      const a = floorPosition(left.position);
      const b = floorPosition(right.position);
      return Math.abs(a.x - start.x) + Math.abs(a.y - start.y) - Math.abs(b.x - start.x) - Math.abs(b.y - start.y);
    })[0];
    if (!output) continue;
    claimed.add(output);
    const end = floorPosition(output.position);
    const axis = vector.x === 0 ? "v" : "h";
    const fixed = vector.x === 0 ? start.x : start.y;
    const first = vector.x === 0 ? Math.min(start.y, end.y) : Math.min(start.x, end.x);
    const last = vector.x === 0 ? Math.max(start.y, end.y) : Math.max(start.x, end.x);
    for (let coordinate = first; coordinate <= last; coordinate += 1) {
      result.add(`${input.name}:${axis}:${fixed}:${coordinate}`);
    }
  }
  return result;
}

interface SearchNode extends Tile {
  heading: CardinalDirection;
  arrivedUnderground: boolean;
  cost: number;
  estimate: number;
  key: string;
}

interface RoutedPoint extends Tile {
  arrivedUnderground: boolean;
  heading: CardinalDirection;
}

let lastRoutingDiagnostic = "none";

function routeBetween(
  drafts: Draft[],
  material: string,
  beltName: string,
  sourceEnd: Tile,
  sourceDirection: CardinalDirection,
  targetStart: Tile,
  finalDirection: CardinalDirection = 4,
  padding = 12,
  reservedTiles: ReadonlySet<string> = new Set(),
  loopRetryDepth = 0,
): boolean {
  const sourceVector = directionVector(sourceDirection);
  const finalVector = directionVector(finalDirection);
  if (sourceEnd.x + sourceVector.x === targetStart.x + 0 &&
    sourceEnd.y + sourceVector.y === targetStart.y) return true;
  const start = { x: sourceEnd.x + sourceVector.x, y: sourceEnd.y + sourceVector.y };
  const goal = { x: targetStart.x - finalVector.x, y: targetStart.y - finalVector.y };
  const physicalOccupancy = new Set<string>();
  drafts.flatMap(occupiedDraftTiles).forEach((tile) => physicalOccupancy.add(`${tile.x},${tile.y}`));
  const incompatibleIngress = new Set<string>();
  for (const draft of drafts) {
    if (draft.direction === undefined || draft.undergroundType === "input" ||
      (!draft.name.includes("belt") && !draft.name.includes("splitter")) ||
      beltMaterialCompatible(material, draft.material)) continue;
    const vector = directionVector(draft.direction);
    for (const tile of occupiedDraftTiles(draft)) {
      incompatibleIngress.add(`${tile.x + vector.x},${tile.y + vector.y}`);
    }
  }
  if (physicalOccupancy.has(`${start.x},${start.y}`) || physicalOccupancy.has(`${goal.x},${goal.y}`) ||
    reservedTiles.has(`${start.x},${start.y}`) || reservedTiles.has(`${goal.x},${goal.y}`) ||
    incompatibleIngress.has(`${start.x},${start.y}`) || incompatibleIngress.has(`${goal.x},${goal.y}`)) {
    const occupantsAt = (point: Tile): string => drafts.filter((draft) =>
      occupiedDraftTiles(draft).some((tile) => tile.x === point.x && tile.y === point.y))
      .map((draft) => `${draft.name}/${draft.material ?? "power"}/${draft.role}@` +
        `${floorPosition(draft.position).x},${floorPosition(draft.position).y}`)
      .join("+") || "none";
    lastRoutingDiagnostic = `${material} blocked endpoint start=${start.x},${start.y}:` +
      `${physicalOccupancy.has(`${start.x},${start.y}`) || reservedTiles.has(`${start.x},${start.y}`)} ` +
      `(${occupantsAt(start)}) goal=${goal.x},${goal.y}:${physicalOccupancy.has(`${goal.x},${goal.y}`)} ` +
      `(${occupantsAt(goal)})`;
    return false;
  }
  const occupancy = new Set([...physicalOccupancy, ...reservedTiles, ...incompatibleIngress]);
  const points = [...occupancy].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  });
  const minX = Math.min(start.x, goal.x, ...points.map((point) => point.x)) - padding;
  const maxX = Math.max(start.x, goal.x, ...points.map((point) => point.x)) + padding;
  const minY = Math.min(start.y, goal.y, ...points.map((point) => point.y)) - padding;
  const maxY = Math.max(start.y, goal.y, ...points.map((point) => point.y)) + padding;
  const undergroundName = beltName === "transport-belt" ? "underground-belt" :
    beltName === "fast-transport-belt" ? "fast-underground-belt" : "express-underground-belt";
  const tunnelTiles = existingTunnelTiles(drafts);
  const keyFor = (x: number, y: number, heading: CardinalDirection, arrived: boolean): string =>
    `${x},${y},${heading},${arrived ? 1 : 0}`;
  const heuristic = (x: number, y: number): number => Math.abs(x - goal.x) + Math.abs(y - goal.y);
  const queue: SearchNode[] = [];
  const push = (node: SearchNode): void => {
    queue.push(node);
    let index = queue.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (queue[parent].estimate <= node.estimate) break;
      queue[index] = queue[parent];
      index = parent;
    }
    queue[index] = node;
  };
  const pop = (): SearchNode | undefined => {
    if (queue.length === 0) return undefined;
    const first = queue[0];
    const last = queue.pop()!;
    if (queue.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= queue.length) break;
        const right = left + 1;
        const child = right < queue.length && queue[right].estimate < queue[left].estimate ? right : left;
        if (queue[child].estimate >= last.estimate) break;
        queue[index] = queue[child];
        index = child;
      }
      queue[index] = last;
    }
    return first;
  };
  const startKey = keyFor(start.x, start.y, sourceDirection, false);
  const best = new Map([[startKey, 0]]);
  const previous = new Map<string, string>();
  const pointsByKey = new Map<string, RoutedPoint>([[startKey, {
    ...start,
    heading: sourceDirection,
    arrivedUnderground: false,
  }]]);
  push({ ...start, heading: sourceDirection, arrivedUnderground: false,
    cost: 0, estimate: heuristic(start.x, start.y), key: startKey });
  const directions: CardinalDirection[] = [0, 4, 8, 12];
  let goalKey: string | undefined;
  while (queue.length > 0) {
    const current = pop()!;
    if (current.cost !== best.get(current.key)) continue;
    if (current.x === goal.x && current.y === goal.y && !current.arrivedUnderground) {
      goalKey = current.key;
      break;
    }
    for (const direction of directions) {
      if ((direction + 8) % 16 === current.heading || (current.arrivedUnderground && direction !== current.heading)) continue;
      const vector = directionVector(direction);
      const x = current.x + vector.x;
      const y = current.y + vector.y;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (!occupancy.has(`${x},${y}`)) {
        const key = keyFor(x, y, direction, false);
        const turnCost = direction === current.heading ? 0 : 0.35;
        const cost = current.cost + 1 + turnCost;
        if (cost < (best.get(key) ?? Number.POSITIVE_INFINITY)) {
          best.set(key, cost);
          previous.set(key, current.key);
          pointsByKey.set(key, { x, y, heading: direction, arrivedUnderground: false });
          push({ x, y, heading: direction, arrivedUnderground: false, cost, estimate: cost + heuristic(x, y), key });
        }
        continue;
      }
      if (current.arrivedUnderground || direction !== current.heading) continue;
      for (let distance = 2; distance <= undergroundReach(undergroundName); distance += 1) {
        const exitX = current.x + vector.x * distance;
        const exitY = current.y + vector.y * distance;
        if (exitX < minX || exitX > maxX || exitY < minY || exitY > maxY) break;
        if (occupancy.has(`${exitX},${exitY}`)) continue;
        const exitDistance = Math.abs(exitX - goal.x) + Math.abs(exitY - goal.y);
        const forwardDistance = Math.abs(exitX + vector.x - goal.x) + Math.abs(exitY + vector.y - goal.y);
        if (exitDistance === 1 && forwardDistance > exitDistance) continue;
        const axis = vector.x === 0 ? "v" : "h";
        const fixed = vector.x === 0 ? current.x : current.y;
        let overlap = false;
        for (let step = 0; step <= distance; step += 1) {
          const coordinate = vector.x === 0 ? current.y + vector.y * step : current.x + vector.x * step;
          if (tunnelTiles.has(`${undergroundName}:${axis}:${fixed}:${coordinate}`)) overlap = true;
        }
        if (overlap) continue;
        const key = keyFor(exitX, exitY, direction, true);
        const cost = current.cost + distance + 2;
        if (cost < (best.get(key) ?? Number.POSITIVE_INFINITY)) {
          best.set(key, cost);
          previous.set(key, current.key);
          pointsByKey.set(key, { x: exitX, y: exitY, heading: direction, arrivedUnderground: true });
          push({ x: exitX, y: exitY, heading: direction, arrivedUnderground: true,
            cost, estimate: cost + heuristic(exitX, exitY), key });
        }
        break;
      }
    }
  }
  if (!goalKey) {
    lastRoutingDiagnostic = `${material} no path ${sourceEnd.x},${sourceEnd.y} -> ${targetStart.x},${targetStart.y}`;
    return false;
  }
  const reversedPath: RoutedPoint[] = [];
  for (let key: string | undefined = goalKey; key; key = previous.get(key)) reversedPath.push(pointsByKey.get(key)!);
  const path = reversedPath.reverse();
  const reservedPathPoint = path.find((point) => reservedTiles.has(`${point.x},${point.y}`));
  if (reservedPathPoint) {
    lastRoutingDiagnostic = `${material} route crossed reserved terminal ` +
      `${reservedPathPoint.x},${reservedPathPoint.y}`;
    return false;
  }
  const firstVisit = new Map<string, number>();
  let repeatedVisit: { first: number; second: number } | undefined;
  path.some((point, index) => {
    const key = `${point.x},${point.y}`;
    const first = firstVisit.get(key);
    if (first !== undefined) {
      repeatedVisit = { first, second: index };
      return true;
    }
    firstVisit.set(key, index);
    return false;
  });
  if (repeatedVisit) {
    // Heading-aware A* can occasionally find a cheap directed cycle because
    // revisiting one tile from another heading is a distinct search state.
    // Do not emit or splice that invalid path. Negotiate a fresh route while
    // forbidding a few interior cycle tiles; this preserves belt direction
    // and keeps the final path physically simple.
    if (loopRetryDepth < 6) {
      const cycle = path.slice(repeatedVisit.first + 1, repeatedVisit.second);
      const middle = cycle[Math.floor(cycle.length / 2)];
      const retryTiles = [middle, cycle[0], cycle.at(-1)]
        .filter((point): point is RoutedPoint => point !== undefined)
        .filter((point, index, points) => points.findIndex((candidate) =>
          candidate.x === point.x && candidate.y === point.y) === index)
        .filter((point) => !(point.x === start.x && point.y === start.y) &&
          !(point.x === goal.x && point.y === goal.y));
      for (const blocked of retryTiles) {
        const negotiated = new Set(reservedTiles);
        negotiated.add(`${blocked.x},${blocked.y}`);
        if (routeBetween(drafts, material, beltName, sourceEnd, sourceDirection,
          targetStart, finalDirection, padding, negotiated, loopRetryDepth + 1)) return true;
      }
    }
    lastRoutingDiagnostic = `${material} belt route contains a physical loop`;
    return false;
  }
  path.forEach((point, index) => {
    const previousPoint = index > 0 ? path[index - 1] : undefined;
    const nextPoint = path[index + 1];
    const jumpFromPrevious = previousPoint &&
      Math.abs(point.x - previousPoint.x) + Math.abs(point.y - previousPoint.y) > 1;
    const jumpToNext = nextPoint && Math.abs(nextPoint.x - point.x) + Math.abs(nextPoint.y - point.y) > 1;
    const undergroundType = jumpFromPrevious ? "output" : jumpToNext ? "input" : undefined;
    const direction = jumpToNext
      ? directionBetweenLong(point, nextPoint!)
      : jumpFromPrevious
        ? directionBetweenLong(previousPoint!, point)
        : nextPoint ? directionBetween(point, nextPoint) : finalDirection;
    drafts.push({
      role: undergroundType ? "underground-belt" : "material-bus",
      material,
      name: undergroundType ? undergroundName : beltName,
      position: tilePosition(point.x, point.y),
      direction,
      undergroundType,
    });
  });
  return true;
}

function routePipeBetween(
  drafts: Draft[],
  material: string,
  sourceEnd: Tile,
  sourceDirection: CardinalDirection,
  targetStart: Tile,
  targetDirection: CardinalDirection,
  padding = 14,
  reservedTiles: ReadonlySet<string> = new Set(),
  pumpDepth = 0,
  strictTargetDirection = false,
): boolean {
  const sourceVector = directionVector(sourceDirection);
  const targetVector = directionVector(targetDirection);
  if (Math.abs(sourceEnd.x - targetStart.x) + Math.abs(sourceEnd.y - targetStart.y) === 1) return true;
  const start = { x: sourceEnd.x + sourceVector.x, y: sourceEnd.y + sourceVector.y };
  // Surface pipes are undirected. Any free cardinal neighbor of the target
  // manifold is a real connection; forcing the rail's nominal continuation
  // direction creates artificial U-turns and invalid underground endpoints.
  const goal = targetStart;
  const compatiblePipes = new Set<string>();
  const physical = new Set<string>();
  const fluidKeepout = new Set<string>();
  for (const draft of drafts) {
    for (const tile of occupiedDraftTiles(draft)) {
      const tileKey = `${tile.x},${tile.y}`;
      if (draft.name === "pipe" && draft.material === material) compatiblePipes.add(tileKey);
      else physical.add(tileKey);
    }
    if ((draft.name === "pipe" || draft.name === "pipe-to-ground") && draft.material !== material) {
      const tile = floorPosition(draft.position);
      const exposedDirections: CardinalDirection[] = draft.name === "pipe"
        ? [0, 4, 8, 12]
        : draft.direction === undefined ? [] : [draft.direction];
      exposedDirections.forEach((direction) => {
        const vector = directionVector(direction);
        fluidKeepout.add(`${tile.x + vector.x},${tile.y + vector.y}`);
      });
    }
  }
  if (physical.has(`${start.x},${start.y}`)) {
    const describe = (point: Tile): string => drafts.filter((draft) =>
      occupiedDraftTiles(draft).some((tile) => tile.x === point.x && tile.y === point.y))
      .map((draft) => `${draft.name}/${draft.material ?? "power"}`).join("+") || "free";
    lastRoutingDiagnostic = `${material} pipe endpoint blocked ${start.x},${start.y}` +
      `(${describe(start)}) -> ${goal.x},${goal.y}(${describe(goal)})`;
    return false;
  }
  const occupancy = new Set([...physical, ...fluidKeepout, ...reservedTiles]);
  const occupiedPoints = [...occupancy].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  });
  const minimumX = Math.min(start.x, goal.x, ...occupiedPoints.map((point) => point.x)) - padding;
  const maximumX = Math.max(start.x, goal.x, ...occupiedPoints.map((point) => point.x)) + padding;
  const minimumY = Math.min(start.y, goal.y, ...occupiedPoints.map((point) => point.y)) - padding;
  const maximumY = Math.max(start.y, goal.y, ...occupiedPoints.map((point) => point.y)) + padding;

  // Factorio 2.0 stops every fluid segment whose bounding box exceeds the
  // engine's pipeline-extent limit. Segment long global routes with powered
  // pumps before running the ordinary pipe A*. This decision depends only on
  // geometry and works for every fluid and recipe graph.
  const directExtent = Math.max(
    Math.abs(sourceEnd.x - targetStart.x),
    Math.abs(sourceEnd.y - targetStart.y),
  );
  if (directExtent > 180 && pumpDepth < 8) {
    const dominantDirection: CardinalDirection = Math.abs(targetStart.x - sourceEnd.x) >=
      Math.abs(targetStart.y - sourceEnd.y)
      ? targetStart.x >= sourceEnd.x ? 4 : 12
      : targetStart.y >= sourceEnd.y ? 8 : 0;
    const vector = directionVector(dominantDirection);
    const perpendicular = { x: vector.y, y: -vector.x };
    const midpoint = {
      x: Math.round((sourceEnd.x + targetStart.x) / 2),
      y: Math.round((sourceEnd.y + targetStart.y) / 2),
    };
    const pumpCandidates: Array<{ input: Tile; output: Tile }> = [];
    for (const along of [0, -4, 4, -8, 8, -12, 12]) {
      for (const across of [0, -2, 2, -4, 4, -6, 6, -8, 8]) {
        const input = {
          x: midpoint.x + vector.x * along + perpendicular.x * across,
          y: midpoint.y + vector.y * along + perpendicular.y * across,
        };
        const output = { x: input.x + vector.x, y: input.y + vector.y };
        const before = { x: input.x - vector.x, y: input.y - vector.y };
        const after = { x: output.x + vector.x, y: output.y + vector.y };
        if ([input, output, before, after].some((tile) => occupancy.has(`${tile.x},${tile.y}`))) continue;
        pumpCandidates.push({ input, output });
      }
    }
    for (const candidate of pumpCandidates) {
      const baseline = drafts.length;
      const pumpKeepout = new Set(reservedTiles);
      pumpKeepout.add(`${candidate.input.x},${candidate.input.y}`);
      pumpKeepout.add(`${candidate.output.x},${candidate.output.y}`);
      if (!routePipeBetween(drafts, material, sourceEnd, sourceDirection,
        candidate.input, dominantDirection, padding, pumpKeepout, pumpDepth + 1, true)) {
        drafts.length = baseline;
        continue;
      }
      drafts.push({
        role: "pump",
        material,
        name: "pump",
        position: {
          x: (candidate.input.x + candidate.output.x) / 2 + 0.5,
          y: (candidate.input.y + candidate.output.y) / 2 + 0.5,
        },
        direction: dominantDirection,
      });
      if (!routePipeBetween(drafts, material, candidate.output, dominantDirection,
        targetStart, targetDirection, padding, reservedTiles, pumpDepth + 1, strictTargetDirection)) {
        drafts.length = baseline;
        continue;
      }
      const used = new Set(drafts.flatMap(occupiedDraftTiles).map((tile) => `${tile.x},${tile.y}`));
      const pumpCenter = {
        x: (candidate.input.x + candidate.output.x) / 2,
        y: (candidate.input.y + candidate.output.y) / 2,
      };
      const pole = Array.from({ length: 7 }, (_, radius) => radius).flatMap((radius) =>
        Array.from({ length: radius * 2 + 1 }, (_, offset) => offset - radius).flatMap((offset) => [
          { x: Math.round(pumpCenter.x + offset), y: Math.round(pumpCenter.y - radius) },
          { x: Math.round(pumpCenter.x + offset), y: Math.round(pumpCenter.y + radius) },
          { x: Math.round(pumpCenter.x - radius), y: Math.round(pumpCenter.y + offset) },
          { x: Math.round(pumpCenter.x + radius), y: Math.round(pumpCenter.y + offset) },
        ]))
        .find((tile) => Math.max(Math.abs(tile.x - pumpCenter.x), Math.abs(tile.y - pumpCenter.y)) <= 3.5 &&
          !used.has(`${tile.x},${tile.y}`));
      if (!pole) {
        drafts.length = baseline;
        continue;
      }
      drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(pole.x, pole.y) });
      return true;
    }
    lastRoutingDiagnostic = `${material} could not place a powered pipeline segmentation pump`;
    return false;
  }
  const queue: Array<RoutedPoint & { cost: number; estimate: number; key: string }> = [{
    ...start,
    heading: sourceDirection,
    arrivedUnderground: false,
    cost: 0,
    estimate: Math.max(0, Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y) - 1),
    key: `${start.x},${start.y},${sourceDirection},0`,
  }];
  const key = (point: Tile, heading: CardinalDirection, underground = false): string =>
    `${point.x},${point.y},${heading},${underground ? 1 : 0}`;
  const best = new Map([[key(start, sourceDirection), 0]]);
  const previous = new Map<string, string>();
  const points = new Map<string, RoutedPoint>([[key(start, sourceDirection), {
    ...start,
    heading: sourceDirection,
    arrivedUnderground: false,
  }]]);
  const pipeTunnels = new Set<string>();
  const pipeEndpoints = drafts.filter((draft) => draft.name === "pipe-to-ground" && draft.direction !== undefined);
  for (const entrance of pipeEndpoints) {
    const startPoint = floorPosition(entrance.position);
    const undergroundDirection = ((entrance.direction! + 8) % 16) as CardinalDirection;
    const vector = directionVector(undergroundDirection);
    const exit = pipeEndpoints.find((candidate) => {
      if (candidate === entrance || candidate.material !== entrance.material || candidate.direction !== undergroundDirection) return false;
      const end = floorPosition(candidate.position);
      const projection = (end.x - startPoint.x) * vector.x + (end.y - startPoint.y) * vector.y;
      const perpendicular = (end.x - startPoint.x) * vector.y - (end.y - startPoint.y) * vector.x;
      return perpendicular === 0 && projection > 0 && projection <= 10;
    });
    if (!exit) continue;
    const end = floorPosition(exit.position);
    const axis = vector.x === 0 ? "v" : "h";
    const fixed = vector.x === 0 ? startPoint.x : startPoint.y;
    const first = vector.x === 0 ? Math.min(startPoint.y, end.y) : Math.min(startPoint.x, end.x);
    const last = vector.x === 0 ? Math.max(startPoint.y, end.y) : Math.max(startPoint.x, end.x);
    for (let coordinate = first; coordinate <= last; coordinate += 1) {
      pipeTunnels.add(`${axis}:${fixed}:${coordinate}`);
    }
  }
  let goalKey: string | undefined;
  while (queue.length > 0) {
    queue.sort((left, right) => left.estimate - right.estimate);
    const current = queue.shift()!;
    if (current.cost !== best.get(current.key)) continue;
    const targetConnection = {
      x: goal.x - targetVector.x,
      y: goal.y - targetVector.y,
    };
    const reachedTarget = strictTargetDirection
      ? current.x === targetConnection.x && current.y === targetConnection.y
      : Math.abs(current.x - goal.x) + Math.abs(current.y - goal.y) === 1;
    if (reachedTarget && !current.arrivedUnderground) {
      goalKey = current.key;
      break;
    }
    for (const direction of [0, 4, 8, 12] as CardinalDirection[]) {
      // A pipe-to-ground is straight: the surface pipe entering its first
      // endpoint and the surface pipe leaving its second endpoint must follow
      // the same heading as the tunnel. Without this state constraint an A*
      // path can look connected on a tile grid while Factorio creates two
      // disconnected fluid systems.
      if ((direction + 8) % 16 === current.heading ||
        (current.arrivedUnderground && direction !== current.heading)) continue;
      const vector = directionVector(direction);
      const next = { x: current.x + vector.x, y: current.y + vector.y };
      if (next.x >= minimumX && next.x <= maximumX && next.y >= minimumY && next.y <= maximumY &&
        !occupancy.has(`${next.x},${next.y}`)) {
        const nextKey = key(next, direction);
        const cost = current.cost + 1;
        if (cost < (best.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
          best.set(nextKey, cost);
          previous.set(nextKey, current.key);
          points.set(nextKey, { ...next, heading: direction, arrivedUnderground: false });
          queue.push({ ...next, heading: direction, arrivedUnderground: false, cost,
            estimate: cost + Math.max(0, Math.abs(next.x - goal.x) + Math.abs(next.y - goal.y) - 1), key: nextKey });
        }
      }
      if (current.arrivedUnderground || direction !== current.heading) continue;
      // Underground segments are ordinary negotiated-routing moves, not just
      // a final straight shot at the target. Restricting them to the goal row
      // produced hundreds of surface pipes on large integrated factories,
      // increasing both footprint cost and fluid-system volume enough to
      // starve distant machines at low boundary pressure.
      for (let distance = 2; distance <= 10; distance += 1) {
        const exit = { x: current.x + vector.x * distance, y: current.y + vector.y * distance };
        if (exit.x < minimumX || exit.x > maximumX || exit.y < minimumY || exit.y > maximumY) break;
        // The far end must be a new pipe-to-ground entity. Landing a tunnel
        // directly on an existing same-fluid surface pipe looks valid to the
        // grid search but causes the renderer to omit the required endpoint.
        if (occupancy.has(`${exit.x},${exit.y}`) || compatiblePipes.has(`${exit.x},${exit.y}`)) continue;
        const exitDistance = Math.abs(exit.x - goal.x) + Math.abs(exit.y - goal.y);
        const forwardDistance = Math.abs(exit.x + vector.x - goal.x) + Math.abs(exit.y + vector.y - goal.y);
        if (exitDistance === 1 && forwardDistance > exitDistance) continue;
        const axis = vector.x === 0 ? "v" : "h";
        const fixed = vector.x === 0 ? current.x : current.y;
        let overlap = false;
        for (let step = 0; step <= distance; step += 1) {
          const coordinate = vector.x === 0 ? current.y + vector.y * step : current.x + vector.x * step;
          if (pipeTunnels.has(`${axis}:${fixed}:${coordinate}`)) overlap = true;
        }
        if (overlap) continue;
        const exitKey = key(exit, direction, true);
        const cost = current.cost + 2.2 + distance * 0.05;
        if (cost < (best.get(exitKey) ?? Number.POSITIVE_INFINITY)) {
          best.set(exitKey, cost);
          previous.set(exitKey, current.key);
          points.set(exitKey, { ...exit, heading: direction, arrivedUnderground: true });
          queue.push({ ...exit, heading: direction, arrivedUnderground: true, cost,
            estimate: cost + Math.max(0, Math.abs(exit.x - goal.x) + Math.abs(exit.y - goal.y) - 1), key: exitKey });
        }
      }
    }
  }
  if (!goalKey) {
    lastRoutingDiagnostic = `${material} no pipe path ${sourceEnd.x},${sourceEnd.y} -> ${targetStart.x},${targetStart.y}`;
    return false;
  }
  const reversedPath: RoutedPoint[] = [];
  for (let cursor: string | undefined = goalKey; cursor; cursor = previous.get(cursor)) reversedPath.push(points.get(cursor)!);
  const path = reversedPath.reverse();
  if (new Set(path.map((point) => `${point.x},${point.y}`)).size !== path.length) {
    lastRoutingDiagnostic = `${material} pipe route contains a physical loop`;
    return false;
  }
  path.forEach((point, index) => {
    const previousPoint = index > 0 ? path[index - 1] : undefined;
    const nextPoint = path[index + 1];
    const jumpFromPrevious = previousPoint &&
      Math.abs(point.x - previousPoint.x) + Math.abs(point.y - previousPoint.y) > 1;
    const jumpToNext = nextPoint && Math.abs(nextPoint.x - point.x) + Math.abs(nextPoint.y - point.y) > 1;
    const jumpDirection = jumpToNext
      ? directionBetweenLong(point, nextPoint!)
      : jumpFromPrevious ? directionBetweenLong(previousPoint!, point) : point.heading;
    if (compatiblePipes.has(`${point.x},${point.y}`)) return;
    drafts.push({
      role: jumpFromPrevious || jumpToNext ? "pipe-to-ground" : "pipe",
      material,
      name: jumpFromPrevious || jumpToNext ? "pipe-to-ground" : "pipe",
      position: tilePosition(point.x, point.y),
      direction: jumpToNext
        ? ((jumpDirection + 8) % 16) as CardinalDirection
        : jumpFromPrevious ? jumpDirection : undefined,
    });
  });
  return true;
}

function directionBetweenLong(from: Tile, to: Tile): CardinalDirection {
  if (to.x === from.x && to.y < from.y) return 0;
  if (to.x > from.x && to.y === from.y) return 4;
  if (to.x === from.x && to.y > from.y) return 8;
  if (to.x < from.x && to.y === from.y) return 12;
  throw new Error(`Non-cardinal underground route ${from.x},${from.y} -> ${to.x},${to.y}.`);
}

function beltMaterialCompatible(routeMaterial: string, draftMaterial: string | undefined): boolean {
  if (draftMaterial === routeMaterial) return true;
  return draftMaterial?.startsWith("mix:") === true &&
    draftMaterial.slice(4).split("|").includes(routeMaterial);
}

function directedBeltPathExists(drafts: Draft[], material: string, source: Tile, target: Tile): boolean {
  const belts = drafts.filter((draft) => draft.direction !== undefined &&
    (draft.name.includes("belt") || draft.name.includes("splitter")) &&
    beltMaterialCompatible(material, draft.material));
  const tileOf = (draft: Draft): Tile => floorPosition(draft.position);
  const byTile = new Map<string, Draft[]>();
  belts.forEach((draft) => occupiedDraftTiles(draft).forEach((tile) => {
    const entries = byTile.get(`${tile.x},${tile.y}`) ?? [];
    entries.push(draft);
    byTile.set(`${tile.x},${tile.y}`, entries);
  }));
  const starts = byTile.get(`${source.x},${source.y}`) ?? [];
  const queue = [...starts];
  const visited = new Set<Draft>(queue);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (occupiedDraftTiles(current).some((tile) => tile.x === target.x && tile.y === target.y)) return true;
    let nextDrafts: Draft[] = [];
    if (current.undergroundType === "input") {
      const start = tileOf(current);
      const vector = directionVector(current.direction!);
      nextDrafts = belts.filter((candidate) => {
        if (candidate.undergroundType !== "output" || candidate.name !== current.name ||
          candidate.direction !== current.direction) return false;
        const end = tileOf(candidate);
        const projection = (end.x - start.x) * vector.x + (end.y - start.y) * vector.y;
        const perpendicular = (end.x - start.x) * vector.y - (end.y - start.y) * vector.x;
        return perpendicular === 0 && projection > 0 && projection <= undergroundReach(current.name);
      }).sort((left, right) => {
        const a = tileOf(left);
        const b = tileOf(right);
        return Math.abs(a.x - start.x) + Math.abs(a.y - start.y) -
          Math.abs(b.x - start.x) - Math.abs(b.y - start.y);
      }).slice(0, 1);
    } else {
      const currentTiles = occupiedDraftTiles(current);
      const vector = directionVector(current.direction!);
      const seen = new Set<Draft>();
      for (const tile of currentTiles) {
        for (const candidate of byTile.get(`${tile.x + vector.x},${tile.y + vector.y}`) ?? []) {
          if (candidate !== current && !seen.has(candidate)) {
            seen.add(candidate);
            nextDrafts.push(candidate);
          }
        }
      }
    }
    for (const next of nextDrafts) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return false;
}

function translatedDrafts(state: PlacementState): Draft[] {
  const drafts: Draft[] = [];
  for (const placement of state.placements.values()) {
    placement.rack.drafts.forEach((draft) => drafts.push({
      ...draft,
      position: { x: draft.position.x + placement.x, y: draft.position.y + placement.y },
    }));
  }
  return drafts;
}

function nearestRailOrder(source: Tile, rails: Rail[]): Rail[] {
  const remaining = new Set(rails);
  const ordered: Rail[] = [];
  let cursor = source;
  while (remaining.size > 0) {
    const next = [...remaining].sort((left, right) =>
      Math.abs(left.start.x - cursor.x) + Math.abs(left.start.y - cursor.y) -
      Math.abs(right.start.x - cursor.x) - Math.abs(right.start.y - cursor.y))[0];
    remaining.delete(next);
    ordered.push(next);
    cursor = next.end;
  }
  return ordered;
}

function routedRailOrder(source: Tile, rails: Rail[], variant: number): Rail[] {
  if (rails.length < 2) return [...rails];
  // A physical machine runs at full prototype speed, even when the rational
  // plan needs only a fraction of it. On a serial manifold, an early machine
  // can therefore fill a long intermediate buffer before later consumers see
  // anything. Feed the shortest paths to the requested output first, then the
  // larger planned flows. Recipe order is a structural final tie-breaker, so
  // this startup schedule is independent of Factorio prototype names.
  const priority = (a: Rail, b: Rail): number =>
    (a.criticalDistance ?? Number.POSITIVE_INFINITY) -
      (b.criticalDistance ?? Number.POSITIVE_INFINITY) ||
    (b.demandPerSecond ?? 0) - (a.demandPerSecond ?? 0) ||
    (a.consumerOrdinal ?? 0) - (b.consumerOrdinal ?? 0);
  if (variant === 0) return [...rails].sort((left, right) =>
    priority(left, right) ||
    Math.abs(left.start.x - source.x) + Math.abs(left.start.y - source.y) -
      Math.abs(right.start.x - source.x) - Math.abs(right.start.y - source.y));
  const sorted = [...rails];
  if (variant === 1) return sorted.sort((a, b) => priority(a, b) || a.start.x - b.start.x || a.start.y - b.start.y);
  if (variant === 2) return sorted.sort((a, b) => priority(a, b) || b.start.x - a.start.x || b.start.y - a.start.y);
  if (variant === 3) return sorted.sort((a, b) => priority(a, b) || a.start.y - b.start.y || a.start.x - b.start.x);
  if (variant === 4) return sorted.sort((a, b) => priority(a, b) || b.start.y - a.start.y || b.start.x - a.start.x);
  if (variant === 5) {
    return sorted.sort((a, b) => priority(a, b) ||
      Math.abs(b.start.x - source.x) + Math.abs(b.start.y - source.y) -
      Math.abs(a.start.x - source.x) - Math.abs(a.start.y - source.y));
  }
  // Deterministic spatial hashes diversify negotiated routing without making
  // output depend on runtime randomness.
  return sorted.sort((a, b) => priority(a, b) ||
    ((a.start.x * 73856093) ^ (a.start.y * 19349663) ^ (variant * 83492791)) -
    ((b.start.x * 73856093) ^ (b.start.y * 19349663) ^ (variant * 83492791)));
}

/** Exact minimum-wire matching for equal parallel channel sets. */
function assignRailsToSources(
  sources: Array<{ point: Tile; direction: CardinalDirection }>,
  rails: Rail[],
): Rail[] {
  if (sources.length !== rails.length || rails.length > 12) return rails;
  const count = rails.length;
  const stateCount = 1 << count;
  const costs = Array(stateCount).fill(Number.POSITIVE_INFINITY) as number[];
  const previousMask = Array(stateCount).fill(-1) as number[];
  const previousRail = Array(stateCount).fill(-1) as number[];
  costs[0] = 0;
  const bits = (value: number): number => {
    let remaining = value;
    let result = 0;
    while (remaining > 0) {
      remaining &= remaining - 1;
      result += 1;
    }
    return result;
  };
  for (let mask = 0; mask < stateCount; mask += 1) {
    const sourceIndex = bits(mask);
    if (sourceIndex >= count || !Number.isFinite(costs[mask])) continue;
    for (let railIndex = 0; railIndex < count; railIndex += 1) {
      if ((mask & (1 << railIndex)) !== 0) continue;
      const source = sources[sourceIndex];
      const rail = rails[railIndex];
      const wire = Math.abs(source.point.x - rail.start.x) + Math.abs(source.point.y - rail.start.y);
      const nextMask = mask | (1 << railIndex);
      const cost = costs[mask] + wire;
      if (cost < costs[nextMask] - 1e-9) {
        costs[nextMask] = cost;
        previousMask[nextMask] = mask;
        previousRail[nextMask] = railIndex;
      }
    }
  }
  const assigned = Array<unknown>(count) as Rail[];
  let mask = stateCount - 1;
  for (let sourceIndex = count - 1; sourceIndex >= 0; sourceIndex -= 1) {
    const railIndex = previousRail[mask];
    if (railIndex < 0) return rails;
    assigned[sourceIndex] = rails[railIndex];
    mask = previousMask[mask];
  }
  return assigned;
}

/**
 * Jointly assigns and routes equal-size parallel item channels. A minimum-wire
 * assignment alone can force the last connection across paths committed by
 * the first connections. This bounded branch-and-route search evaluates the
 * physical paths while choosing the permutation, then rolls back rejected
 * partial assignments. Its state contains only terminals and occupancy.
 */
function routeParallelItemChannels(
  drafts: Draft[],
  material: string,
  beltName: string,
  sources: Array<{ point: Tile; direction: CardinalDirection; supplyPerSecond?: number }>,
  rails: Rail[],
  reservedTiles: ReadonlySet<string>,
  reservedOwners: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  if (sources.length !== rails.length || sources.length < 2 || sources.length > 8) return false;
  const baseline = drafts.length;
  const sourceOrders = [
    sources.map((_, index) => index),
    sources.map((_, index) => index).sort((a, b) => sources[a].point.y - sources[b].point.y),
    sources.map((_, index) => index).sort((a, b) => sources[b].point.y - sources[a].point.y),
    sources.map((_, index) => index).sort((a, b) => sources[a].point.x - sources[b].point.x),
    sources.map((_, index) => index).sort((a, b) => sources[b].point.x - sources[a].point.x),
  ];
  const signatures = new Set<string>();
  let expanded = 0;
  const maximumExpanded = 12;
  for (const order of sourceOrders) {
    const signature = order.join(",");
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    drafts.length = baseline;
    const search = (depth: number, remaining: number[]): boolean => {
      if (depth === order.length) return true;
      if (expanded >= maximumExpanded) return false;
      const source = sources[order[depth]];
      const candidates = [...remaining].sort((leftIndex, rightIndex) => {
        const score = (railIndex: number): number => {
          const rail = rails[railIndex];
          const wire = Math.abs(source.point.x - rail.start.x) + Math.abs(source.point.y - rail.start.y);
          const rateMismatch = Math.abs((source.supplyPerSecond ?? 0) - (rail.demandPerSecond ?? 0));
          const directionMismatch = source.direction === rail.direction ? 0 : 2;
          return wire * 10 + rateMismatch + directionMismatch;
        };
        return score(leftIndex) - score(rightIndex) || leftIndex - rightIndex;
      });
      for (const railIndex of candidates) {
        expanded += 1;
        const rail = rails[railIndex];
        const targetVector = directionVector(rail.direction);
        const sourceVector = directionVector(source.direction);
        const targetIngress = `${rail.start.x - targetVector.x},${rail.start.y - targetVector.y}`;
        const sourceEscape = `${source.point.x + sourceVector.x},${source.point.y + sourceVector.y}`;
        const negotiated = new Set(reservedTiles);
        if (terminalCanBeClaimed(reservedOwners, sourceEscape, material)) negotiated.delete(sourceEscape);
        if (terminalCanBeClaimed(reservedOwners, targetIngress, material)) negotiated.delete(targetIngress);
        const beforeRoute = drafts.length;
        if (routeBetween(drafts, material, beltName, source.point, source.direction,
          rail.start, rail.direction, 20, negotiated) &&
          search(depth + 1, remaining.filter((candidate) => candidate !== railIndex))) return true;
        drafts.length = beforeRoute;
      }
      return false;
    };
    if (search(0, rails.map((_, index) => index)) && rails.every((rail) =>
      sources.some((source) => directedBeltPathExists(drafts, material, source.point, rail.start)))) return true;
  }
  drafts.length = baseline;
  return false;
}

function stableOrdinalHash(value: number, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0;
  hash ^= value;
  hash = Math.imul(hash, 16777619) >>> 0;
  hash ^= hash >>> 13;
  return Math.imul(hash, 2246822519) >>> 0;
}

function splitterForBelt(beltName: string): string {
  if (beltName === "transport-belt") return "splitter";
  if (beltName === "fast-transport-belt") return "fast-splitter";
  return "express-splitter";
}

function terminalCanBeClaimed(
  owners: ReadonlyMap<string, ReadonlySet<string>>,
  key: string,
  material: string,
): boolean {
  const reservedFor = owners.get(key);
  return reservedFor === undefined || [...reservedFor].every((owner) => owner === material);
}

function reservationsAgainstMaterial(
  reservedTiles: ReadonlySet<string>,
  reservedOwners: ReadonlyMap<string, ReadonlySet<string>>,
  material: string,
): Set<string> {
  return new Set([...reservedTiles].filter((key) => !terminalCanBeClaimed(reservedOwners, key, material)));
}

/**
 * Routes one item producer into a balanced physical splitter chain. Every
 * consumer receives an independent branch, so a full-speed fractional-load
 * machine cannot starve the rest of the production graph while its output
 * belt is filling. Splitter locations are searched from geometry and graph
 * terminals only; no recipe or material identity participates.
 */
function routeItemFanout(
  drafts: Draft[],
  material: string,
  beltName: string,
  source: { point: Tile; direction: CardinalDirection },
  consumers: Rail[],
  reservedTiles: ReadonlySet<string>,
  reservedOwners: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  if (consumers.length < 2) return false;
  const splitterCount = consumers.length - 1;
  const chainWidth = (splitterCount - 1) * 3 + 1;
  const occupied = new Set(drafts.flatMap(occupiedDraftTiles).map((tile) => `${tile.x},${tile.y}`));
  const physical = [...occupied].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  });
  const minimumX = Math.min(...physical.map((tile) => tile.x));
  const maximumX = Math.max(...physical.map((tile) => tile.x));
  const minimumY = Math.min(...physical.map((tile) => tile.y));
  const maximumY = Math.max(...physical.map((tile) => tile.y));
  const consumerCenter = {
    x: Math.round(consumers.reduce((sum, rail) => sum + rail.start.x, 0) / consumers.length),
    y: Math.round(consumers.reduce((sum, rail) => sum + rail.start.y, 0) / consumers.length),
  };
  const anchors = new Map<string, Tile>();
  const addAnchor = (x: number, y: number): void => {
    const anchor = { x: Math.round(x), y: Math.round(y) };
    const required = Array.from({ length: splitterCount }, (_, index) =>
      [{ x: anchor.x + index * 3, y: anchor.y }, { x: anchor.x + index * 3, y: anchor.y + 1 }]).flat();
    if (required.some((tile) => occupied.has(`${tile.x},${tile.y}`) ||
      reservedTiles.has(`${tile.x},${tile.y}`))) return;
    anchors.set(`${anchor.x},${anchor.y}`, anchor);
  };
  // Search compact pockets around both the producer and consumer centroid.
  for (const center of [source.point, consumerCenter]) {
    for (let radius = 0; radius <= 10; radius += 1) {
      for (let offset = -radius; offset <= radius; offset += 1) {
        addAnchor(center.x + 2 + offset, center.y - radius);
        addAnchor(center.x + 2 + offset, center.y + radius);
        addAnchor(center.x + 2 - radius, center.y + offset);
        addAnchor(center.x + 2 + radius, center.y + offset);
      }
    }
  }
  // Guaranteed open-space candidates keep the solver complete when the
  // machine packing itself leaves no two-tile pocket.
  for (const y of [minimumY - 4, maximumY + 3]) {
    addAnchor(consumerCenter.x - Math.floor(chainWidth / 2), y);
    addAnchor(source.point.x + 2, y);
    addAnchor(minimumX, y);
  }
  addAnchor(minimumX - chainWidth - 4, consumerCenter.y);
  addAnchor(maximumX + 4, consumerCenter.y);
  const areaWith = (anchor: Tile): number => {
    const lastX = anchor.x + chainWidth - 1;
    return (Math.max(maximumX, lastX + 1) - Math.min(minimumX, anchor.x - 1) + 1) *
      (Math.max(maximumY, anchor.y + 1) - Math.min(minimumY, anchor.y) + 1);
  };
  const orderedAnchors = [...anchors.values()].sort((left, right) => {
    const wire = (anchor: Tile): number => {
      const lastX = anchor.x + chainWidth - 1;
      return Math.abs(source.point.x - anchor.x) + Math.abs(source.point.y - anchor.y) +
        consumers.reduce((sum, rail) => sum + Math.min(
          Math.abs(rail.start.x - lastX) + Math.abs(rail.start.y - anchor.y),
          Math.abs(rail.start.x - anchor.x) + Math.abs(rail.start.y - (anchor.y + 1)),
        ), 0);
    };
    return areaWith(left) - areaWith(right) || wire(left) - wire(right);
  }).slice(0, 12);
  const baselineLength = drafts.length;
  const splitterName = splitterForBelt(beltName);
  let fanoutEscapeReservations = new Set<string>();
  const failureCounts = { source: 0, chain: 0, branch: 0, connectivity: 0 };
  let lastBranchFailure = "none";
  const routeToRail = (from: Tile, fromDirection: CardinalDirection, rail: Rail): boolean => {
    const targetVector = directionVector(rail.direction);
    const targetIngress = `${rail.start.x - targetVector.x},${rail.start.y - targetVector.y}`;
    const sourceVector = directionVector(fromDirection);
    const sourceEscape = `${from.x + sourceVector.x},${from.y + sourceVector.y}`;
    // The splitter's own escape must be removed from the temporary splitter
    // keep-outs, but never from a rack terminal reservation that happens to
    // occupy the same tile. Losing that distinction allowed an earlier
    // material's underground endpoint to box in a later consumer.
    const negotiated = new Set(reservedTiles);
    for (const reserved of fanoutEscapeReservations) {
      if (reserved !== sourceEscape) negotiated.add(reserved);
    }
    if (terminalCanBeClaimed(reservedOwners, targetIngress, material)) negotiated.delete(targetIngress);
    return routeBetween(drafts, material, beltName, from, fromDirection,
      rail.start, rail.direction, 12, negotiated);
  };
  for (const anchor of orderedAnchors) {
    drafts.length = baselineLength;
    const splitters = Array.from({ length: splitterCount }, (_, index) => ({
      x: anchor.x + index * 3,
      y: anchor.y,
    }));
    splitters.forEach((splitter) => drafts.push({
      role: "splitter",
      material,
      name: splitterName,
      position: { x: splitter.x + 0.5, y: splitter.y + 1 },
      direction: 4,
    }));
    fanoutEscapeReservations = new Set(splitters.flatMap((splitter) => [
      `${splitter.x + 1},${splitter.y}`,
      `${splitter.x + 1},${splitter.y + 1}`,
    ]));
    const first = splitters[0];
    const sourceVector = directionVector(source.direction);
    const sourceEscape = `${source.point.x + sourceVector.x},${source.point.y + sourceVector.y}`;
    const sourceReserved = new Set([...reservedTiles, ...fanoutEscapeReservations]);
    if (terminalCanBeClaimed(reservedOwners, sourceEscape, material)) sourceReserved.delete(sourceEscape);
    if (!routeBetween(drafts, material, beltName, source.point, source.direction,
      first, 4, 12, sourceReserved)) {
      failureCounts.source += 1;
      continue;
    }
    let routed = true;
    for (let index = 0; index < splitters.length - 1; index += 1) {
      if (!routeBetween(drafts, material, beltName, splitters[index], 4,
        splitters[index + 1], 4, 4)) {
        routed = false;
        break;
      }
    }
    if (!routed) {
      failureCounts.chain += 1;
      continue;
    }
    for (let index = 0; index < splitters.length - 1; index += 1) {
      if (!routeToRail({ x: splitters[index].x, y: splitters[index].y + 1 }, 4, consumers[index])) {
        routed = false;
        break;
      }
    }
    if (!routed) {
      failureCounts.branch += 1;
      lastBranchFailure = lastRoutingDiagnostic;
      continue;
    }
    const last = splitters.at(-1)!;
    if (!routeToRail(last, 4, consumers[splitterCount]) ||
      !routeToRail({ x: last.x, y: last.y + 1 }, 4, consumers[splitterCount - 1])) {
      failureCounts.branch += 1;
      lastBranchFailure = lastRoutingDiagnostic;
      continue;
    }
    if (consumers.every((rail) => directedBeltPathExists(drafts, material, source.point, rail.start))) return true;
    failureCounts.connectivity += 1;
  }
  drafts.length = baselineLength;
  const fanoutFailure = lastRoutingDiagnostic;
  lastRoutingDiagnostic = `${material} splitter fan-out could not route ${consumers.length} consumers from ` +
    `${source.point.x},${source.point.y}/${source.direction} to ` +
    consumers.map((rail) => `${rail.start.x},${rail.start.y}/${rail.direction}`).join(";") +
    `; failures=${JSON.stringify(failureCounts)}; branch=${lastBranchFailure}; reason=${fanoutFailure}`;
  return false;
}

/** Inverse of the searched fan-out: combine several bounded lane streams. */
function routeItemMerge(
  drafts: Draft[],
  material: string,
  beltName: string,
  sources: Array<{ point: Tile; direction: CardinalDirection }>,
  target: Rail,
  reservedTiles: ReadonlySet<string>,
  reservedOwners: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  if (sources.length < 2) return false;
  const splitterCount = sources.length - 1;
  const chainWidth = (splitterCount - 1) * 3 + 1;
  const occupied = new Set(drafts.flatMap(occupiedDraftTiles).map((tile) => `${tile.x},${tile.y}`));
  const physical = [...occupied].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  });
  const minimumX = Math.min(...physical.map((tile) => tile.x));
  const maximumX = Math.max(...physical.map((tile) => tile.x));
  const minimumY = Math.min(...physical.map((tile) => tile.y));
  const maximumY = Math.max(...physical.map((tile) => tile.y));
  const sourceCenter = {
    x: Math.round(sources.reduce((sum, source) => sum + source.point.x, 0) / sources.length),
    y: Math.round(sources.reduce((sum, source) => sum + source.point.y, 0) / sources.length),
  };
  const anchors = new Map<string, Tile>();
  const addAnchor = (x: number, y: number): void => {
    const anchor = { x: Math.round(x), y: Math.round(y) };
    const required = Array.from({ length: splitterCount }, (_, index) =>
      [{ x: anchor.x + index * 3, y: anchor.y }, { x: anchor.x + index * 3, y: anchor.y + 1 }]).flat();
    if (required.some((tile) => occupied.has(`${tile.x},${tile.y}`) ||
      reservedTiles.has(`${tile.x},${tile.y}`))) return;
    anchors.set(`${anchor.x},${anchor.y}`, anchor);
  };
  for (const center of [target.start, sourceCenter]) {
    for (let radius = 0; radius <= 12; radius += 1) {
      for (let offset = -radius; offset <= radius; offset += 1) {
        addAnchor(center.x - chainWidth - 2 + offset, center.y - radius);
        addAnchor(center.x - chainWidth - 2 + offset, center.y + radius);
        addAnchor(center.x - chainWidth - 2 - radius, center.y + offset);
        addAnchor(center.x - chainWidth - 2 + radius, center.y + offset);
      }
    }
  }
  for (const y of [minimumY - 4, maximumY + 3]) {
    addAnchor(target.start.x - chainWidth - 3, y);
    addAnchor(sourceCenter.x - Math.floor(chainWidth / 2), y);
  }
  addAnchor(minimumX - chainWidth - 4, target.start.y);
  addAnchor(maximumX + 4, target.start.y);
  const targetDirectionVector = directionVector(target.direction);
  const targetBehind = {
    x: target.start.x - targetDirectionVector.x * (chainWidth + 8),
    y: target.start.y - targetDirectionVector.y * (chainWidth + 8),
  };
  const targetPerpendicular = { x: targetDirectionVector.y, y: -targetDirectionVector.x };
  for (const offset of [0, -4, 4, -8, 8]) {
    addAnchor(targetBehind.x + targetPerpendicular.x * offset,
      targetBehind.y + targetPerpendicular.y * offset);
  }
  const orderedAnchors = [...anchors.values()].sort((left, right) => {
    const objective = (anchor: Tile): number => {
      const last = { x: anchor.x + (splitterCount - 1) * 3, y: anchor.y };
      const wire = sources.reduce((sum, source) => sum +
        Math.abs(source.point.x - anchor.x) + Math.abs(source.point.y - anchor.y), 0) +
        Math.abs(last.x - target.start.x) + Math.abs(last.y - target.start.y);
      const area = (Math.max(maximumX, anchor.x + chainWidth) - Math.min(minimumX, anchor.x - 1) + 1) *
        (Math.max(maximumY, anchor.y + 1) - Math.min(minimumY, anchor.y) + 1);
      return area * 100 + wire;
    };
    return objective(left) - objective(right);
  }).slice(0, 16);
  const splitterName = splitterForBelt(beltName);
  const baselineLength = drafts.length;
  let mergeIngressReservations = new Set<string>();
  const routeSource = (source: { point: Tile; direction: CardinalDirection }, destination: Tile): boolean => {
    const vector = directionVector(source.direction);
    const escape = `${source.point.x + vector.x},${source.point.y + vector.y}`;
    const negotiated = new Set([...reservedTiles, ...mergeIngressReservations]);
    if (terminalCanBeClaimed(reservedOwners, escape, material)) negotiated.delete(escape);
    negotiated.delete(`${destination.x - 1},${destination.y}`);
    return routeBetween(drafts, material, beltName, source.point, source.direction,
      destination, 4, 12, negotiated);
  };
  for (const anchor of orderedAnchors) {
    drafts.length = baselineLength;
    const splitters = Array.from({ length: splitterCount }, (_, index) => ({
      x: anchor.x + index * 3,
      y: anchor.y,
    }));
    splitters.forEach((splitter) => drafts.push({
      role: "splitter",
      material,
      name: splitterName,
      position: { x: splitter.x + 0.5, y: splitter.y + 1 },
      direction: 4,
    }));
    mergeIngressReservations = new Set(splitters.flatMap((splitter) => [
      `${splitter.x - 1},${splitter.y}`,
      `${splitter.x - 1},${splitter.y + 1}`,
    ]));
    if (!routeSource(sources[0], splitters[0]) ||
      !routeSource(sources[1], { x: splitters[0].x, y: splitters[0].y + 1 })) continue;
    let routed = true;
    for (let index = 1; index < splitters.length; index += 1) {
      const chainReserved = new Set(mergeIngressReservations);
      chainReserved.delete(`${splitters[index].x - 1},${splitters[index].y}`);
      if (!routeBetween(drafts, material, beltName, splitters[index - 1], 4,
        splitters[index], 4, 4, chainReserved) ||
        !routeSource(sources[index + 1], { x: splitters[index].x, y: splitters[index].y + 1 })) {
        routed = false;
        break;
      }
    }
    if (!routed) continue;
    const last = splitters.at(-1)!;
    const targetVector = directionVector(target.direction);
    const targetIngress = `${target.start.x - targetVector.x},${target.start.y - targetVector.y}`;
    const negotiated = new Set(reservedTiles);
    if (terminalCanBeClaimed(reservedOwners, targetIngress, material)) negotiated.delete(targetIngress);
    if (!routeBetween(drafts, material, beltName, last, 4,
      target.start, target.direction, 12, negotiated)) continue;
    if (sources.every((source) => directedBeltPathExists(drafts, material, source.point, target.start))) return true;
  }
  drafts.length = baselineLength;
  const mergeFailure = lastRoutingDiagnostic;
  lastRoutingDiagnostic = `${material} splitter merge could not route ${sources.length} producers ` +
    sources.map((source) => `${source.point.x},${source.point.y}/${source.direction}`).join(";") +
    ` -> ${target.start.x},${target.start.y}/${target.direction}; reason=${mergeFailure}`;
  return false;
}

function routeMaterialNetworks(
  drafts: Draft[],
  state: PlacementState,
  plan: ChainPlan,
  beltName: string,
  inputSide: Side,
  fanoutMaterials: ReadonlySet<string>,
  orderVariant = 0,
): Map<string, Tile> | undefined {
  const inputPositions = new Map<string, Tile>();
  const placements = state.placements;
  const uniquePlacements = [...new Map([...placements.values()]
    .map((placement) => [placement.rack.planned.material, placement])).values()];
  const byMaterial = new Map(uniquePlacements.map((placement) =>
    [placement.rack.planned.material, placement.rack.planned]));
  const recipeOrdinal = new Map(plan.recipes.map((planned, index) => [planned.material, index]));
  const downstream = new Map<string, string[]>();
  for (const planned of plan.recipes) {
    for (const ingredient of planned.ingredientRates) {
      if (!byMaterial.has(ingredient.name)) continue;
      const consumers = downstream.get(ingredient.name) ?? [];
      consumers.push(planned.material);
      downstream.set(ingredient.name, consumers);
    }
  }
  const criticalMemo = new Map<string, number>([[plan.target, 0]]);
  const criticalDistance = (material: string, visiting = new Set<string>()): number => {
    const memo = criticalMemo.get(material);
    if (memo !== undefined) return memo;
    if (visiting.has(material)) return Number.POSITIVE_INFINITY;
    const next = downstream.get(material) ?? [];
    const distance = next.length === 0
      ? Number.POSITIVE_INFINITY
      : 1 + Math.min(...next.map((consumer) => criticalDistance(consumer, new Set(visiting).add(material))));
    criticalMemo.set(material, distance);
    return distance;
  };
  const materialConsumers = new Map<string, Rail[]>();
  const reservedTiles = new Set<string>();
  const reservedOwners = new Map<string, Set<string>>();
  const reserve = (tile: Tile, material: string): void => {
    const key = `${tile.x},${tile.y}`;
    reservedTiles.add(key);
    const owners = reservedOwners.get(key) ?? new Set<string>();
    owners.add(material);
    reservedOwners.set(key, owners);
  };
  for (const placement of uniquePlacements) {
    for (const [material] of placement.rack.inputs) {
      const locals = rackInputRails(placement.rack, material);
      const plannedDemand = placement.rack.planned.ingredientRates
        .find((ingredient) => ingredient.name === material)?.perSecond;
      for (const local of locals) {
        const rails = materialConsumers.get(material) ?? [];
        rails.push({
          ...translatedRail(local, placement),
          demandPerSecond: local.demandPerSecond ?? (plannedDemand ?? plan.materialRates[material] ?? 0) /
            Math.max(1, locals.length),
          criticalDistance: criticalDistance(placement.rack.planned.material),
          consumerOrdinal: recipeOrdinal.get(placement.rack.planned.material),
        });
        materialConsumers.set(material, rails);
      }
    }
  }
  for (const rails of materialConsumers.values()) {
    rails.forEach((rail) => {
      const vector = directionVector(rail.direction);
      for (let distance = 1; distance <= 1; distance += 1) {
        reserve({ x: rail.start.x - vector.x * distance, y: rail.start.y - vector.y * distance }, rail.material);
        reserve({ x: rail.end.x + vector.x * distance, y: rail.end.y + vector.y * distance }, rail.material);
      }
    });
  }
  for (const placement of uniquePlacements) {
    rackOutputRails(placement.rack).forEach((local) => {
      const output = translatedRail(local, placement);
      const vector = directionVector(output.direction);
      reserve({ x: output.end.x + vector.x, y: output.end.y + vector.y }, output.material);
    });
  }
  const physicalTiles = drafts.flatMap(occupiedDraftTiles);
  const minimumX = Math.min(...physicalTiles.map((tile) => tile.x));
  const maximumX = Math.max(...physicalTiles.map((tile) => tile.x));
  const minimumY = Math.min(...physicalTiles.map((tile) => tile.y));
  const maximumY = Math.max(...physicalTiles.map((tile) => tile.y));
  const materialOrdinal = new Map([...materialConsumers.keys()].map((material, index) => [material, index]));
  const materialOrder = [...materialConsumers].sort((left, right) => {
    if (orderVariant === 6 && byMaterial.has(left[0]) !== byMaterial.has(right[0])) {
      return byMaterial.has(left[0]) ? -1 : 1;
    }
    if (orderVariant === 7 && right[1].length !== left[1].length) return left[1].length - right[1].length;
    if (orderVariant === 8 && left[1][0].type !== right[1][0].type) return left[1][0].type === "fluid" ? -1 : 1;
    if (orderVariant >= 9) {
      return stableOrdinalHash(materialOrdinal.get(left[0]) ?? 0, orderVariant * 2654435761) -
        stableOrdinalHash(materialOrdinal.get(right[0]) ?? 0, orderVariant * 2654435761);
    }
    if (right[1].length !== left[1].length) return right[1].length - left[1].length;
    const leftPoint = left[1][0].start;
    const rightPoint = right[1][0].start;
    if (orderVariant === 1) return leftPoint.y - rightPoint.y || leftPoint.x - rightPoint.x;
    if (orderVariant === 2) return rightPoint.y - leftPoint.y || rightPoint.x - leftPoint.x;
    if (orderVariant === 3) return leftPoint.x - rightPoint.x || leftPoint.y - rightPoint.y;
    if (orderVariant === 4) return rightPoint.x - leftPoint.x || rightPoint.y - leftPoint.y;
    return (materialOrdinal.get(left[0]) ?? 0) - (materialOrdinal.get(right[0]) ?? 0);
  });
  let boundaryIndex = 0;
  const usedPortTracks = new Set<number>();
  const boundaryPorts = new Map<string, Tile>();
  const inwardDirection: CardinalDirection = inputSide === "north" ? 8 :
    inputSide === "east" ? 12 : inputSide === "south" ? 0 : 4;
  const inwardVector = directionVector(inwardDirection);
  const laneCapacity = (Object.values(BELTS)
    .find((candidate) => candidate.entityName === beltName)?.itemsPerSecond ?? 45) / 2;
  for (const [material, consumers] of materialOrder) {
    if (byMaterial.has(material)) continue;
    const edgeConsumer = [...consumers].sort((left, right) => {
      if (inputSide === "west") return left.start.x - right.start.x || left.start.y - right.start.y;
      if (inputSide === "east") return right.start.x - left.start.x || left.start.y - right.start.y;
      if (inputSide === "north") return left.start.y - right.start.y || left.start.x - right.start.x;
      return right.start.y - left.start.y || left.start.x - right.start.x;
    })[0];
    const alignedTrack = inputSide === "west" || inputSide === "east"
      ? edgeConsumer.start.y
      : edgeConsumer.start.x;
    const alternateTrack = (inputSide === "west" || inputSide === "east" ? minimumY : minimumX) -
      3 - boundaryIndex * 2;
    const track = usedPortTracks.has(alignedTrack) ? alternateTrack : alignedTrack;
    usedPortTracks.add(track);
    const duplicatedConsumer = new Set(consumers.map((rail) => rail.consumerOrdinal)).size < consumers.length;
    const pointPortFanout = consumers.length > 1 && consumers.some((rail) =>
      rail.start.x === rail.end.x && rail.start.y === rail.end.y);
    const rateRequiresFanout = consumers.reduce((sum, rail) => sum + (rail.demandPerSecond ?? 0), 0) >
      laneCapacity + 1e-9;
    let boundaryClearance = (duplicatedConsumer || pointPortFanout) && rateRequiresFanout
      ? 10 + Math.max(0, consumers.length - 2) * 3
      : 3;
    const boundaryPoint = (clearance: number): Tile => inputSide === "west"
      ? { x: minimumX - clearance, y: track }
      : inputSide === "east"
        ? { x: maximumX + clearance, y: track }
        : inputSide === "north"
          ? { x: track, y: minimumY - clearance }
          : { x: track, y: maximumY + clearance };
    let port = boundaryPoint(boundaryClearance);
    // Aligned boundary ports are compact, but their first inward tile can
    // coincide with a differently-owned rack terminal near a concave edge.
    // Move only that port outward until both real belt tiles are attachable.
    while (boundaryClearance < 24) {
      const escapeKey = `${port.x + inwardVector.x},${port.y + inwardVector.y}`;
      const portKey = `${port.x},${port.y}`;
      if (!physicalTiles.some((tile) => `${tile.x},${tile.y}` === portKey) &&
        terminalCanBeClaimed(reservedOwners, escapeKey, material)) break;
      boundaryClearance += 1;
      port = boundaryPoint(boundaryClearance);
    }
    const type = consumers[0].type;
    drafts.push(type === "item"
      ? { role: "input-belt", material, name: beltName, position: tilePosition(port.x, port.y), direction: inwardDirection }
      : { role: "pipe", material, name: "pipe", position: tilePosition(port.x, port.y) });
    inputPositions.set(material, tilePosition(port.x, port.y));
    boundaryPorts.set(material, port);
    reserve({ x: port.x + inwardVector.x, y: port.y + inwardVector.y }, material);
    boundaryIndex += 1;
  }
  for (const [material, consumers] of materialOrder) {
    const producer = byMaterial.get(material);
    let sourceCursors: Array<{ point: Tile; direction: CardinalDirection; supplyPerSecond?: number }>;
    if (producer) {
      const placement = placements.get(material)!;
      sourceCursors = rackOutputRails(placement.rack).map((local) => {
        const output = translatedRail(local, placement);
        return { point: output.end, direction: output.direction, supplyPerSecond: local.supplyPerSecond };
      });
    } else {
      const port = boundaryPorts.get(material)!;
      sourceCursors = [{ point: port, direction: inwardDirection,
        supplyPerSecond: plan.inputs.find((input) => input.name === material)?.requiredPerSecond }];
    }
    const orderedByGraph = routedRailOrder(sourceCursors[0].point, consumers, orderVariant);
    const totalDemand = orderedByGraph.reduce((sum, rail) => sum + (rail.demandPerSecond ?? 0), 0);
    const serialCapacity = sourceCursors.length === 1 &&
      (sourceCursors[0].supplyPerSecond ?? 0) > laneCapacity + 1e-9
      ? laneCapacity * 2
      : laneCapacity;
    const continuationIsClear = (rail: Rail): boolean => {
      const vector = directionVector(rail.direction);
      const escape = { x: rail.end.x + vector.x, y: rail.end.y + vector.y };
      return !drafts.some((draft) => occupiedDraftTiles(draft)
        .some((tile) => tile.x === escape.x && tile.y === escape.y));
    };
    // A one-tile radial port has no safe continuation through its inserter.
    // At sub-lane rates, put that terminal last on a serial manifold; this is
    // both smaller and more reliable than adding a splitter solely because a
    // compact machine uses a point pickup.
    const ordered = totalDemand <= serialCapacity + 1e-9
      ? [...orderedByGraph].sort((left, right) =>
        Number(!continuationIsClear(left)) - Number(!continuationIsClear(right)) ||
        Number(left.start.x === left.end.x && left.start.y === left.end.y) -
        Number(right.start.x === right.end.x && right.start.y === right.end.y))
      : orderedByGraph;
    if (ordered[0].type === "item" && sourceCursors.length > 1) {
      if (sourceCursors.length === ordered.length) {
        if (!routeParallelItemChannels(drafts, material, beltName, sourceCursors,
          ordered, reservedTiles, reservedOwners)) return undefined;
        continue;
      }
      const channelOrdered = sourceCursors.length === ordered.length
        ? assignRailsToSources(sourceCursors, ordered)
        : ordered;
      if (sourceCursors.length <= ordered.length) {
        for (let sourceIndex = 0; sourceIndex < sourceCursors.length; sourceIndex += 1) {
          const from = Math.floor(sourceIndex * channelOrdered.length / sourceCursors.length);
          const to = Math.floor((sourceIndex + 1) * channelOrdered.length / sourceCursors.length);
          const assigned = channelOrdered.slice(from, Math.max(from + 1, to));
          if (assigned.length === 1) {
            const rail = assigned[0];
            const targetVector = directionVector(rail.direction);
            const targetIngress = `${rail.start.x - targetVector.x},${rail.start.y - targetVector.y}`;
            const source = sourceCursors[sourceIndex];
            const sourceVector = directionVector(source.direction);
            const sourceEscape = `${source.point.x + sourceVector.x},${source.point.y + sourceVector.y}`;
            const negotiated = new Set(reservedTiles);
            if (terminalCanBeClaimed(reservedOwners, sourceEscape, material)) negotiated.delete(sourceEscape);
            if (terminalCanBeClaimed(reservedOwners, targetIngress, material)) negotiated.delete(targetIngress);
            if (!routeBetween(drafts, material, beltName, source.point, source.direction,
              rail.start, rail.direction, 12, negotiated)) return undefined;
          } else {
            const assignedDemand = assigned.reduce((sum, rail) => sum + (rail.demandPerSecond ?? 0), 0);
            const canSerial = assignedDemand <= laneCapacity + 1e-9 && assigned.every((rail) =>
              rail.start.x !== rail.end.x || rail.start.y !== rail.end.y);
            if (canSerial) {
              const beforeSerial = drafts.length;
              let serialCursor = sourceCursors[sourceIndex];
              let serialRouted = true;
              for (const rail of assigned) {
                const targetVector = directionVector(rail.direction);
                const targetIngress = `${rail.start.x - targetVector.x},${rail.start.y - targetVector.y}`;
                const sourceVector = directionVector(serialCursor.direction);
                const sourceEscape = `${serialCursor.point.x + sourceVector.x},${serialCursor.point.y + sourceVector.y}`;
                const negotiated = new Set(reservedTiles);
                if (terminalCanBeClaimed(reservedOwners, sourceEscape, material)) negotiated.delete(sourceEscape);
                if (terminalCanBeClaimed(reservedOwners, targetIngress, material)) negotiated.delete(targetIngress);
                if (!routeBetween(drafts, material, beltName, serialCursor.point, serialCursor.direction,
                  rail.start, rail.direction, 32, negotiated)) {
                  serialRouted = false;
                  break;
                }
                serialCursor = { point: rail.end, direction: rail.direction };
              }
              if (!serialRouted) {
                drafts.length = beforeSerial;
                if (!routeItemFanout(drafts, material, beltName, sourceCursors[sourceIndex],
                  assigned, reservedTiles, reservedOwners)) return undefined;
              }
            } else if (!routeItemFanout(drafts, material, beltName, sourceCursors[sourceIndex],
              assigned, reservedTiles, reservedOwners)) return undefined;
          }
        }
        continue;
      }
      for (let consumerIndex = 0; consumerIndex < channelOrdered.length; consumerIndex += 1) {
        const from = Math.floor(consumerIndex * sourceCursors.length / channelOrdered.length);
        const to = Math.floor((consumerIndex + 1) * sourceCursors.length / channelOrdered.length);
        const assigned = sourceCursors.slice(from, Math.max(from + 1, to));
        if (assigned.length === 1) {
          const source = assigned[0];
          const rail = channelOrdered[consumerIndex];
          if (!routeBetween(drafts, material, beltName, source.point, source.direction,
            rail.start, rail.direction, 12, reservedTiles)) return undefined;
        } else if (!routeItemMerge(drafts, material, beltName, assigned,
          channelOrdered[consumerIndex], reservedTiles, reservedOwners)) return undefined;
      }
      continue;
    }
    let cursor = sourceCursors[0];
    const blockedContinuations = ordered.filter((rail) => !continuationIsClear(rail)).length;
    if (ordered[0].type === "item" && ordered.length > 1 &&
      (new Set(ordered.map((rail) => rail.consumerOrdinal)).size > 1 ||
        fanoutMaterials.has(material) ||
        blockedContinuations > 1 ||
        new Set(ordered.map((rail) => rail.consumerOrdinal)).size < ordered.length ||
        (totalDemand > serialCapacity + 1e-9 &&
          ordered.some((rail) => rail.start.x === rail.end.x && rail.start.y === rail.end.y)))) {
      if (!routeItemFanout(drafts, material, beltName, cursor, ordered, reservedTiles, reservedOwners)) return undefined;
      continue;
    }
    for (const rail of ordered) {
      const targetVector = directionVector(rail.direction);
      const targetIngress = `${rail.start.x - targetVector.x},${rail.start.y - targetVector.y}`;
      const routeWithDirection = (sourceDirection: CardinalDirection): boolean => {
        const sourceVector = directionVector(sourceDirection);
        const sourceEscape = `${cursor.point.x + sourceVector.x},${cursor.point.y + sourceVector.y}`;
        const routeReserved = reservationsAgainstMaterial(reservedTiles, reservedOwners, material);
        if (rail.type !== "item") return routePipeBetween(drafts, material, cursor.point, sourceDirection,
          rail.start, rail.direction, 14, routeReserved);
        for (let retry = 0; retry < 8; retry += 1) {
          const baseline = drafts.length;
          if (!routeBetween(drafts, material, beltName, cursor.point, sourceDirection,
            rail.start, rail.direction, 12, routeReserved)) return false;
          const violation = drafts.slice(baseline).flatMap(occupiedDraftTiles).find((tile) => {
            const owners = reservedOwners.get(`${tile.x},${tile.y}`);
            return owners !== undefined && [...owners].some((owner) => owner !== material);
          });
          if (!violation) return true;
          drafts.length = baseline;
          routeReserved.add(`${violation.x},${violation.y}`);
          lastRoutingDiagnostic = `${material} negotiated around foreign terminal ${violation.x},${violation.y}`;
        }
        return false;
      };
      const sourceDirections = rail.type === "item"
        ? [cursor.direction]
        : [...new Set<CardinalDirection>([
          cursor.direction,
          ((cursor.direction + 4) % 16) as CardinalDirection,
          ((cursor.direction + 12) % 16) as CardinalDirection,
          ((cursor.direction + 8) % 16) as CardinalDirection,
        ])];
      const routed = sourceDirections.some(routeWithDirection);
      if (!routed) {
        const sourceVector = directionVector(cursor.direction);
        const sourceEscapeKey = `${cursor.point.x + sourceVector.x},${cursor.point.y + sourceVector.y}`;
        lastRoutingDiagnostic += `; network=${material}; source=${producer ? "producer" : "boundary"}; ` +
          `source-owners=${[...(reservedOwners.get(sourceEscapeKey) ?? [])].join("|") || "none"}; ` +
          `target-owners=${[...(reservedOwners.get(targetIngress) ?? [])].join("|") || "none"}`;
        return undefined;
      }
      if (rail.type === "item" && !directedBeltPathExists(drafts, material, cursor.point, rail.start)) {
        lastRoutingDiagnostic = `${material} disconnected belt route ${cursor.point.x},${cursor.point.y} -> ` +
          `${rail.start.x},${rail.start.y}`;
        return undefined;
      }
      // Belts are directional and continue through each consumer rail. Pipes
      // are undirected networks: branch subsequent consumers from the shared
      // source manifold instead of forcing an artificial exit through a
      // machine header that may already be surrounded by solid-item belts.
      if (rail.type === "item") cursor = { point: rail.end, direction: rail.direction };
    }
  }
  for (const input of plan.inputs) {
    if (!inputPositions.has(input.name)) return undefined;
  }
  return inputPositions;
}

function routeExternalOutput(
  drafts: Draft[],
  material: string,
  beltName: string,
  sourceEnd: Tile,
  sourceDirection: CardinalDirection,
  side: Side,
  type: MaterialType,
): Tile | undefined {
  const occupied = drafts.flatMap(occupiedDraftTiles);
  const minimumX = Math.min(...occupied.map((tile) => tile.x));
  const maximumX = Math.max(...occupied.map((tile) => tile.x));
  const minimumY = Math.min(...occupied.map((tile) => tile.y));
  const maximumY = Math.max(...occupied.map((tile) => tile.y));
  const goal = side === "east" ? { x: maximumX + 3, y: sourceEnd.y } :
    side === "north" ? { x: maximumX + 3, y: minimumY - 3 } :
      side === "south" ? { x: maximumX + 3, y: maximumY + 3 } :
        { x: minimumX - 3, y: maximumY + 3 };
  // A synthetic target one tile beyond the requested port lets the same
  // capacity-aware router enforce the final belt orientation.
  const vector = directionVector(side === "north" ? 0 : side === "east" ? 4 : side === "south" ? 8 : 12);
  const syntheticTarget = { x: goal.x + vector.x, y: goal.y + vector.y };
  const finalDirection = side === "north" ? 0 : side === "east" ? 4 : side === "south" ? 8 : 12;
  if (type === "fluid") {
    drafts.push({ role: "pipe", material, name: "pipe", position: tilePosition(goal.x, goal.y) });
    if (!routePipeBetween(drafts, material, sourceEnd, sourceDirection,
      goal, finalDirection, 18)) return undefined;
    return goal;
  }
  if (!routeBetween(drafts, material, beltName, sourceEnd, sourceDirection,
    syntheticTarget, finalDirection, 18)) return undefined;
  return goal;
}

function collisionFree(drafts: Draft[]): boolean {
  const occupied = new Map<string, Draft>();
  for (const draft of drafts) {
    for (const tile of occupiedDraftTiles(draft)) {
      const key = `${tile.x},${tile.y}`;
      const previous = occupied.get(key);
      if (previous) {
        lastRoutingDiagnostic = `collision ${key}: ${previous.name}/${previous.material ?? "power"} + ` +
          `${draft.name}/${draft.material ?? "power"}`;
        return false;
      }
      occupied.set(key, draft);
    }
  }
  return true;
}

function undergroundPairsValid(drafts: Draft[]): boolean {
  const endpoints = drafts.filter((draft) => draft.undergroundType !== undefined);
  const outputs = new Set<Draft>();
  for (const input of endpoints.filter((draft) => draft.undergroundType === "input")) {
    if (input.direction === undefined) return false;
    const vector = directionVector(input.direction);
    const start = floorPosition(input.position);
    const output = endpoints.filter((candidate) => {
      if (candidate.undergroundType !== "output" || outputs.has(candidate) || candidate.name !== input.name ||
        candidate.material !== input.material || candidate.direction !== input.direction) return false;
      const end = floorPosition(candidate.position);
      const projection = (end.x - start.x) * vector.x + (end.y - start.y) * vector.y;
      const perpendicular = (end.x - start.x) * vector.y - (end.y - start.y) * vector.x;
      return perpendicular === 0 && projection > 0 && projection <= undergroundReach(input.name);
    }).sort((left, right) => {
      const a = floorPosition(left.position);
      const b = floorPosition(right.position);
      return Math.abs(a.x - start.x) + Math.abs(a.y - start.y) -
        Math.abs(b.x - start.x) - Math.abs(b.y - start.y);
    })[0];
    if (!output) {
      const start = floorPosition(input.position);
      lastRoutingDiagnostic = `unpaired ${input.name}/${input.material} input at ${start.x},${start.y} dir=${input.direction}`;
      return false;
    }
    outputs.add(output);
  }
  if (outputs.size !== endpoints.filter((draft) => draft.undergroundType === "output").length) return false;
  const pipes = drafts.filter((draft) => draft.name === "pipe-to-ground" && draft.direction !== undefined);
  const pairedPipes = new Set<Draft>();
  for (const entrance of pipes) {
    if (pairedPipes.has(entrance)) continue;
    const start = floorPosition(entrance.position);
    const undergroundDirection = ((entrance.direction! + 8) % 16) as CardinalDirection;
    const vector = directionVector(undergroundDirection);
    const exit = pipes.filter((candidate) => {
      if (candidate === entrance || pairedPipes.has(candidate) || candidate.material !== entrance.material ||
        candidate.direction !== undergroundDirection) return false;
      const end = floorPosition(candidate.position);
      const projection = (end.x - start.x) * vector.x + (end.y - start.y) * vector.y;
      const perpendicular = (end.x - start.x) * vector.y - (end.y - start.y) * vector.x;
      return perpendicular === 0 && projection > 0 && projection <= 10;
    }).sort((left, right) => {
      const a = floorPosition(left.position);
      const b = floorPosition(right.position);
      return Math.abs(a.x - start.x) + Math.abs(a.y - start.y) -
        Math.abs(b.x - start.x) - Math.abs(b.y - start.y);
    })[0];
    if (!exit) {
      const related = pipes.filter((candidate) => candidate.material === entrance.material)
        .map((candidate) => {
          const point = floorPosition(candidate.position);
          return `${point.x},${point.y}:${candidate.direction}`;
        }).join("|");
      lastRoutingDiagnostic = `unpaired pipe-to-ground/${entrance.material} at ${start.x},${start.y} ` +
        `dir=${entrance.direction}; endpoints=${related}`;
      return false;
    }
    pairedPipes.add(entrance);
    pairedPipes.add(exit);
  }
  return pairedPipes.size === pipes.length;
}

function materialIsolationValid(drafts: Draft[]): boolean {
  const transports = drafts.filter((draft) => draft.direction !== undefined &&
    (draft.name.includes("belt") || draft.name.includes("splitter")));
  const byTile = new Map<string, Draft[]>();
  transports.forEach((draft) => occupiedDraftTiles(draft).forEach((tile) => {
    const entries = byTile.get(`${tile.x},${tile.y}`) ?? [];
    entries.push(draft);
    byTile.set(`${tile.x},${tile.y}`, entries);
  }));
  return transports.every((draft) => {
    if (draft.undergroundType === "input") return true;
    const vector = directionVector(draft.direction!);
    return occupiedDraftTiles(draft).every((tile) => {
      const next = byTile.get(`${tile.x + vector.x},${tile.y + vector.y}`) ?? [];
      const compatible = (left: string | undefined, right: string | undefined): boolean => {
        if (left === right) return true;
        if (left?.startsWith("mix:")) return left.slice(4).split("|").includes(right ?? "");
        if (right?.startsWith("mix:")) return right.slice(4).split("|").includes(left ?? "");
        return false;
      };
      const incompatible = next.find((candidate) => !compatible(draft.material, candidate.material));
      if (incompatible) {
        lastRoutingDiagnostic = `item contamination ${tile.x},${tile.y} ` +
          `${draft.name}/${draft.material ?? "none"}/${draft.role} -> ` +
          `${tile.x + vector.x},${tile.y + vector.y} ` +
          `${incompatible.name}/${incompatible.material ?? "none"}/${incompatible.role}`;
        return false;
      }
      return true;
    });
  });
}

function fluidIsolationValid(drafts: Draft[]): boolean {
  const pipes = drafts.filter((draft) =>
    draft.name === "pipe" || draft.name === "pipe-to-ground" || draft.name === "pump");
  const byTile = new Map(pipes.map((draft) => {
    const tile = floorPosition(draft.position);
    return [`${tile.x},${tile.y}`, draft] as const;
  }));
  const connects = (draft: Draft, direction: CardinalDirection): boolean =>
    draft.name === "pipe" || (draft.name === "pump"
      ? draft.direction === direction || ((draft.direction! + 8) % 16) === direction
      : draft.direction === direction);
  for (const pipe of pipes) {
    const tile = floorPosition(pipe.position);
    for (const direction of [0, 4, 8, 12] as CardinalDirection[]) {
      if (!connects(pipe, direction)) continue;
      const vector = directionVector(direction);
      const neighbor = byTile.get(`${tile.x + vector.x},${tile.y + vector.y}`);
      if (!neighbor || !connects(neighbor, ((direction + 8) % 16) as CardinalDirection)) continue;
      if (neighbor.material !== pipe.material) {
        lastRoutingDiagnostic = `fluid contamination ${tile.x},${tile.y}: ${pipe.material} + ${neighbor.material}`;
        return false;
      }
    }
  }
  return true;
}

function connectPowerNetwork(drafts: Draft[]): boolean {
  const isPole = (draft: Draft): boolean => draft.role === "power-pole";
  const poleReach = (draft: Draft): number => draft.name === "substation" ? 18 : 9;
  const distance = (left: Tile, right: Tile): number => Math.hypot(left.x - right.x, left.y - right.y);
  const occupied = new Set(drafts.flatMap(occupiedDraftTiles).map((tile) => `${tile.x},${tile.y}`));
  let bridges = 0;
  while (bridges < 1_000) {
    const poles = drafts.filter(isPole);
    if (poles.length === 0) return false;
    const parent = poles.map((_, index) => index);
    const find = (index: number): number => {
      let cursor = index;
      while (parent[cursor] !== cursor) cursor = parent[cursor];
      while (parent[index] !== index) {
        const next = parent[index];
        parent[index] = cursor;
        index = next;
      }
      return cursor;
    };
    const union = (left: number, right: number): void => {
      const a = find(left);
      const b = find(right);
      if (a !== b) parent[b] = a;
    };
    for (let left = 0; left < poles.length; left += 1) {
      for (let right = left + 1; right < poles.length; right += 1) {
        if (distance(poles[left].position, poles[right].position) <=
          Math.min(poleReach(poles[left]), poleReach(poles[right])) + 1e-9) union(left, right);
      }
    }
    const roots = new Set(poles.map((_, index) => find(index)));
    if (roots.size === 1) return true;
    let nearest: { left: number; right: number; distance: number } | undefined;
    for (let left = 0; left < poles.length; left += 1) {
      for (let right = 0; right < poles.length; right += 1) {
        if (find(left) === find(right)) continue;
        const separation = distance(poles[left].position, poles[right].position);
        if (!nearest || separation < nearest.distance) nearest = { left, right, distance: separation };
      }
    }
    if (!nearest) return false;
    const from = floorPosition(poles[nearest.left].position);
    const target = floorPosition(poles[nearest.right].position);
    const candidates: Array<Tile & { targetDistance: number; stepDistance: number }> = [];
    for (let dx = -8; dx <= 8; dx += 1) for (let dy = -8; dy <= 8; dy += 1) {
      const stepDistance = Math.hypot(dx, dy);
      if (stepDistance < 1 || stepDistance > 8.5) continue;
      const point = { x: from.x + dx, y: from.y + dy };
      if (occupied.has(`${point.x},${point.y}`)) continue;
      const targetDistance = distance(point, target);
      if (targetDistance >= nearest.distance - 0.5) continue;
      candidates.push({ ...point, targetDistance, stepDistance });
    }
    candidates.sort((left, right) => left.targetDistance - right.targetDistance ||
      right.stepDistance - left.stepDistance || left.y - right.y || left.x - right.x);
    const next = candidates[0];
    if (!next) {
      lastRoutingDiagnostic = `power bridge blocked ${from.x},${from.y} -> ${target.x},${target.y}`;
      return false;
    }
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(next.x, next.y) });
    occupied.add(`${next.x},${next.y}`);
    bridges += 1;
  }
  lastRoutingDiagnostic = "power bridge iteration limit";
  return false;
}

function powerCoverageValid(drafts: Draft[]): boolean {
  const poles = drafts.filter((draft) => draft.role === "power-pole");
  const powered = drafts.filter((draft) =>
    draft.name === "assembling-machine-3" || draft.name === "electric-furnace" ||
    draft.name === "chemical-plant" || draft.name.endsWith("inserter") || draft.name === "pump");
  const supplyDistance = (pole: Draft): number => pole.name === "substation" ? 9 : 3.5;
  return poles.length > 0 && powered.every((entity) => {
    const half = draftHalfSize(entity);
    return poles.some((pole) =>
      Math.abs(entity.position.x - pole.position.x) <= supplyDistance(pole) + half.x + 1e-9 &&
      Math.abs(entity.position.y - pole.position.y) <= supplyDistance(pole) + half.y + 1e-9);
  });
}

function ensurePowerCoverage(drafts: Draft[]): boolean {
  const powered = drafts.filter((draft) =>
    draft.name === "assembling-machine-3" || draft.name === "electric-furnace" ||
    draft.name === "chemical-plant" || draft.name.endsWith("inserter") || draft.name === "pump");
  const covered = (entity: Draft): boolean => {
    const half = draftHalfSize(entity);
    return drafts.some((pole) => pole.role === "power-pole" &&
      Math.abs(entity.position.x - pole.position.x) <= (pole.name === "substation" ? 9 : 3.5) + half.x + 1e-9 &&
      Math.abs(entity.position.y - pole.position.y) <= (pole.name === "substation" ? 9 : 3.5) + half.y + 1e-9);
  };
  const occupied = new Set(drafts.flatMap(occupiedDraftTiles).map((tile) => `${tile.x},${tile.y}`));
  for (const entity of powered) {
    if (covered(entity)) continue;
    const center = floorPosition(entity.position);
    const existingPoles = drafts.filter((draft) => draft.role === "power-pole");
    const candidates: Array<Tile & { networkDistance: number; entityDistance: number }> = [];
    for (let dx = -4; dx <= 4; dx += 1) for (let dy = -4; dy <= 4; dy += 1) {
      const tile = { x: center.x + dx, y: center.y + dy };
      if (occupied.has(`${tile.x},${tile.y}`)) continue;
      const position = tilePosition(tile.x, tile.y);
      const half = draftHalfSize(entity);
      if (Math.abs(entity.position.x - position.x) > 3.5 + half.x + 1e-9 ||
        Math.abs(entity.position.y - position.y) > 3.5 + half.y + 1e-9) continue;
      const networkDistance = existingPoles.length === 0 ? 0 : Math.min(...existingPoles.map((pole) =>
        Math.hypot(position.x - pole.position.x, position.y - pole.position.y)));
      candidates.push({ ...tile, networkDistance, entityDistance: Math.hypot(dx, dy) });
    }
    candidates.sort((left, right) => left.networkDistance - right.networkDistance ||
      left.entityDistance - right.entityDistance || left.y - right.y || left.x - right.x);
    const selected = candidates[0];
    if (!selected) {
      lastRoutingDiagnostic = `no collision-free power coverage tile near ${entity.name} ` +
        `${entity.position.x},${entity.position.y}`;
      return false;
    }
    drafts.push({ role: "power-pole", name: "medium-electric-pole",
      position: tilePosition(selected.x, selected.y) });
    occupied.add(`${selected.x},${selected.y}`);
  }
  return powerCoverageValid(drafts);
}

function measure(layout: CanonicalLayout): GlobalSynthesisMetrics {
  const extents = layout.drafts.map((draft) => {
    const half = draftHalfSize(draft);
    return {
      minimumX: draft.position.x - half.x,
      maximumX: draft.position.x + half.x,
      minimumY: draft.position.y - half.y,
      maximumY: draft.position.y + half.y,
    };
  });
  const width = Math.ceil(Math.max(...extents.map((extent) => extent.maximumX)) -
    Math.min(...extents.map((extent) => extent.minimumX)));
  const height = Math.ceil(Math.max(...extents.map((extent) => extent.maximumY)) -
    Math.min(...extents.map((extent) => extent.minimumY)));
  const area = width * height;
  const transportEntities = layout.drafts.filter((draft) =>
    draft.name.includes("belt") || draft.name.includes("splitter") || draft.name.includes("pipe") ||
      draft.name === "pump").length;
  const undergroundEntities = layout.drafts.filter((draft) => draft.undergroundType !== undefined ||
    draft.name === "pipe-to-ground").length;
  return {
    policy: "global-physical-synthesis",
    width,
    height,
    area,
    entityCount: layout.drafts.length,
    transportEntities,
    undergroundEntities,
    score: area * 10 + transportEntities * 2 + undergroundEntities * 8 + Math.max(width, height) * 25,
  };
}

function buildIntegratedItemCandidates(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
  reportSearch?: (detail: string) => void,
): GlobalSynthesisCandidate[] {
  const belt = BELTS[beltTier];
  const consumerCounts = new Map<string, number>();
  plan.recipes.forEach((planned) => planned.ingredientRates.forEach((ingredient) =>
    consumerCounts.set(ingredient.name, (consumerCounts.get(ingredient.name) ?? 0) + 1)));
  const terminalMaterials = new Set([...consumerCounts]
    .filter(([, consumers]) => consumers === 1)
    .map(([material]) => material));
  const fanoutMaterials = new Set(plan.recipes
    .filter((producer) => producer.materialType === "item" &&
      (consumerCounts.get(producer.material) ?? 0) >= 2)
    .map((planned) => planned.material));
  const itemFanoutCount = fanoutMaterials.size;
  const hasItemFanout = itemFanoutCount > 0;
  const complexFanout = itemFanoutCount >= 4;
  // Several fan-out intermediates make a single, preselected socket geometry
  // brittle: a linear face may waste area while a radial face may make global
  // routing harder. Keep both legal, rate-derived neighborhoods in the same
  // floorplanning beam and let the routed whole-factory objective choose.
  // This is a topology portfolio, not a recipe-specific layout library.
  const searchCompactInternalTopologies = itemFanoutCount >= 2;
  const byMaterial = new Map(plan.recipes.map((planned) => [planned.material, planned]));
  const embedded = new Set<string>();
  const pairByConsumer = new Map<string, MachineRack>();
  const pairCandidates = plan.recipes.flatMap((consumer) => consumer.ingredientRates
    .map((ingredient) => byMaterial.get(ingredient.name))
    .filter((source): source is PlannedRecipe => source !== undefined)
    .map((source) => ({ source, consumer, rate: plan.materialRates[source.material] ?? 0 })))
    .filter(({ source }) => terminalMaterials.has(source.material))
    .sort((left, right) => right.rate - left.rate);
  for (const { source, consumer } of pairCandidates) {
    if (embedded.has(source.material) || embedded.has(consumer.material) || pairByConsumer.has(consumer.material)) continue;
    const pair = buildDirectPairRack(source, consumer, belt.entityName) ??
      buildGeneralDirectPairRack(source, consumer, belt.entityName);
    if (!pair) continue;
    embedded.add(source.material);
    embedded.add(consumer.material);
    pairByConsumer.set(consumer.material, pair);
  }
  const failedRacks: string[] = [];
  const topologyVariants = new Map<string, MachineRack[]>();
  const racks = plan.recipes.flatMap((planned) => {
    const pair = pairByConsumer.get(planned.material);
    if (pair) {
      topologyVariants.set(planned.material, [pair]);
      return [pair];
    }
    if (embedded.has(planned.material)) return [];
    const rack = buildMachineRack(planned, belt.entityName, terminalMaterials, false);
    if (!rack) failedRacks.push(planned.material);
    if (rack) {
      const variants = [rack];
      if (searchCompactInternalTopologies) {
        const compact = buildMachineRack(planned, belt.entityName, terminalMaterials, true);
        if (compact && rackTopologySignature(compact) !== rackTopologySignature(rack)) variants.push(compact);
      }
      topologyVariants.set(planned.material, variants);
    }
    return rack ? [rack] : [];
  });
  if (racks.length + embedded.size / 2 !== plan.recipes.length) {
    throw new Error(`Global rack synthesis failed for ${failedRacks.join(",")}; last=${lastRoutingDiagnostic}.`);
  }
  const physicalMachineCount = plan.recipes.reduce((sum, planned) => sum + planned.machineCount, 0);
  // At a belt-limited boundary, smelting and cable racks can contain hundreds
  // of machines. Routing forty-one ordering restarts through each enormous
  // floorplan adds minutes while contributing negligible placement diversity.
  // Keep the same global solver and seeds, but spend the beam/restart budget on
  // geometry rather than repeating equivalent routes through unavoidable rows.
  const capacityScale = physicalMachineCount > 256;
  const moderateScale = !capacityScale && physicalMachineCount > 64 &&
    (racks.length > 7 || complexFanout);
  const compactRacks = racks.map((rack) => topologyVariants.get(rack.planned.material)?.at(-1) ?? rack);
  const hasCompactFamily = compactRacks.some((rack, index) =>
    rackTopologySignature(rack) !== rackTopologySignature(racks[index]));
  const rackFamilies = hasCompactFamily ? [compactRacks, racks] : [racks];
  const searchedPlacementStates = rackFamilies.flatMap((family, familyIndex) => {
    const compactFamily = hasCompactFamily && familyIndex === 0;
    const preferredFamily = !hasCompactFamily || compactFamily;
    return capacityScale
      ? searchPlacements(family, plan, 8, false, new Map(), reportSearch)
      : moderateScale || complexFanout
        ? [
          ...searchPlacements(family, plan, preferredFamily ? 40 : 8, false, new Map(), reportSearch),
          ...searchPlacements(family, plan, preferredFamily ? 24 : 4, true, new Map(), reportSearch),
        ]
        : [
          ...searchPlacements(family, plan, preferredFamily ? 120 : 24, false, new Map(), reportSearch),
          ...searchPlacements(family, plan, preferredFamily ? 72 : 16, true, new Map(), reportSearch),
        ];
  });
  // A smaller mixed-topology beam explores combinations between the two
  // complete families. Keeping the complete-family beams as well prevents a
  // locally attractive topology choice from pruning the globally better one
  // before routing has supplied the decisive evidence.
  if (hasCompactFamily && !capacityScale) {
    searchedPlacementStates.push(
      ...searchPlacements(racks, plan, moderateScale || complexFanout ? 4 : 8,
        false, topologyVariants, reportSearch),
      ...searchPlacements(racks, plan, moderateScale || complexFanout ? 2 : 4,
        true, topologyVariants, reportSearch),
    );
  }
  const seededPlacementStates = rackFamilies.flatMap((family) => [
    layeredPlacement(family, plan, 1),
    layeredPlacement(family, plan, 2),
    layeredPlacement(family, plan, 3),
    layeredPlacement(family, plan, 4),
    layeredPlacement(family, plan, 7),
    layeredPlacement(family, plan, 10),
    layeredPlacement(family, plan, 7, true),
    seededPlacement(family, plan, "horizontal"),
    seededPlacement(family, plan, "vertical"),
    seededPlacement(family, plan, "shelf"),
    seededPlacement(family, plan, "diagonal"),
  ]);
  const placementSignatures = new Set<string>();
  const recipeOrder = new Map(plan.recipes.map((planned, index) => [planned.material, index]));
  const placementStates = [...seededPlacementStates, ...searchedPlacementStates].filter((state) => {
    const signature = [...state.placements]
      .sort(([left], [right]) => (recipeOrder.get(left) ?? 0) - (recipeOrder.get(right) ?? 0))
      .map(([material, placement]) => {
        const rack = placement.rack;
        const firstDirectional = rack.drafts.find((draft) => draft.direction !== undefined);
        return `${recipeOrder.get(material) ?? -1}:${placement.x},${placement.y}:${rack.minimumX},${rack.maximumX},` +
          `${rack.minimumY},${rack.maximumY}:${firstDirectional?.direction ?? "x"}:` + rackTopologySignature(rack);
      }).join("|");
    if (placementSignatures.has(signature)) return false;
    placementSignatures.add(signature);
    return true;
  });
  // Route the requested boundaries directly. Rotating a finished factory is
  // not physically equivalent in Factorio: assembling-machine fluid boxes do
  // not rotate with the blueprint entity. Direct side routing keeps every
  // recipe socket attached while still supporting all 16 side combinations.
  const rotationQuarterTurns = 0;
  const canonicalOutputSide = outputSide;
  const candidates: GlobalSynthesisCandidate[] = [];
  let materialRoutingFailures = 0;
  let outputRoutingFailures = 0;
  let collisionFailures = 0;
  let collisionDiagnostic = "none";
  let undergroundFailures = 0;
  let undergroundDiagnostic = "none";
  let isolationFailures = 0;
  let fluidIsolationFailures = 0;
  let powerFailures = 0;
  let bestCandidateScore = Number.POSITIVE_INFINITY;
  let lastImprovementState = 0;
  for (const [stateIndex, state] of placementStates.entries()) {
    if (capacityScale && candidates.length >= 4 && stateIndex >= 16) break;
    // Beam states are score-ordered. Once a full candidate frontier has gone
    // forty-eight additional floorplans without improvement, subsequent
    // states are dominated in both packing lower bound and routed score.
    // This is deterministic convergence, not a wall-clock cutoff.
    if (candidates.length >= 1 && stateIndex >= 64 && stateIndex - lastImprovementState >= 48) break;
    const progressInterval = Math.max(1, Math.floor(placementStates.length / 10));
    if (stateIndex % progressInterval === 0) {
      reportSearch?.(`Routing floorplan ${stateIndex + 1}/${placementStates.length}; ` +
        `${candidates.length} validated candidate${candidates.length === 1 ? "" : "s"}`);
    }
    const stateWidth = state.maximumX - state.minimumX + 1;
    const stateHeight = state.maximumY - state.minimumY + 1;
    const physicalLowerBound = stateWidth * stateHeight * 10 + Math.max(stateWidth, stateHeight) * 25;
    if (physicalLowerBound >= bestCandidateScore) continue;
    const orderVariants = capacityScale
      ? [0, 1, 2, 3]
      : moderateScale
        ? [0, 1, 2, 3]
      : complexFanout
        ? [0, 1]
      : hasItemFanout || candidates.length >= 16
        ? [0, 1, 2, 3, 4, 5, 6, 7, 8]
      : stateIndex < 24
      ? Array.from({ length: 41 }, (_, index) => index)
      : [0, 1, 2, 3, 4, 5, 6, 7, 8];
    for (const orderVariant of orderVariants) {
      const drafts = translatedDrafts(state);
      const inputPositions = routeMaterialNetworks(
        drafts,
        state,
        plan,
        belt.entityName,
        inputSide,
        fanoutMaterials,
        orderVariant,
      );
      if (!inputPositions) {
        materialRoutingFailures += 1;
        continue;
      }
      const targetPlacement = state.placements.get(plan.target)!;
      const targetOutputRails = rackOutputRails(targetPlacement.rack)
        .map((rail) => translatedRail(rail, targetPlacement));
      let targetOutputRail = targetOutputRails[0];
      if (plan.targetType === "item" && targetOutputRails.length > 1) {
        const tiles = drafts.flatMap(occupiedDraftTiles);
        const minimumX = Math.min(...tiles.map((tile) => tile.x));
        const maximumX = Math.max(...tiles.map((tile) => tile.x));
        const minimumY = Math.min(...tiles.map((tile) => tile.y));
        const maximumY = Math.max(...tiles.map((tile) => tile.y));
        const centerX = Math.round((minimumX + maximumX) / 2);
        const centerY = Math.round((minimumY + maximumY) / 2);
        const outwardDirection: CardinalDirection = canonicalOutputSide === "north" ? 0 :
          canonicalOutputSide === "east" ? 4 : canonicalOutputSide === "south" ? 8 : 12;
        const mergeClearance = 24 + targetOutputRails.length * 3;
        const mergePoint = canonicalOutputSide === "north" ? { x: centerX, y: minimumY - mergeClearance } :
          canonicalOutputSide === "east" ? { x: maximumX + mergeClearance, y: centerY } :
            canonicalOutputSide === "south" ? { x: centerX, y: maximumY + mergeClearance } :
              { x: minimumX - mergeClearance, y: centerY };
        targetOutputRail = {
          material: plan.target,
          type: "item",
          start: mergePoint,
          end: mergePoint,
          direction: outwardDirection,
          supplyPerSecond: plan.effectiveOutputPerSecond,
        };
        drafts.push({ role: "output-belt", material: plan.target, name: belt.entityName,
          position: tilePosition(mergePoint.x, mergePoint.y), direction: outwardDirection });
        const sources = targetOutputRails.map((rail) => ({ point: rail.end, direction: rail.direction }));
        if (!routeItemMerge(drafts, plan.target, belt.entityName, sources,
          targetOutputRail, new Set(), new Map())) {
          outputRoutingFailures += 1;
          continue;
        }
      }
      const outputPosition = routeExternalOutput(
        drafts,
        plan.target,
        belt.entityName,
        targetOutputRail.end,
        targetOutputRail.direction,
        canonicalOutputSide,
        plan.targetType,
      );
      if (!outputPosition) {
        outputRoutingFailures += 1;
        continue;
      }
      if (!ensurePowerCoverage(drafts) || !connectPowerNetwork(drafts) || !powerCoverageValid(drafts)) {
        powerFailures += 1;
        continue;
      }
      if (!collisionFree(drafts)) {
        collisionFailures += 1;
        collisionDiagnostic = lastRoutingDiagnostic;
        continue;
      }
      if (!undergroundPairsValid(drafts)) {
        undergroundFailures += 1;
        undergroundDiagnostic = lastRoutingDiagnostic;
        continue;
      }
      if (!materialIsolationValid(drafts)) {
        isolationFailures += 1;
        continue;
      }
      if (!fluidIsolationValid(drafts)) {
        fluidIsolationFailures += 1;
        continue;
      }
      const layout: CanonicalLayout = {
        drafts,
        inputPositions,
        outputPosition: tilePosition(outputPosition.x, outputPosition.y),
        canonicalOutputSide,
        rotationQuarterTurns,
      };
      const metrics = measure(layout);
      if (metrics.score < bestCandidateScore) lastImprovementState = stateIndex;
      bestCandidateScore = Math.min(bestCandidateScore, metrics.score);
      candidates.push({ layout, metrics });
      if (candidates.length > 16) {
        candidates.sort((left, right) => left.metrics.score - right.metrics.score);
        candidates.length = 16;
      }
    }
  }
  if (candidates.length === 0 && placementStates.length > 0) {
    throw new Error(
      `Global routing rejected ${placementStates.length} placements for ${plan.target}: ` +
      `material=${materialRoutingFailures}, output=${outputRoutingFailures}, collision=${collisionFailures}, ` +
      `underground=${undergroundFailures}, isolation=${isolationFailures}, ` +
      `fluid-isolation=${fluidIsolationFailures}, power=${powerFailures}; collision-detail=${collisionDiagnostic}; ` +
      `underground-detail=${undergroundDiagnostic}; last=${lastRoutingDiagnostic}.`,
    );
  }
  return candidates.sort((left, right) => left.metrics.score - right.metrics.score);
}

/**
 * The only recursive production-layout entrypoint. Unsupported physical
 * graphs fail explicitly; no legacy cell, island, motif, or bus compiler is
 * consulted after this function begins.
 */
export function synthesizeGlobalFactory(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
  reportSearch?: (detail: string) => void,
): GlobalSynthesisCandidate[] {
  const candidates = buildIntegratedItemCandidates(plan, inputSide, outputSide, beltTier, reportSearch);
  if (candidates.length === 0) {
    throw new Error(
      `The global physical synthesizer could not route ${plan.target}; ` +
      "no legacy layout fallback is available.",
    );
  }
  return candidates;
}
