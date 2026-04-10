import { useEffect, useState } from "react";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeMood = history[0]?.mood || mood;
  const petMessage = PET_TEXT[activeMood] || PET_TEXT.okay;
  const petTrait = PET_TRAITS[activeMood] || PET_TRAITS.okay;

  const loadMoodHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/moods?limit=10`);
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      setHistory(data.items || []);
      setHistoryError("");
    } catch (error) {
      setHistoryError(error.message || "Failed to load mood history.");
    }
  };

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        setStatus("connected");
      } catch (error) {
        setStatus("error");
      }
    };

    checkBackend().then(loadMoodHistory);
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

      setSubmitMessage("Saved mood check-in.");
      setNote("");
      await loadMoodHistory();
    } catch (error) {
      setSubmitMessage(error.message || "Failed to save mood check-in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="container">
      <header className="hero">
        <p className="eyebrow">Local Demo</p>
        <h1>Noise</h1>
        <p className="subtitle">A calm daily mood companion</p>
      </header>

      <section
        className={`pet-stage distance-${petTrait.distance}`}
        aria-label="Digital pet prototype"
      >
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
        <div className="pet-bubble">
          <p className="pet-bubble-label">Noise says</p>
          <p>{petMessage}</p>
        </div>
      </section>

      <form className="checkin-form" onSubmit={handleSubmit}>
        <h2>Daily Mood Check-in</h2>

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
          rows="3"
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="How are you feeling today?"
        />

        <button type="submit" disabled={isSubmitting || status !== "connected"}>
          {isSubmitting ? "Saving..." : "Save Check-in"}
        </button>
        {submitMessage && <p className="form-message">{submitMessage}</p>}
      </form>

      <section className="history">
        <h2>Recent Check-ins</h2>
        {historyError && <p className="error-text">{historyError}</p>}
        {!historyError && history.length === 0 && <p>No check-ins yet.</p>}
        {history.length > 0 && (
          <ul>
            {history.map((item) => (
              <li key={item.id}>
                <div className="history-head">
                  <strong className="mood-pill">{item.mood}</strong>
                  <span>{new Date(item.createdAt).toLocaleString()}</span>
                </div>
                <p>{item.note || "No note"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default App;
