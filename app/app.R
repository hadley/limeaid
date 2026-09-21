# Recipe browser + weekly planner backed by db/mealime.sqlite
# (run db/load-sqlite.R first).
library(shiny)
library(bslib)
library(DBI)
library(jsonlite)

con <- dbConnect(RSQLite::SQLite(), "../db/mealime.sqlite")
addResourcePath("recipe-images", "../recipes-full")

img_src <- function(image_path) sub("^recipes-full/", "recipe-images/", image_path)

protein_choices <- c(
  "Chicken" = "chicken", "Beef" = "beef", "Pork" = "pork", "Lamb" = "lamb",
  "Turkey" = "turkey", "Seafood" = "seafood", "Tofu" = "tofu", "Egg" = "egg",
  "Vegetarian (no protein)" = "vegetarian"
)

# Monday of the current week — the meal_plans key
current_week <- function() {
  d <- Sys.Date()
  as.character(d - (as.POSIXlt(d)$wday + 6) %% 7)
}

get_plan <- function() {
  dbGetQuery(con, "select * from meal_plans where week_start = ?", params = list(current_week()))
}

get_or_create_plan <- function() {
  plan <- get_plan()
  if (nrow(plan) == 0) {
    dbExecute(con, "insert into meal_plans (week_start) values (?)", params = list(current_week()))
    plan <- get_plan()
  }
  plan$id[1]
}

plan_entries <- function(plan_id) {
  dbGetQuery(con,
    "select e.id as entry_id, r.* from meal_plan_entries e
     join recipes r on r.id = e.recipe_id
     where e.meal_plan_id = ? order by e.id",
    params = list(plan_id))
}

set_rating <- function(recipe_id, rating) {
  if (is.na(rating)) {
    dbExecute(con, "delete from ratings where recipe_id = ?", params = list(recipe_id))
  } else {
    dbExecute(con,
      "insert into ratings (recipe_id, rating, updated_at) values (?, ?, current_timestamp)
       on conflict (recipe_id) do update set rating = excluded.rating,
       updated_at = excluded.updated_at",
      params = list(recipe_id, rating))
  }
}

# 0.5 -> "½", 1.25 -> "1¼", 2 -> "2"
format_qty <- function(x) {
  frac <- c("¼", "⅓", "½", "⅔", "¾")
  vapply(x, function(v) {
    whole <- floor(v)
    r <- v - whole
    f <- which.min(abs(r - c(0.25, 1/3, 0.5, 2/3, 0.75)))
    if (r > 0.1 && abs(r - c(0.25, 1/3, 0.5, 2/3, 0.75)[f]) < 0.06) {
      paste0(if (whole > 0) whole else "", frac[f])
    } else {
      format(round(v, 2), trim = TRUE, nsmall = 0)
    }
  }, character(1))
}

recipe_card <- function(id, name, minutes, image_path, rating) {
  badge <- switch(rating %||% "",
    liked = tags$span(class = "badge text-bg-secondary", "liked"),
    loved = tags$span(class = "badge text-bg-secondary", "loved"),
    disliked = tags$span(class = "badge text-bg-secondary", "disliked"),
    NULL
  )
  card(
    height = "270px",
    card_image(
      src = img_src(image_path), alt = name, height = "150px",
      style = "object-fit: cover;",
      href = paste0("#recipe-", id),
      onclick = sprintf(
        "Shiny.setInputValue('open_recipe', %d, {priority: 'event'}); return false;", id
      )
    ),
    card_body(
      padding = 2, gap = 1,
      tags$strong(name, style = "font-size: 0.85rem;"),
      tags$div(
        class = "text-muted", style = "font-size: 0.75rem;",
        paste0(minutes, " min "), badge
      )
    )
  )
}

ui <- page_navbar(
  title = "Mealime",
  theme = bs_theme(version = 5),
  id = "tabs",
  nav_item(uiOutput("week_status", inline = TRUE)),
  nav_panel(
    "Browse",
    layout_sidebar(
      sidebar = sidebar(
        textInput("search", "Search", placeholder = "name or ingredient…"),
        checkboxGroupInput("proteins", "Protein", choices = protein_choices),
        checkboxInput("show_disliked", "Show disliked", value = FALSE),
        helpText(textOutput("n_recipes"))
      ),
      uiOutput("grid")
    )
  ),
  nav_panel(
    "Plan week",
    layout_columns(
      col_widths = c(6, 6),
      card(
        card_header("1 · Pick dinners"),
        card_body(
          layout_columns(
            col_widths = c(6, 6), fill = FALSE,
            numericInput("n_dinners", "How many?", value = 4, min = 1, max = 7),
            div(class = "d-flex align-items-end pb-2",
                actionButton("suggest", "Suggest", class = "btn-primary"))
          ),
          uiOutput("plan_list")
        )
      ),
      card(
        card_header("2 · Shopping list"),
        card_body(
          actionButton("gen_list", "Generate shopping list", class = "btn-primary mb-3"),
          uiOutput("shopping_list")
        )
      )
    )
  )
)

server <- function(input, output, session) {
  refresh <- reactiveVal(0) # bump to re-render db-dependent UI
  open_id <- reactiveVal(NULL)

  # Week state: plan -> shop -> cook, shown in the navbar
  week_state <- reactive({
    refresh()
    p <- get_plan()
    n_dinners <- 0; n_cooked <- 0; n_items <- 0; n_checked <- 0
    if (nrow(p)) {
      entries <- dbGetQuery(con,
        "select count(*) n, coalesce(sum(cooked), 0) cooked from meal_plan_entries where meal_plan_id = ?",
        params = list(p$id[1]))
      n_dinners <- entries$n; n_cooked <- entries$cooked
      items <- dbGetQuery(con,
        "select count(*) n, coalesce(sum(checked), 0) checked from grocery_items where meal_plan_id = ?",
        params = list(p$id[1]))
      n_items <- items$n; n_checked <- items$checked
    }
    stage <- if (n_dinners == 0) "plan" else if (n_items == 0 || n_checked < n_items) "shop" else "cook"
    list(stage = stage, n_dinners = n_dinners, n_cooked = n_cooked,
         n_items = n_items, n_checked = n_checked)
  })

  output$week_status <- renderUI({
    ws <- week_state()
    pill <- function(label, detail, active) {
      tags$span(
        class = paste("badge", if (active) "text-bg-primary" else "text-bg-light"),
        paste0(label, if (nzchar(detail)) paste0(" · ", detail))
      )
    }
    div(
      class = "d-flex gap-1 align-items-center ms-3",
      pill("Plan", if (ws$n_dinners) paste0(ws$n_dinners, " dinners") else "", ws$stage == "plan"),
      pill("Shop", if (ws$n_items) paste0(ws$n_checked, "/", ws$n_items) else "", ws$stage == "shop"),
      pill("Cook", if (ws$n_dinners) paste0(ws$n_cooked, "/", ws$n_dinners) else "", ws$stage == "cook")
    )
  })

  # --- Browse tab -----------------------------------------------------------

  browse_recipes <- reactive({
    refresh()
    sql <- "select r.*, rt.rating from recipes r
            left join ratings rt on rt.recipe_id = r.id"
    where <- c()
    params <- list()
    if (!isTRUE(input$show_disliked)) {
      where <- c(where, "(rt.rating is null or rt.rating != 'disliked')")
    }
    if (nzchar(input$search)) {
      where <- c(where, "(r.name like ? or r.ingredients like ?)")
      params <- c(params, list(paste0("%", input$search, "%"), paste0("%", tolower(input$search), "%")))
    }
    for (p in input$proteins) {
      if (p == "vegetarian") {
        where <- c(where, "r.proteins = '[]'")
      } else {
        where <- c(where, "r.proteins like ?")
        params <- c(params, list(paste0('%\"', p, '\"%')))
      }
    }
    if (length(where)) sql <- paste(sql, "where", paste(where, collapse = " and "))
    sql <- paste(sql, "order by r.name")
    dbGetQuery(con, sql, params = unname(params))
  })

  output$n_recipes <- renderText(paste(nrow(browse_recipes()), "recipes"))

  output$grid <- renderUI({
    r <- browse_recipes()
    cards <- lapply(seq_len(nrow(r)), function(i) {
      recipe_card(r$id[i], r$name[i], r$total_time_minutes[i], r$image_path[i], r$rating[i])
    })
    layout_column_wrap(width = "220px", fill = FALSE, !!!cards)
  })

  observeEvent(input$open_recipe, {
    open_id(input$open_recipe)
    r <- dbGetQuery(con,
      "select r.*, rt.rating from recipes r left join ratings rt on rt.recipe_id = r.id
       where r.id = ?", params = list(input$open_recipe))
    ing <- fromJSON(r$ingredients)
    steps <- fromJSON(r$instructions)
    proteins <- fromJSON(r$proteins)

    rate_btn <- function(value, label) {
      cls <- if (identical(r$rating, value)) "btn-primary btn-sm" else "btn-outline-secondary btn-sm"
      actionButton(paste0("rate_", value), label, class = cls)
    }
    showModal(modalDialog(
      title = r$name,
      size = "l",
      easyClose = TRUE,
      footer = tagList(
        rate_btn("disliked", "Disliked"), rate_btn("liked", "Liked"),
        rate_btn("loved", "Loved"), actionButton("rate_clear", "Clear", class = "btn-outline-secondary btn-sm"),
        tags$a(href = r$source_url, target = "_blank", class = "btn btn-link btn-sm", "Original on Mealime")
      ),
      layout_columns(
        col_widths = c(4, 8),
        div(
          tags$img(src = img_src(r$image_path), alt = r$name, style = "width: 100%; border-radius: 4px;"),
          tags$p(class = "text-muted mt-2",
            paste(r$total_time_minutes, "min ·", r$yield, "·",
              if (length(proteins)) paste(proteins, collapse = ", ") else "vegetarian")),
          if (!is.na(r$community_rating)) {
            tags$p(class = "text-muted", style = "font-size: 0.85rem;",
              sprintf("★ %.1f on Mealime (%d reviews) — what did you rate it?",
                r$community_rating, r$community_rating_count))
          }
        ),
        div(
          tags$h6("Ingredients"),
          tags$ul(lapply(ing$display, tags$li)),
          tags$h6("Instructions"),
          tags$ol(lapply(seq_len(nrow(steps)), function(i) {
            amt <- steps$amounts[[i]]
            tags$li(
              steps$text[i],
              if (!is.null(amt) && length(amt)) {
                tags$div(class = "text-muted", style = "font-size: 0.85em;",
                  paste(amt, collapse = " · "))
              }
            )
          }))
        )
      )
    ))
  })

  for (value in c("disliked", "liked", "loved")) {
    local({
      v <- value
      observeEvent(input[[paste0("rate_", v)]], {
        set_rating(open_id(), v)
        removeModal()
        refresh(refresh() + 1)
      })
    })
  }
  observeEvent(input$rate_clear, {
    set_rating(open_id(), NA)
    removeModal()
    refresh(refresh() + 1)
  })

  # --- Plan tab: step 1 -----------------------------------------------------

  plan_id <- reactive({
    refresh()
    p <- get_plan()
    if (nrow(p)) p$id[1] else NA_integer_
  })

  observeEvent(input$suggest, {
    pid <- get_or_create_plan()
    pool <- dbGetQuery(con,
      "select r.id from recipes r left join ratings rt on rt.recipe_id = r.id
       where rt.rating is null or rt.rating != 'disliked'")$id
    ids <- sample(pool, min(input$n_dinners, length(pool)))
    dbExecute(con, "delete from meal_plan_entries where meal_plan_id = ?", params = list(pid))
    for (id in ids) {
      dbExecute(con, "insert into meal_plan_entries (meal_plan_id, recipe_id) values (?, ?)",
        params = list(pid, id))
    }
    refresh(refresh() + 1)
  })

  observeEvent(input$swap_recipe, {
    current <- plan_entries(plan_id())$id
    pool <- dbGetQuery(con,
      "select r.id from recipes r left join ratings rt on rt.recipe_id = r.id
       where (rt.rating is null or rt.rating != 'disliked')")$id
    pool <- setdiff(pool, current)
    if (!length(pool)) return()
    dbExecute(con, "update meal_plan_entries set recipe_id = ? where id = ?",
      params = list(sample(pool, 1), input$swap_recipe))
    refresh(refresh() + 1)
  })

  output$plan_list <- renderUI({
    pid <- plan_id()
    if (is.na(pid)) return(helpText("No plan yet for this week — hit Suggest."))
    entries <- plan_entries(pid)
    if (nrow(entries) == 0) return(helpText("No dinners picked yet — hit Suggest."))
    tagList(lapply(seq_len(nrow(entries)), function(i) {
      e <- entries[i, ]
      card(
        card_body(
          padding = 2, class = "d-flex gap-3 align-items-center",
          tags$img(src = img_src(e$image_path), alt = e$name,
            style = "width: 90px; height: 60px; object-fit: cover; border-radius: 4px;"),
          div(
            class = "flex-grow-1",
            tags$strong(e$name, style = "font-size: 0.9rem;"),
            tags$div(class = "text-muted", style = "font-size: 0.75rem;",
              paste0(e$total_time_minutes, " min"))
          ),
          actionButton(paste0("swap_", e$entry_id), "Swap",
            class = "btn-outline-secondary btn-sm",
            onclick = sprintf("Shiny.setInputValue('swap_recipe', %d, {priority: 'event'}); return false;",
              e$entry_id))
        )
      )
    }))
  })

  # --- Plan tab: step 2 -----------------------------------------------------

  observeEvent(input$gen_list, {
    pid <- plan_id()
    if (is.na(pid)) return()
    entries <- plan_entries(pid)
    if (nrow(entries) == 0) return()

    ing <- do.call(rbind, lapply(entries$ingredients, fromJSON))
    regular <- ing[!is.na(ing$quantity), ]
    staples <- sort(unique(ing$display[is.na(ing$quantity)]))

    # merge same name+unit across recipes, summing quantities
    key <- paste(regular$name, regular$unit)
    merged <- do.call(rbind, lapply(split(seq_len(nrow(regular)), key), function(ix) {
      data.frame(
        name = regular$name[ix[1]],
        unit = regular$unit[ix[1]],
        quantity = sum(regular$quantity[ix])
      )
    }))
    merged <- merged[order(merged$name), ]
    merged$display <- paste(format_qty(merged$quantity), merged$unit, merged$name)

    dbExecute(con, "delete from grocery_items where meal_plan_id = ?", params = list(pid))
    pos <- 0
    for (i in seq_len(nrow(merged))) {
      dbExecute(con,
        "insert into grocery_items (meal_plan_id, name, display, quantity, unit, position)
         values (?, ?, ?, ?, ?, ?)",
        params = list(pid, merged$name[i], merged$display[i], merged$quantity[i],
          merged$unit[i], pos <- pos + 1))
    }
    for (s in staples) {
      dbExecute(con,
        "insert into grocery_items (meal_plan_id, name, display, position)
         values (?, ?, ?, ?)",
        params = list(pid, s, s, pos <- pos + 1))
    }
    refresh(refresh() + 1)
  })

  grocery <- reactive({
    refresh()
    pid <- plan_id()
    if (is.na(pid)) return(NULL)
    dbGetQuery(con,
      "select * from grocery_items where meal_plan_id = ? order by position",
      params = list(pid))
  })

  output$shopping_list <- renderUI({
    items <- grocery()
    if (is.null(items) || nrow(items) == 0) {
      return(helpText("No list yet — pick dinners, then hit Generate shopping list."))
    }
    is_staple <- is.na(items$quantity)
    sections <- list(
      list(title = "To buy", rows = items[!is_staple, ]),
      list(title = "Pantry staples — check you have them", rows = items[is_staple, ])
    )
    tagList(lapply(sections, function(sec) {
      if (nrow(sec$rows) == 0) return(NULL)
      tagList(
        tags$h6(class = "mt-2", sec$title),
        lapply(seq_len(nrow(sec$rows)), function(i) {
          it <- sec$rows[i, ]
          div(
            class = "form-check",
            tags$input(
              class = "form-check-input", type = "checkbox", id = paste0("chk_", it$id),
              checked = if (it$checked) "checked" else NULL,
              onclick = sprintf(
                "Shiny.setInputValue('toggle_item', {id: %d, checked: this.checked}, {priority: 'event'});",
                it$id)
            ),
            tags$label(class = "form-check-label", `for` = paste0("chk_", it$id),
              style = if (it$checked) "text-decoration: line-through; opacity: 0.6;" else NULL,
              it$display)
          )
        })
      )
    }))
  })

  observeEvent(input$toggle_item, {
    dbExecute(con, "update grocery_items set checked = ? where id = ?",
      params = list(as.integer(input$toggle_item$checked), input$toggle_item$id))
    refresh(refresh() + 1)
  }, ignoreInit = TRUE)
}

shinyApp(ui, server)
