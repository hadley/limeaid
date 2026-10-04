import Link from "next/link";
import { Suspense } from "react";
import { pool, type RecipeSummary } from "@/lib/db";
import { RecipeCard } from "@/components/recipe-card";
import { Filters } from "./filters";

const PAGE_SIZE = 48;

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    protein?: string;
    rating?: string;
    page?: string;
  }>;
}) {
  const { q = "", protein = "", rating = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  const { rows } = await pool.query<RecipeSummary & { total: string }>(
    `with filtered as (
       select recipes.id, slug, name, proteins, total_time_minutes,
              r.rating as user_rating
       from recipes
       left join ratings r on r.recipe_id = recipes.id
       where ($1 = '' or name ilike '%' || $1 || '%')
         and (
           ($2 = 'vegetarian' and cardinality(proteins) = 0)
           or ($2 <> 'vegetarian' and ($2 = '' or $2 = any(proteins)))
         )
         and (r.rating is null or r.rating <> 'disliked')
       and ($5 = '' or ($5 = 'unrated' and r.rating is null) or r.rating = $5)
     )
     select *, count(*) over () as total
     from filtered
     order by name
     limit $3 offset $4`,
    [q, protein, PAGE_SIZE, (pageNum - 1) * PAGE_SIZE, rating],
  );
  const total = rows.length ? Number(rows[0].total) : 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const link = (over: Record<string, string>) => {
    const p = new URLSearchParams({
      q,
      protein,
      rating,
      page: String(pageNum),
      ...over,
    });
    return `/recipes?${p}`;
  };

  return (
    <main className="container">
      <h1>Recipes</h1>
      <Suspense>
        <Filters />
      </Suspense>
      <p className="muted">
        {total} recipe{total === 1 ? "" : "s"}
      </p>
      <div className="grid">
        {rows.map((r) => (
          <RecipeCard key={r.id} recipe={r} href={`/recipes/${r.slug}`} />
        ))}
      </div>
      {totalPages > 1 && (
        <nav className="pagination">
          {pageNum > 1 && (
            <Link href={link({ page: String(pageNum - 1) })}>← Prev</Link>
          )}
          <span>
            Page {pageNum} of {totalPages}
          </span>
          {pageNum < totalPages && (
            <Link href={link({ page: String(pageNum + 1) })}>Next →</Link>
          )}
        </nav>
      )}
    </main>
  );
}
