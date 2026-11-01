import Link from "next/link";
import { notFound } from "next/navigation";
import { pool, type Recipe } from "@/lib/db";
import { groupIngredientsByLocation } from "@/lib/ingredients";
import {
  RecipeHeader,
  RecipeIngredients,
  RecipeSteps,
} from "@/components/recipe-view";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { rows } = await pool.query<Recipe>(
    `select id, slug, name, proteins, total_time_minutes,
            community_rating, community_rating_count, yield, source_url,
            category, ingredients, instructions, rt.rating as user_rating
     from recipes
     left join ratings rt on rt.recipe_id = recipes.id
     where slug = $1`,
    [slug],
  );
  const recipe = rows[0];
  if (!recipe) notFound();

  const sections = await groupIngredientsByLocation(recipe.ingredients);

  return (
    <main className="container">
      <p>
        <Link href="/recipes">← All recipes</Link>
      </p>
      <RecipeHeader recipe={recipe} />
      <RecipeIngredients sections={sections} />
      <RecipeSteps instructions={recipe.instructions} />
    </main>
  );
}
