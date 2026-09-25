"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { CookEntry, LocatedIngredient } from "@/lib/cook";
import type { Recipe } from "@/lib/db";
import { LOCATION_ORDER } from "@/lib/locations";
import { rate, toggleCooked } from "../actions";

type Entry = CookEntry &
  Omit<Recipe, "ingredients"> & { ingredients: LocatedIngredient[] };

// Group ingredients by kitchen location, in display order; ingredients with
// no classification go in an unlabeled final group.
function groupByLocation(ingredients: LocatedIngredient[]) {
  const groups = new Map<string | null, LocatedIngredient[]>();
  for (const i of ingredients) {
    const key = LOCATION_ORDER.includes(i.location ?? "") ? i.location : null;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return [...groups.entries()];
}

type Rating = "disliked" | "liked" | "loved";

const RATINGS: { value: Rating; label: string }[] = [
  { value: "disliked", label: "👎 Disliked" },
  { value: "liked", label: "👍 Liked" },
  { value: "loved", label: "❤️ Loved" },
];

// Keep the screen awake while cooking; re-acquire when the tab becomes
// visible again (the lock drops on backgrounding).
function useWakeLock() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const acquire = async () => {
      try {
        lock =
          (await navigator.wakeLock?.request("screen").catch(() => null)) ??
          null;
      } catch {
        // Wake Lock unsupported or denied — fine, cooking still works.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}

// Step-through cooking flow: a single ingredients page first (gather
// everything, grouped by kitchen location), then one instruction per
// screen — step text first, its per-step amounts as chips below — then a
// finish screen that marks the meal cooked and prompts for a rating. A row
// of step circles at the top shows progress and jumps to any screen.
export function CookMode({
  week,
  initialEntry,
}: {
  week: string;
  initialEntry: Entry;
}) {
  useWakeLock();
  const router = useRouter();
  const entry = initialEntry;
  const steps = entry.instructions;
  const FINISH = steps.length;
  // -1 = ingredients, 0..n-1 = steps, n = finish
  const [pos, setPos] = useState(-1);
  // Furthest screen reached; everything before it counts as completed.
  const [maxPos, setMaxPos] = useState(-1);
  const [cooked, setCooked] = useState(entry.cooked);
  const [rating, setRating] = useState(entry.user_rating);
  const [pending, startTransition] = useTransition();

  const jump = (p: number) => {
    setPos(p);
    setMaxPos((m) => Math.max(m, p));
  };

  const finish = () =>
    startTransition(async () => {
      await toggleCooked(week, entry.entryId, true);
      setCooked(true);
      jump(FINISH);
    });

  const pick = (value: Rating) =>
    startTransition(async () => {
      const next = rating === value ? null : value;
      await rate(week, Number(entry.id), next);
      setRating(next);
    });

  let body;
  if (pos === -1) {
    body = (
      <>
        <h2>Ingredients</h2>
        <p className="muted">Get everything out before you start.</p>
        <div className="cook-ingredient-groups">
          {groupByLocation(entry.ingredients).map(([location, items]) => (
            <section key={location ?? "other"}>
              {location && <h3 className="cook-location">{location}</h3>}
              <ul className="cook-ingredients">
                {items.map((i) => (
                  <li key={i.display}>{i.display}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </>
    );
  } else if (pos < FINISH) {
    const s = steps[pos];
    body = (
      <>
        <p className="cook-step">{s.text}</p>
        {s.amounts && s.amounts.length > 0 && (
          <ul className="cook-amounts">
            {s.amounts.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </>
    );
  } else {
    body = (
      <>
        <h2>{cooked ? "Done — enjoy!" : "All steps complete"}</h2>
        {cooked && (
          <>
            <p>How was it?</p>
            <div className="cook-rating">
              {RATINGS.map((r) => (
                <button
                  key={r.value}
                  disabled={pending}
                  className={rating === r.value ? "selected" : ""}
                  onClick={() => pick(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        )}
        <p>
          <Link href={`/cook/${week}`}>← Back to this week</Link>
        </p>
      </>
    );
  }

  const circleState = (p: number) =>
    [p === pos ? "current" : "", cooked || p < maxPos ? "done" : ""].join(" ");

  return (
    <div className="cook-mode">
      <div className="plan-toolbar cook-toolbar">
        <Link href={`/cook/${week}`} className="muted">
          ← {entry.name}
        </Link>
      </div>
      <nav className="cook-steps" aria-label="Steps">
        <button
          className={`ingredients ${circleState(-1)}`}
          aria-label="Ingredients"
          aria-current={pos === -1 ? "step" : undefined}
          onClick={() => jump(-1)}
        />
        {steps.map((_, i) => (
          <button
            key={i}
            className={circleState(i)}
            aria-label={`Step ${i + 1}`}
            aria-current={pos === i ? "step" : undefined}
            onClick={() => jump(i)}
          />
        ))}
        <button
          className={`finish ${circleState(FINISH)}`}
          aria-label="Done and rate"
          aria-current={pos === FINISH ? "step" : undefined}
          onClick={() => jump(FINISH)}
        />
      </nav>

      {body}

      <div className="cook-nav">
        <button disabled={pos === -1} onClick={() => jump(pos - 1)}>
          ← Back
        </button>
        {pos === steps.length - 1 ? (
          <button
            className="primary"
            disabled={pending || cooked}
            onClick={finish}
          >
            {cooked ? "Cooked ✓" : "Finish & mark cooked"}
          </button>
        ) : pos < FINISH ? (
          <button className="primary" onClick={() => jump(pos + 1)}>
            {pos === -1 ? "Start cooking →" : "Next →"}
          </button>
        ) : (
          <button
            className="primary"
            onClick={() => router.push(`/cook/${week}`)}
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
