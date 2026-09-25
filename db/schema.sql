-- Mealime replacement — database schema (Postgres / Neon)
-- Single user for v1; no user table. Multi-user can be added later by
-- introducing a users table and user_id columns without reshaping anything.

create table if not exists recipes (
  id            bigint generated always as identity primary key,
  slug          text not null unique,          -- mealime slug
  mealime_id    integer unique,
  name          text not null,
  source_url    text,                          -- original mealime url
  category      text,                          -- 'Dinner', 'Simple', etc.
  proteins      text[] not null default '{}',  -- any of chicken/beef/pork/lamb/turkey/seafood/tofu/egg; empty = vegetarian
  total_time_minutes integer,                  -- parsed from ISO 8601; soft signal only
  yield         text,                          -- e.g. '2 servings'
  image_path    text,                          -- local file in app storage
  image_url     text,                          -- original CDN url (fallback)
  community_rating       real,                 -- mealime-wide average (1-5); recall aid for re-entering own ratings
  community_rating_count integer,
  ingredients   jsonb not null,                -- array of {name, quantity, unit, display}; quantity/unit null = pantry staple
  instructions  jsonb not null,                -- array of {text, amounts?}, ordered; amounts = per-step qty strings
  created_at    timestamptz not null default now()
);

create index if not exists recipes_category_idx on recipes (category);

-- Three-level rating; disliked recipes are hidden everywhere in the UI.
create table if not exists ratings (
  recipe_id  bigint not null references recipes (id) on delete cascade,
  rating     text not null check (rating in ('disliked', 'liked', 'loved')),
  updated_at timestamptz not null default now(),
  primary key (recipe_id)
);

-- Weekly dinner plans. A plan covers a week; entries are the picked dinners.
create table if not exists meal_plans (
  id          bigint generated always as identity primary key,
  week_start  date not null unique,            -- Monday of the planned week
  created_at  timestamptz not null default now()
);

create table if not exists meal_plan_entries (
  id         bigint generated always as identity primary key,
  meal_plan_id bigint not null references meal_plans (id) on delete cascade,
  recipe_id    bigint not null references recipes (id),
  cooked       boolean not null default false, -- marked once actually cooked that week
  cooked_at    timestamptz,                    -- set when cooked; drives recency scoring
  unique (meal_plan_id, recipe_id)
);

-- Single-user key-value settings (e.g. the novelty slider s for
-- recommendation scoring).
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);

-- Grocery list for a plan: generated from the plan's recipes by merging
-- (name, unit) across recipes. No manual items; staples (null quantity) are
-- grouped into their own section at generation time by position.
create table if not exists grocery_items (
  id           bigint generated always as identity primary key,
  meal_plan_id bigint not null references meal_plans (id) on delete cascade,
  name         text not null,                  -- canonical name used for merging
  display      text not null,                  -- display text, e.g. '2 limes'
  quantity     numeric,                        -- parsed amount; null = pantry staple section
  unit         text,                           -- 'clove', 'cup', 'oz', ...; null if none
  checked      boolean not null default false,
  position     smallint not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists grocery_items_meal_plan_idx on grocery_items (meal_plan_id);

-- Grocery-store department per canonical ingredient name. Populated from
-- db/seed/ingredient-classifications.csv, produced by
-- scrape-recipes/classify-ingredients.R (LLM classification).
create table if not exists ingredient_departments (
  name       text primary key,   -- canonical ingredient name
  department text not null
);

-- Kitchen storage location per canonical ingredient name (Fridge, Freezer,
-- Pantry, Spice Rack, Bench). Used to group the cook page's ingredient
-- list. Populated from db/seed/ingredient-classifications.csv, produced by
-- scrape-recipes/classify-ingredients.R (LLM classification).
create table if not exists ingredient_locations (
  name     text primary key,   -- canonical ingredient name
  location text not null
);
