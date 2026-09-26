"use server";

import { refresh } from "next/cache";
import { setNovelty as saveNovelty } from "@/lib/settings";

// Refresh so the current page re-renders with the new value (the plan picker
// is keyed on novelty, so its suggestion order resets).
export async function setNovelty(value: number): Promise<void> {
  await saveNovelty(value);
  refresh();
}
