"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { setNovelty } from "./actions";

const WEEK_PATH = /^\/(plan|shop|cook)\/(\d{4}-\d{2}-\d{2})/;

const STAGES = [
  ["plan", "Plan"],
  ["shop", "Shop"],
  ["cook", "Cook"],
] as const;

// Plan / Shop / Cook switcher. On week pages it links to the same week's
// other stages and highlights the active one; elsewhere (recipes) it links
// to `thisWeek` with nothing highlighted.
export function StageNav({ thisWeek }: { thisWeek: string }) {
  const m = usePathname().match(WEEK_PATH);
  const week = m?.[2] ?? thisWeek;
  return (
    <nav className="stage-nav">
      {STAGES.map(([stage, label]) => (
        <Link
          key={stage}
          href={`/${stage}/${week}`}
          className={m?.[1] === stage ? "active" : undefined}
          aria-current={m?.[1] === stage ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function WeekMenu({
  weeks,
  thisWeek,
}: {
  weeks: string[];
  thisWeek: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = pathname.match(WEEK_PATH)?.[2] ?? thisWeek;

  const select = (week: string) => {
    const m = pathname.match(WEEK_PATH);
    router.push(m ? `/${m[1]}/${week}` : `/plan/${week}`);
    setOpen(false);
  };

  const label = (w: string) =>
    new Date(w + "T12:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <span className="week-menu">
      <button
        className="week-button"
        onClick={() => setOpen(!open)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Week of ${label(current)}`}
      >
        {label(current)} ▾
      </button>
      {open && (
        <div className="dropdown">
          {weeks.map((w) => (
            <button
              key={w}
              className={`week-option${w === current ? " active" : ""}`}
              onClick={() => select(w)}
            >
              Week of {label(w)}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function SettingsMenu({ novelty }: { novelty: number }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(novelty);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Saving refreshes the page (reordering the plan picker), so wait until
  // the slider settles rather than saving on every step.
  const slide = (v: number) => {
    setValue(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => startTransition(() => setNovelty(v)), 300);
  };

  return (
    <span className="settings-menu">
      <button
        className="icon-button"
        aria-label="Settings"
        onClick={() => setOpen(!open)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className="dropdown">
          <Link
            href="/recipes"
            className="settings-link"
            onClick={() => setOpen(false)}
          >
            Browse recipes
          </Link>
          <label className="muted">
            Novelty: {value.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={value}
              onChange={(e) => slide(Number(e.target.value))}
            />
          </label>
          <p className="muted">
            Higher recommends more recipes you’ve never cooked.
          </p>
        </div>
      )}
    </span>
  );
}
