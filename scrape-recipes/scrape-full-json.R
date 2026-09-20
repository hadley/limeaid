library(httr2)
library(rvest)
library(purrr)
library(dplyr)

dir.create("recipes-full", showWarnings = FALSE)

index <- readr::read_csv("mealime-index.csv") |>
  mutate(json_path = file.path("recipes-full", paste0(slug, ".json")))

fetch_parallel <- function(urls) {
  reqs <- map(urls, \(url) request(url) |> req_throttle(rate = 100 / 1))
  req_perform_parallel(reqs, on_error = "continue", progress = TRUE)
}

# Extract the embedded Next.js __NEXT_DATA__ JSON — contains per-step
# quantities (steps[].secondary_message), structured line_items, full
# nutrition, and variant metadata that the JSON-LD lacks.
extract_next_data <- function(resp) {
  html <- resp_body_html(resp)
  json <- html_element(html, "script#__NEXT_DATA__") |> html_text()
  parsed <- jsonlite::fromJSON(json)
  stopifnot(identical(parsed$page, "/recipes/[slug]/[variantId]"))
  jsonlite::prettify(json)
}

# Save JSON for each successful response; returns the rows that succeeded
save_recipes <- function(df, resps) {
  ok <- resps_ok(resps)
  df <- df[ok, ]
  json <- map(resps[ok], possibly(extract_next_data, otherwise = NULL))
  good <- !map_lgl(json, is.null)
  walk2(json[good], df$json_path[good], writeLines)
  df[good, ]
}

# --- Pass 1: assume 2-servings US variant is id - 1 (holds for newer recipes) ---
todo_json <- index |> filter(!file.exists(json_path))
resps <- fetch_parallel(todo_json$url_2serv_us)
got <- save_recipes(todo_json, resps)

# --- Pass 2: failures are old recipes with non-contiguous variant ids;
# follow the labeled "2 servings" link on the 4-servings page instead ---
retry <- todo_json |> filter(!json_path %in% got$json_path)

find_2serv_link <- function(resp) {
  anchors <- resp_body_html(resp) |> html_elements("a[href*='/recipes/']")
  is_2serv <- map_lgl(anchors, \(a) grepl("2 servings", html_text2(a), fixed = TRUE))
  href <- html_attr(anchors[is_2serv][1], "href")
  if (is.na(href)) {
    return(NA_character_)
  }
  paste0("https://www.mealime.com", href)
}

page_resps <- fetch_parallel(retry$url)
page_ok <- resps_ok(page_resps)
urls_2serv <- page_resps[page_ok] |>
  map_chr(possibly(find_2serv_link, otherwise = NA_character_))
has_link <- !is.na(urls_2serv)

resps2 <- fetch_parallel(urls_2serv[has_link])
got <- bind_rows(got, save_recipes(retry[page_ok, ][has_link, ], resps2))
