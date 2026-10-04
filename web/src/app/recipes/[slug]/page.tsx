import Link from "next/link";
import { notFound } from "next/navigation";
import { pool, imageSrc, type Recipe } from "@/lib/db";

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

  const src = imageSrc(recipe);
  const pantry = recipe.ingredients.filter((i) => i.quantity == null);
  const shopping = recipe.ingredients.filter((i) => i.quantity != null);

  return (
    <main className="container">
      <p>
        <Link href="/recipes">← All recipes</Link>
      </p>
      <h1>{recipe.name}</h1>
      <p className="muted">
        {[
          recipe.total_time_minutes ? `${recipe.total_time_minutes} min` : null,
          recipe.yield,
          recipe.proteins.length ? recipe.proteins.join(", ") : "vegetarian",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {recipe.community_rating != null && (
        <p className="muted">
          Mealime community: ★ {recipe.community_rating.toFixed(1)} (
          {recipe.community_rating_count} ratings)
        </p>
      )}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={recipe.name} className="hero" />
      )}

      <h2>Ingredients</h2>
      <ul>
        {shopping.map((i) => (
          <li key={i.display}>{i.display}</li>
        ))}
      </ul>
      {pantry.length > 0 && (
        <>
          <h3>Pantry staples</h3>
          <ul>
            {pantry.map((i) => (
              <li key={i.display}>{i.display}</li>
            ))}
          </ul>
        </>
      )}

      <h2>Instructions</h2>
      <ol className="steps">
        {recipe.instructions.map((s, i) => (
          <li key={i}>
            <p>{s.text}</p>
            {s.amounts && s.amounts.length > 0 && (
              <ul className="amounts">
                {s.amounts.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
