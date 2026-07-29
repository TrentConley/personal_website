export interface SolidIngredientRate {
  name: string;
  perSecond: number;
}

/**
 * Packs solid ingredients onto two-lane belts while balancing total flow.
 * Four feeder belts can therefore carry every vanilla deterministic recipe,
 * including Spidertron's eight solid ingredients.
 */
export function groupSolidIngredients(
  ingredients: SolidIngredientRate[],
): SolidIngredientRate[][] {
  const sorted = [...ingredients].sort((left, right) => right.perSecond - left.perSecond);
  if (sorted.length > 8) throw new Error("Recipes with more than eight solid ingredients are unsupported.");
  if (sorted.length === 0) return [];
  const groups = Array.from({ length: Math.ceil(sorted.length / 2) }, () => [] as SolidIngredientRate[]);
  for (const ingredient of sorted) {
    const candidates = groups.filter((group) => group.length < 2);
    candidates.sort(
      (left, right) =>
        left.reduce((sum, entry) => sum + entry.perSecond, 0) -
        right.reduce((sum, entry) => sum + entry.perSecond, 0),
    );
    candidates[0].push(ingredient);
  }
  return groups;
}
