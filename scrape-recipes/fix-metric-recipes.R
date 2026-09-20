# Re-scrape recipes whose saved JSON is in metric units.
#
# Cause: for the oldest recipes (id ~1k-3k), the pass-1 shortcut of
# id - 1 did NOT 404 — it fetched the metric 2-servings variant, which for
# these recipes lives at id - 1 (e.g. US 4-servings = 2292, US 2-servings =
# 2289, metric 2-servings = 2291). Fix: follow the labeled "2 servings"
# link on the 4-servings page (always the US variant) and overwrite the
# saved JSON.

library(httr2)
library(rvest)
library(purrr)
library(dplyr)

index <- readr::read_csv("mealime-index.csv", show_col_types = FALSE) |>
  mutate(json_path = file.path("recipes", paste0(slug, ".json")))

# Find saved recipes with metric-looking ingredient strings
files <- list.files("recipes", pattern = "\\.json$", full.names = TRUE)
is_metric <- function(f) {
  r <- jsonlite::fromJSON(f)
  any(grepl("\\b(kg|g|ml|l)\\b", r$recipeIngredient))
}
metric_files <- files[map_lgl(files, is_metric)]
metric_slugs <- sub("\\.json$", "", basename(metric_files))
message("Found ", length(metric_slugs), " metric recipes to re-scrape")

fix <- index |> filter(slug %in% metric_slugs)
stopifnot(nrow(fix) == length(metric_slugs))

fetch_parallel <- function(urls) {
  reqs <- map(urls, \(url) request(url) |> req_throttle(rate = 100 / 1))
  req_perform_parallel(reqs, on_error = "continue", progress = TRUE)
}

# The "2 servings" link on the 4-servings page is the US variant
find_2serv_link <- function(resp) {
  anchors <- resp_body_html(resp) |> html_elements("a[href*='/recipes/']")
  is_2serv <- map_lgl(anchors, \(a) grepl("2 servings", html_text2(a), fixed = TRUE))
  href <- html_attr(anchors[is_2serv][1], "href")
  if (is.na(href)) return(NA_character_)
  paste0("https://www.mealime.com", href)
}

page_resps <- fetch_parallel(fix$url)
page_ok <- resps_ok(page_resps)
urls_2serv <- page_resps[page_ok] |>
  map_chr(possibly(find_2serv_link, otherwise = NA_character_))
has_link <- !is.na(urls_2serv)

resps2 <- fetch_parallel(urls_2serv[has_link])

extract_recipe <- function(resp) {
  html <- resp_body_html(resp)
  ld_json <- html_element(html, "script[type='application/ld+json']") |> html_text()
  parsed <- jsonlite::fromJSON(ld_json)
  stopifnot(identical(parsed[["@type"]], "Recipe"))
  jsonlite::prettify(ld_json)
}

ok <- resps_ok(resps2)
json <- map(resps2[ok], possibly(extract_recipe, otherwise = NULL))
good <- !map_lgl(json, is.null)
paths <- fix[page_ok, ][has_link, ]$json_path[ok][good]
walk2(json[good], paths, writeLines)

# Verify: re-check for metric strings in the overwritten files
still_metric <- paths[map_lgl(paths, is_metric)]
message("Overwrote ", length(paths), " files; ", length(still_metric), " still metric")
if (length(still_metric) > 0) print(still_metric)
