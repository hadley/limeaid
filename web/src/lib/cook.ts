import { pool, type Recipe, type RecipeSummary } from "./db";
import { groupIngredientsByLocation } from "./ingredients";
import type { Rating } from "./ratings";
import type { IngredientSection } from "@/components/recipe-view";

// Ingredients sharing a kitchen location (Fridge, Pantry, …) as the label.
// A null label marks the final group of ingredients with no known location.
export type IngredientGroup = IngredientSection;

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
            r.community_rating, r.community_rating_count
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
            r.community_rating, r.community_rating_count, r.yield,
            r.source_url, r.category, r.ingredients, r.instructions
     from meal_plan_entries e
     join meal_plans p on p.id = e.meal_plan_id
     join recipes r on r.id = e.recipe_id
     left join ratings rt on rt.recipe_id = r.id
     where p.week_start = $1 and e.id = $2`,
    [weekStart, entryId],
  );
  if (rows.length === 0) return null;
  const { entry_id, ...r } = rows[0];

  const { ingredients, ...recipe } = r;
  const ingredientGroups = await groupIngredientsByLocation(ingredients);

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
