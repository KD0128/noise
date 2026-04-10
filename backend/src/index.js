const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const VALID_MOODS = ["great", "good", "okay", "down", "stressed"];
let dbReady = false;
let dbInitError = null;
let db = null;

async function initializeDatabase() {
  try {
    const dataDir = path.resolve(__dirname, "../data");
    fs.mkdirSync(dataDir, { recursive: true });

    const dbPath = path.join(dataDir, "noise.db");
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(`
      CREATE TABLE IF NOT EXISTS mood_checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mood TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS pet_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checkin_id INTEGER NOT NULL,
        tone TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(checkin_id) REFERENCES mood_checkins(id) ON DELETE CASCADE
      )
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mood_checkins_created_at
      ON mood_checkins(created_at DESC)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pet_responses_checkin_id
      ON pet_responses(checkin_id)
    `);

    dbReady = true;
    dbInitError = null;
    console.log(`SQLite ready at ${dbPath}`);
  } catch (error) {
    dbReady = false;
    dbInitError = error.message;
    console.error("SQLite init failed:", error.message);
  }
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Noise backend running",
    database: dbReady ? "connected" : "disconnected",
    dbError: dbInitError,
  });
});

app.post("/api/moods", async (req, res) => {
  if (!dbReady || !db) {
    return res.status(503).json({
      ok: false,
      message: "Database not ready. Check backend logs and DATABASE_URL.",
      dbError: dbInitError,
    });
  }

  const { mood, note } = req.body ?? {};

  if (!VALID_MOODS.includes(mood)) {
    return res.status(400).json({
      ok: false,
      message: `Invalid mood. Allowed: ${VALID_MOODS.join(", ")}`,
    });
  }

  if (note != null && typeof note !== "string") {
    return res.status(400).json({
      ok: false,
      message: "note must be a string.",
    });
  }

  const trimmedNote = typeof note === "string" ? note.trim() : "";
  const finalNote = trimmedNote.length > 0 ? trimmedNote.slice(0, 1000) : null;

  try {
    const statement = db.prepare(
      "INSERT INTO mood_checkins (mood, note) VALUES (?, ?)"
    );
    const result = statement.run(mood, finalNote);

    return res.status(201).json({
      ok: true,
      id: Number(result.lastInsertRowid),
      mood,
      note: finalNote,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to save mood check-in.",
      error: error.message,
    });
  }
});

app.get("/api/moods", async (req, res) => {
  if (!dbReady || !db) {
    return res.status(503).json({
      ok: false,
      message: "Database not ready. Check backend logs and DATABASE_URL.",
      dbError: dbInitError,
    });
  }

  const requestedLimit = Number(req.query.limit);
  const requestedPage = Number(req.query.page);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 50)
    : 10;
  const page = Number.isFinite(requestedPage)
    ? Math.max(Math.floor(requestedPage), 1)
    : 1;
  const offset = (page - 1) * limit;

  try {
    const countRow = db
      .prepare("SELECT COUNT(*) AS total FROM mood_checkins")
      .get();
    const total = Number(countRow.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const statement = db.prepare(`
      SELECT
        id,
        mood,
        note,
        created_at AS createdAt
      FROM mood_checkins
      ORDER BY datetime(created_at) DESC
      LIMIT ? OFFSET ?
    `);
    const items = statement.all(limit, offset);

    return res.json({
      ok: true,
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load mood history.",
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`Server running on ${PORT}`);
});
