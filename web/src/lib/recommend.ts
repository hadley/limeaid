import { pool } from "./db";
import type { Rating } from "./ratings";

const TAU = 0.3; // softmax temperature
const COOLDOWN_DAYS = 14; // recipes cooked this recently are never suggested
const RECENCY_CAP_DAYS = 365; // beyond this, a recipe counts as fully "rested"
const COOKED_NOVELTY = 0.25; // novelty credit for recipes cooked before
const RATING_POINTS: Record<Rating | "unrated", number> = {
  loved: 2,
  liked: 1,
  unrated: 0.5,
  disliked: 0, // excluded in SQL; listed for exhaustiveness
};
const DAY_MS = 86_400_000;

type Candidate = {
  id: number;
  rating: Rating | null;
  lastCookedMs: number | null;
  // Sampling stratum. Recipes are multi-protein, but each is sampled from
  // a single bucket: its first protein (array order from the importer).
  bucket: string;
};

type Weighted = Candidate & { w: number };

// Hard filters applied in SQL: no disliked, nothing cooked within the
// cooldown, plus the user's text/protein filter.
async function candidates(q: string, protein: string): Promise<Candidate[]> {
  const { rows } = await pool.query<{
    id: string;
    rating: Rating | null;
    last_cooked: Date | null;
    proteins: string[];
  }>(
    `select r.id, rt.rating, max(e.cooked_at) as last_cooked, r.proteins
     from recipes r
     left join ratings rt on rt.recipe_id = r.id
     left join meal_plan_entries e on e.recipe_id = r.id and e.cooked
     where coalesce(rt.rating, '') <> 'disliked'
       and ($1 = '' or r.name ilike '%' || $1 || '%')
       and (
         $2 = ''
         or ($2 = 'vegetarian' and cardinality(r.proteins) = 0)
         or ($2 <> 'vegetarian' and $2 = any(r.proteins))
       )
     group by r.id, rt.rating, r.proteins
     having max(e.cooked_at) is null
        or max(e.cooked_at) < now() - make_interval(days => $3)`,
    [q, protein, COOLDOWN_DAYS],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    rating: r.rating,
    lastCookedMs: r.last_cooked?.getTime() ?? null,
    bucket: r.proteins[0] ?? "vegetarian",
  }));
}

// Blend of "cook what you like" and "try something new", controlled by the
// novelty setting s in [0, 1].
function score(c: Candidate, s: number, now: number): number {
  const ratingPts = RATING_POINTS[c.rating ?? "unrated"];
  if (c.lastCookedMs === null) return (1 - s) * ratingPts + s;

  const days = (now - c.lastCookedMs) / DAY_MS;
  const recency = Math.min(days, RECENCY_CAP_DAYS) / RECENCY_CAP_DAYS;
  return (1 - s) * ratingPts * recency + s * COOKED_NOVELTY * recency;
}

// Weighted pick of one item from a list; removes and returns it.
function pickWeighted<T extends { w: number }>(items: T[]): T {
  const total = items.reduce((a, b) => a + b.w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= items[i].w;
    if (r <= 0) return items.splice(i, 1)[0];
  }
  return items.pop()!;
}

// Stratified softmax sampling: round-robin across protein buckets so no
// page is dominated by one protein; weighted by exp(score/tau) within bucket.
function stratifiedSample(items: Weighted[], n: number): Weighted[] {
  const buckets = new Map<string, Weighted[]>();
  for (const c of items) {
    const b = buckets.get(c.bucket) ?? [];
    b.push(c);
    buckets.set(c.bucket, b);
  }
  const out: Weighted[] = [];
  while (out.length < n) {
    let progressed = false;
    for (const b of buckets.values()) {
      if (out.length >= n) break;
      if (b.length > 0) {
        out.push(pickWeighted(b));
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return out;
}

// Draw n recipe ids matching the filters, avoiding `exclude`. If fewer than
// n remain after exclusion, `exhausted` is true and the draw ignores
// `exclude` entirely (callers should reset their history).
export async function drawBatch(
  n: number,
  novelty: number,
  q: string,
  protein: string,
  exclude: Set<number>,
): Promise<{ ids: number[]; exhausted: boolean }> {
  const all = await candidates(q, protein);
  let remaining = all.filter((c) => !exclude.has(c.id));
  const exhausted = remaining.length < n;
  if (exhausted) remaining = all;

  const now = Date.now();
  const weighted = remaining.map((c) => ({
    ...c,
    w: Math.exp(score(c, novelty, now) / TAU),
  }));
  return { ids: stratifiedSample(weighted, n).map((c) => c.id), exhausted };
}
