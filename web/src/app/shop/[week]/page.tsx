import Link from "next/link";
import { notFound } from "next/navigation";
import { getPicks } from "@/lib/plan";
import { getList } from "@/lib/shop";
import { isMonday } from "@/lib/week";
import { GroceryList } from "./list";

export default async function ShopWeekPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  if (!isMonday(week)) notFound();

  const [items, picks] = await Promise.all([getList(week), getPicks(week)]);

  const label = new Date(week + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className="container">
      <h1>Week of {label}</h1>
      {picks.length === 0 && (
        <p className="muted">
          Nothing planned this week — <Link href={`/plan/${week}`}>pick some dinners</Link>.
        </p>
      )}
      <GroceryList week={week} initialItems={JSON.parse(JSON.stringify(items))} />
    </main>
  );
}
