import { useEffect, useRef, useState } from 'react';
import { Camera } from '@mediapipe/camera_utils';
import { Hands } from '@mediapipe/hands';
import { drawConnectors } from '@mediapipe/drawing_utils';
import { ASL_HINTS } from '../data/aslData';

export default function PracticeMode({ letter, onNext }) {
  const [camOn, setCamOn] = useState(false);
  const [score, setScore] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const handsRef = useRef(null);

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
    const detectionFrame = { xMin: 0.14, xMax: 0.86, yMin: 0.12, yMax: 0.9 };

    const stopStream = () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      if (handsRef.current) {
        handsRef.current.close?.();
        handsRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    const startStream = async () => {
      try {
        setCameraError('');
        const hands = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });

        hands.onResults((results) => {
          const canvas = canvasRef.current;
          const video = videoRef.current;
          if (!canvas || !video) return;

          if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth || 1280;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight || 720;

          const ctx = canvas.getContext('2d');
          ctx.save();
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          results.multiHandLandmarks?.forEach((landmarks, handIndex) => {
            const centroid = landmarks.reduce(
              (acc, point) => ({
                x: acc.x + point.x / landmarks.length,
                y: acc.y + point.y / landmarks.length,
              }),
              { x: 0, y: 0 }
            );

            const inFrame =
              centroid.x >= detectionFrame.xMin &&
              centroid.x <= detectionFrame.xMax &&
              centroid.y >= detectionFrame.yMin &&
              centroid.y <= detectionFrame.yMax;

            if (!inFrame) return;

            const points63 = landmarks.flatMap((point) => [point.x, point.y, point.z]);
            console.log(`hand ${handIndex + 1} 63 landmark values`, points63);

            drawConnectors(ctx, landmarks, Hands.HAND_CONNECTIONS, {
              color: 'rgba(0, 0, 0, 0.45)',
              lineWidth: 10,
            });
            drawConnectors(ctx, landmarks, Hands.HAND_CONNECTIONS, {
              color: 'rgba(110, 255, 136, 1)',
              lineWidth: 5,
            });

            landmarks.forEach((landmark) => {
              const x = landmark.x * canvas.width;
              const y = landmark.y * canvas.height;

              ctx.beginPath();
              ctx.arc(x, y, 9, 0, Math.PI * 2);
              ctx.fillStyle = '#d9ff8f';
              ctx.shadowColor = 'rgba(110, 255, 136, 1)';
              ctx.shadowBlur = 16;
              ctx.fill();

              ctx.shadowBlur = 0;
              ctx.lineWidth = 2.75;
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
              ctx.stroke();
            });
          });

          ctx.restore();
        });

        handsRef.current = hands;

        if (!videoRef.current) {
          throw new Error('Camera video element is not ready yet.');
        }

        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (!cancelled && handsRef.current && videoRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 1280,
          height: 720,
        });

        cameraRef.current = camera;
        await camera.start();
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
                  onLoadedMetadata={() => {
                    const canvas = canvasRef.current;
                    if (canvas && videoRef.current) {
                      canvas.width = videoRef.current.videoWidth || 1280;
                      canvas.height = videoRef.current.videoHeight || 720;
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: '12px',
                    transform: 'scaleX(-1)',
                    background: '#000',
                  }}
                />
                <canvas
                  ref={canvasRef}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    transform: 'scaleX(-1)',
                    pointerEvents: 'none',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: '12% 14%',
                    borderRadius: 20,
                    border: '2px solid rgba(110, 255, 136, 0.9)',
                    boxShadow: '0 0 0 9999px rgba(15, 23, 36, 0.12) inset, 0 0 24px rgba(110, 255, 136, 0.18)',
                    pointerEvents: 'none',
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
