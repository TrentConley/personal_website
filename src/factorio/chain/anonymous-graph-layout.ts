import { BELTS } from "../core/throughput";
import type { CardinalDirection, Side } from "../core/types";
import type { CanonicalLayout, Draft } from "./layout";
import type { CatalogRecipe, ChainEntityRole, ChainPlan, PlannedRecipe } from "./types";

const SIDE_INDEX: Record<Side, number> = { north: 0, east: 1, south: 2, west: 3 };
const INDEX_SIDE: Side[] = ["north", "east", "south", "west"];
const MACHINE_PITCH = 4;
const ROW_PITCH = 9;
const SAFE_BULK_BELT_INPUT = 1.8;
const SAFE_BULK_BELT_OUTPUT = 1.8;
const SAFE_LONG_BELT_INPUT = 0.72;

type MachineSide = "north" | "south";
type FeederChannel = "north-near" | "north-far" | "south-near" | "south-far";

interface DemandRef {
  consumerBlockId?: number;
  ingredientIndex?: number;
  outputIndex?: number;
  rate: number;
}

interface GraphIngredient {
  material: string;
  rate: number;
  streamId?: number;
  channel?: FeederChannel;
  feederY?: number;
}

interface GraphBlock {
  id: number;
  recipeOrder: number;
  material: string;
  recipe: CatalogRecipe;
  outputRate: number;
  ingredients: GraphIngredient[];
  outputStreamId: number;
  machineCount: number;
  outputSide: MachineSide;
  outputInserters: number;
  ingredientInserters: number[];
  centerY: number;
  outputY: number;
  lastMachineX: number;
}

interface GraphStream {
  id: number;
  material: string;
  boundary: boolean;
  target: boolean;
  producerBlockIds: number[];
  demands: DemandRef[];
  color: number;
  startY: number;
  endY: number;
  path: Array<{ x: number; y: number }>;
}

interface ChannelDefinition {
  key: FeederChannel;
  side: MachineSide;
  inserter: "bulk-inserter" | "long-handed-inserter";
  capacity: number;
}

const CHANNELS: Record<FeederChannel, ChannelDefinition> = {
  "north-near": { key: "north-near", side: "north", inserter: "bulk-inserter", capacity: SAFE_BULK_BELT_INPUT },
  "north-far": { key: "north-far", side: "north", inserter: "long-handed-inserter", capacity: SAFE_LONG_BELT_INPUT },
  "south-near": { key: "south-near", side: "south", inserter: "bulk-inserter", capacity: SAFE_BULK_BELT_INPUT },
  "south-far": { key: "south-far", side: "south", inserter: "long-handed-inserter", capacity: SAFE_LONG_BELT_INPUT },
};

function tilePosition(x: number, y: number): { x: number; y: number } {
  return { x: x + 0.5, y: y + 0.5 };
}

function directionBetween(from: { x: number; y: number }, to: { x: number; y: number }): CardinalDirection {
  if (to.x === from.x && to.y === from.y - 1) return 0;
  if (to.x === from.x + 1 && to.y === from.y) return 4;
  if (to.x === from.x && to.y === from.y + 1) return 8;
  if (to.x === from.x - 1 && to.y === from.y) return 12;
  throw new Error("Anonymous graph routes must use one-tile cardinal steps.");
}

function appendLine(path: Array<{ x: number; y: number }>, target: { x: number; y: number }): void {
  if (path.length === 0) {
    path.push(target);
    return;
  }
  let current = path.at(-1)!;
  if (current.x !== target.x && current.y !== target.y) {
    throw new Error("Anonymous graph polylines cannot contain diagonal segments.");
  }
  const stepX = Math.sign(target.x - current.x);
  const stepY = Math.sign(target.y - current.y);
  while (current.x !== target.x || current.y !== target.y) {
    current = { x: current.x + stepX, y: current.y + stepY };
    path.push(current);
  }
}

function permutations<T>(values: T[], length: number): T[][] {
  if (length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)], length - 1)
      .map((suffix) => [value, ...suffix]));
}

function synthesizeBlock(block: GraphBlock, planned: PlannedRecipe): void {
  const minimumMachines = Math.max(
    1,
    Math.ceil(block.outputRate / planned.machineCapacityPerSecond - 1e-12),
  );
  let best: {
    machineCount: number;
    outputSide: MachineSide;
    channels: FeederChannel[];
    ingredientInserters: number[];
    outputInserters: number;
    score: number;
  } | undefined;

  for (let machineCount = minimumMachines; machineCount <= minimumMachines + 96 && !best; machineCount += 1) {
    for (const outputSide of ["south", "north"] as const) {
      const available = (Object.keys(CHANNELS) as FeederChannel[])
        .filter((channel) => channel !== `${outputSide}-near`);
      for (const assignment of permutations(available, block.ingredients.length)) {
        const outputInserters = Math.max(
          1,
          Math.ceil(block.outputRate / machineCount / SAFE_BULK_BELT_OUTPUT - 1e-12),
        );
        const ingredientInserters = block.ingredients.map((ingredient, index) => Math.max(
          1,
          Math.ceil(ingredient.rate / machineCount / CHANNELS[assignment[index]].capacity - 1e-12),
        ));
        const northSlots = ingredientInserters.reduce(
          (sum, count, index) => sum + (CHANNELS[assignment[index]].side === "north" ? count : 0),
          outputSide === "north" ? outputInserters : 0,
        );
        const southSlots = ingredientInserters.reduce(
          (sum, count, index) => sum + (CHANNELS[assignment[index]].side === "south" ? count : 0),
          outputSide === "south" ? outputInserters : 0,
        );
        if (northSlots > 3 || southSlots > 3) continue;
        const longInserters = ingredientInserters.reduce(
          (sum, count, index) => sum + (assignment[index].endsWith("far") ? count : 0),
          0,
        );
        const score = longInserters * 20 + ingredientInserters.reduce((sum, count) => sum + count, outputInserters);
        if (!best || score < best.score) {
          best = { machineCount, outputSide, channels: assignment, ingredientInserters, outputInserters, score };
        }
      }
    }
  }
  if (!best) throw new Error(`No anonymous three-tile row can serve recipe arity ${block.ingredients.length}.`);
  block.machineCount = best.machineCount;
  block.outputSide = best.outputSide;
  block.outputInserters = best.outputInserters;
  block.ingredientInserters = best.ingredientInserters;
  block.ingredients.forEach((ingredient, index) => {
    ingredient.channel = best!.channels[index];
  });
  block.lastMachineX = (block.machineCount - 1) * MACHINE_PITCH;
}

function blockOutputCapacity(
  planned: PlannedRecipe,
  boundaryMaterials: Set<string>,
  beltCapacity: number,
): number {
  const laneCapacity = beltCapacity / 2;
  let capacity = laneCapacity;
  for (const ingredient of planned.ingredientRates) {
    const ratio = ingredient.perSecond / planned.outputPerSecond;
    const transportCapacity = boundaryMaterials.has(ingredient.name) ? beltCapacity : laneCapacity;
    capacity = Math.min(capacity, transportCapacity / ratio);
  }
  return capacity;
}

function splitDemand(reference: DemandRef, capacity: number): DemandRef[] {
  const count = Math.max(1, Math.ceil(reference.rate / capacity - 1e-12));
  return Array.from({ length: count }, (_, index) => ({
    ...reference,
    rate: index + 1 === count
      ? reference.rate - capacity * (count - 1)
      : capacity,
  }));
}

function packDemands(references: DemandRef[], capacity: number): DemandRef[][] {
  const bins: DemandRef[][] = [];
  const totals: number[] = [];
  for (const reference of references) {
    if (reference.rate > capacity + 1e-8) {
      throw new Error("A consumer ingredient would require more than one anonymous stream.");
    }
    let bin = totals.findIndex((total) => total + reference.rate <= capacity + 1e-8);
    if (bin < 0) {
      bin = bins.length;
      bins.push([]);
      totals.push(0);
    }
    bins[bin].push(reference);
    totals[bin] += reference.rate;
  }
  return bins;
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

function placeBlockEntities(drafts: Draft[], block: GraphBlock): void {
  const northOffsets = [-1, 0, 1];
  const southOffsets = [-1, 0, 1];
  let northCursor = 0;
  let southCursor = 0;
  const groupOffsets: number[][] = block.ingredients.map(() => []);
  block.ingredients.forEach((ingredient, ingredientIndex) => {
    const channel = CHANNELS[ingredient.channel!];
    const offsets = channel.side === "north" ? northOffsets : southOffsets;
    const cursor = channel.side === "north" ? northCursor : southCursor;
    groupOffsets[ingredientIndex] = offsets.slice(cursor, cursor + block.ingredientInserters[ingredientIndex]);
    if (channel.side === "north") northCursor += block.ingredientInserters[ingredientIndex];
    else southCursor += block.ingredientInserters[ingredientIndex];
  });
  const outputOffsets = block.outputSide === "north"
    ? northOffsets.slice(northCursor, northCursor + block.outputInserters)
    : southOffsets.slice(southCursor, southCursor + block.outputInserters);

  for (let machine = 0; machine < block.machineCount; machine += 1) {
    const machineX = machine * MACHINE_PITCH;
    drafts.push({
      role: "machine",
      material: block.material,
      recipe: block.recipe.id,
      name: block.recipe.machine.name,
      position: tilePosition(machineX, block.centerY),
      direction: 0,
      recipeSetting: block.recipe.id,
    });
    block.ingredients.forEach((ingredient, ingredientIndex) => {
      const channel = CHANNELS[ingredient.channel!];
      for (const offset of groupOffsets[ingredientIndex]) {
        addInserter(
          drafts,
          "input-inserter",
          ingredient.material,
          block.recipe.id,
          channel.inserter,
          machineX + offset,
          block.centerY + (channel.side === "north" ? -2 : 2),
          channel.side === "north" ? 0 : 8,
        );
      }
    });
    for (const offset of outputOffsets) {
      addInserter(
        drafts,
        "output-inserter",
        block.material,
        block.recipe.id,
        "bulk-inserter",
        machineX + offset,
        block.centerY + (block.outputSide === "north" ? -2 : 2),
        block.outputSide === "north" ? 8 : 0,
      );
    }
  }
  for (let machine = 0; machine + 1 < block.machineCount; machine += 2) {
    drafts.push({ role: "power-pole", name: "medium-electric-pole", position: tilePosition(machine * 4 + 2, block.centerY) });
  }
  if (block.machineCount % 2 === 1) {
    drafts.push({
      role: "power-pole",
      name: "medium-electric-pole",
      position: tilePosition((block.machineCount - 1) * 4 + 2, block.centerY),
    });
  }
}

function feederOffset(channel: FeederChannel): number {
  if (channel === "north-near") return -3;
  if (channel === "north-far") return -4;
  if (channel === "south-near") return 3;
  return 4;
}

function buildGraph(plan: ChainPlan, beltCapacity: number): { blocks: GraphBlock[]; streams: GraphStream[] } | undefined {
  if (plan.targetType !== "item" || plan.recipes.length === 0) return undefined;
  if (plan.recipes.some((planned) =>
    planned.materialType !== "item" ||
    planned.recipe.ingredients.length === 0 ||
    planned.recipe.ingredients.length > 3 ||
    planned.recipe.ingredients.some((ingredient) => ingredient.type !== "item") ||
    planned.recipe.result.type !== "item")) return undefined;

  const boundaryMaterials = new Set(plan.inputs.map((input) => input.name));
  const plannedByMaterial = new Map(plan.recipes.map((planned) => [planned.material, planned]));
  const recipeOrder = new Map(plan.recipes.map((planned, index) => [planned.material, index]));
  const pending = new Map<string, DemandRef[]>();
  const blocks: GraphBlock[] = [];
  const streams: GraphStream[] = [];
  const targetPlanned = plannedByMaterial.get(plan.target);
  if (!targetPlanned) return undefined;
  const targetCapacity = blockOutputCapacity(targetPlanned, boundaryMaterials, beltCapacity);
  pending.set(plan.target, splitDemand({ rate: plan.effectiveOutputPerSecond, outputIndex: 0 }, targetCapacity));

  for (let recipeIndex = plan.recipes.length - 1; recipeIndex >= 0; recipeIndex -= 1) {
    const planned = plan.recipes[recipeIndex];
    const demands = pending.get(planned.material) ?? [];
    if (demands.length === 0) continue;
    const capacity = blockOutputCapacity(planned, boundaryMaterials, beltCapacity);
    const expandedDemands = demands.flatMap((demand) => splitDemand(demand, capacity));
    for (const bin of packDemands(expandedDemands, capacity)) {
      const outputRate = bin.reduce((sum, demand) => sum + demand.rate, 0);
      const blockId = blocks.length;
      const sharedTargetStream = planned.material === plan.target
        ? streams.find((stream) => stream.target)
        : undefined;
      const streamId = sharedTargetStream?.id ?? streams.length;
      const ingredients = planned.ingredientRates.map((ingredient) => ({
        material: ingredient.name,
        rate: outputRate * ingredient.perSecond / planned.outputPerSecond,
      }));
      const block: GraphBlock = {
        id: blockId,
        recipeOrder: recipeOrder.get(planned.material)!,
        material: planned.material,
        recipe: planned.recipe,
        outputRate,
        ingredients,
        outputStreamId: streamId,
        machineCount: 0,
        outputSide: "south",
        outputInserters: 0,
        ingredientInserters: [],
        centerY: 0,
        outputY: 0,
        lastMachineX: 0,
      };
      synthesizeBlock(block, planned);
      blocks.push(block);
      if (sharedTargetStream) {
        sharedTargetStream.producerBlockIds.push(blockId);
        sharedTargetStream.demands.push(...bin);
      } else {
        streams.push({
          id: streamId,
          material: planned.material,
          boundary: false,
          target: planned.material === plan.target,
          producerBlockIds: [blockId],
          demands: bin,
          color: -1,
          startY: 0,
          endY: 0,
          path: [],
        });
      }
      for (const demand of bin) {
        if (demand.consumerBlockId === undefined || demand.ingredientIndex === undefined) continue;
        const consumer = blocks[demand.consumerBlockId];
        const ingredient = consumer.ingredients[demand.ingredientIndex];
        if (ingredient.streamId !== undefined) {
          throw new Error("Anonymous graph construction assigned multiple streams to one ingredient feeder.");
        }
        ingredient.streamId = streamId;
      }
      ingredients.forEach((ingredient, ingredientIndex) => {
        const references = pending.get(ingredient.material) ?? [];
        references.push({ consumerBlockId: blockId, ingredientIndex, rate: ingredient.rate });
        pending.set(ingredient.material, references);
      });
    }
  }

  for (const input of plan.inputs) {
    const demands = pending.get(input.name) ?? [];
    if (demands.length === 0) continue;
    const streamId = streams.length;
    streams.push({
      id: streamId,
      material: input.name,
      boundary: true,
      target: false,
      producerBlockIds: [],
      demands,
      color: -1,
      startY: 0,
      endY: 0,
      path: [],
    });
    for (const demand of demands) {
      if (demand.consumerBlockId === undefined || demand.ingredientIndex === undefined) continue;
      const ingredient = blocks[demand.consumerBlockId].ingredients[demand.ingredientIndex];
      if (ingredient.streamId !== undefined) {
        throw new Error("Anonymous boundary construction assigned multiple streams to one ingredient feeder.");
      }
      ingredient.streamId = streamId;
    }
  }
  if (blocks.some((block) => block.ingredients.some((ingredient) => ingredient.streamId === undefined))) {
    throw new Error("Anonymous graph construction left an ingredient without a stream.");
  }
  return { blocks, streams };
}

function topologicalBlockOrder(blocks: GraphBlock[], streams: GraphStream[]): GraphBlock[] {
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const producersByStream = new Map(streams.map((stream) => [stream.id, stream.producerBlockIds]));
  const ordered: GraphBlock[] = [];
  const visited = new Set<number>();
  const visiting = new Set<number>();
  const visit = (blockId: number): void => {
    if (visited.has(blockId)) return;
    if (visiting.has(blockId)) throw new Error("Anonymous production graph contains a cycle.");
    visiting.add(blockId);
    const block = blockById.get(blockId)!;
    for (const ingredient of block.ingredients) {
      for (const producer of producersByStream.get(ingredient.streamId!) ?? []) visit(producer);
    }
    visiting.delete(blockId);
    visited.add(blockId);
    ordered.push(block);
  };
  streams.filter((stream) => stream.target).forEach((stream) => stream.producerBlockIds.forEach(visit));
  blocks.forEach((block) => visit(block.id));
  return ordered;
}

function buildStreamPaths(
  blocks: GraphBlock[],
  streams: GraphStream[],
  inputPositions: Map<string, { x: number; y: number }>,
): { mergeX: number; mergeY: number; minimumX: number; maximumRightChannel: number } {
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const maximumLocalX = Math.max(...blocks.map((block) => block.lastMachineX + 2));
  const bottomMachineY = Math.max(...blocks.map((block) => block.centerY));
  const targetStreams = streams.filter((stream) => stream.target);
  const mergeY = bottomMachineY + 8;

  for (const stream of streams) {
    const consumers = stream.demands
      .filter((demand) => demand.consumerBlockId !== undefined && demand.ingredientIndex !== undefined)
      .map((demand) => {
        const block = blockById.get(demand.consumerBlockId!)!;
        return {
          block,
          ingredient: block.ingredients[demand.ingredientIndex!],
          y: block.ingredients[demand.ingredientIndex!].feederY!,
        };
      })
      .sort((left, right) => left.block.centerY - right.block.centerY || left.y - right.y);
    const producers = stream.producerBlockIds.map((blockId) => blockById.get(blockId)!)
      .sort((left, right) => left.centerY - right.centerY);
    stream.startY = producers[0]?.outputY ?? consumers[0]?.y ?? mergeY;
    stream.endY = stream.target ? mergeY + targetStreams.indexOf(stream) : consumers.at(-1)?.y ?? stream.startY;
  }

  const intervals = [...streams].sort((left, right) =>
    left.startY - right.startY || left.endY - right.endY || left.id - right.id);
  const colorEnds: number[] = [];
  for (const stream of intervals) {
    let color = colorEnds.findIndex((end) => end + 2 < stream.startY);
    if (color < 0) {
      color = colorEnds.length;
      colorEnds.push(stream.endY);
    } else {
      colorEnds[color] = stream.endY;
    }
    stream.color = color;
  }
  const maximumColor = Math.max(...streams.map((stream) => stream.color));
  const leftBase = -6;
  const rightBase = maximumLocalX + 4;
  const minimumX = leftBase - maximumColor * 3 - 4;
  const maximumRightChannel = rightBase + maximumColor * 3;
  const mergeX = maximumRightChannel + 6;

  for (const stream of streams) {
    const leftX = leftBase - stream.color * 3;
    const rightX = rightBase + stream.color * 3;
    const consumers = stream.demands
      .filter((demand) => demand.consumerBlockId !== undefined && demand.ingredientIndex !== undefined)
      .map((demand) => {
        const block = blockById.get(demand.consumerBlockId!)!;
        return { block, y: block.ingredients[demand.ingredientIndex!].feederY! };
      })
      .sort((left, right) => left.block.centerY - right.block.centerY || left.y - right.y);
    const path: Array<{ x: number; y: number }> = [];
    if (stream.boundary) {
      const first = consumers.shift();
      if (!first) continue;
      path.push({ x: minimumX, y: first.y });
      appendLine(path, { x: rightX, y: first.y });
      inputPositions.set(stream.material, tilePosition(minimumX, first.y));
      let onRight = true;
      for (const consumer of consumers) {
        appendLine(path, { x: onRight ? rightX : leftX, y: consumer.y });
        appendLine(path, { x: onRight ? leftX : rightX, y: consumer.y });
        onRight = !onRight;
      }
    } else {
      const producers = stream.producerBlockIds.map((blockId) => blockById.get(blockId)!)
        .sort((left, right) => left.centerY - right.centerY);
      const producer = producers.shift();
      if (!producer) throw new Error("Anonymous internal streams require at least one producer.");
      path.push({ x: -2, y: producer.outputY });
      appendLine(path, { x: rightX, y: producer.outputY });
      let onRight = true;
      for (const additionalProducer of producers) {
        appendLine(path, { x: onRight ? rightX : leftX, y: additionalProducer.outputY });
        appendLine(path, { x: onRight ? leftX : rightX, y: additionalProducer.outputY });
        onRight = !onRight;
      }
      for (const consumer of consumers) {
        appendLine(path, { x: onRight ? rightX : leftX, y: consumer.y });
        appendLine(path, { x: onRight ? leftX : rightX, y: consumer.y });
        onRight = !onRight;
      }
      if (stream.target) {
        const laneY = mergeY + targetStreams.indexOf(stream);
        appendLine(path, { x: onRight ? rightX : leftX, y: laneY });
        if (!onRight) appendLine(path, { x: rightX, y: laneY });
        appendLine(path, { x: targetStreams.length === 1 ? mergeX : mergeX - 1, y: laneY });
      }
    }
    stream.path = path;
  }
  return { mergeX, mergeY, minimumX, maximumRightChannel };
}

function emitStreamBelts(
  drafts: Draft[],
  streams: GraphStream[],
  beltName: string,
  undergroundName: string,
): void {
  const occupancy = new Map<string, Array<{ stream: GraphStream; index: number; horizontal: boolean; vertical: boolean }>>();
  for (const stream of streams) {
    stream.path.forEach((point, index) => {
      const previous = stream.path[index - 1];
      const next = stream.path[index + 1];
      const horizontal = Boolean((previous && previous.y === point.y) || (next && next.y === point.y));
      const vertical = Boolean((previous && previous.x === point.x) || (next && next.x === point.x));
      const key = `${point.x},${point.y}`;
      const entries = occupancy.get(key) ?? [];
      entries.push({ stream, index, horizontal, vertical });
      occupancy.set(key, entries);
    });
  }

  const holes = new Map<number, Set<number>>();
  for (const entries of occupancy.values()) {
    if (entries.length < 2) continue;
    const horizontal = entries.find((entry) => entry.horizontal && !entry.vertical);
    const vertical = entries.find((entry) => entry.vertical && !entry.horizontal);
    if (!horizontal || !vertical) {
      throw new Error("Anonymous routes overlap without a perpendicular underground crossing.");
    }
    const streamHoles = holes.get(horizontal.stream.id) ?? new Set<number>();
    streamHoles.add(horizontal.index);
    holes.set(horizontal.stream.id, streamHoles);
  }

  for (const stream of streams) {
    const streamHoles = holes.get(stream.id) ?? new Set<number>();
    const endpoints = new Map<number, "input" | "output">();
    for (const hole of streamHoles) {
      if (hole <= 0 || hole + 1 >= stream.path.length) throw new Error("An anonymous crossing touches a route endpoint.");
      const previous = stream.path[hole - 1];
      const point = stream.path[hole];
      const next = stream.path[hole + 1];
      if (previous.y !== point.y || next.y !== point.y) {
        throw new Error("Anonymous crossings must tunnel a horizontal route.");
      }
      if (endpoints.has(hole - 1) || endpoints.has(hole + 1)) {
        throw new Error("Anonymous crossings are too close for independent underground pairs.");
      }
      endpoints.set(hole - 1, "input");
      endpoints.set(hole + 1, "output");
    }
    const role: ChainEntityRole = stream.boundary
      ? "input-belt"
      : stream.target
        ? "output-belt"
        : "material-bus";
    stream.path.forEach((point, index) => {
      if (streamHoles.has(index)) return;
      const undergroundType = endpoints.get(index);
      const next = stream.path[index + 1];
      const previous = stream.path[index - 1];
      const direction = undergroundType === "input"
        ? directionBetween(point, stream.path[index + 1])
        : next
          ? directionBetween(point, next)
          : previous
            ? directionBetween(previous, point)
            : 4;
      drafts.push({
        role: undergroundType ? "underground-belt" : role,
        material: stream.material,
        name: undergroundType ? undergroundName : beltName,
        position: tilePosition(point.x, point.y),
        direction,
        undergroundType,
      });
    });
  }
}

function addOutputRoute(
  drafts: Draft[],
  material: string,
  beltName: string,
  from: { x: number; y: number },
  side: Side,
  minimumX: number,
  topY: number,
  bottomY: number,
): { x: number; y: number } {
  const path: Array<{ x: number; y: number }> = [];
  const eastX = from.x + 6;
  path.push({ x: from.x, y: from.y });
  appendLine(path, { x: eastX, y: from.y });
  if (side === "north") appendLine(path, { x: eastX, y: topY - 6 });
  else if (side === "south") appendLine(path, { x: eastX, y: bottomY + 6 });
  else if (side === "west") {
    appendLine(path, { x: eastX, y: bottomY + 6 });
    appendLine(path, { x: minimumX - 6, y: bottomY + 6 });
  }
  path.forEach((point, index) => {
    const next = path[index + 1];
    const previous = path[index - 1];
    drafts.push({
      role: "output-belt",
      material,
      name: beltName,
      position: tilePosition(point.x, point.y),
      direction: next
        ? directionBetween(point, next)
        : previous
          ? directionBetween(previous, point)
          : 4,
    });
  });
  return tilePosition(path.at(-1)!.x, path.at(-1)!.y);
}

/**
 * Recipe-blind compact compiler. It sees only graph structure, rates, entity
 * footprints, and transport limits; product and recipe names are metadata.
 */
export function buildAnonymousGraphLayout(
  plan: ChainPlan,
  inputSide: Side,
  outputSide: Side,
  beltTier: keyof typeof BELTS,
): CanonicalLayout | undefined {
  const belt = BELTS[beltTier];
  const graph = buildGraph(plan, belt.itemsPerSecond);
  if (!graph) return undefined;
  const { blocks, streams } = graph;
  const orderedBlocks = topologicalBlockOrder(blocks, streams);
  orderedBlocks.forEach((block, row) => {
    block.centerY = row * ROW_PITCH;
    block.outputY = block.centerY + (block.outputSide === "north" ? -3 : 3);
    block.ingredients.forEach((ingredient) => {
      ingredient.feederY = block.centerY + feederOffset(ingredient.channel!);
    });
  });

  const rotationQuarterTurns = (SIDE_INDEX[inputSide] - SIDE_INDEX.west + 4) % 4;
  const canonicalOutputSide = INDEX_SIDE[(SIDE_INDEX[outputSide] - rotationQuarterTurns + 4) % 4];
  const drafts: Draft[] = [];
  orderedBlocks.forEach((block) => placeBlockEntities(drafts, block));
  const inputPositions = new Map<string, { x: number; y: number }>();
  const geometry = buildStreamPaths(blocks, streams, inputPositions);
  const undergroundName = beltTier === "yellow"
    ? "underground-belt"
    : beltTier === "red"
      ? "fast-underground-belt"
      : "express-underground-belt";
  emitStreamBelts(drafts, streams, belt.entityName, undergroundName);

  const targetStreams = streams.filter((stream) => stream.target);
  if (targetStreams.length === 2) {
    drafts.push({
      role: "splitter",
      material: plan.target,
      name: belt.splitterEntityName,
      position: { x: geometry.mergeX + 0.5, y: geometry.mergeY + 1 },
      direction: 4,
      outputPriority: "left",
    });
  } else if (targetStreams.length !== 1) {
    throw new Error("Anonymous output routing supports one full item belt.");
  }
  const outputStartX = targetStreams.length === 2 ? geometry.mergeX + 1 : geometry.mergeX + 1;
  const topY = Math.min(...drafts.map((draft) => Math.floor(draft.position.y)));
  const bottomY = Math.max(...drafts.map((draft) => Math.floor(draft.position.y)));
  const outputPosition = addOutputRoute(
    drafts,
    plan.target,
    belt.entityName,
    { x: outputStartX, y: geometry.mergeY },
    canonicalOutputSide,
    geometry.minimumX,
    topY,
    bottomY,
  );
  return { drafts, inputPositions, outputPosition, canonicalOutputSide, rotationQuarterTurns };
}
