import { redirect } from "next/navigation";
import { currentPlanStart } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function CookPage() {
  redirect(`/cook/${await currentPlanStart()}`);
}
