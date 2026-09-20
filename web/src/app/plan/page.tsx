import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { mondayOf } from "@/lib/week";

export default function PlanIndex() {
  redirect(`/plan/${mondayOf()}`);
}
