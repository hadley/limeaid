"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { CookEntry } from "@/lib/cook";
import { type Rating, RATINGS, RATING_EMOJI, RATING_NAME } from "@/lib/ratings";
import { RecipeCard } from "@/components/recipe-card";
import { rate, toggleCooked } from "./actions";

type Change =
  | { kind: "cooked"; entryId: number; cooked: boolean }
  | { kind: "rating"; recipeId: string; rating: Rating };

const applyChange = (entries: CookEntry[], c: Change) =>
  entries.map((e) =>
    c.kind === "cooked"
      ? e.entryId === c.entryId
        ? { ...e, cooked: c.cooked }
        : e
      : e.id === c.recipeId
        ? { ...e, user_rating: c.rating }
        : e,
  );

// Grid of a week's entries; each whole card opens the cooking view.
// Cooked entries render faded. The top-left check toggles cooked; a cooked
// but unrated entry shows a rating picker top-right until it's rated.
// Changes apply optimistically, and the cards keep their initial order so
// a card doesn't jump away when the server re-sorts cooked meals last.
export function CookList({
  week,
  entries,
}: {
  week: string;
  entries: CookEntry[];
}) {
  const [order] = useState(() => entries.map((e) => e.entryId));
  const [shown, update] = useOptimistic(entries, applyChange);
  const [, startTransition] = useTransition();

  const position = (e: CookEntry) => {
    const i = order.indexOf(e.entryId);
    return i === -1 ? Infinity : i;
  };
  const sorted = [...shown].sort((a, b) => position(a) - position(b));

  const setCooked = (entryId: number, cooked: boolean) =>
    startTransition(async () => {
      update({ kind: "cooked", entryId, cooked });
      await toggleCooked(week, entryId, cooked);
    });

  const setRating = (recipeId: string, rating: Rating) =>
    startTransition(async () => {
      update({ kind: "rating", recipeId, rating });
      await rate(week, Number(recipeId), rating);
    });

  return (
    <div className="grid">
      {sorted.map((e) => (
        <RecipeCard
          key={e.entryId}
          recipe={e}
          cooked={e.cooked}
          href={`/cook/${week}/${e.entryId}`}
          overlay={
            <CookBadges
              entry={e}
              onCooked={(cooked) => setCooked(e.entryId, cooked)}
              onRate={(rating) => setRating(e.id, rating)}
            />
          }
        />
      ))}
    </div>
  );
}

function CookBadges({
  entry,
  onCooked,
  onRate,
}: {
  entry: CookEntry;
  onCooked: (cooked: boolean) => void;
  onRate: (rating: Rating) => void;
}) {
  const rating = entry.user_rating;
  return (
    <>
      <button
        type="button"
        className={`card-badge cook-check${entry.cooked ? " checked" : ""}`}
        aria-label="Cooked"
        aria-pressed={entry.cooked}
        onClick={() => onCooked(!entry.cooked)}
      >
        {entry.cooked ? "✓" : ""}
      </button>
      {rating ? (
        <span className="card-badge card-rating-badge">
          {RATING_EMOJI[rating]}
        </span>
      ) : (
        entry.cooked && (
          <div className="cook-rate" role="group" aria-label="Rate it">
            {RATINGS.map((r) => (
              <button
                key={r}
                type="button"
                className="card-badge"
                aria-label={RATING_NAME[r]}
                title={RATING_NAME[r]}
                onClick={() => onRate(r)}
              >
                {RATING_EMOJI[r]}
              </button>
            ))}
          </div>
        )
      )}
    </>
  );
}
