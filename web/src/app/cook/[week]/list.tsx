"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { CookEntry } from "@/lib/cook";
import { RecipeCard } from "@/components/recipe-card";
import { toggleCooked } from "./actions";

export function CookList({
  week,
  initialEntries,
}: {
  week: string;
  initialEntries: CookEntry[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [pending, startTransition] = useTransition();

  const uncook = (entry: CookEntry) =>
    startTransition(async () => {
      setEntries(await toggleCooked(week, entry.entryId, false));
    });

  const cooked = entries.filter((e) => e.cooked).length;

  return (
    <>
      <div className="plan-toolbar">
        <p>
          <strong>{cooked}</strong>/{entries.length} cooked
        </p>
      </div>
      <div className="grid">
        {entries.map((e) => (
          <RecipeCard
            key={e.entryId}
            recipe={e}
            cooked={e.cooked}
            titleHref={`/cook/${week}/${e.entryId}`}
          >
            {e.cooked ? (
              <button
                className="uncook"
                disabled={pending}
                onClick={() => uncook(e)}
              >
                Cooked ✓ — undo
              </button>
            ) : (
              <Link className="cook-button" href={`/cook/${week}/${e.entryId}`}>
                Cook →
              </Link>
            )}
          </RecipeCard>
        ))}
      </div>
    </>
  );
}
