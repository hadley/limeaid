import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { weekStage } from "@/lib/plan";
import { mondayOf } from "@/lib/week";

// TODO: send the cook stage to /cook/<week> once it exists.
export default async function Home() {
  const week = mondayOf();
  const s = await weekStage(week);
  redirect(s.stage === "plan" ? `/plan/${week}` : `/shop/${week}`);
}
