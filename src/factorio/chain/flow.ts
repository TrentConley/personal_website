import { MATERIAL_TYPES, materialType, recipeFor } from "./catalog";
import { Fraction } from "./fraction";
import type { CatalogRecipe, MaterialType } from "./types";

export interface ProductionFlowNode {
  material: string;
  type: MaterialType;
  unitRate: Fraction;
  recipe?: CatalogRecipe;
  boundary: boolean;
}

export interface ProductionFlowEdge {
  material: string;
  type: MaterialType;
  unitRate: Fraction;
  producer?: string;
  consumer: string;
}

export interface ProductionFlowGraph {
  target: string;
  nodes: Map<string, ProductionFlowNode>;
  edges: ProductionFlowEdge[];
  boundaries: Map<string, Fraction>;
  materials: Map<string, Fraction>;
  recipeOrder: string[];
}

function add(map: Map<string, Fraction>, name: string, amount: Fraction): void {
  map.set(name, (map.get(name) ?? new Fraction(0n)).add(amount));
}

/**
 * Expands a deterministic vanilla production request into an exact, geometry-free
 * flow graph. Nothing in this layer knows about belts, lanes, splitters, or layout.
 */
export function buildProductionFlowGraph(
  target: string,
  boundaryNames: ReadonlySet<string>,
): ProductionFlowGraph {
  if (!materialType(target)) throw new Error(`Unknown vanilla material: ${target}.`);

  const boundaries = new Map<string, Fraction>();
  const materials = new Map<string, Fraction>();
  const includedRecipes = new Set<string>();
  const edges: ProductionFlowEdge[] = [];
  const active = new Set<string>();

  function visit(material: string, rate: Fraction, consumer: string): void {
    add(materials, material, rate);
    if (boundaryNames.has(material)) {
      add(boundaries, material, rate);
      edges.push({
        material,
        type: materialType(material)!,
        unitRate: rate,
        consumer,
      });
      return;
    }
    if (active.has(material)) throw new Error(`Recipe cycle detected while expanding ${material}.`);
    const recipe = recipeFor(material);
    if (!recipe) {
      const kind = MATERIAL_TYPES[material] === "fluid" ? "fluid" : "material";
      throw new Error(
        `${material} is a required ${kind} with no supported assembler, furnace, or chemical-plant recipe. ` +
          `Add it to inputs (refinery, mining, and water extraction are intentionally outside the blueprint).`,
      );
    }

    includedRecipes.add(material);
    if (consumer !== material) {
      edges.push({
        material,
        type: recipe.result.type,
        unitRate: rate,
        producer: material,
        consumer,
      });
    }
    active.add(material);
    const crafts = rate.divide(Fraction.from(recipe.result.amount));
    for (const ingredient of recipe.ingredients) {
      visit(
        ingredient.name,
        crafts.multiply(Fraction.from(ingredient.amount)),
        material,
      );
    }
    active.delete(material);
  }

  visit(target, new Fraction(1n), target);

  const visited = new Set<string>();
  const recipeOrder: string[] = [];
  function order(material: string): void {
    if (visited.has(material) || boundaryNames.has(material) || !includedRecipes.has(material)) return;
    visited.add(material);
    const recipe = recipeFor(material)!;
    for (const ingredient of recipe.ingredients) order(ingredient.name);
    recipeOrder.push(material);
  }
  order(target);

  const nodes = new Map<string, ProductionFlowNode>();
  for (const [material, unitRate] of materials) {
    nodes.set(material, {
      material,
      type: materialType(material)!,
      unitRate,
      recipe: includedRecipes.has(material) ? recipeFor(material) : undefined,
      boundary: boundaries.has(material),
    });
  }

  return { target, nodes, edges, boundaries, materials, recipeOrder };
}
