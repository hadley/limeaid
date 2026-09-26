"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { RecipeSummary } from "@/lib/db";
import { RecipeCard } from "@/components/recipe-card";
import { PicksPanel } from "@/components/picks-panel";
import { loadMore, togglePick } from "./actions";

export function Picker({
  week,
  novelty,
  q,
  protein,
  initialPage,
  initialPicks,
}: {
  week: string;
  novelty: number;
  q: string;
  protein: string;
  initialPage: { recipes: RecipeSummary[]; done: boolean };
  initialPicks: RecipeSummary[];
}) {
  const [recipes, setRecipes] = useState(initialPage.recipes);
  const [done, setDone] = useState(initialPage.done);
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState(initialPicks);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  const pickIds = new Set(picks.map((p) => String(p.id)));

  const toggle = (id: string) =>
    startTransition(async () => {
      setPicks(await togglePick(week, Number(id)));
    });

  // Fetch the next slice of the week's fixed order when the sentinel below
  // the grid scrolls into view. The order is deterministic, but the candidate
  // set can shift between fetches (e.g. a rating changes), so skip any
  // recipe already on screen.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || loading || done) return;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setLoading(true);
        try {
          const next = await loadMore(
            week,
            novelty,
            recipes.length,
            q,
            protein,
          );
          const seen = new Set(recipes.map((r) => String(r.id)));
          setRecipes([
            ...recipes,
            ...next.recipes.filter((r) => !seen.has(String(r.id))),
          ]);
          setDone(next.done);
        } finally {
          setLoading(false);
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [week, novelty, q, protein, recipes, loading, done]);

  return (
    <div className="plan-layout">
      <div className="plan-main">
        <div className="grid">
          {recipes.map((r) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              onClick={() => toggle(String(r.id))}
              selected={pickIds.has(String(r.id))}
              disabled={pending}
            />
          ))}
        </div>
        <div ref={sentinel} className="muted" aria-live="polite">
          {loading
            ? "Loading more…"
            : done
              ? "That’s every matching recipe."
              : null}
        </div>
      </div>

      <PicksPanel week={week} picks={picks} onRemove={toggle} />
    </div>
  );
}
