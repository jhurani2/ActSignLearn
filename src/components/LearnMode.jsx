import { ASL_HINTS, getSteps } from '../data/aslData';
import ModelViewer from './ModelViewer';

export default function LearnMode({ letter, onPractice, onPrev, onNext }) {
  const steps = getSteps(letter);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <div className="card" style={{ width: '100%', maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
        <div style={{ width: '100%', display: 'flex', gap: 28, alignItems: 'flex-start', justifyContent: 'center', padding: '36px 18px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 'clamp(140px,20vw,240px)', fontWeight: 900 }}>{letter}</div>
          </div>

          <div style={{ width: 480, maxWidth: '48%', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ModelViewer letter={letter}>
                <div style={{ fontSize: 18, color: 'var(--muted)' }}>model placeholder</div>
              </ModelViewer>
            </div>

            <div>
              <div className="section-label">how to sign it</div>
              <div className="steps" style={{ marginTop: 10 }}>
                {steps.map((step, i) => (
                  <div key={i} className="step">
                    <div className="num">{i + 1}</div>
                    <div className="hint-text">{step}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ width: '100%', display: 'flex', justifyContent: 'center', paddingBottom: 18 }}>
          <button className="primary-btn big-btn" onClick={onPractice}>practice this sign</button>
        </div>
      </div>

      <div className="nav-controls">
        <button className="ghost-btn big-btn" onClick={onPrev}>← previous</button>
        <button className="ghost-btn big-btn" onClick={onNext}>next →</button>
      </div>
    </div>
  );
}
