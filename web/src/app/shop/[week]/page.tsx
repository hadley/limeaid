import Link from "next/link";
import { notFound } from "next/navigation";
import { getPicks } from "@/lib/plan";
import { syncList } from "@/lib/shop";
import { isMonday } from "@/lib/week";
import { GroceryList } from "./list";

export default async function ShopWeekPage({
  params,
}: {
  params: Promise<{ week: string }>;
}) {
  const { week } = await params;
  if (!isMonday(week)) notFound();

  const [items, picks] = await Promise.all([syncList(week), getPicks(week)]);

  return (
    <main className="container">
      {picks.length === 0 ? (
        <p className="muted">
          Nothing planned this week —{" "}
          <Link href={`/plan/${week}`}>pick some dinners</Link>.
        </p>
      ) : (
        <GroceryList
          week={week}
          initialItems={JSON.parse(JSON.stringify(items))}
        />
      )}
    </main>
  );
}
