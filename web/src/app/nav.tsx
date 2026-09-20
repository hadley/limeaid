"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setNovelty } from "./actions";

const WEEK_PATH = /^\/(plan|shop|cook)\/(\d{4}-\d{2}-\d{2})/;

export function WeekSelector({ weeks }: { weeks: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = pathname.match(WEEK_PATH)?.[2] ?? weeks[0];

  const onChange = (week: string) => {
    const m = pathname.match(WEEK_PATH);
    router.push(m ? `/${m[1]}/${week}` : `/plan/${week}`);
  };

  const label = (w: string) =>
    new Date(w + "T12:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <select
      className="week-select"
      value={current}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Week"
    >
      {weeks.map((w) => (
        <option key={w} value={w}>
          Week of {label(w)}
        </option>
      ))}
    </select>
  );
}

export function SettingsMenu({ novelty }: { novelty: number }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(novelty);
  const [, startTransition] = useTransition();

  const slide = (v: number) => {
    setValue(v);
    startTransition(() => setNovelty(v));
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
