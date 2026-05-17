import { getSteps } from '../data/aslData';
import ModelViewer from './ModelViewer';

export default function LearnMode({ letter, onPractice, onPrev, onNext }) {
  const steps = getSteps(letter);
  const useRemoteIconScout = process.env.REACT_APP_USE_ICONSCOUT_REMOTE === 'true';
  const remoteModelUrl = useRemoteIconScout
    ? `/api/iconscout/letter/${encodeURIComponent(letter)}/download`
    : null;

  return (
    <div className="learn-mode">
      <div className="learn-card card">
        <div className="learn-layout">
          <div className="learn-letter-panel">
            <div className="learn-letter">{letter}</div>
            <p>Current sign</p>
          </div>

          <div className="learn-side-panel">
            <div className="learn-model-card">
              <ModelViewer letter={letter} modelUrl={remoteModelUrl} />
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

        <div className="learn-actions">
          <button className="primary-btn big-btn" type="button" onClick={onPractice}>Practice this sign</button>
        </div>
      </div>

      <div className="nav-controls">
        <button className="ghost-btn big-btn" type="button" onClick={onPrev}>Previous</button>
        <button className="ghost-btn big-btn" type="button" onClick={onNext}>Next</button>
      </div>
    </div>
  );
}
