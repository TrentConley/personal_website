import { encodeBlueprint } from "../core/codec";
import { FACTORIO_VERSION } from "../core/generator";
import { BELTS } from "../core/throughput";
import { BELT_TIERS, SIDES } from "../core/types";
import type { BlueprintDocument } from "../core/types";
import { materialType } from "./catalog";
import { buildCanonicalLayout, finalizeLayout } from "./layout";
import { buildSpatialLayoutCandidates } from "./optimized-layout";
import { DEFAULT_PIPE_CAPACITY_PER_SECOND, planChain } from "./planner";
import type { ChainGeneratorConfig, GeneratedChainBlueprint } from "./types";

export function generateChainBlueprint(config: ChainGeneratorConfig): GeneratedChainBlueprint {
  const resolved = {
    ...config,
    inputSide: config.inputSide ?? "west",
    outputSide: config.outputSide ?? "east",
    beltTier: config.beltTier ?? "blue",
    pipeCapacityPerSecond: config.pipeCapacityPerSecond ?? DEFAULT_PIPE_CAPACITY_PER_SECOND,
  } as Required<Omit<ChainGeneratorConfig, "inputs">> & { inputs: ChainGeneratorConfig["inputs"] };
  if (!SIDES.includes(resolved.inputSide) || !SIDES.includes(resolved.outputSide)) {
    throw new Error("Input and output sides must be north, east, south, or west.");
  }
  if (!BELT_TIERS.includes(resolved.beltTier)) throw new Error("Belt tier must be yellow, red, or blue.");
  const plan = planChain(resolved);
  const hasComplexRecipe = plan.recipes.some(
    (recipe) => {
      const solidCount = recipe.ingredientRates.filter((ingredient) => ingredient.type === "item").length;
      const hasFluid = recipe.ingredientRates.some((ingredient) => ingredient.type === "fluid") ||
        recipe.materialType === "fluid";
      return solidCount > 4 || (solidCount > 3 && hasFluid && resolved.inputSide !== "west");
    },
  );
  const spatialCandidates = hasComplexRecipe
    ? []
    : buildSpatialLayoutCandidates(plan, resolved.inputSide, resolved.outputSide, resolved.beltTier);
  const selectedSpatialCandidate = spatialCandidates[0];
  const layout = finalizeLayout(
    hasComplexRecipe
      ? buildCanonicalLayout(plan, resolved.inputSide, resolved.outputSide, resolved.beltTier)
      : selectedSpatialCandidate.layout,
  );
  const firstItemInput = plan.inputs.find((input) => input.type === "item");
  const icons = [
    ...(materialType(plan.target) === "item"
      ? [{ signal: { type: "item" as const, name: plan.target }, index: 1 }]
      : []),
    ...(firstItemInput && firstItemInput.name !== plan.target
      ? [{ signal: { type: "item" as const, name: firstItemInput.name }, index: 2 }]
      : []),
  ];
  const document: BlueprintDocument = {
    blueprint: {
      item: "blueprint",
      label: `${plan.target} ${plan.effectiveOutputPerSecond.toFixed(3)}/s • ${resolved.inputSide.toUpperCase()} → ${resolved.outputSide.toUpperCase()}`,
      description:
        `Vanilla Factorio 2.0 recursive factory. Target ${plan.effectiveOutputPerSecond.toFixed(6)} ${plan.target}/s` +
        `${plan.clamped ? ` (requested ${plan.requestedOutputPerSecond.toFixed(6)}/s; ${plan.limitingConstraints.map((constraint) => constraint.id).join(", ")})` : ""}. ` +
        `Inputs: ${plan.inputs.map((input) => `${input.name} ${input.requiredPerSecond.toFixed(6)}/s`).join(", ")}. ` +
        "No modules or beacons. Connect any substation to power.",
      icons,
      entities: layout.entities.map((planned) => planned.entity),
      version: FACTORIO_VERSION,
    },
  };
  const blueprintString = encodeBlueprint(document);
  const itemCost = layout.entities.reduce<Record<string, number>>((cost, planned) => {
    cost[planned.entity.name] = (cost[planned.entity.name] ?? 0) + 1;
    return cost;
  }, {});
  return {
    config: resolved,
    plan,
    document,
    blueprintString,
    entities: layout.entities,
    inputPorts: plan.inputs.map((input) => ({
      material: input.name,
      type: input.type,
      side: resolved.inputSide,
      position: layout.inputPositions.get(input.name)!,
      requiredPerSecond: input.requiredPerSecond,
      maximumPerSecond: input.maximumPerSecond,
    })),
    outputPort: {
      material: plan.target,
      type: plan.targetType,
      side: resolved.outputSide,
      position: layout.outputPosition,
      requiredPerSecond: plan.effectiveOutputPerSecond,
      maximumPerSecond:
        plan.targetType === "item" ? BELTS[resolved.beltTier].itemsPerSecond : resolved.pipeCapacityPerSecond,
    },
    itemCost,
    ...(selectedSpatialCandidate
      ? {
          spatialOptimization: {
            strategy: "anonymous-graph-compiler-v3" as const,
            policy: selectedSpatialCandidate.metrics.policy,
            candidatesAccepted: spatialCandidates.length,
            width: selectedSpatialCandidate.metrics.width,
            height: selectedSpatialCandidate.metrics.height,
            area: selectedSpatialCandidate.metrics.area,
            transportEntities: selectedSpatialCandidate.metrics.transportEntities,
            undergroundEntities: selectedSpatialCandidate.metrics.undergroundEntities,
            score: selectedSpatialCandidate.metrics.score,
          },
        }
      : {}),
    warnings: [
      ...(plan.clamped
        ? [`Output was clamped from ${plan.requestedOutputPerSecond}/s to ${plan.effectiveOutputPerSecond}/s by ${plan.limitingConstraints.map((constraint) => constraint.explanation).join(" ")}`]
        : []),
    ],
  };
}
