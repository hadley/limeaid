import { Pool } from "pg";
import type { Rating } from "./ratings";

const globalForPg = globalThis as unknown as { pool?: Pool };

const connectionString =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

export const pool =
  globalForPg.pool ??
  new Pool({
    connectionString,
    ssl: connectionString?.includes("neon.tech")
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
  user_rating: Rating | null;
};

// Select list producing a RecipeSummary; expects `recipes r` and
// `left join ratings rt on rt.recipe_id = r.id`.
export const RECIPE_SUMMARY_COLUMNS = `r.id, r.slug, r.name, r.proteins,
  r.total_time_minutes, r.image_path, r.image_url, r.community_rating,
  r.community_rating_count, rt.rating as user_rating`;

export type Recipe = RecipeSummary & {
  yield: string | null;
  source_url: string | null;
  category: string | null;
  ingredients: Ingredient[];
  instructions: Instruction[];
};

export { imageSrc } from "./images";
