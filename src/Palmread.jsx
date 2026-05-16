import { useState, useEffect } from 'react';
import LearnMode from './components/LearnMode';
import PracticeMode from './components/PracticeMode';
import { LETTERS } from './data/aslData';
import './styles.css';

export default function Palmread() {
  const [mode, setMode] = useState('learn');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [animating, setAnimating] = useState(false);

  const currentLetter = LETTERS[currentIdx];

  const navigate = (delta) => {
    setAnimating(true);
    setTimeout(() => {
      setCurrentIdx((i) => (i + delta + LETTERS.length) % LETTERS.length);
      setAnimating(false);
    }, 220);
  };

  const jumpTo = (i) => {
    setAnimating(true);
    setTimeout(() => { setCurrentIdx(i); setAnimating(false); }, 220);
  };

  const markPracticed = (letter) => {
    // placeholder if you want to track mastery later
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight') navigate(1);
      if (e.key === 'ArrowLeft')  navigate(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <span className="logo-name">palmread</span>
          <span className="logo-sub">asl trainer</span>
        </div>

        <div className="toggle-pill">
          <button
            className={`toggle-btn ${mode === 'learn' ? 'active' : ''}`}
            onClick={() => setMode('learn')}
          >
            learn
          </button>
          <button
            className={`toggle-btn ${mode === 'practice' ? 'active' : ''}`}
            onClick={() => setMode('practice')}
          >
            practice
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="main">
        <div style={{ width: '100%', display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}>
            {mode === 'learn' ? (
              <LearnMode
                letter={currentLetter}
                onPractice={() => setMode('practice')}
                onPrev={() => navigate(-1)}
                onNext={() => navigate(1)}
              />
            ) : (
              <PracticeMode
                letter={currentLetter}
                onNext={() => { markPracticed(currentLetter); navigate(1); }}
              />
            )}
        </div>
      </main>
    </div>
  );
}
