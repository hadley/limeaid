import { pool, type Ingredient, type Recipe, type RecipeSummary } from "./db";
import { LOCATION_ORDER } from "./locations";
import type { Rating } from "./ratings";

// Ingredients sharing a kitchen location. `location` is null for the final
// group of ingredients with no known location.
export type IngredientGroup = { location: string | null; items: Ingredient[] };

// One entry with its full recipe, ingredients grouped for the cook view.
export type CookRecipe = CookEntry &
  Omit<Recipe, "ingredients"> & { ingredientGroups: IngredientGroup[] };

export type CookEntry = RecipeSummary & {
  entryId: number;
  cooked: boolean;
};

// The week's picks with per-entry cook state and the user's rating.
export async function getCookEntries(weekStart: string): Promise<CookEntry[]> {
  const { rows } = await pool.query<
    RecipeSummary & { entry_id: string; cooked: boolean }
  >(
    `select e.id as entry_id, e.cooked, rt.rating as user_rating,
            r.id, r.slug, r.name, r.proteins, r.total_time_minutes,
            r.image_path, r.image_url, r.community_rating,
            r.community_rating_count
     from meal_plan_entries e
     join meal_plans p on p.id = e.meal_plan_id
     join recipes r on r.id = e.recipe_id
     left join ratings rt on rt.recipe_id = r.id
     where p.week_start = $1
     order by e.id`,
    [weekStart],
  );
  return rows.map(({ entry_id, ...r }) => ({
    ...r,
    entryId: Number(entry_id),
  }));
}

// One entry with the full recipe, for the step-through cooking view.
// Returns null if the entry doesn't belong to the given week.
export async function getCookEntry(
  weekStart: string,
  entryId: number,
): Promise<CookRecipe | null> {
  const { rows } = await pool.query<
    Recipe & { entry_id: string; cooked: boolean }
  >(
    `select e.id as entry_id, e.cooked, rt.rating as user_rating,
            r.id, r.slug, r.name, r.proteins, r.total_time_minutes,
            r.image_path, r.image_url, r.community_rating,
            r.community_rating_count, r.yield, r.source_url, r.category,
            r.ingredients, r.instructions
     from meal_plan_entries e
     join meal_plans p on p.id = e.meal_plan_id
     join recipes r on r.id = e.recipe_id
     left join ratings rt on rt.recipe_id = r.id
     where p.week_start = $1 and e.id = $2`,
    [weekStart, entryId],
  );
  if (rows.length === 0) return null;
  const { entry_id, ...r } = rows[0];

  // Group ingredients by kitchen location (Fridge, Pantry, …) in
  // LOCATION_ORDER, alphabetical within a group, so the ingredients section
  // can show where things live. Unknown locations form a final group.
  const { ingredients, ...recipe } = r;
  const { rows: locRows } = await pool.query<{
    name: string;
    location: string;
  }>("select name, location from ingredient_locations where name = any($1)", [
    ingredients.map((i) => i.name),
  ]);
  const locOf = new Map(locRows.map((l) => [l.name, l.location]));
  const byLocation = new Map<string | null, Ingredient[]>();
  const sorted = [...ingredients].sort((a, b) => a.name.localeCompare(b.name));
  for (const i of sorted) {
    const loc = locOf.get(i.name) ?? null;
    const key = loc !== null && LOCATION_ORDER.includes(loc) ? loc : null;
    byLocation.set(key, [...(byLocation.get(key) ?? []), i]);
  }
  const ingredientGroups = [...LOCATION_ORDER, null]
    .filter((location) => byLocation.has(location))
    .map((location) => ({ location, items: byLocation.get(location)! }));

  return { ...recipe, ingredientGroups, entryId: Number(entry_id) };
}

export async function setCooked(
  entryId: number,
  cooked: boolean,
): Promise<void> {
  await pool.query(
    `update meal_plan_entries
     set cooked = $2, cooked_at = case when $2 then now() else null end
     where id = $1`,
    [entryId, cooked],
  );
}

export async function setRating(
  recipeId: number,
  rating: Rating | null,
): Promise<void> {
  if (rating === null) {
    await pool.query("delete from ratings where recipe_id = $1", [recipeId]);
  } else {
    await pool.query(
      `insert into ratings (recipe_id, rating, updated_at)
       values ($1, $2, now())
       on conflict (recipe_id) do update
       set rating = excluded.rating, updated_at = excluded.updated_at`,
      [recipeId, rating],
    );
  }
}
