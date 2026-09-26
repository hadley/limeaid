import { pool, RECIPE_SUMMARY_COLUMNS, type RecipeSummary } from "./db";

const TAU = 1.75; // softmax temperature; tuned so page 1 is ~10% liked/loved at novelty 0.3
const COOLDOWN_DAYS = 14; // recipes cooked this close to the week are never suggested
const RECENCY_CAP_DAYS = 365; // beyond this, a recipe counts as fully "rested"
const COOKED_NOVELTY = 0.25; // novelty credit for recipes cooked before

// Deterministic suggestion order for a week: a function of (week, filters,
// novelty, candidate set) only, so pages are just offset/limit and nothing
// needs storing.
//
// Weighted sampling without replacement via Efraimidis–Spirakis: each recipe
// gets u = hash(week, id) in (0, 1) and weight w = exp(score / tau); sorting
// by ln(u) / w descending is equivalent to sorting by u^(1/w). Because u
// depends only on the recipe itself, adding or removing a candidate doesn't
// reshuffle the rest.
//
// Scoring blends "cook what you like" and "try something new" via novelty s:
//   never cooked:  (1 - s) * ratingPts + s
//   cooked before: ((1 - s) * ratingPts + s * COOKED_NOVELTY) * recency
// where recency is days since last cooked (as of the week start), capped.
// Everything is relative to the week start, including the cooldown, so the
// order for a given week never drifts over time.
export async function suggestions(
  weekStart: string,
  novelty: number,
  offset: number,
  limit: number,
  q = "",
  protein = "",
): Promise<RecipeSummary[]> {
  const { rows } = await pool.query<RecipeSummary>(
    `with candidates as (
       select r.id, lc.last_cooked,
              case rt.rating when 'loved' then 2 when 'liked' then 1
                             else 0.5 end as rating_pts
       from recipes r
       left join ratings rt on rt.recipe_id = r.id
       left join lateral (
         select max(cooked_at) as last_cooked
         from meal_plan_entries e
         where e.recipe_id = r.id and e.cooked
       ) lc on true
       where rt.rating is distinct from 'disliked'
         and (lc.last_cooked is null
              or lc.last_cooked < $3::date - make_interval(days => $5::int))
         and ($1 = '' or r.name ilike '%' || $1 || '%')
         and (
           $2 = ''
           or ($2 = 'vegetarian' and cardinality(r.proteins) = 0)
           or ($2 <> 'vegetarian' and $2 = any(r.proteins))
         )
     ),
     scored as (
       select id,
         case when last_cooked is null
           then (1 - $4::float8) * rating_pts + $4::float8
           else ((1 - $4::float8) * rating_pts + $4::float8 * $7::float8)
                * least(
                    extract(epoch from $3::date - last_cooked) / 86400, $6::float8
                  ) / $6::float8
         end as score,
         -- u in (0, 1) from the first 32 bits of md5(week:id)
         ((('x' || substr(md5($3::text || ':' || id), 1, 8))::bit(32)::bigint
           + 0.5) / 4294967296.0) as u
       from candidates
     ),
     keyed as (
       select id, ln(u) / exp(score / $8::float8) as k from scored
     )
     select ${RECIPE_SUMMARY_COLUMNS}
     from keyed
     join recipes r on r.id = keyed.id
     left join ratings rt on rt.recipe_id = r.id
     order by keyed.k desc, r.id
     limit $9 offset $10`,
    [
      q,
      protein,
      weekStart,
      novelty,
      COOLDOWN_DAYS,
      RECENCY_CAP_DAYS,
      COOKED_NOVELTY,
      TAU,
      limit,
      offset,
    ],
  );
  return rows;
}
