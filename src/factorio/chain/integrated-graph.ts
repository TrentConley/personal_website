import type { ChainPlan, MaterialType, PlannedRecipe } from "./types";

export interface MachineInstance {
  id: string;
  material: string;
  materialType: MaterialType;
  ordinal: number;
  plannedOutputPerSecond: number;
  prototypeCapacityPerSecond: number;
}
export interface MachineMaterialEdge {
  material: string;
  type: MaterialType;
  producerMaterial?: string;
  consumerMaterial: string;
  perSecond: number;
}

export interface IntegratedMachineGraph {
  machines: MachineInstance[];
  edges: MachineMaterialEdge[];
  byMaterial: Map<string, MachineInstance[]>;
}

export interface DirectInsertionTransfer {
  sourceOrdinal: number;
  consumerOrdinal: number;
  itemsPerSecond: number;
  sourceX: number;
  consumerX: number;
}

export interface DirectInsertionCell {
  sourceOrdinals: number[];
  consumerOrdinals: number[];
  sourceXs: number[];
  consumerXs: number[];
  transfers: DirectInsertionTransfer[];
}

export interface DirectInsertionPattern {
  sourceMaterial: string;
  consumerMaterial: string;
  sourceMachineCount: number;
  directSourceMachineCount: number;
  residualSourceMachineCount: number;
  consumerMachineCount: number;
  cells: DirectInsertionCell[];
  directRatePerSecond: number;
}

/**
 * Lowers exact recipe rates to individual machine instances and typed material
 * edges. This is deliberately geometry-free: placement operators consume the
 * graph, while recipe names are only labels on otherwise anonymous nodes.
 */
export function buildIntegratedMachineGraph(plan: ChainPlan): IntegratedMachineGraph {
  const byMaterial = new Map<string, MachineInstance[]>();
  const machines = plan.recipes.flatMap((planned) => {
    const prototypeCapacityPerSecond = planned.recipe.result.amount *
      planned.recipe.machine.craftingSpeed / planned.recipe.energySeconds;
    const instances = Array.from({ length: planned.machineCount }, (_, ordinal): MachineInstance => ({
      id: `${planned.material}#${ordinal}`,
      material: planned.material,
      materialType: planned.materialType,
      ordinal,
      plannedOutputPerSecond: planned.outputPerSecond / planned.machineCount,
      prototypeCapacityPerSecond,
    }));
    byMaterial.set(planned.material, instances);
    return instances;
  });
  const producers = new Set(byMaterial.keys());
  const edges = plan.recipes.flatMap((consumer) => consumer.ingredientRates.map((ingredient) => ({
    material: ingredient.name,
    type: ingredient.type,
    producerMaterial: producers.has(ingredient.name) ? ingredient.name : undefined,
    consumerMaterial: consumer.material,
    perSecond: ingredient.perSecond,
  })));
  return { machines, edges, byMaterial };
}

interface FlowEdge {
  to: number;
  reverse: number;
  capacity: number;
  initialCapacity: number;
}

function addFlowEdge(graph: FlowEdge[][], from: number, to: number, capacity: number): void {
  const forward: FlowEdge = { to, reverse: graph[to].length, capacity, initialCapacity: capacity };
  const backward: FlowEdge = { to: from, reverse: graph[from].length, capacity: 0, initialCapacity: 0 };
  graph[from].push(forward);
  graph[to].push(backward);
}

function solveDirectFlow(
  sourceXs: number[],
  consumerXs: number[],
  sourceSupply: number,
  consumerDemand: number,
  edgeCapacity: number,
): Array<{ source: number; consumer: number; flow: number }> | undefined {
  const sourceCount = sourceXs.length;
  const consumerCount = consumerXs.length;
  const start = 0;
  const sourceOffset = 1;
  const consumerOffset = sourceOffset + sourceCount;
  const sink = consumerOffset + consumerCount;
  const graph = Array.from({ length: sink + 1 }, () => [] as FlowEdge[]);
  sourceXs.forEach((_, index) => addFlowEdge(graph, start, sourceOffset + index, sourceSupply));
  const directEdges: Array<{ source: number; consumer: number; edge: FlowEdge }> = [];
  sourceXs.forEach((sourceX, sourceIndex) => consumerXs.forEach((consumerX, consumerIndex) => {
    // With three-tile machines separated by one row, the one-tile inserter
    // gap has a legal overlap exactly when horizontal centers differ by <= 2.
    if (Math.abs(sourceX - consumerX) > 2) return;
    const from = sourceOffset + sourceIndex;
    const before = graph[from].length;
    addFlowEdge(graph, from, consumerOffset + consumerIndex, edgeCapacity);
    directEdges.push({ source: sourceIndex, consumer: consumerIndex, edge: graph[from][before] });
  }));
  consumerXs.forEach((_, index) => addFlowEdge(graph, consumerOffset + index, sink, consumerDemand));

  const required = consumerDemand * consumerCount;
  let delivered = 0;
  while (delivered < required - 1e-9) {
    const parent = Array<{ node: number; edge: number } | undefined>(graph.length);
    const queue = [start];
    parent[start] = { node: -1, edge: -1 };
    for (let head = 0; head < queue.length && !parent[sink]; head += 1) {
      const node = queue[head];
      graph[node].forEach((edge, edgeIndex) => {
        if (edge.capacity <= 1e-9 || parent[edge.to]) return;
        parent[edge.to] = { node, edge: edgeIndex };
        queue.push(edge.to);
      });
    }
    if (!parent[sink]) return undefined;
    let amount = required - delivered;
    for (let node = sink; node !== start;) {
      const step = parent[node]!;
      amount = Math.min(amount, graph[step.node][step.edge].capacity);
      node = step.node;
    }
    for (let node = sink; node !== start;) {
      const step = parent[node]!;
      const edge = graph[step.node][step.edge];
      edge.capacity -= amount;
      graph[node][edge.reverse].capacity += amount;
      node = step.node;
    }
    delivered += amount;
  }
  return directEdges.flatMap(({ source, consumer, edge }) => {
    const flow = edge.initialCapacity - edge.capacity;
    return flow > 1e-9 ? [{ source, consumer, flow }] : [];
  });
}

function positionCombinations(count: number, minimum: number, maximum: number): number[][] {
  const result: number[][] = [];
  const visit = (values: number[], next: number): void => {
    if (values.length === count) {
      result.push(values);
      return;
    }
    for (let value = next; value <= maximum; value += 1) {
      visit([...values, value], value + 3);
    }
  };
  visit([], minimum);
  return result;
}

function deriveCell(
  sourceCount: number,
  consumerCount: number,
  sourceSupply: number,
  consumerDemand: number,
  edgeCapacity: number,
): Omit<DirectInsertionCell, "sourceOrdinals" | "consumerOrdinals"> | undefined {
  const sourceXs = Array.from({ length: sourceCount }, (_, index) => index * 3);
  const candidates = positionCombinations(consumerCount, -2, Math.max(...sourceXs) + 2)
    .map((consumerXs) => {
      const transfers = solveDirectFlow(sourceXs, consumerXs, sourceSupply, consumerDemand, edgeCapacity);
      if (!transfers) return undefined;
      const width = Math.max(...sourceXs, ...consumerXs) - Math.min(...sourceXs, ...consumerXs) + 3;
      const wire = transfers.reduce((sum, transfer) => sum +
        Math.abs(sourceXs[transfer.source] - consumerXs[transfer.consumer]), 0);
      const imbalance = consumerXs.reduce((sum, x) => sum + Math.abs(x -
        (Math.max(...sourceXs) + Math.min(...sourceXs)) / 2), 0);
      return { consumerXs, transfers, score: width * 100 + wire * 10 + imbalance };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
    .sort((left, right) => left.score - right.score);
  const selected = candidates[0];
  if (!selected) return undefined;
  return {
    sourceXs,
    consumerXs: selected.consumerXs,
    transfers: selected.transfers.map((transfer) => ({
      sourceOrdinal: transfer.source,
      consumerOrdinal: transfer.consumer,
      itemsPerSecond: transfer.flow,
      sourceX: sourceXs[transfer.source],
      consumerX: selected.consumerXs[transfer.consumer],
    })),
  };
}

/**
 * Discovers a repeatable direct-insertion cell from machine-count ratio and
 * edge flow. The supported cell envelope (up to three producers by two
 * consumers) is a physical inserter-neighborhood limit, not a recipe lookup.
 */
export function deriveDirectInsertionPattern(
  source: PlannedRecipe,
  consumer: PlannedRecipe,
  maximumInserterItemsPerSecond: number,
): DirectInsertionPattern | undefined {
  const direct = consumer.ingredientRates.find((ingredient) => ingredient.name === source.material);
  if (!direct || direct.type !== "item" || source.materialType !== "item" ||
    consumer.materialType !== "item" || source.machineCount < 1 || consumer.machineCount < 1) return undefined;
  const sourceSupply = source.machineCapacityPerSecond;
  const consumerDemand = direct.perSecond / consumer.machineCount;
  const cellConsumerCounts: number[] = [];
  for (let remaining = consumer.machineCount; remaining > 0;) {
    const count = Math.min(2, remaining);
    cellConsumerCounts.push(count);
    remaining -= count;
  }
  const cellSourceCounts = cellConsumerCounts.map((consumerCount) =>
    Math.ceil(consumerDemand * consumerCount / sourceSupply - 1e-12));
  if (cellSourceCounts.some((count) => count < 1 || count > 3)) return undefined;
  const directSourceMachineCount = cellSourceCounts.reduce((sum, count) => sum + count, 0);
  if (directSourceMachineCount > source.machineCount) return undefined;
  const cells: DirectInsertionCell[] = [];
  let sourceOffset = 0;
  let consumerOffset = 0;
  for (let cellIndex = 0; cellIndex < cellConsumerCounts.length; cellIndex += 1) {
    const sourceCount = cellSourceCounts[cellIndex];
    const consumerCount = cellConsumerCounts[cellIndex];
    const cell = deriveCell(sourceCount, consumerCount, sourceSupply, consumerDemand,
      maximumInserterItemsPerSecond);
    if (!cell) return undefined;
    cells.push({
      sourceOrdinals: Array.from({ length: sourceCount }, (_, index) => sourceOffset + index),
      consumerOrdinals: Array.from({ length: consumerCount }, (_, index) => consumerOffset + index),
      sourceXs: cell.sourceXs,
      consumerXs: cell.consumerXs,
      transfers: cell.transfers.map((transfer) => ({
        ...transfer,
        sourceOrdinal: sourceOffset + transfer.sourceOrdinal,
        consumerOrdinal: consumerOffset + transfer.consumerOrdinal,
      })),
    });
    sourceOffset += sourceCount;
    consumerOffset += consumerCount;
  }
  return {
    sourceMaterial: source.material,
    consumerMaterial: consumer.material,
    sourceMachineCount: source.machineCount,
    directSourceMachineCount,
    residualSourceMachineCount: source.machineCount - directSourceMachineCount,
    consumerMachineCount: consumer.machineCount,
    cells,
    directRatePerSecond: direct.perSecond,
  };
}
