import type { Metadata } from "next";
import { getWeeks } from "@/lib/plan";
import { getNovelty } from "@/lib/settings";
import { today } from "@/lib/week";
import { SettingsMenu, StageNav, WeekMenu } from "./nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Limeaid",
  description: "Weekly dinner planning",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [weeks, novelty] = await Promise.all([getWeeks(), getNovelty()]);
  const thisWeek = today();

  return (
    <html lang="en">
      <body>
        <header className="navbar">
          <StageNav thisWeek={thisWeek} />
          <span className="nav-right">
            <WeekMenu
              weeks={weeks}
              thisWeek={thisWeek}
              today={new Date().toLocaleDateString("en-CA")}
            />
            <SettingsMenu novelty={novelty} />
          </span>
        </header>
        {children}
      </body>
    </html>
  );
}
