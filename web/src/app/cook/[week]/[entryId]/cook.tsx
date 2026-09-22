"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { CookEntry } from "@/lib/cook";
import type { Recipe } from "@/lib/db";
import { rate, toggleCooked } from "../actions";

type Entry = CookEntry & Recipe;

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
// everything, sorted by grocery department), then one instruction per
// screen — step text first, its per-step amounts as chips below — then a
// finish screen that marks the meal cooked and prompts for a rating. A
// hamburger menu jumps to any screen directly.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [cooked, setCooked] = useState(entry.cooked);
  const [rating, setRating] = useState(entry.user_rating);
  const [pending, startTransition] = useTransition();

  const jump = (p: number) => {
    setPos(p);
    setMenuOpen(false);
  };

  const finish = () =>
    startTransition(async () => {
      await toggleCooked(week, entry.entryId, true);
      setCooked(true);
      setPos(FINISH);
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
        <ul className="cook-ingredients">
          {entry.ingredients.map((i) => (
            <li key={i.display}>{i.display}</li>
          ))}
        </ul>
      </>
    );
  } else if (pos < FINISH) {
    const s = steps[pos];
    body = (
      <>
        <p className="muted">
          Step {pos + 1} of {steps.length}
        </p>
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

  return (
    <div className="cook-mode">
      <div className="plan-toolbar cook-toolbar">
        <Link href={`/cook/${week}`} className="muted">
          ← {entry.name}
        </Link>
        <button
          className="icon-button cook-menu-button"
          aria-label="Jump to any step"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>
      {menuOpen && (
        <div className="cook-menu">
          <button
            className={pos === -1 ? "current" : ""}
            onClick={() => jump(-1)}
          >
            Ingredients
          </button>
          <div className="cook-menu-steps">
            {steps.map((_, i) => (
              <button
                key={i}
                className={pos === i ? "current" : ""}
                onClick={() => jump(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button
            className={pos === FINISH ? "current" : ""}
            onClick={() => jump(FINISH)}
          >
            Finish & rate
          </button>
        </div>
      )}
      <div className="cook-progress">
        <div style={{ width: `${((pos + 1) / (FINISH + 1)) * 100}%` }} />
      </div>

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
