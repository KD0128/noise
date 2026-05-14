import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";
const PAGE_SIZE = 5;
const MOOD_OPTIONS = ["great", "good", "okay", "down", "stressed"];
const PET_TEXT = {
  great: "You sound bright today. I am glowing with you.",
  good: "Steady and good. I will stay close.",
  okay: "Quiet day is okay. I am here with you.",
  down: "It feels heavy. Let us breathe slowly together.",
  stressed: "A lot is happening. One step at a time.",
};
const PET_TRAITS = {
  great: { expression: "joy", distance: "near" },
  good: { expression: "soft-smile", distance: "near" },
  okay: { expression: "neutral", distance: "center" },
  down: { expression: "sad", distance: "close" },
  stressed: { expression: "anxious", distance: "close" },
};

function App() {
  const [status, setStatus] = useState("checking");
  const [mood, setMood] = useState("okay");
  const [note, setNote] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [trend, setTrend] = useState([]);
  const [trendError, setTrendError] = useState("");
  const [supportSignal, setSupportSignal] = useState({
    shouldPrompt: false,
    level: "none",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const latestCheckin = history[0];
  const activeMood = latestCheckin?.mood || mood;
  const petMessage =
    latestCheckin?.petResponse?.message || PET_TEXT[activeMood] || PET_TEXT.okay;
  const petTrait = latestCheckin?.petResponse?.tone
    ? {
        expression: latestCheckin.petResponse.tone,
        distance: PET_TRAITS[activeMood]?.distance || PET_TRAITS.okay.distance,
      }
    : PET_TRAITS[activeMood] || PET_TRAITS.okay;
  const trendDaysWithEntries = trend.filter((item) => item.total > 0).length;
  const latestDate = latestCheckin
    ? new Date(latestCheckin.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "No entries yet";

  const loadMoodHistory = async (page = 1) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/moods?limit=${PAGE_SIZE}&page=${page}`,
      );
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      setHistory(data.items || []);
      setSupportSignal(
        data.supportSignal || {
          shouldPrompt: false,
          level: "none",
          message: "",
        },
      );
      setCurrentPage(data.pagination?.page || 1);
      setTotalPages(data.pagination?.totalPages || 1);
      setHistoryError("");
    } catch (error) {
      setHistoryError(error.message || "Failed to load mood history.");
    }
  };

  const loadMoodTrend = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/moods/trend?days=7`);
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      setTrend(data.items || []);
      setTrendError("");
    } catch (error) {
      setTrend([]);
      setTrendError(error.message || "Failed to load mood trend.");
    }
  };

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await response.json();
        setStatus("connected");
      } catch (error) {
        setStatus("error");
      }
    };

    checkBackend().then(() => {
      loadMoodHistory(1);
      loadMoodTrend();
    });
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/moods`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mood, note }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      setSubmitMessage("Check-in saved.");
      setSupportSignal(
        data.supportSignal || {
          shouldPrompt: false,
          level: "none",
          message: "",
        },
      );
      setNote("");
      await loadMoodHistory(1);
      await loadMoodTrend();
    } catch (error) {
      setSubmitMessage(error.message || "Failed to save mood check-in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="container">
      <header className="hero">
        <p className="eyebrow">Calm Mood Companion</p>
        <h1>Noise</h1>
        <p className="subtitle">
          A soft space to check in, notice patterns, and hear one kind reply.
        </p>
      </header>

      <section className="overview-strip overview-strip-compact" aria-label="Overview">
        <article className="overview-card">
          <span className="overview-label">Latest Mood</span>
          <strong>{activeMood}</strong>
          <p>{latestDate}</p>
        </article>
        <article className="overview-card">
          <span className="overview-label">Trend Coverage</span>
          <strong>{trendDaysWithEntries}/7</strong>
          <p>Days with activity</p>
        </article>
      </section>

      <section
        className={`pet-stage distance-${petTrait.distance}`}
        aria-label="Digital pet prototype"
      >
        <div className="pet-stage-visual">
          <div className="pet-orb-track">
            <div className={`pet-orb mood-${activeMood}`}>
              <div
                className={`pet-face face-${petTrait.expression}`}
                aria-hidden="true"
              >
                <span className="eye left" />
                <span className="eye right" />
                <span className="mouth" />
              </div>
            </div>
          </div>
          <p className="pet-stage-caption">Noise stays close and responds after each check-in.</p>
        </div>
        <div className="pet-bubble">
          <p className="pet-bubble-label">Noise says</p>
          <p className="pet-bubble-text">{petMessage}</p>
        </div>
      </section>

      {supportSignal.shouldPrompt && (
        <section className={`support-card support-${supportSignal.level}`}>
          <p className="support-label">Gentle support</p>
          <p>{supportSignal.message}</p>
        </section>
      )}

      <section className="main-grid">
        <form className="checkin-form" onSubmit={handleSubmit}>
          <div className="section-heading">
            <div>
              <p className="section-kicker">Today</p>
              <h2>Daily Mood Check-in</h2>
            </div>
            <span className="section-chip">One moment, one note</span>
          </div>

          <label htmlFor="mood">Mood</label>
          <select
            id="mood"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
          >
            {MOOD_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <label htmlFor="note">Note (optional)</label>
          <textarea
            id="note"
            rows="4"
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What felt most present today?"
          />

          <div className="form-footer">
            <button type="submit" disabled={isSubmitting || status !== "connected"}>
              {isSubmitting ? "Saving..." : "Save Check-in"}
            </button>
            {submitMessage && <p className="form-message">{submitMessage}</p>}
          </div>
        </form>

        <section className="trend-card">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Weekly View</p>
              <h2>Mood Trend</h2>
            </div>
            <span className="section-chip">Last 7 days</span>
          </div>
          {trendError && <p className="error-text">{trendError}</p>}
          {!trendError && trend.length === 0 && <p>No trend data yet.</p>}
          {!trendError && trend.length > 0 && (
            <div className="trend-list">
              {trend.map((item) => {
                const total = item.total || 1;
                const positivePct = (item.positive / total) * 100;
                const neutralPct = (item.neutral / total) * 100;
                const negativePct = (item.negative / total) * 100;

                return (
                  <div className="trend-row" key={item.day}>
                    <div className="trend-day">
                      {new Date(`${item.day}T00:00:00`).toLocaleDateString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </div>
                    <div className="trend-bar-wrap">
                      <div className="trend-bar">
                        <span
                          className="seg positive"
                          style={{ width: `${positivePct}%` }}
                        />
                        <span
                          className="seg neutral"
                          style={{ width: `${neutralPct}%` }}
                        />
                        <span
                          className="seg negative"
                          style={{ width: `${negativePct}%` }}
                        />
                      </div>
                      <small>{item.total === 0 ? "No check-in" : `${item.total} check-in${item.total > 1 ? "s" : ""}`}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </section>

      <section className="history">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Archive</p>
            <h2>Recent Check-ins</h2>
          </div>
          <span className="section-chip">Page {currentPage}</span>
        </div>
        {historyError && <p className="error-text">{historyError}</p>}
        {!historyError && history.length === 0 && <p>No check-ins yet.</p>}
        {history.length > 0 && (
          <ul>
            {history.map((item) => (
              <li key={item.id}>
                <div className="history-head">
                  <strong className={`mood-pill mood-pill-${item.mood}`}>{item.mood}</strong>
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                </div>
                <p className="history-note">{item.note || "No note"}</p>
                {item.petResponse?.message && (
                  <p className="history-pet-message">Noise: {item.petResponse.message}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="history-pagination">
          <button
            type="button"
            onClick={() => loadMoodHistory(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            Previous
          </button>
          <span>
            Page {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => loadMoodHistory(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next
          </button>
        </div>
      </section>
    </main>
  );
}

export default App;
