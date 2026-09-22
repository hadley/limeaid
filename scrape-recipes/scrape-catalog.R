# Scrape recipes missing from the corpus but present in the full app catalog.
#
# The website index (mealime-index.csv) lists only free, currently-listed
# recipes — it excludes ALL Pro recipes and various unlisted/delisted ones.
# The complete catalog comes from the authenticated app API endpoint
# api.mealime.com/api/v2/get_builder_data (the "Start a New Meal Plan" flow on
# my.mealime.com; capture once via a logged-in browser session). Its
# variant_meta gives, per recipe: variant id (2-servings US, matching the
# corpus convention), recipe_id, name, is_pro, ruleset, rating,
# rating_count, published_recipe_uuid, and image urls. The captured dump
# lives at mealime-catalog.json (2,764 recipes; 793 Pro).
#
# Pass 1: website pages. The page URL needs the slug, which variant_meta
# lacks, so derive it from the name (stopword-dropping rules below reproduce
# Mealime's slug format with ~99.9% accuracy, verified against the known
# corpus) and verify the fetched page's embedded recipe_id before saving.
# Pass 2: app-only recipes have NO website page (404 regardless of slug), so
# fetch the app's CDN JSON instead:
# https://cdn-recipes.mealime.com/<published_recipe_uuid>.json — no auth
# needed, same publishedRecipe shape as the website's __NEXT_DATA__ blob.
# It's wrapped in a synthetic __NEXT_DATA__ structure (category from ruleset,
# community rating from variant_meta) so import-recipes.R consumes it
# unchanged. Caveat: CDN-sourced files list only the 2-servings US variant
# in altVariants — no metric/4/6-serving variants, no keywords/cuisine.
#
# Resumable: re-running skips recipes whose .json already exists.

library(httr2)
library(rvest)
library(purrr)
library(dplyr)
library(jsonlite)

dir.create("recipes-full", showWarnings = FALSE)

catalog <- fromJSON("mealime-catalog.json")$variant_meta

# Slugs already in the corpus
corpus_rids <- map_int(
  list.files("recipes-full", pattern = "\\.json$", full.names = TRUE),
  \(p) fromJSON(p)$props$pageProps$publishedRecipe$recipe_id
)

todo <- catalog |> filter(!recipe_id %in% corpus_rids)
message("Catalog recipes: ", nrow(catalog), "; missing from corpus: ", nrow(todo))

# --- slug derivation --------------------------------------------------------
# "Turkey Shepherd's Pie with Mixed Vegetables & Parmesan Potatoes" ->
# "turkey-shepherd-s-pie-mixed-vegetables-parmesan-potatoes": lowercase,
# transliterate, & -> space, ' -> -, drop stopwords (with/a/an/and/of —
# note "in" is kept), hyphenate.
slugify <- function(name, drop_stop = TRUE) {
  # iconv("ASCII//TRANSLIT") on macOS decomposes accents ("jalape~no");
  # stringi transliterates cleanly ("jalapeno")
  s <- stringi::stri_trans_general(name, "Any-Latin; Latin-ASCII")
  s <- tolower(s)
  s <- gsub("[&\"]", " ", s)
  s <- gsub("'", "-", s, fixed = TRUE)
  s <- gsub("[^a-z0-9]+", "-", s)
  s <- gsub("^-+|-+$", "", s)
  parts <- strsplit(s, "-", fixed = TRUE)[[1]]
  parts <- parts[nzchar(parts)]
  if (drop_stop) parts <- parts[!parts %in% c("with", "a", "an", "and", "of")]
  paste(parts, collapse = "-")
}

fetch_parallel <- function(urls) {
  reqs <- map(urls, \(url) request(url) |> req_throttle(rate = 100 / 1))
  req_perform_parallel(reqs, on_error = "continue", progress = TRUE)
}

extract_next_data <- function(resp) {
  html <- resp_body_html(resp)
  json <- html_element(html, "script#__NEXT_DATA__") |> html_text()
  parsed <- fromJSON(json)
  stopifnot(identical(parsed$page, "/recipes/[slug]/[variantId]"))
  parsed
}

# --- Pass 1: website pages --------------------------------------------------
todo <- todo |> mutate(slug_guess = map_chr(name, slugify))
resps <- fetch_parallel(paste0("https://www.mealime.com/recipes/", todo$slug_guess, "/", todo$id))

parsed <- map(resps, possibly(extract_next_data, otherwise = NULL))
verified <- map2_lgl(parsed, todo$recipe_id, \(d, rid) {
  !is.null(d) && identical(d$props$pageProps$publishedRecipe$recipe_id, rid)
})
message("Pass 1 (website): ", sum(verified), " of ", nrow(todo))

image_jobs <- list()
for (i in which(verified)) {
  pr <- parsed[[i]]$props$pageProps$publishedRecipe
  path <- file.path("recipes-full", paste0(pr$slug, ".json"))
  writeLines(prettify(toJSON(parsed[[i]], auto_unbox = TRUE)), path)
  image_jobs[[pr$slug]] <- pr$presentation_image_url
}

# --- Pass 2: app-only recipes via the recipe CDN ----------------------------
# category mapping: ruleset values seen are dinner/simple/breakfast/snack/
# dessert/cpg; import-recipes.R filters to "Dinner"
ruleset_to_category <- c(
  dinner = "Dinner", simple = "Simple", breakfast = "Breakfast",
  snack = "Snack", dessert = "Dessert", cpg = "CPG"
)

cdn_fetch <- function(m) {
  url <- paste0("https://cdn-recipes.mealime.com/", m$published_recipe_uuid, ".json")
  tryCatch(request(url) |> req_throttle(rate = 100 / 1) |> req_perform() |> resp_body_json(),
           error = function(e) NULL)
}

remaining <- todo[!verified, ]
cdn <- map(seq_len(nrow(remaining)), \(i) cdn_fetch(remaining[i, ]))
cdn_ok <- map2_lgl(cdn, remaining$recipe_id, \(pr, rid) {
  !is.null(pr) && identical(pr$recipe_id, rid)
})
message("Pass 2 (CDN): ", sum(cdn_ok), " of ", nrow(remaining))

for (i in which(cdn_ok)) {
  pr <- cdn[[i]]
  m <- remaining[i, ]
  wrapped <- list(
    page = "/recipes/[slug]/[variantId]",
    props = list(pageProps = list(
      publishedRecipe = pr,
      altVariants = list(list(
        id = m$id, recipe_id = m$recipe_id, name = m$name,
        serving_count = m$serving_count, unit_family_id = 2,
        is_pro = m$is_pro, is_secret = m$is_secret,
        average_rating = m$rating, rating_count = m$rating_count
      )),
      schemaMetadata = list(category = unname(ruleset_to_category[m$ruleset]))
    )),
    cdn_source = paste0("https://cdn-recipes.mealime.com/", m$published_recipe_uuid, ".json")
  )
  path <- file.path("recipes-full", paste0(pr$slug, ".json"))
  writeLines(prettify(toJSON(wrapped, auto_unbox = TRUE, null = "null")), path)
  image_jobs[[pr$slug]] <- pr$presentation_image_url
}

if (any(!cdn_ok)) {
  warning("No data for: ", paste(remaining$name[!cdn_ok], collapse = ", "))
}

# --- Images ------------------------------------------------------------------
# skip if any image file with this slug already exists
has_image <- function(slug) {
  length(list.files("recipes-full", pattern = paste0("^", slug, "\\.(jpeg|jpg|png)$"))) > 0
}
needed <- names(image_jobs)[!map_lgl(names(image_jobs), has_image)]

if (length(needed) > 0) {
  img_resps <- fetch_parallel(unname(image_jobs[needed]))
  walk2(img_resps, needed, \(resp, slug) {
    if (resp_is_error(resp)) return()
    ext <- tools::file_ext(resp$url)
    if (ext == "") ext <- "jpeg"
    writeBin(resp_body_raw(resp), file.path("recipes-full", paste0(slug, ".", ext)))
  })
  message("Images: downloaded ", sum(!resp_is_error(img_resps)), " of ", length(needed))
}

message("Done. Pass 1: ", sum(verified), " website; pass 2: ", sum(cdn_ok), " CDN")
