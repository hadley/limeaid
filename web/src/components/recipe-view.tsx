import { imageSrc } from "@/lib/images";
import type { Ingredient, Instruction, Recipe } from "@/lib/db";

// The single recipe view, shared by /recipes/[slug] and the cook mode page.
// Always render a recipe through these pieces — never re-create recipe
// markup on a page — so the two views can't drift apart. Keep this file
// free of server-only imports (pg etc.): cook mode is a client component.

export type RecipeHeaderData = Pick<
  Recipe,
  | "slug"
  | "name"
  | "proteins"
  | "total_time_minutes"
  | "yield"
  | "community_rating"
  | "community_rating_count"
>;

export function RecipeHeader({ recipe }: { recipe: RecipeHeaderData }) {
  return (
    <>
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageSrc(recipe)} alt={recipe.name} className="hero" />
    </>
  );
}

// A labelled group of ingredients. A null label renders no heading — used
// for the main shopping list and for ingredients of unknown location.
export type IngredientSection = { label: string | null; items: Ingredient[] };

export function RecipeIngredients({
  sections,
}: {
  sections: IngredientSection[];
}) {
  return (
    <>
      <h2>Ingredients</h2>
      <div className="ingredient-groups">
        {sections.map(({ label, items }) => (
          <div key={label ?? "ungrouped"}>
            {label && <h3 className="ingredient-label">{label}</h3>}
            <ul className="ingredient-list">
              {items.map((i) => (
                <li key={i.display}>{i.display}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

// One instruction: the step text plus its per-step quantity "amounts".
export function StepBody({ step }: { step: Instruction }) {
  return (
    <>
      <p className="step-text">{step.text}</p>
      {step.amounts && step.amounts.length > 0 && (
        <ul className="amounts">
          {step.amounts.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </>
  );
}

export function RecipeSteps({
  instructions,
}: {
  instructions: Instruction[];
}) {
  return (
    <>
      <h2>Instructions</h2>
      <ol className="steps">
        {instructions.map((s, i) => (
          <li key={i}>
            <StepBody step={s} />
          </li>
        ))}
      </ol>
    </>
  );
}
