# Load db/seed/recipes.jsonl into a local SQLite database.
# Proves db/schema.sql (Postgres) with minimal SQLite adaptations:
#   bigint identity -> integer primary key autoincrement
#   text[]          -> text (JSON array)
#   jsonb           -> text (JSON)
#   timestamptz     -> text, default now() -> current_timestamp
library(DBI)
library(jsonlite)

con <- dbConnect(RSQLite::SQLite(), "db/mealime.sqlite")

for (t in c("grocery_items", "meal_plan_entries", "meal_plans", "ratings", "settings", "recipes")) {
  dbExecute(con, paste("drop table if exists", t))
}

dbExecute(con, "
create table recipes (
  id            integer primary key autoincrement,
  slug          text not null unique,
  mealime_id    integer unique,
  name          text not null,
  source_url    text,
  category      text,
  proteins      text not null default '[]',
  total_time_minutes integer,
  yield         text,
  image_path    text,
  image_url     text,
  community_rating       real,
  community_rating_count integer,
  ingredients   text not null,
  instructions  text not null,
  created_at    text not null default current_timestamp
)")
dbExecute(con, "create index recipes_category_idx on recipes (category)")

dbExecute(con, "
create table ratings (
  recipe_id  integer not null references recipes (id) on delete cascade,
  rating     text not null check (rating in ('disliked', 'liked', 'loved')),
  updated_at text not null default current_timestamp,
  primary key (recipe_id)
)")

dbExecute(con, "
create table meal_plans (
  id          integer primary key autoincrement,
  week_start  text not null unique,
  created_at  text not null default current_timestamp
)")

dbExecute(con, "
create table meal_plan_entries (
  id         integer primary key autoincrement,
  meal_plan_id integer not null references meal_plans (id) on delete cascade,
  recipe_id    integer not null references recipes (id),
  cooked       integer not null default 0,
  cooked_at    text,
  unique (meal_plan_id, recipe_id)
)")

dbExecute(con, "
create table settings (
  key   text primary key,
  value text not null
)")

dbExecute(con, "
create table grocery_items (
  id           integer primary key autoincrement,
  meal_plan_id integer not null references meal_plans (id) on delete cascade,
  name         text not null,
  display      text not null,
  quantity     real,
  unit         text,
  checked      integer not null default 0,
  position     integer not null default 0,
  created_at   text not null default current_timestamp
)")
dbExecute(con, "create index grocery_items_meal_plan_idx on grocery_items (meal_plan_id)")

# Load seed
recipes <- lapply(readLines("db/seed/recipes.jsonl", warn = FALSE), fromJSON)
stopifnot(length(recipes) == 1224)

scalar <- function(x) if (is.null(x) || length(x) == 0) NA else x
rows <- lapply(recipes, function(r) {
  data.frame(
    slug = r$slug,
    mealime_id = scalar(r$mealime_id),
    name = r$name,
    source_url = scalar(r$source_url),
    category = scalar(r$category),
    proteins = toJSON(as.list(r$proteins), auto_unbox = TRUE),
    total_time_minutes = scalar(r$total_time_minutes),
    yield = scalar(r$yield),
    image_path = scalar(r$image_path),
    image_url = scalar(r$image_url),
    community_rating = scalar(r$community_rating),
    community_rating_count = scalar(r$community_rating_count),
    ingredients = toJSON(r$ingredients, auto_unbox = TRUE, null = "null"),
    instructions = toJSON(r$instructions, auto_unbox = TRUE, null = "null")
  )
})
dbWriteTable(con, "recipes", do.call(rbind, rows), append = TRUE)

n <- dbGetQuery(con, "select count(*) as n from recipes")$n
cat("Loaded", n, "recipes into db/mealime.sqlite\n")

# Sanity checks
print(dbGetQuery(con, "select proteins, count(*) n from recipes group by proteins order by n desc limit 5"))
print(dbGetQuery(con, "select count(*) missing_community_rating from recipes where community_rating is null"))

dbDisconnect(con)
