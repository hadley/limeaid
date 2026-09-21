import { notFound } from "next/navigation";
import { getCookEntry } from "@/lib/cook";
import { isMonday } from "@/lib/week";
import { CookMode } from "./cook";

export default async function CookEntryPage({
  params,
}: {
  params: Promise<{ week: string; entryId: string }>;
}) {
  const { week, entryId } = await params;
  if (!isMonday(week) || !/^\d+$/.test(entryId)) notFound();

  const entry = await getCookEntry(week, Number(entryId));
  if (!entry) notFound();

  return (
    <main className="container cook">
      <CookMode week={week} initialEntry={JSON.parse(JSON.stringify(entry))} />
    </main>
  );
}
