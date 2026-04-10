# Noise Local Database Schema

This project runs fully offline with SQLite at:

- `backend/data/noise.db`

## Table: `mood_checkins`

- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `mood` TEXT NOT NULL
- `note` TEXT NULL
- `created_at` TEXT NOT NULL DEFAULT `datetime('now')`

Purpose:

- Stores each mood check-in submitted from the frontend.
- Supports timeline/history and trend analysis.

## Table: `pet_responses`

- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `checkin_id` INTEGER NOT NULL
- `tone` TEXT NOT NULL
- `message` TEXT NOT NULL
- `created_at` TEXT NOT NULL DEFAULT `datetime('now')`
- Foreign key: `checkin_id -> mood_checkins(id)` with `ON DELETE CASCADE`

Purpose:

- Stores generated companion responses linked to one mood check-in.
- Supports future replay/history of pet feedback.

## Indexes

- `idx_mood_checkins_created_at` on `mood_checkins(created_at DESC)`
- `idx_pet_responses_checkin_id` on `pet_responses(checkin_id)`

Purpose:

- Faster newest-first mood history queries.
- Faster lookup of pet responses by check-in.
