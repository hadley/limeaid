"use client";

import Link from "next/link";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
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

// Scrolling cooking flow: ingredients (grouped by kitchen location), then
// every instruction, then a finish section that marks the meal cooked and
// prompts for a rating — all on one page. Scroll snapping lands each
// section exactly under the sticky header; the non-current sections are
// dimmed. A row of dots in the header tracks progress and jumps to any
// section; tapping a dimmed section also jumps to it.
export function CookMode({
  week,
  initialEntry,
}: {
  week: string;
  initialEntry: Entry;
}) {
  useWakeLock();
  const entry = initialEntry;
  const steps = entry.instructions;
  const FINISH = steps.length;
  // -1 = ingredients, 0..n-1 = steps, n = finish
  const [pos, setPos] = useState(-1);
  const [cooked, setCooked] = useState(entry.cooked);
  const [rating, setRating] = useState(entry.user_rating);
  const [pending, startTransition] = useTransition();
  const headerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  // Enable document-level snapping while cook mode is mounted, keep the
  // snap offset in sync with the sticky header height, and derive the
  // current section from scroll position.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("cook-snap");
    let frame = 0;
    const update = () => {
      frame = 0;
      const header = headerRef.current?.offsetHeight ?? 0;
      html.style.scrollPaddingTop = `${header}px`;
      const sections = sectionRefs.current;
      let current = 0;
      sections.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= header + 40) current = i;
      });
      // At the very bottom the finish section may not reach the top.
      if (window.innerHeight + window.scrollY >= html.scrollHeight - 2) {
        current = sections.length - 1;
      }
      setPos(current - 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      html.classList.remove("cook-snap");
      html.style.scrollPaddingTop = "";
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const jump = (p: number) =>
    sectionRefs.current[p + 1]?.scrollIntoView({ behavior: "smooth" });

  const finish = () =>
    startTransition(async () => {
      await toggleCooked(week, entry.entryId, true);
      setCooked(true);
    });

  const pick = (value: Rating) =>
    startTransition(async () => {
      const next = rating === value ? null : value;
      await rate(week, Number(entry.id), next);
      setRating(next);
    });

  const section = (p: number, className: string, children: ReactNode) => (
    <section
      key={p}
      ref={(el) => {
        sectionRefs.current[p + 1] = el;
      }}
      className={`cook-section ${className} ${p === pos ? "current" : p === pos + 1 ? "next" : ""}`}
      onClick={p === pos ? undefined : () => jump(p)}
    >
      {children}
    </section>
  );

  const circleState = (p: number) => (p <= pos ? "done" : "");

  return (
    <div className="cook-mode">
      <div className="cook-header" ref={headerRef}>
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
      </div>

      {section(
        -1,
        "cook-ingredients-section",
        <>
          <h2>Ingredients</h2>
          <div className="cook-ingredient-groups">
            {groupByLocation(entry.ingredients).map(([location, items]) => (
              <div key={location ?? "other"}>
                {location && <h3 className="cook-location">{location}</h3>}
                <ul className="cook-ingredients">
                  {items.map((i) => (
                    <li key={i.display}>{i.display}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>,
      )}

      {steps.map((s, i) =>
        section(
          i,
          "",
          <>
            <p className="cook-step">{s.text}</p>
            {s.amounts && s.amounts.length > 0 && (
              <ul className="cook-amounts">
                {s.amounts.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </>,
        ),
      )}

      {section(
        FINISH,
        "cook-finish",
        <>
          {cooked ? (
            <>
              <h2>Done — enjoy!</h2>
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
          ) : (
            <button
              className="cook-finish-button"
              disabled={pending}
              onClick={finish}
            >
              Finish & mark cooked
            </button>
          )}
          <p>
            <Link href={`/cook/${week}`}>← Back to this week</Link>
          </p>
        </>,
      )}
    </div>
  );
}
