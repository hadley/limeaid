import { pool, type Ingredient } from "./db";
import { LOCATION_ORDER } from "./locations";
import type { IngredientSection } from "@/components/recipe-view";

// Group ingredients by kitchen location (Fridge, Pantry, …) in
// LOCATION_ORDER, alphabetical within a group, so the recipe view can show
// where things live. Unknown locations form a final unlabeled group.
export async function groupIngredientsByLocation(
  ingredients: Ingredient[],
): Promise<IngredientSection[]> {
  const { rows } = await pool.query<{ name: string; location: string }>(
    "select name, location from ingredient_locations where name = any($1)",
    [ingredients.map((i) => i.name)],
  );
  const locOf = new Map(rows.map((l) => [l.name, l.location]));
  const byLocation = new Map<string | null, Ingredient[]>();
  const sorted = [...ingredients].sort((a, b) => a.name.localeCompare(b.name));
  for (const i of sorted) {
    const loc = locOf.get(i.name) ?? null;
    const key = loc !== null && LOCATION_ORDER.includes(loc) ? loc : null;
    byLocation.set(key, [...(byLocation.get(key) ?? []), i]);
  }
  return [...LOCATION_ORDER, null]
    .filter((location) => byLocation.has(location))
    .map((location) => ({ label: location, items: byLocation.get(location)! }));
}
