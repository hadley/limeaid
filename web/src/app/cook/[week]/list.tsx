import type { CookEntry } from "@/lib/cook";
import { RecipeCard } from "@/components/recipe-card";

// Grid of a week's entries; each whole card opens the cooking view.
// Cooked entries render faded.
export function CookList({
  week,
  entries,
}: {
  week: string;
  entries: CookEntry[];
}) {
  return (
    <div className="grid">
      {entries.map((e) => (
        <RecipeCard
          key={e.entryId}
          recipe={e}
          cooked={e.cooked}
          href={`/cook/${week}/${e.entryId}`}
        />
      ))}
    </div>
  );
}
