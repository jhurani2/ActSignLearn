import { useState } from 'react';
import { ASL_HINTS } from '../data/aslData';

export default function PracticeMode({ letter, onNext }) {
  const [camOn, setCamOn] = useState(false);
  const [score, setScore] = useState(null);

  // TODO: replace with real MediaPipe + TF.js classifier
  const simulateFeedback = () => {
    const s = Math.floor(72 + Math.random() * 27);
    setScore(s);
  };

  const handleNext = () => {
    setScore(null);
    setCamOn(false);
    onNext();
  };

  const scoreColor = score >= 85 ? '#7bc96f' : score >= 70 ? '#c8a96e' : '#e07070';
  const scoreBg   = score >= 85 ? '#1e2e1a' : score >= 70 ? '#2a2010' : '#2a1010';
  const scoreBdr  = score >= 85 ? '#3a5c32' : score >= 70 ? '#5c4a1a' : '#5c2a2a';
  const scoreMsg  = score >= 85
    ? 'great form! move to next letter'
    : score >= 70
    ? 'almost — check your thumb position'
    : 'try adjusting your finger curl';

  return (
    <div className="flash-wrap">
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ width: '100%', maxWidth: 920, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div className="cam-box" style={{ width: '100%', height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {camOn ? (
              <>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(122,162,247,0.06) 0%, transparent 100%)' }} />
                <svg viewBox="0 0 200 200" width="200" height="200" style={{ position: 'relative', zIndex: 1 }}>
                  <line x1="100" y1="180" x2="100" y2="120" stroke="#0b8a5f" strokeWidth="2" opacity="0.8"/>
                  <circle cx="100" cy="120" r="6" fill="#0b8a5f" opacity="0.6"/>
                </svg>
                <div style={{ position: 'absolute', bottom: '18px', fontSize: '14px', color: 'var(--primary)', letterSpacing: '0.08em', opacity: 0.95 }}>
                  hand detected
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '68px', opacity: 0.08 }}>◉</div>
                <div style={{ fontSize: '16px', color: 'var(--muted)', letterSpacing: '0.06em' }}>camera off</div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ width: 420, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="flash-card card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220 }}>
          <div style={{ fontSize: 80, fontWeight: 800 }}>{letter}</div>
        </div>

        <div className="card">
          <div className="section-label">feedback</div>

          {score !== null ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <div style={{ width: '96px', height: '96px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '28px', border: `2px solid transparent`, background: 'var(--glass)', color: 'var(--text)' }}>{score}%</div>
              <div style={{ color: 'var(--muted)' }}>{scoreMsg}</div>
              {score >= 85 && (
                <button className="primary-btn" onClick={handleNext} style={{ width: '100%' }}>
                  next →
                </button>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div className="hint-text">{camOn ? 'show your hand & press check sign' : 'start the camera to begin'}</div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>tip</div>
            <div className="hint-text">{ASL_HINTS[letter]}</div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className={camOn ? 'ghost-btn' : 'primary-btn'} onClick={() => { setCamOn(c => !c); setScore(null); }}>{camOn ? 'stop camera' : 'start camera'}</button>
            {camOn && <button className="primary-btn" onClick={simulateFeedback}>check sign</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
