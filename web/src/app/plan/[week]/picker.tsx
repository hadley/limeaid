"use client";

import { useState, useTransition } from "react";
import type { RecipeSummary } from "@/lib/db";
import { RecipeCard } from "@/components/recipe-card";
import { PicksPanel } from "@/components/picks-panel";
import { gotoPage, togglePick } from "./actions";

type Page = { batch: RecipeSummary[]; idx: number; total: number };

export function Picker({
  week,
  q,
  protein,
  initialPage,
  initialPicks,
}: {
  week: string;
  q: string;
  protein: string;
  initialPage: Page;
  initialPicks: RecipeSummary[];
}) {
  const [page, setPage] = useState(initialPage);
  const [picks, setPicks] = useState(initialPicks);
  const [pending, startTransition] = useTransition();

  const pickIds = new Set(picks.map((p) => String(p.id)));

  const toggle = (id: string) =>
    startTransition(async () => {
      setPicks(await togglePick(week, Number(id)));
    });

  const goto = (idx: number) =>
    startTransition(async () => {
      setPage(await gotoPage(week, idx, q, protein));
    });

  return (
    <div className="plan-layout">
      <div className="plan-main">
        <div className="grid">
          {page.batch.map((r) => {
            const selected = pickIds.has(String(r.id));
            return (
              <RecipeCard
                key={r.id}
                recipe={r}
                onClick={() => toggle(String(r.id))}
                selected={selected}
                disabled={pending}
              />
            );
          })}
        </div>

        <span className="pagination">
          <button
            onClick={() => goto(page.idx - 1)}
            disabled={pending || page.idx === 0}
          >
            ← Prev
          </button>
          <span className="muted">
            Page {page.idx + 1} of {page.total}
          </span>
          <button onClick={() => goto(page.idx + 1)} disabled={pending}>
            {page.idx + 1 < page.total ? "Next →" : "More →"}
          </button>
        </span>
      </div>

      <PicksPanel week={week} picks={picks} onRemove={toggle} />
    </div>
  );
}
