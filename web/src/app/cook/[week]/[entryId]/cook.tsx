"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { CookRecipe } from "@/lib/cook";
import { type Rating, RATINGS, ratingLabel } from "@/lib/ratings";
import {
  RecipeHeader,
  RecipeIngredients,
  StepBody,
} from "@/components/recipe-view";
import { rate, toggleCooked } from "../actions";

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

// How far below the header a section's top may sit and still count as the
// current one (absorbs snap rounding and small scroll offsets).
const CURRENT_SLOP_PX = 40;
// Tolerance when detecting that the page is scrolled to the very bottom.
const BOTTOM_SLOP_PX = 2;

// Document-level scroll snapping for a stack of sections under a sticky
// header. While mounted: snapping is enabled on <html>, the snap offset
// tracks the header's height, and `current` is the index of the section
// sitting under the header (the last one once scrolled to the bottom, since
// it may be too short to reach the top). Attach `headerRef` to the header
// and `sectionRef(i)` to section i; `scrollTo(i)` smooth-scrolls to it.
function useSnapSections() {
  const [current, setCurrent] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);
  const sections = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("cook-snap");
    let frame = 0;
    const update = () => {
      frame = 0;
      const header = headerRef.current?.offsetHeight ?? 0;
      html.style.scrollPaddingTop = `${header}px`;
      const els = sections.current;
      const atBottom =
        window.innerHeight + window.scrollY >=
        html.scrollHeight - BOTTOM_SLOP_PX;
      let next = 0;
      els.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= header + CURRENT_SLOP_PX)
          next = i;
      });
      setCurrent(atBottom ? els.length - 1 : next);
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

  return {
    current,
    headerRef,
    sectionRef: (i: number) => (el: HTMLElement | null) => {
      sections.current[i] = el;
    },
    scrollTo: (i: number) =>
      sections.current[i]?.scrollIntoView({ behavior: "smooth" }),
  };
}

type Step = CookRecipe["instructions"][number];

// Everything on the page, in order: the ingredients, each instruction, then
// the finish section. Indexes into this list are the only notion of
// position; `kind` picks the dot colour and what the section renders.
type Section =
  | { kind: "ingredients"; label: string }
  | { kind: "step"; label: string; step: Step }
  | { kind: "finish"; label: string };

function buildSections(steps: Step[]): Section[] {
  return [
    { kind: "ingredients", label: "Ingredients" },
    ...steps.map((step, i) => ({
      kind: "step" as const,
      label: `Step ${i + 1}`,
      step,
    })),
    { kind: "finish", label: "Done and rate" },
  ];
}

// Marks the meal cooked, then offers a rating (tap the selected rating
// again to clear it).
function FinishSection({ week, entry }: { week: string; entry: CookRecipe }) {
  const [cooked, setCooked] = useState(entry.cooked);
  const [rating, setRating] = useState(entry.user_rating);
  const [pending, startTransition] = useTransition();

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

  return (
    <>
      {cooked ? (
        <>
          <h2>Done — enjoy!</h2>
          <p>How was it?</p>
          <div className="cook-rating">
            {RATINGS.map((r) => (
              <button
                key={r}
                disabled={pending}
                className={rating === r ? "selected" : ""}
                onClick={() => pick(r)}
              >
                {ratingLabel(r)}
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
    </>
  );
}

// Scrolling cooking flow: ingredients, every instruction, then a finish
// section — all on one page, snapping each section under a sticky header.
// Non-current sections are dimmed (the next one less so) and tapping one
// jumps to it. The header's dots show position: dark up to the current
// section, light after; tapping a dot jumps to its section.
export function CookMode({ week, entry }: { week: string; entry: CookRecipe }) {
  useWakeLock();
  const sections = buildSections(entry.instructions);
  const { current, headerRef, sectionRef, scrollTo } = useSnapSections();

  const sectionClass = (i: number) =>
    i === current ? "current" : i === current + 1 ? "next" : "";

  return (
    <div className="cook-mode">
      <div className="cook-header" ref={headerRef}>
        <nav className="cook-steps" aria-label="Steps">
          {sections.map((s, i) => (
            <button
              key={i}
              className={`${s.kind} ${i <= current ? "done" : ""}`}
              aria-label={s.label}
              aria-current={i === current ? "step" : undefined}
              onClick={() => scrollTo(i)}
            />
          ))}
        </nav>
      </div>

      {sections.map((s, i) => (
        <section
          key={i}
          ref={sectionRef(i)}
          className={`cook-section cook-section-${s.kind} ${sectionClass(i)}`}
          onClick={i === current ? undefined : () => scrollTo(i)}
        >
          {s.kind === "ingredients" ? (
            <>
              <RecipeHeader recipe={entry} />
              <RecipeIngredients sections={entry.ingredientGroups} />
            </>
          ) : s.kind === "step" ? (
            <StepBody step={s.step} />
          ) : (
            <FinishSection week={week} entry={entry} />
          )}
        </section>
      ))}
    </div>
  );
}
