import type { Metadata } from "next";
import { getNovelty, getWeeks } from "@/lib/plan";
import { mondayOf } from "@/lib/week";
import { SettingsMenu, StageNav, WeekMenu } from "./nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mealime",
  description: "Weekly dinner planning",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [weeks, novelty] = await Promise.all([getWeeks(), getNovelty()]);
  const thisWeek = mondayOf();

  return (
    <html lang="en">
      <body>
        <header className="navbar">
          <StageNav thisWeek={thisWeek} />
          <span className="nav-right">
            <WeekMenu weeks={weeks} thisWeek={thisWeek} />
            <SettingsMenu novelty={novelty} />
          </span>
        </header>
        {children}
      </body>
    </html>
  );
}
