# Limeaid

A personal dinner planner and grocery-list builder — a Mealime replacement,
seeded with the full scraped Mealime recipe catalog. See ../PLAN.md.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Database

Postgres via `DATABASE_URL` in `.env.local`. Apply the schema and load the
seed data with:

```bash
npm run seed
```
