import rawCatalog from "../data/vanilla-recipes.json";
import type { CatalogRecipe, MaterialType } from "./types";

interface CatalogDocument {
  factorioVersion: string;
  source: string;
  materialTypes: Record<string, MaterialType>;
  recipes: CatalogRecipe[];
}

export const VANILLA_CATALOG = rawCatalog as CatalogDocument;
export const VANILLA_RECIPES = VANILLA_CATALOG.recipes;
export const MATERIAL_TYPES = VANILLA_CATALOG.materialTypes;

const recipesByResult = new Map<string, CatalogRecipe[]>();
for (const recipe of VANILLA_RECIPES) {
  const options = recipesByResult.get(recipe.result.name) ?? [];
  options.push(recipe);
  recipesByResult.set(recipe.result.name, options);
}

const preferredRecipeIds: Record<string, string> = {
  "solid-fuel": "solid-fuel-from-petroleum-gas",
};

export function materialType(name: string): MaterialType | undefined {
  return MATERIAL_TYPES[name];
}

export function recipeFor(material: string): CatalogRecipe | undefined {
  const options = recipesByResult.get(material);
  if (!options || options.length === 0) return undefined;
  const preferred = preferredRecipeIds[material] ?? material;
  return options.find((recipe) => recipe.id === preferred) ?? options[0];
}

export function recipesFor(material: string): readonly CatalogRecipe[] {
  return recipesByResult.get(material) ?? [];
}
