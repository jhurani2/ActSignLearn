import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LearnMode from './components/LearnMode';
import PracticeMode from './components/PracticeMode';
import SignDuelMode from './components/SignDuelMode';
import SpeedSignMode from './components/SpeedSignMode';
import { LETTERS } from './data/aslData';

function SignIndex({ letters, currentIdx, progress, onSelect }) {
  const learned = useMemo(() => new Set(progress?.learnedLetters || []), [progress]);
  const mastered = useMemo(() => new Set(progress?.masteredLetters || []), [progress]);
  const practiceCounts = progress?.practiceCounts || {};
  const bestScores = progress?.bestScores || {};

  return (
    <section className="sign-index card" aria-labelledby="sign-index-title">
      <div className="sign-index-header">
        <div>
          <p className="eyebrow">Alphabet Index</p>
          <h2 id="sign-index-title">Jump to any sign</h2>
        </div>
        <p>Covered signs are highlighted. A sign is mastered after one 99%+ practice score.</p>
      </div>
      <div className="sign-index-grid">
        {letters.map((letter, index) => {
          const count = Number(practiceCounts[letter] || 0);
          const statusClass = mastered.has(letter)
            ? 'mastered'
            : count > 0
            ? 'practiced'
            : learned.has(letter)
            ? 'learned'
            : '';

          return (
            <button
              key={letter}
              type="button"
              className={`index-letter ${statusClass} ${index === currentIdx ? 'active' : ''}`}
              onClick={() => onSelect(index)}
              title={`${letter}: ${learned.has(letter) ? 'covered' : 'not covered'}, best score ${bestScores[letter] || 0}%`}
              aria-label={`${letter}. ${learned.has(letter) ? 'Covered' : 'Not covered'}. Best score ${bestScores[letter] || 0} percent.`}
            >
              <span>{letter}</span>
              {count > 0 ? <small>{count}</small> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function UnsupportedDeckNotice({ deck }) {
  return (
    <section className="deck-unavailable-card card" aria-labelledby="deck-unavailable-title">
      <p className="eyebrow">Unlocked Set</p>
      <h2 id="deck-unavailable-title">{deck?.title || 'This deck'} is ready for later</h2>
      <p className="hint-text">
        You unlocked this set, but its sign images, camera references, and lesson steps are not in the app yet.
        Your progress is safe; the deck will become playable as soon as that ASL dataset is added.
      </p>
    </section>
  );
}

export default function ActSignLearnStudio({
  user,
  progress,
  activeDeck,
  initialMode = 'learn',
  onBackToDashboard,
  onMarkLearned,
  onPracticeComplete,
}) {
  const [mode, setMode] = useState(initialMode);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [savingProgress, setSavingProgress] = useState(false);
  const learnedInSessionRef = useRef(new Set());
  const isSpeedSign = activeDeck?.gameMode === 'speed-sign';
  const isSignDuel = activeDeck?.gameMode === 'sign-duel';
  const isGameMode = isSpeedSign || isSignDuel;

  const deckLetters = useMemo(() => {
    if (!activeDeck) return LETTERS;
    return (activeDeck.items || []).filter((item) => /^[A-Z]$/.test(item));
  }, [activeDeck]);
  const activeItems = activeDeck?.items || LETTERS;
  const isUnsupportedDeck = Boolean(
    activeDeck &&
    !isGameMode &&
    (
      !['learn', 'practice'].includes(activeDeck.mode) ||
      !deckLetters.length ||
      deckLetters.length !== activeItems.length
    )
  );
  const currentLetter = deckLetters[currentIdx] || deckLetters[0] || 'A';
  const previousBestScore = Number(progress?.bestScores?.[currentLetter] || 0);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setCurrentIdx(0);
  }, [activeDeck]);

  useEffect(() => {
    if (mode !== 'learn') return;
    if (isUnsupportedDeck) return;
    if (learnedInSessionRef.current.has(currentLetter)) return;

    learnedInSessionRef.current.add(currentLetter);
    if (typeof onMarkLearned === 'function') {
      onMarkLearned(currentLetter).catch(() => {
        // Keep the lesson smooth even if a progress request fails.
      });
    }
  }, [isUnsupportedDeck, mode, currentLetter, onMarkLearned]);

  const navigate = useCallback((delta) => {
    if (!deckLetters.length) return;
    setCurrentIdx((index) => (index + delta + deckLetters.length) % deckLetters.length);
  }, [deckLetters.length]);

  useEffect(() => {
    const handler = (event) => {
      if (isGameMode || isUnsupportedDeck) return;
      if (event.key === 'ArrowRight') navigate(1);
      if (event.key === 'ArrowLeft') navigate(-1);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isGameMode, isUnsupportedDeck, navigate]);

  const handlePracticeComplete = async ({ letter, score }) => {
    if (typeof onPracticeComplete !== 'function') return;
    setSavingProgress(true);
    try {
      await onPracticeComplete({
        letter,
        score,
        passed: score >= 99,
      });
    } finally {
      setSavingProgress(false);
    }
  };

  const handleSpeedSignRoundComplete = async ({ correctLetters }) => {
    if (typeof onPracticeComplete !== 'function') return;

    const entries = Object.entries(correctLetters || {});
    if (!entries.length) return;

    setSavingProgress(true);
    try {
      for (const [letter, score] of entries) {
        await onPracticeComplete({
          letter,
          score,
          passed: score >= 99,
        });
      }
    } finally {
      setSavingProgress(false);
    }
  };

  return (
    <main className={`screen-wrap ${isSignDuel ? 'duel-screen-wrap' : ''}`}>
      <section className="studio-shell card-shell" aria-label="Learning studio">
        <header className="studio-header">
          <div>
            <p className="eyebrow">{isGameMode ? activeDeck?.title : activeDeck?.title || 'Learning Studio'}</p>
            <h1 className="page-title">Hi {user?.username}, let&apos;s sign underwater</h1>
          </div>
          <div className="studio-actions">
            <button type="button" className="ghost-btn" onClick={onBackToDashboard}>Back to Dashboard</button>
            {isGameMode || isUnsupportedDeck ? (
              <div className="game-rules-pill">
                {isSignDuel ? 'First to 5 wins' : isSpeedSign ? '95% match counts' : 'Deck unlocked'}
              </div>
            ) : (
              <div className="toggle-pill" role="tablist" aria-label="Learning mode">
                <button
                  className={`toggle-btn ${mode === 'learn' ? 'active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={mode === 'learn'}
                  onClick={() => setMode('learn')}
                >
                  Learn
                </button>
                <button
                  className={`toggle-btn ${mode === 'practice' ? 'active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={mode === 'practice'}
                  onClick={() => setMode('practice')}
                >
                  Practice
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="studio-body">
          {isUnsupportedDeck ? (
            <UnsupportedDeckNotice deck={activeDeck} />
          ) : isSpeedSign ? (
            <SpeedSignMode
              user={user}
              letters={deckLetters}
              onRoundComplete={handleSpeedSignRoundComplete}
            />
          ) : isSignDuel ? (
            <SignDuelMode
              letters={deckLetters}
              onMatchComplete={handleSpeedSignRoundComplete}
            />
          ) : mode === 'learn' ? (
            <LearnMode
              letter={currentLetter}
              onPractice={() => setMode('practice')}
              onPrev={() => navigate(-1)}
              onNext={() => navigate(1)}
            />
          ) : (
            <PracticeMode
              letter={currentLetter}
              previousBestScore={previousBestScore}
              onNext={() => navigate(1)}
              onComplete={handlePracticeComplete}
            />
          )}
        </div>

        {savingProgress ? <p className="saving-progress">Saving progress...</p> : null}
        {!isGameMode && !isUnsupportedDeck ? (
          <SignIndex
            letters={deckLetters}
            currentIdx={currentIdx}
            progress={progress}
            onSelect={setCurrentIdx}
          />
        ) : null}
      </section>
    </main>
  );
}
