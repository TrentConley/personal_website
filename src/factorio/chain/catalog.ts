import rawCatalog from "../data/vanilla-recipes.json";
import type { CatalogRecipe, MaterialType, ProductGroup } from "./types";

interface CatalogDocument {
  factorioVersion: string;
  source: string;
  materialTypes: Record<string, MaterialType>;
  recipes: CatalogRecipe[];
  productGroups: ProductGroup[];
}

export const VANILLA_CATALOG = rawCatalog as CatalogDocument;
export const VANILLA_RECIPES = VANILLA_CATALOG.recipes;
export const MATERIAL_TYPES = VANILLA_CATALOG.materialTypes;
export const PRODUCT_GROUPS = VANILLA_CATALOG.productGroups;

const recipesByResult = new Map<string, CatalogRecipe[]>();
for (const recipe of VANILLA_RECIPES) {
  const options = recipesByResult.get(recipe.result.name) ?? [];
  options.push(recipe);
  recipesByResult.set(recipe.result.name, options);
}

const preferredRecipeIds: Record<string, string> = {
  "solid-fuel": "solid-fuel-from-petroleum-gas",
};

const simpleFluidBoundaries = new Set([
  "water",
  "crude-oil",
  "petroleum-gas",
  "light-oil",
  "heavy-oil",
  "lubricant",
  "sulfuric-acid",
]);

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

export function directIngredientsFor(material: string): string[] {
  return recipeFor(material)?.ingredients.map((ingredient) => ingredient.name) ?? [];
}

export function boundaryMaterialsFor(material: string): string[] {
  const boundary: string[] = [];
  const expanded = new Set<string>();
  const visit = (name: string): void => {
    if (simpleFluidBoundaries.has(name)) {
      if (!boundary.includes(name)) boundary.push(name);
      return;
    }
    const recipe = recipeFor(name);
    if (!recipe) {
      if (!boundary.includes(name)) boundary.push(name);
      return;
    }
    if (expanded.has(name)) return;
    expanded.add(name);
    recipe.ingredients.forEach((ingredient) => visit(ingredient.name));
  };
  visit(material);
  return boundary;
}
