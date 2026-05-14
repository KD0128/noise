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
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const FALLBACK_MESSAGES = {
  great: "You sound bright today. I am glowing with you.",
  good: "Steady and good. I will stay close.",
  okay: "Quiet day is okay. I am here with you.",
  down: "It feels heavy. Let us breathe slowly together.",
  stressed: "A lot is happening. One step at a time.",
};
const PET_TONES = {
  great: "joy",
  good: "soft-smile",
  okay: "neutral",
  down: "sad",
  stressed: "anxious",
};

let dbReady = false;
let dbInitError = null;
let db = null;

function buildSupportSignal() {
  return {
    shouldPrompt: false,
    level: "none",
    message: "",
  };
}

function getFallbackPetResponse(mood) {
  return {
    tone: PET_TONES[mood] || PET_TONES.okay,
    message: FALLBACK_MESSAGES[mood] || FALLBACK_MESSAGES.okay,
  };
}

function classifyNote(note) {
  const text = (note || "").toLowerCase();

  if (
    /kill myself|suicide|suicidal|end my life|hurt myself|self harm|want to die/.test(
      text
    )
  ) {
    return "crisis";
  }

  if (/overwhelmed|panic|depressed|failed|hopeless|worthless|can't do this/.test(text)) {
    return "heavy";
  }

  return "general";
}

function buildAiPrompt(mood, note) {
  const severity = classifyNote(note);

  return [
    `Mood: ${mood}`,
    note && note.length > 0 ? `User note: ${note}` : "User note: none",
    `Severity: ${severity}`,
    "Reply as a gentle digital pet.",
    "Use the note more than the mood if they conflict.",
    "Mention one concrete detail from the user's note when possible.",
    "Be specific instead of generic.",
    "Do not mention being an AI.",
    "Do not use emojis.",
    severity === "crisis"
      ? "Write two short sentences that sound calm, serious, and caring. Acknowledge the pain clearly, then tell the user to contact a trusted person or emergency support now. Do not give trivial self-care advice."
      : severity === "heavy"
        ? "Write one or two short sentences. First show empathy for the specific situation, then give one small practical next step that fits what happened."
        : "Write one or two short sentences that feel warm and lightly supportive, with one small next step that fits the user's situation.",
  ].join("\n");
}

function extractResponseText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (!Array.isArray(data.output)) {
    return "";
  }

  for (const item of data.output) {
    if (!Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (content.type === "output_text" && typeof content.text === "string") {
        const text = content.text.trim();
        if (text) {
          return text;
        }
      }
    }
  }

  return "";
}

async function generateAiPetResponse(mood, note) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: buildAiPrompt(mood, note),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI request failed:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    const message = extractResponseText(data);
    if (!message) {
      console.error("OpenAI returned no text:", JSON.stringify(data));
      return null;
    }

    return {
      tone: PET_TONES[mood] || PET_TONES.okay,
      message,
    };
  } catch (error) {
    console.error("OpenAI fetch failed:", error.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

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
    ai: process.env.OPENAI_API_KEY ? "configured" : "fallback",
    model: process.env.OPENAI_API_KEY ? OPENAI_MODEL : null,
  });
});

app.post("/api/moods", async (req, res) => {
  if (!dbReady || !db) {
    return res.status(503).json({
      ok: false,
      message: "Database not ready.",
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
    const result = db
      .prepare("INSERT INTO mood_checkins (mood, note) VALUES (?, ?)")
      .run(mood, finalNote);
    const checkinId = Number(result.lastInsertRowid);
    const petResponse =
      (await generateAiPetResponse(mood, finalNote)) ||
      getFallbackPetResponse(mood);

    db.prepare(
      `
        INSERT INTO pet_responses (checkin_id, tone, message)
        VALUES (?, ?, ?)
      `
    ).run(checkinId, petResponse.tone, petResponse.message);

    return res.status(201).json({
      ok: true,
      id: checkinId,
      mood,
      note: finalNote,
      petResponse,
      supportSignal: buildSupportSignal(),
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
      message: "Database not ready.",
      dbError: dbInitError,
    });
  }

  const requestedLimit = Number(req.query.limit);
  const requestedPage = Number(req.query.page);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 50)
    : 5;
  const page = Number.isFinite(requestedPage)
    ? Math.max(Math.floor(requestedPage), 1)
    : 1;
  const offset = (page - 1) * limit;

  try {
    const total = Number(
      db.prepare("SELECT COUNT(*) AS total FROM mood_checkins").get().total || 0
    );
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const items = db
      .prepare(
        `
          SELECT
            mc.id,
            mc.mood,
            mc.note,
            mc.created_at AS createdAt,
            pr.tone AS petTone,
            pr.message AS petMessage
          FROM mood_checkins mc
          LEFT JOIN pet_responses pr ON pr.checkin_id = mc.id
          ORDER BY datetime(mc.created_at) DESC, mc.id DESC
          LIMIT ? OFFSET ?
        `
      )
      .all(limit, offset)
      .map((item) => ({
        id: item.id,
        mood: item.mood,
        note: item.note,
        createdAt: item.createdAt,
        petResponse: item.petMessage
          ? {
              tone: item.petTone,
              message: item.petMessage,
            }
          : null,
      }));

    return res.json({
      ok: true,
      items,
      supportSignal: buildSupportSignal(),
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

app.get("/api/moods/trend", async (req, res) => {
  if (!dbReady || !db) {
    return res.status(503).json({
      ok: false,
      message: "Database not ready.",
      dbError: dbInitError,
    });
  }

  const requestedDays = Number(req.query.days);
  const days = Number.isFinite(requestedDays)
    ? Math.min(Math.max(Math.floor(requestedDays), 1), 30)
    : 7;

  try {
    const startDateExpr = `date('now', '-${days - 1} day')`;
    const rows = db.prepare(`
      SELECT
        date(created_at) AS day,
        SUM(CASE WHEN mood IN ('great', 'good') THEN 1 ELSE 0 END) AS positive,
        SUM(CASE WHEN mood = 'okay' THEN 1 ELSE 0 END) AS neutral,
        SUM(CASE WHEN mood IN ('down', 'stressed') THEN 1 ELSE 0 END) AS negative,
        COUNT(*) AS total
      FROM mood_checkins
      WHERE date(created_at) >= ${startDateExpr}
      GROUP BY day
      ORDER BY day ASC
    `).all();

    const map = new Map(rows.map((row) => [row.day, row]));
    const items = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      const found = map.get(key);

      items.push({
        day: key,
        positive: Number(found?.positive || 0),
        neutral: Number(found?.neutral || 0),
        negative: Number(found?.negative || 0),
        total: Number(found?.total || 0),
      });
    }

    return res.json({ ok: true, items, days });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Failed to load mood trend.",
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, async () => {
  await initializeDatabase();
  console.log(`Server running on ${PORT}`);
});
