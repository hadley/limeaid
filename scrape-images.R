library(httr2)
library(purrr)
library(dplyr)

# Read image URLs from the saved recipe JSON files
json_files <- list.files("recipes", pattern = "\\.json$", full.names = TRUE)

images <- tibble(
  slug = tools::file_path_sans_ext(basename(json_files)),
  image_url = map_chr(json_files, \(f) {
    parsed <- jsonlite::fromJSON(f)
    as.character(parsed$image[[1]])
  })
)
images <- images |>
  mutate(image_path = file.path("recipes", paste0(slug, ".", tools::file_ext(image_url)))) |>
  # Skip images already downloaded so re-runs resume after failures
  filter(!file.exists(image_path))
images

# --- Download images in parallel, streaming bodies straight to disk ---
reqs <- map(images$image_url, \(url) request(url) |> req_throttle(rate = 100 / 1))
resps <- req_perform_parallel(
  reqs,
  paths = images$image_path,
  on_error = "continue",
  progress = TRUE
)
