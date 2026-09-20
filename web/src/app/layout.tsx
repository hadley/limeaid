import type { Metadata } from "next";
import Link from "next/link";
import { getNovelty, getWeeks, weekStage } from "@/lib/plan";
import { mondayOf } from "@/lib/week";
import { SettingsMenu, WeekSelector } from "./nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mealime",
  description: "Weekly dinner planning",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const week = mondayOf();
  const [s, weeks, novelty] = await Promise.all([
    weekStage(week),
    getWeeks(),
    getNovelty(),
  ]);

  const pills = [
    { label: "Plan", count: `${s.picks}`, href: `/plan/${week}`, stage: "plan" },
    {
      label: "Shop",
      count: `${s.groceriesChecked}/${s.groceriesTotal}`,
      href: `/shop/${week}`,
      stage: "shop",
    },
    {
      label: "Cook",
      count: `${s.cooked}/${s.picks}`,
      href: null,
      stage: "cook",
    },
  ];

  return (
    <html lang="en">
      <body>
        <header className="navbar">
          <span className="brand">Mealime</span>
          <nav className="pills">
            {pills.map((p) =>
              p.href ? (
                <Link
                  key={p.label}
                  href={p.href}
                  className={`pill${s.stage === p.stage ? " active" : ""}`}
                >
                  {p.label} · {p.count}
                </Link>
              ) : (
                <span
                  key={p.label}
                  className={`pill disabled${s.stage === p.stage ? " active" : ""}`}
                  title="Coming in a later stage"
                >
                  {p.label} · {p.count}
                </span>
              ),
            )}
          </nav>
          <Link href="/recipes" className="muted">
            Recipes
          </Link>
          <WeekSelector weeks={weeks} />
          <SettingsMenu novelty={novelty} />
        </header>
        {children}
      </body>
    </html>
  );
}
