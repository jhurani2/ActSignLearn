import { useMemo } from 'react';
import {
  DASHBOARD_PROMPTS,
  GAME_DECKS,
  LEARN_DECKS,
  OCEAN_BUDDIES,
  PRACTICE_DECKS,
} from '../../data/decks';

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function getDeckMetric(deck, progress, type) {
  const items = deck.items || [];
  const learned = new Set(progress.learnedLetters || []);
  const mastered = new Set(progress.masteredLetters || []);
  const practiceCounts = progress.practiceCounts || {};

  if (!items.length) {
    return { value: 0, total: 0, label: 'No signs yet' };
  }

  if (type === 'learn') {
    const value = items.filter((item) => learned.has(item)).length;
    return { value, total: items.length, label: `${value} of ${items.length} covered` };
  }

  if (type === 'games') {
    const value = items.filter((item) => Number(practiceCounts[item] || 0) > 0).length;
    return { value, total: items.length, label: `${value} signs attempted` };
  }

  const value = items.filter((item) => mastered.has(item)).length;
  return { value, total: items.length, label: `${value} mastered at 99%+` };
}

function DeckCard({ deck, progress, type, onNavigate }) {
  const metric = getDeckMetric(deck, progress, type);
  const percent = metric.total ? Math.round((metric.value / metric.total) * 100) : 0;
  const status = deck.unlocked ? 'Unlocked' : 'Locked';

  return (
    <button
      type="button"
      className={`deck-card ${deck.unlocked ? '' : 'locked'}`}
      style={{ '--deck-accent': deck.accent }}
      onClick={() => onNavigate(deck)}
      disabled={!deck.unlocked}
      aria-label={`${deck.title}. ${status}. ${metric.label}.`}
    >
      <span className="deck-art" aria-hidden="true">{deck.art}</span>
      <span className="deck-topline">
        <span>{deck.level}</span>
        <span className={`deck-status ${deck.unlocked ? 'open' : 'closed'}`}>{status}</span>
      </span>
      <span className="deck-title">{deck.title}</span>
      <span className="deck-description">{deck.description}</span>
      <span className="deck-progress" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </span>
      <span className="deck-foot">{deck.unlocked ? metric.label : 'Locked for a later academy level'}</span>
    </button>
  );
}

function DeckSection({ title, prompt, decks, type, progress, onNavigate }) {
  return (
    <section className="dashboard-section" aria-labelledby={`${type}-title`}>
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">{title}</p>
          <h2 id={`${type}-title`}>{prompt}</h2>
        </div>
      </div>
      <div className="deck-grid">
        {decks.map((deck) => (
          <DeckCard
            key={deck.id}
            deck={deck}
            type={type}
            progress={progress}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}

export default function DashboardPage({
  user,
  progress,
  onNavigate,
  onLogout,
  gestureCameraOn,
  onGestureCameraToggle,
}) {
  const safeProgress = progress || {
    learnedCount: 0,
    masteredCount: 0,
    totalAttempts: 0,
    averageScore: 0,
    learnedLetters: [],
    masteredLetters: [],
    bestScores: {},
    practiceCounts: {},
    masteryRecords: {},
  };
  const prompts = useMemo(() => ({
    learn: pickRandom(DASHBOARD_PROMPTS.learn),
    practice: pickRandom(DASHBOARD_PROMPTS.practice),
    games: pickRandom(DASHBOARD_PROMPTS.games),
  }), []);
  const buddyNote = useMemo(() => {
    const buddy = pickRandom(OCEAN_BUDDIES);
    return {
      ...buddy,
      quote: pickRandom(buddy.quotes),
    };
  }, []);

  return (
    <main className="screen-wrap dashboard-wrap">
      <section className="dashboard-shell card-shell" aria-labelledby="dashboard-title">
        <div className="dashboard-top">
          <div>
            <p className="eyebrow2">ActSignLearn | ACADEMY DASHBOARD</p>
            <h1 id="dashboard-title" className="page-title">Welcome, {user.username}</h1>
            <p className="page-subtitle">
              Choose a deck, visit the learning studio, or warm up in the practice lagoon.
            </p>
          </div>
          <div className="dashboard-top-actions">
            {typeof onGestureCameraToggle === 'function' ? (
              <button
                type="button"
                className="gesture-inline-toggle"
                onClick={onGestureCameraToggle}
                aria-label={`Camera gesture ${gestureCameraOn ? 'on' : 'off'}`}
                title="Camera gesture"
              >
                <span className={`gesture-inline-dot ${gestureCameraOn ? 'on' : 'off'}`} aria-hidden="true" />
                <span className="gesture-inline-label">camera gesture</span>
                <span className="gesture-inline-state">{gestureCameraOn ? 'stop' : 'start'}</span>
              </button>
            ) : null}
            <button type="button" className="ghost-btn" onClick={onLogout}>Log Out</button>
          </div>
        </div>

        <div className="metrics-grid" role="list" aria-label="Learning progress overview">
          <article className="metric-card" role="listitem">
            <p>Alphabet covered</p>
            <strong>{safeProgress.learnedCount} / 26</strong>
          </article>
          <article className="metric-card" role="listitem">
            <p>Mastered signs</p>
            <strong>{safeProgress.masteredCount}</strong>
            <span>99%+ accuracy</span>
          </article>
          <article className="metric-card" role="listitem">
            <p>Practice attempts</p>
            <strong>{safeProgress.totalAttempts}</strong>
          </article>
          <article className="metric-card" role="listitem">
            <p>Average score</p>
            <strong>{safeProgress.averageScore}%</strong>
          </article>
        </div>

        <section className="buddy-note" aria-labelledby="buddy-note-title">
          <div>
            <p className="eyebrow">Note from Ocean Buddies</p>
            <h2 id="buddy-note-title">A little current for today</h2>
          </div>
          <article className="tip-card buddy-note-card">
            <img src={buddyNote.sprite} alt="" aria-hidden="true" />
            <p><strong>{buddyNote.name}:</strong> {buddyNote.quote}</p>
          </article>
        </section>

        <DeckSection
          title="Academy Lessons"
          prompt={prompts.learn}
          decks={LEARN_DECKS}
          type="learn"
          progress={safeProgress}
          onNavigate={onNavigate}
        />

        <DeckSection
          title="Practice Lagoon"
          prompt={prompts.practice}
          decks={PRACTICE_DECKS}
          type="practice"
          progress={safeProgress}
          onNavigate={onNavigate}
        />

        <DeckSection
          title="Game Cove"
          prompt={prompts.games}
          decks={GAME_DECKS}
          type="games"
          progress={safeProgress}
          onNavigate={onNavigate}
        />
      </section>
    </main>
  );
}
