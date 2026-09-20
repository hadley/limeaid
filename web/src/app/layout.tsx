import type { Metadata } from "next";
import Link from "next/link";
import { weekStage } from "@/lib/plan";
import { mondayOf } from "@/lib/week";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mealime",
  description: "Weekly dinner planning",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const week = mondayOf();
  const s = await weekStage(week);

  const pills = [
    { label: "Plan", count: `${s.picks}`, href: `/plan/${week}`, stage: "plan" },
    {
      label: "Shop",
      count: `${s.groceriesChecked}/${s.groceriesTotal}`,
      href: null,
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
        </header>
        {children}
      </body>
    </html>
  );
}
