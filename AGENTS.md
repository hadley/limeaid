# Mealime recipe scraper

Goal: build a Mealime replacement (Mealime is shutting down) — see PLAN.md.
Dinner-only planning, grocery list feeding HEB curbside via search-URL
handoff, React/Next.js + Postgres on Vercel, single user. The scraped corpus 
below is the seed catalog.

Scraping stage: complete. Full recipe JSON (2-servings US variant) saved to
`recipes-full/<slug>.json` alongside images `recipes-full/<slug>.<jpeg|jpg>`;
both gitignored. Corpus: 2,791 recipes — the COMPLETE app catalog (2,764
recipes incl. all 793 Pro, per `mealime-catalog.json`) plus 27 website-only
delisted extras. The website index covers only ~60% of the catalog: it
excludes ALL Pro recipes and other unlisted ones, and the sitemap excludes
Pro too, but Pro recipe PAGES are still live on the website (just orphaned).

Full catalog: `mealime-catalog.json` = dump of the authenticated app API
endpoint `POST https://api.mealime.com/api/v2/get_builder_data` (auth:
`authorization: Token token=...`, body `{"source":"my-web","client_id":...}`;
captured from the my.mealime.com "Start a New Meal Plan" flow via Chrome
DevTools protocol on a logged-in session). Per recipe it has: variant id
(2-servings US), recipe_id, name, slug-less identity, is_pro, ruleset
(dinner/simple/breakfast/snack/dessert/cpg), calories, macros, sodium,
price_per_serving, community rating + count, popularity, ingredient_names,
presentation/thumbnail urls, and published_recipe_uuid. That uuid keys the
app's recipe CDN: `https://cdn-recipes.mealime.com/<uuid>.json` serves the
FULL recipe (instructions, line_items, nutrition) with NO auth — this is how
app-only recipes (no website page at all) are scraped. Other working API
endpoint: `POST /api/v2/get_user` (whole account: recipe_ratings keyed by
recipe_id, favourites, history of meal plans with is_cooked flags). There is
NO recipe-catalog REST endpoint.

User data (Hadley's account, extracted 2026-09): `user-ratings.csv` (149
ratings, slug/name/rating/is_pro/recipe_id), `user-favourites.csv` (4),
`user-cooked-history.csv` (times-cooked per recipe, 1 unresolved variant id).
Raw dump with auth token was in /tmp (not committed).

## Site structure

- Index: `https://www.mealime.com/recipes?page=N`, 67 pages, 24 recipes/page.
  There is NO meal-type filter on the index (query params like `?category=dinner`
  are ignored — they return the same results).
- Recipe pages: `https://www.mealime.com/recipes/<slug>/<id>`. The rich data is
  the embedded Next.js blob in `<script id="__NEXT_DATA__" type="application/json">`
  — extract with rvest + jsonlite. Data lives at
  `props.pageProps.publishedRecipe` (id, recipe_id, slug, serving_count,
  cooking_minutes, name, presentation_image_url, cookwares, instructions,
  line_items, nutrition) plus `props.pageProps.schemaMetadata` (category,
  keywords, cuisine, reviewCount). Sanity-check `parsed$page ==
  "/recipes/[slug]/[variantId]"` — Next.js serves a 200 with a 404 page body
  for dead variant ids.
- Key fields: `line_items` = data frame of {quantity, ingredient_name}
  (quantity is "" for pantry staples); `instructions` = data frame of
  {primary_message, secondary_message} where secondary_message holds the
  per-step quantities ("1 tsp red wine vinegar") as newline-separated strings;
  `nutrition` = ~80-field nutrient profile (not yet imported into the schema).
- The page ALSO embeds a schema.org Recipe as JSON-LD, but it is a lossy
  summary: pantry staples have no quantities anywhere in it. Do not use it.
- Variant URLs: the index URL is the 4-servings/US-units variant. The reliable
  way to find other variants is the labeled links on the recipe page itself
  (`a[href*='/recipes/']` with link text "2 servings" / "4 servings" /
  "6 servings" / "US Units" / "Metric Units").
- The `id - 1` = 2-servings US shortcut holds for NEWER recipes only (median id
  ~17k). For ~200 of the oldest recipes (median id ~3.4k) it 404s — variant ids
  there are non-contiguous (e.g. 2/4/6-servings US = id-2/id/id+2, metric a
  distant id). No clean rule (not parity, not a fixed offset); use the page
  links as the fallback.

## Scripts

- Deleted: `scrape-index.R` / `scrape-full-json.R` (index-era scrapers,
  superseded by scrape-catalog.R, which doesn't need `mealime-index.csv` —
  it diffs the app catalog against the corpus directly, and the catalog's
  variant ids are already the 2-servings US variant so no variant-hunting
  passes are needed). Recoverable from git history if needed. The "Site
  structure" section above still documents how the website variant URLs and
  page links behave, which remains relevant to scrape-catalog.R pass 1.
- `scrape-recipes/scrape-catalog.R`: scrapes catalog recipes missing from the
  corpus (Pro + unlisted — invisible to the index). Pass 1 derives the slug
  from the name (drop stopwords with/a/an/and/of, apostrophe→hyphen,
  stringi transliteration; ~99.9% accurate) and fetches the website page,
  verifying the embedded recipe_id. Pass 2 falls back to the recipe CDN for
  app-only recipes and wraps it in a synthetic `__NEXT_DATA__` (category from
  ruleset, community rating from variant_meta) so import-recipes.R consumes
  it unchanged; caveat: CDN files' altVariants list only the 2-servings US
  variant (no metric/4/6-serving). Resumable; idempotent.
- `scrape-recipes/import-recipes.R`: reads `recipes-full/*.json`, filters to
  `schemaMetadata$category == "Dinner"` (2148 of 2791), writes
  `db/seed/recipes.jsonl` matching the `recipes` table in db/schema.sql.
  Emits structured JSONB shapes: `ingredients` = [{name, quantity, unit,
  display}] (null quantity/unit = pantry staple) and `instructions` = [{text,
  amounts|null}] (amounts = per-step quantity strings). Images referenced as
  `recipes-full/<slug>.<ext>`. Quantity parsing is deterministic (no LLM —
  line_items already splits name/quantity, and all quantity strings match
  `<number> [(pkg size)] [unit words]`); package sizes stay in the unit
  (e.g. `can (15 oz)`) so grocery merging never mixes sizes, and names are
  canonicalized lowercase + comma-inversion only (no singularization).
  Also emits `proteins` = array of all matched protein categories
  (chicken/beef/pork/lamb/turkey/seafood/tofu/egg; [] = vegetarian),
  stored as `text[]` in the schema. Multi-label by design — no
  winner-take-all, so "Prosciutto-Wrapped Cod" = ["pork", "seafood"];
  99 recipes have multiple proteins. Community ratings come from
  `altVariants$average_rating` (0–1 scale, ×5) + `rating_count` — NOT
  `schemaMetadata$reviewScore`, which is missing for most recipes
  (only 1 of 1224 lacks a rating via altVariants). Keyword match on canonical
  ingredient names; patterns match main-dish forms only so seasonings
  (broth, fish sauce, anchovy) don't classify. bacon/prosciutto are
  pork. Known coverage gaps fixed by spot-checking: lamb, prosciutto,
  sole.
- `scrape-recipes/classify-ingredients.R`: one LLM batch job (OpenAI Batch
  API via ellmer, gpt-6-luna) classifying every canonical ingredient name
  into a grocery department AND a kitchen location; writes
  `db/seed/ingredient-classifications.csv` (name, department, location),
  which seed.mjs loads into `ingredient_departments` +
  `ingredient_locations`. Costs money — check with the user before running.
- `scrape-recipes/fix-metric-recipes.R`: superseded one-off fix for the old
  JSON-LD corpus; kept for history only.
- Deleted: `scrape-recipes.R` / `scrape-images.R` (JSON-LD era; recoverable
  from git history if needed).

## Conventions

- Use `pak::pak()` to install packages; base R pipe `|>`.
- Always check with the user before running any LLM batch jobs — they cost
  money.
- jsonlite gotchas when emitting the JSONL: NULL list elements serialize as
  `{}` — use `NA` with `na = "null"` instead; wrap single-element vectors in
  `I()` so `auto_unbox = TRUE` doesn't collapse them to bare strings.
