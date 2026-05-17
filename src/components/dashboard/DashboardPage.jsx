import { useMemo, useRef, useState } from 'react';
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

const ACADEMY_EXPLORE_CUES = [
  'SWIPE OR TAP RIGHT TO EXPLORE MORE FROM THE ACADEMY',
  'TAP THE RIGHT ARROW TO OPEN THE ACADEMY DECKS',
  'SLIDE RIGHT FOR LESSONS, PRACTICE, AND GAMES',
];

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

function isDeckComplete(deck, progress, type) {
  const metric = getDeckMetric(deck, progress, type);
  return metric.total > 0 && metric.value >= metric.total;
}

function canRenderDeck(deck) {
  const items = deck.items || [];
  const hasOnlyLetters = items.length > 0 && items.every((item) => /^[A-Z]$/.test(item));
  return ['speed-sign', 'sign-duel'].includes(deck.gameMode) || ((deck.mode === 'learn' || deck.mode === 'practice') && hasOnlyLetters);
}

function applyProgressiveUnlocks(decks, progress, type) {
  let previousDeckComplete = false;

  return decks.map((deck) => {
    const complete = isDeckComplete(deck, progress, type);
    const unlocked = Boolean(deck.unlocked) || previousDeckComplete;
    const nextDeck = {
      ...deck,
      complete,
      renderable: canRenderDeck(deck),
      unlocked,
    };

    previousDeckComplete = unlocked && complete;
    return nextDeck;
  });
}

function applyGameUnlocks(progress) {
  const alphabetDeck = LEARN_DECKS[0];
  const alphabetComplete = isDeckComplete(alphabetDeck, progress, 'learn');

  return GAME_DECKS.map((deck) => ({
    ...deck,
    complete: isDeckComplete(deck, progress, 'games'),
    renderable: canRenderDeck(deck),
    unlocked: Boolean(deck.unlocked) || alphabetComplete,
    unlockHint: 'Complete Alphabet lessons to unlock all games',
  }));
}

function DeckCard({ deck, progress, type, onNavigate }) {
  const metric = getDeckMetric(deck, progress, type);
  const percent = metric.total ? Math.round((metric.value / metric.total) * 100) : 0;
  const status = deck.complete ? 'Complete' : deck.unlocked ? 'Unlocked' : 'Locked';
  const footLabel = !deck.unlocked
    ? deck.unlockHint || 'Locked until the previous deck is complete'
    : !deck.renderable
    ? 'Unlocked - sign set coming soon'
    : deck.complete
    ? 'Complete - next set unlocked'
    : metric.label;

  return (
    <button
      type="button"
      className={`deck-card ${deck.unlocked ? '' : 'locked'}`}
      style={{ '--deck-accent': deck.accent }}
      onClick={() => onNavigate(deck)}
      disabled={!deck.unlocked}
      aria-label={`${deck.title}. ${status}. ${footLabel}.`}
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
      <span className="deck-foot">{footLabel}</span>
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

function PersonalizedPlanCard({
  plan,
  learnerProfile,
  planStarted,
  generatingPlan,
  onGeneratePlan,
  onStartPlan,
}) {
  if (!plan) {
    return (
      <section className="personal-plan-card card" aria-labelledby="personal-plan-title">
        <div>
          <p className="eyebrow">Quest Builder</p>
          <h2 id="personal-plan-title">Build your first sign quest</h2>
          <p>
            We will use your quiz answers and scores to pick focus letters and a daily routine.
          </p>
        </div>
        <button type="button" className="primary-btn" onClick={onGeneratePlan} disabled={generatingPlan}>
          {generatingPlan ? 'Building...' : 'Build plan'}
        </button>
      </section>
    );
  }

  const focusLetters = getPrimaryPlanLetters(plan);
  const timeTracking = plan.timeTracking || {};
  const totalTime = formatPlanTime(timeTracking.totalSeconds || 0);
  const hasExploredPlan = planStarted || Number(timeTracking.totalSeconds || 0) > 0 || (timeTracking.recent || []).length > 0;
  const chartLabel = focusLetters.length ? `${focusLetters.length}` : '3';
  const presentation = getPlanPresentation(plan, learnerProfile, focusLetters);

  return (
    <section className={`personal-plan-card card ready ${presentation.themeClass}`} aria-labelledby="personal-plan-title">
      <div className="personal-plan-hero">
        <div className="personal-plan-main">
          <p className="eyebrow">{presentation.eyebrow}</p>
          <h2 id="personal-plan-title">{presentation.title}</h2>
          <p>{presentation.summary}</p>
        </div>
        <div className="plan-focus-row" aria-label="Focus letters">
          {focusLetters.map((letter) => (
            <span key={letter}>{letter}</span>
          ))}
        </div>
        <div className="plan-focus-chart" aria-label={`${chartLabel} focus letters`}>
          <span>{chartLabel}</span>
        </div>
      </div>

      <div className="plan-support-row" aria-label="Plan supports">
        {presentation.supports.map((support) => (
          <div className="plan-support-pill" key={support.label}>
            <small>{support.label}</small>
            <strong>{support.value}</strong>
          </div>
        ))}
      </div>

      <div className="plan-detail-grid">
        <article>
          <span>{presentation.goalLabel}</span>
          <strong>{plan.weeklyGoal}</strong>
        </article>
        <article>
          <span>{presentation.sessionLabel}</span>
          <strong>{plan.dailySessionMinutes} min</strong>
        </article>
        <article>
          <span>Time logged</span>
          <strong>{totalTime}</strong>
        </article>
      </div>

      <div className="personal-plan-actions">
        <button type="button" className="primary-btn" onClick={onStartPlan}>
          {hasExploredPlan ? 'Continue' : 'Start plan'}
        </button>
        <button type="button" className="ghost-btn" onClick={onGeneratePlan} disabled={generatingPlan}>
          {generatingPlan ? 'Refreshing...' : 'Refresh plan'}
        </button>
      </div>
    </section>
  );
}

function getPlanPresentation(plan, learnerProfile, focusLetters) {
  const profile = learnerProfile || {};
  const answers = profile.answers || {};
  const accessibility = plan.accessibility || {};
  const focusText = focusLetters.length ? focusLetters.join(', ') : 'today';
  const learnerType = plan.learnerType || profile.learnerType || '';
  const practiceStyle = profile.preferredPracticeStyle || answers.learnBest || '';
  const mood = profile.practiceMood || answers.practiceMood || '';
  const goal = profile.primaryGoal || answers.goal || '';
  const motivation = profile.motivationStyle || answers.motivation || '';
  const schedule = profile.schedulePreference || answers.time || '';
  const challenge = profile.challengeAreas?.[0] || answers.challenge || '';
  const personality = getPlanPersonality({
    learnerType,
    practiceStyle,
    mood,
    goal,
    motivation,
    schedule,
    challenge,
    accessibility,
  });

  return {
    ...personality,
    title: personality.title(focusText),
    summary: personality.summary(plan.summary, focusText),
    supports: [
      { label: 'Learns with', value: getPracticeStyleLabel(practiceStyle, learnerType) },
      { label: 'Access support', value: getAccessibilitySupportLabel(accessibility, challenge) },
      { label: 'Coach tone', value: getCoachToneLabel(accessibility, motivation, mood) },
    ],
  };
}

function getPlanPersonality({ learnerType, practiceStyle, mood, goal, motivation, schedule, challenge, accessibility }) {
  if (goal === 'communication' || learnerType === 'Communication Builder') {
    return {
      themeClass: 'quest-communication',
      eyebrow: 'Real-World Sign Quest',
      goalLabel: 'Conversation goal',
      sessionLabel: 'Recommended practice window',
      title: (focusText) => `Conversation Route for ${focusText}`,
      summary: (fallback, focusText) => `Useful, practical practice for ${focusText}, with recall that transfers into real fingerspelling moments.`,
    };
  }

  if (practiceStyle === 'games' || mood === 'game_like' || mood === 'competitive' || motivation === 'scores_rankings' || learnerType === 'Game Sprinter') {
    return {
      themeClass: 'quest-game',
      eyebrow: 'Challenge Quest',
      goalLabel: 'Score target',
      sessionLabel: 'Recommended round',
      title: (focusText) => `Speed Run for ${focusText}`,
      summary: (fallback, focusText) => `Fast, score-friendly practice for ${focusText}, with enough structure to keep the signs clean.`,
    };
  }

  if (practiceStyle === 'visual_model' || accessibility.visualSupport === 'model first' || learnerType === 'Visual Explorer') {
    return {
      themeClass: 'quest-visual',
      eyebrow: 'Model-First Quest',
      goalLabel: 'Shape goal',
      sessionLabel: 'Recommended model time',
      title: (focusText) => `Model Map for ${focusText}`,
      summary: (fallback, focusText) => `Visual-first practice for ${focusText}: study the hand shape, then use feedback after the model feels familiar.`,
    };
  }

  if (mood === 'accuracy_focused' || goal === 'speed_accuracy' || challenge === 'confidence' || learnerType === 'Accuracy Tuner') {
    return {
      themeClass: 'quest-precision',
      eyebrow: 'Precision Quest',
      goalLabel: 'Accuracy goal',
      sessionLabel: 'Recommended accuracy block',
      title: (focusText) => `Precision Path for ${focusText}`,
      summary: (fallback, focusText) => `Careful practice for ${focusText}, tuned for clear hand shapes, camera confidence, and cleaner scores.`,
    };
  }

  if (mood === 'calm_guided' || motivation === 'gentle_messages' || accessibility.feedbackTone === 'gentle') {
    return {
      themeClass: 'quest-calm',
      eyebrow: 'Calm Current Quest',
      goalLabel: 'Steady goal',
      sessionLabel: 'Recommended gentle session',
      title: (focusText) => `Calm Current for ${focusText}`,
      summary: (fallback, focusText) => `Low-pressure practice for ${focusText}, with a slower pace, gentler feedback, and room to repeat.`,
    };
  }

  if (mood === 'short_daily' || schedule === 'five_min_daily' || schedule === 'ten_fifteen_daily' || challenge === 'consistency' || learnerType === 'Consistency Learner') {
    return {
      themeClass: 'quest-rhythm',
      eyebrow: 'Daily Rhythm Quest',
      goalLabel: 'Habit goal',
      sessionLabel: 'Recommended daily rep',
      title: (focusText) => `Streak Route for ${focusText}`,
      summary: (fallback, focusText) => `Repeatable daily practice for ${focusText}, built to feel doable even when the session is short.`,
    };
  }

  return {
    themeClass: 'quest-guided',
    eyebrow: 'Today\'s Sign Quest',
    goalLabel: 'Quest goal',
    sessionLabel: 'Recommended session',
    title: (focusText) => `Treasure Map for ${focusText}`,
    summary: (fallback) => fallback,
  };
}

function getPracticeStyleLabel(practiceStyle, learnerType) {
  if (practiceStyle === 'steps') return 'Step-by-step';
  if (practiceStyle === 'visual_model') return 'Visual models';
  if (practiceStyle === 'instant_feedback') return 'Camera feedback';
  if (practiceStyle === 'games') return 'Games';
  if (practiceStyle === 'repetition') return 'Repetition';
  if (learnerType) return learnerType;
  return 'Guided practice';
}

function getAccessibilitySupportLabel(accessibility, challenge) {
  if (accessibility.visualSupport) return labelPlanValue(accessibility.visualSupport);
  if (accessibility.hintLevel === 'expanded') return 'Extra hints';
  if (challenge === 'hand_shape') return 'Hand-shape help';
  if (challenge === 'remembering') return 'Memory cues';
  return 'Balanced support';
}

function getCoachToneLabel(accessibility, motivation, mood) {
  if (accessibility.feedbackTone === 'gentle' || motivation === 'gentle_messages') return 'Gentle feedback';
  if (mood === 'competitive' || motivation === 'scores_rankings') return 'Score-focused';
  if (accessibility.promptPace === 'slow') return 'Slow pace';
  return 'Direct feedback';
}

function labelPlanValue(value) {
  return String(value || '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function getPrimaryPlanLetters(plan) {
  const primaryLetters = Array.isArray(plan?.primaryFocusLetters) ? plan.primaryFocusLetters : [];
  const focusLetters = Array.isArray(plan?.focusLetters) ? plan.focusLetters : [];
  const sourceLetters = primaryLetters.length ? primaryLetters : focusLetters.slice(0, 3);

  return sourceLetters
    .map((letter) => String(letter || '').trim().toUpperCase())
    .filter((letter) => /^[A-Z]$/.test(letter));
}

function formatPlanTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  if (safeSeconds < 60) return `${safeSeconds}s`;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export default function DashboardPage({
  user,
  progress,
  learnerProfile,
  personalizedPlan,
  planStarted,
  generatingPlan,
  onGeneratePlan,
  onStartPlan,
  onNavigate,
  onLogout,
  onRetakeQuiz,
  gestureCameraOn,
  onGestureCameraToggle,
}) {
  const [activePanel, setActivePanel] = useState('home');
  const touchStartXRef = useRef(null);
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
  const academyExploreCue = useMemo(() => pickRandom(ACADEMY_EXPLORE_CUES), []);
  const lessonDecks = useMemo(
    () => applyProgressiveUnlocks(LEARN_DECKS, safeProgress, 'learn'),
    [safeProgress]
  );
  const practiceDecks = useMemo(
    () => applyProgressiveUnlocks(PRACTICE_DECKS, safeProgress, 'practice'),
    [safeProgress]
  );
  const gameDecks = useMemo(
    () => applyGameUnlocks(safeProgress),
    [safeProgress]
  );
  const allDecks = useMemo(
    () => [...lessonDecks, ...practiceDecks, ...gameDecks],
    [lessonDecks, practiceDecks, gameDecks]
  );
  const startPlanDeck = () => {
    const deck = allDecks.find((candidate) => candidate.id === personalizedPlan?.recommendedStartDeckId) || allDecks[0];
    if (deck) {
      if (typeof onStartPlan === 'function') {
        onStartPlan(deck);
      } else {
        onNavigate(deck);
      }
    }
  };
  const goToDeckPanel = () => setActivePanel('decks');
  const goToHomePanel = () => setActivePanel('home');
  const handlePanelTouchStart = (event) => {
    touchStartXRef.current = event.touches?.[0]?.clientX ?? null;
  };
  const handlePanelTouchEnd = (event) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null) return;

    const endX = event.changedTouches?.[0]?.clientX ?? startX;
    const deltaX = endX - startX;
    if (Math.abs(deltaX) < 60) return;
    if (activePanel === 'home') {
      goToDeckPanel();
    } else {
      goToHomePanel();
    }
  };

  return (
    <main className="screen-wrap dashboard-wrap">
      <section
        className={`dashboard-shell card-shell dashboard-panel-${activePanel}`}
        aria-labelledby="dashboard-title"
        onTouchStart={handlePanelTouchStart}
        onTouchEnd={handlePanelTouchEnd}
      >
        <div className="dashboard-panel-track">
          <div className="dashboard-panel dashboard-home-panel">
            <div className="dashboard-top">
              <div>
                <p className="eyebrow2">ActSignLearn | ACADEMY DASHBOARD</p>
                <h1 id="dashboard-title" className="page-title">Welcome, {user.username}</h1>
                <p className="page-subtitle">
                  Pick up your plan, then slide over when you want the full deck library.
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
                {typeof onRetakeQuiz === 'function' ? (
                  <button type="button" className="ghost-btn" onClick={onRetakeQuiz}>Retake quiz</button>
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

            <section className="buddy-note dashboard-home-note" aria-labelledby="buddy-note-title">
              <div>
                <p className="eyebrow">Note from Ocean Buddies</p>
                <h2 id="buddy-note-title">A little current for today</h2>
              </div>
              <article className="tip-card buddy-note-card">
                <img src={buddyNote.sprite} alt="" aria-hidden="true" />
                <p><strong>{buddyNote.name}:</strong> {buddyNote.quote}</p>
              </article>
            </section>

            <PersonalizedPlanCard
              plan={personalizedPlan}
              learnerProfile={learnerProfile}
              planStarted={planStarted}
              generatingPlan={generatingPlan}
              onGeneratePlan={onGeneratePlan}
              onStartPlan={startPlanDeck}
            />
          </div>

          <div className="dashboard-panel dashboard-decks-panel" aria-label="Deck library">
            <DeckSection
              title="Academy Lessons"
              prompt={prompts.learn}
              decks={lessonDecks}
              type="learn"
              progress={safeProgress}
              onNavigate={onNavigate}
            />

            <DeckSection
              title="Practice Lagoon"
              prompt={prompts.practice}
              decks={practiceDecks}
              type="practice"
              progress={safeProgress}
              onNavigate={onNavigate}
            />

            <DeckSection
              title="Game Cove"
              prompt={prompts.games}
              decks={gameDecks}
              type="games"
              progress={safeProgress}
              onNavigate={onNavigate}
            />
          </div>
        </div>
        <button
          type="button"
          className="dashboard-panel-button dashboard-panel-next"
          onClick={goToDeckPanel}
          aria-label="Show lesson, practice, and game decks"
        >
          &gt;
        </button>
        <button
          type="button"
          className="dashboard-panel-button dashboard-panel-prev"
          onClick={goToHomePanel}
          aria-label="Back to welcome and plan"
        >
          &lt;
        </button>
        <button type="button" className="dashboard-explore-cue" onClick={goToDeckPanel}>
          {academyExploreCue}
        </button>
      </section>
    </main>
  );
}
