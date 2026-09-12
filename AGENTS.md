# Mealime recipe scraper

Goal: scrape Mealime dinner recipes. Current stage: recipe JSON downloaded to
`recipes/<slug>.json` (2-servings US variant) and images downloaded.
Next: filter to dinners via `recipeCategory == "Dinner"`.

## Site structure

- Index: `https://www.mealime.com/recipes?page=N`, 67 pages, 24 recipes/page.
  There is NO meal-type filter on the index (query params like `?category=dinner`
  are ignored — they return the same results).
- Recipe pages: `https://www.mealime.com/recipes/<slug>/<id>`. Each page embeds
  a schema.org Recipe as JSON-LD in
  `<script type="application/ld+json">` — extract with rvest + jsonlite rather
  than parsing HTML. Contains name, recipeCategory ("Dinner", "Snack", ...),
  totalTime (ISO 8601), recipeYield, recipeIngredient, recipeInstructions,
  image (a bare CDN URL string, e.g. cdn-uploads.mealime.com ... .jpeg).
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

- `scrape-index.R`: fetches all 67 index pages with
  `httr2::req_perform_iterative(iterate_with_offset("page"), max_reqs = 67)`,
  deduplicates by slug, writes `mealime-index.csv` (slug, id, url,
  url_2serv_us).
- `scrape-recipes.R`: downloads each recipe's JSON-LD to `recipes/<slug>.json`.
  Parallel via `req_perform_parallel(on_error = "continue")`, throttled to
  100 req/sec. Pass 1 uses `url_2serv_us` (id - 1); pass 2 retries failures by
  following the "2 servings" link on the 4-servings page. Resumes on re-run by
  skipping slugs whose .json already exists.
- `scrape-images.R`: reads image URLs from the saved JSON files and downloads
  them in parallel (100 req/sec), streaming bodies straight to disk with
  `req_perform_parallel(paths = ...)`; saves as `recipes/<slug>.<ext>`.
  Resumes by skipping existing files.

## Conventions

- Use `pak::pak()` to install packages; base R pipe `|>`.
