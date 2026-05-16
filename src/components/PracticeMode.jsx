import { useEffect, useRef, useState } from 'react';
import { ASL_HINTS } from '../data/aslData';

export default function PracticeMode({ letter, onNext }) {
  const [camOn, setCamOn] = useState(false);
  const [score, setScore] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

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

  useEffect(() => {
    let cancelled = false;

    const stopStream = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    const startStream = async () => {
      try {
        setCameraError('');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (error) {
        stopStream();
        setCameraError(error?.message || 'Unable to start the camera.');
        setCamOn(false);
      }
    };

    if (camOn) {
      startStream();
    } else {
      stopStream();
    }

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [camOn]);

  return (
    <div className="flash-wrap">
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ width: '100%', maxWidth: 1040, height: '72vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div className="cam-box" style={{ width: '100%', height: '100%', maxWidth: 'none', aspectRatio: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {camOn ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: '12px',
                    transform: 'scaleX(-1)',
                    background: '#000',
                  }}
                />
                <div style={{ position: 'absolute', top: 14, left: 14, padding: '8px 12px', borderRadius: 999, background: 'rgba(15,23,36,0.72)', color: 'white', fontSize: 12, letterSpacing: '0.06em' }}>
                  live camera
                </div>
                <div style={{ position: 'absolute', bottom: '18px', fontSize: '14px', color: 'var(--primary)', letterSpacing: '0.08em', opacity: 0.95, background: 'rgba(255,255,255,0.72)', padding: '8px 12px', borderRadius: 999 }}>
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
              {cameraError ? <div className="hint-text" style={{ color: '#c0392b', marginTop: 8 }}>{cameraError}</div> : null}
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
