library(httr2)
library(rvest)
library(dplyr)

# Fetch all 67 pages of the index (?page=N)
resps <- request("https://www.mealime.com/recipes") |>
  req_throttle(rate = 5 / 1) |>
  req_perform_iterative(iterate_with_offset("page"), max_reqs = 67)

links <- resps |>
  resps_data(\(resp) {
    resp_body_html(resp) |>
      html_elements("a[href^='/recipes/']") |>
      html_attr("href") |>
      unique() |>
      grep(pattern = "^/recipes/.+/[0-9]+$", value = TRUE)
  }) |>
  unlist() |>
  unique()

recipe_index <- tibble(
  slug = gsub("/[0-9]+$", "", gsub("^/recipes/", "", links)),
  id = as.integer(gsub("^.*/", "", links)),
  url = paste0("https://www.mealime.com", links)
) |>
  # Each recipe has variant URLs for serving sizes and US/metric units;
  # keep one URL per recipe
  distinct(slug, .keep_all = TRUE) |>
  # Index URL is the 4-servings/US-units variant; 2-servings US is id - 1
  mutate(url_2serv_us = paste0("https://www.mealime.com/recipes/", slug, "/", id - 1))

readr::write_csv(recipe_index, "mealime-index.csv")
