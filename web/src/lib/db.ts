import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForPg.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("neon.tech")
      ? { rejectUnauthorized: false }
      : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pool = pool;

export type Ingredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
  display: string;
};

export type Instruction = {
  text: string;
  amounts: string[] | null;
};

export type RecipeSummary = {
  id: string;
  slug: string;
  name: string;
  proteins: string[];
  total_time_minutes: number | null;
  image_path: string | null;
  image_url: string | null;
  community_rating: number | null;
  community_rating_count: number | null;
};

export type Recipe = RecipeSummary & {
  yield: string | null;
  source_url: string | null;
  category: string | null;
  ingredients: Ingredient[];
  instructions: Instruction[];
};

// Seed image_path points at the scrape dir (recipes-full/<slug>.<ext>);
// in the app images are served from /recipes/<slug>.<ext>.
export function imageSrc(r: {
  image_path: string | null;
  image_url: string | null;
}): string | null {
  if (r.image_path) return `/recipes/${r.image_path.split("/").pop()}`;
  return r.image_url;
}
