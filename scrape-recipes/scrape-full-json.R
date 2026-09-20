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

# --- Pass 3: fix wrong variants. Some pass-2 scrapes of old recipes landed
# on 4-servings metric pages. Detect them by serving_count in the saved JSON,
# then navigate explicitly: follow "US Units" first, then "2 servings" on
# that page (following "2 servings" alone keeps the metric units) ---
is_wrong_variant <- function(path) {
  pr <- jsonlite::fromJSON(path)$props$pageProps$publishedRecipe
  !isTRUE(pr$serving_count == 2)
}
existing <- index$json_path[file.exists(index$json_path)]
wrong <- index |> filter(json_path %in% keep(existing, is_wrong_variant))

if (nrow(wrong) > 0) {
  find_link <- function(resp, label) {
    anchors <- resp_body_html(resp) |> html_elements("a[href*='/recipes/']")
    match <- map_lgl(anchors, \(a) grepl(label, html_text2(a), fixed = TRUE))
    href <- html_attr(anchors[match][1], "href")
    if (is.na(href)) NA_character_ else paste0("https://www.mealime.com", href)
  }

  # Step 1: from the index (4-servings US) page, find the US-units link;
  # absent means the page is already US
  page_resps <- fetch_parallel(wrong$url)
  urls_us <- map2_chr(
    page_resps, wrong$url,
    \(resp, fallback) {
      if (resp_is_error(resp)) return(NA_character_)
      link <- possibly(find_link, otherwise = NA_character_)(resp, "US Units")
      if (is.na(link)) fallback else link
    }
  )
  has_us <- !is.na(urls_us)

  # Step 2: on the US page, find the 2-servings link
  us_resps <- fetch_parallel(urls_us[has_us])
  urls_2serv <- map_chr(
    us_resps,
    \(resp) {
      if (resp_is_error(resp)) return(NA_character_)
      possibly(find_link, otherwise = NA_character_)(resp, "2 servings")
    }
  )
  has_link <- !is.na(urls_2serv)

  resps3 <- fetch_parallel(urls_2serv[has_link])
  got3 <- save_recipes(wrong[has_us, ][has_link, ], resps3)

  # Verify: warn about anything still not at 2 servings
  still_wrong <- keep(got3$json_path, is_wrong_variant)
  if (length(still_wrong) > 0) {
    warning("Still wrong variant after pass 3: ", paste(basename(still_wrong), collapse = ", "))
  }
  message("Pass 3: re-scraped ", nrow(got3), " of ", nrow(wrong), " wrong-variant recipes")
}
