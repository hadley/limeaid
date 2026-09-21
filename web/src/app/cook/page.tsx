import { redirect } from "next/navigation";
import { mondayOf } from "@/lib/week";

export const dynamic = "force-dynamic";

export default function CookPage() {
  redirect(`/cook/${mondayOf()}`);
}
