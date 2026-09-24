import type { Metadata } from "next";
import Link from "next/link";
import { getNovelty, getWeeks } from "@/lib/plan";
import { SettingsMenu, WeekMenu } from "./nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mealime",
  description: "Weekly dinner planning",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [weeks, novelty] = await Promise.all([getWeeks(), getNovelty()]);

  return (
    <html lang="en">
      <body>
        <header className="navbar">
          <WeekMenu weeks={weeks} />
          <span className="nav-right">
            <Link href="/recipes" className="muted">
              Recipes
            </Link>
            <SettingsMenu novelty={novelty} />
          </span>
        </header>
        {children}
      </body>
    </html>
  );
}
