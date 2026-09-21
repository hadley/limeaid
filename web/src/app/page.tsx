import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { weekStage } from "@/lib/plan";
import { mondayOf } from "@/lib/week";

export default async function Home() {
  const week = mondayOf();
  const s = await weekStage(week);
  redirect(
    s.stage === "plan"
      ? `/plan/${week}`
      : s.stage === "shop"
        ? `/shop/${week}`
        : `/cook/${week}`,
  );
}
