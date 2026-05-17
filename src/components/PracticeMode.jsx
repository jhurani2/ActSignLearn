import { useEffect, useRef, useState } from 'react';
import { ASL_HINTS } from '../data/aslData';
import referencePoses from '../data/referencePoses';
import { HAND_LANDMARK_NAMES, compareLandmarkVectors } from '../utils/poseMath';
import { ensureMediapipeLoaded } from './gesture/mediapipe';

const FEEDBACK_HOLD_MS = 700;
const SCORE_SMOOTHING = 0.35;
const MASTERY_SCORE = 99;

export default function PracticeMode({ letter, onNext, onComplete }) {
  const [camOn, setCamOn] = useState(false);
  const [score, setScore] = useState(null);
  const [bestSessionScore, setBestSessionScore] = useState(null);
  const [poseFeedback, setPoseFeedback] = useState('Start the camera to begin.');
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const handsRef = useRef(null);
  const smoothedScoreRef = useRef(null);
  const bestSessionScoreRef = useRef(null);
  const feedbackAtRef = useRef(0);

  useEffect(() => {
    setScore(null);
    setBestSessionScore(null);
    setPoseFeedback('Start the camera to begin.');
    setCameraError('');
    smoothedScoreRef.current = null;
    bestSessionScoreRef.current = null;
    feedbackAtRef.current = 0;
  }, [letter]);

  const handleNext = async () => {
    const savedScore = Math.max(score || 0, bestSessionScoreRef.current || 0);
    if (typeof onComplete === 'function' && savedScore > 0) {
      await onComplete({ letter, score: savedScore });
    }
    setScore(null);
    setBestSessionScore(null);
    smoothedScoreRef.current = null;
    bestSessionScoreRef.current = null;
    setCamOn(false);
    onNext();
  };

  const effectiveScore = Math.max(score || 0, bestSessionScore || 0);
  const scoreMsg  = effectiveScore >= MASTERY_SCORE
    ? 'mastery match! save this attempt'
    : effectiveScore >= 85
    ? 'great form, keep it steady for mastery'
    : effectiveScore >= 70
    ? 'almost, check the red joints'
    : 'try adjusting the red joints';

  const getFeedbackForJoint = (jointName) => {
    if (jointName.includes('thumb')) {
      return 'Curl your thumb inward a little more.';
    }
    if (jointName.includes('index')) {
      return 'Straighten your index finger more.';
    }
    if (jointName.includes('middle')) {
      return 'Raise or straighten your middle finger.';
    }
    if (jointName.includes('ring')) {
      return 'Keep your ring finger straighter and relaxed.';
    }
    if (jointName.includes('pinky')) {
      return 'Tuck your pinky a bit closer.';
    }
    return 'Keep your wrist steadier inside the frame.';
  };

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
        await ensureMediapipeLoaded();
        const Camera = window.Camera;
        const Hands = window.Hands;
        const HAND_CONNECTIONS = window.HAND_CONNECTIONS;
        const drawConnectors = window.drawConnectors;

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

          const referenceVector = referencePoses[letter];
          const inFrameComparisons = [];

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

            const comparison = referenceVector ? compareLandmarkVectors(landmarks, referenceVector) : null;
            if (comparison) {
              inFrameComparisons.push({
                handIndex,
                landmarks,
                comparison,
                inFrame,
              });
            }

            const landmarkColors = comparison
              ? comparison.landmarkErrors.map((error) => (error > 0.16 ? '#ff5d5d' : '#b7ff72'))
              : landmarks.map(() => '#b7ff72');

            HAND_CONNECTIONS.forEach(([start, end]) => {
              const startError = comparison ? comparison.landmarkErrors[start] : 0;
              const endError = comparison ? comparison.landmarkErrors[end] : 0;
              const isOff = startError > 0.16 || endError > 0.16;
              const lineColor = isOff ? 'rgba(255, 93, 93, 1)' : 'rgba(110, 255, 136, 1)';

              drawConnectors(ctx, [landmarks[start], landmarks[end]], [[0, 1]], {
                color: 'rgba(0, 0, 0, 0.45)',
                lineWidth: 10,
              });
              drawConnectors(ctx, [landmarks[start], landmarks[end]], [[0, 1]], {
                color: lineColor,
                lineWidth: 5,
              });
            });

            landmarks.forEach((landmark, index) => {
              const x = landmark.x * canvas.width;
              const y = landmark.y * canvas.height;
              const dotColor = landmarkColors[index];

              ctx.beginPath();
              ctx.arc(x, y, 9, 0, Math.PI * 2);
              ctx.fillStyle = dotColor;
              ctx.shadowColor = dotColor;
              ctx.shadowBlur = 16;
              ctx.fill();

              ctx.shadowBlur = 0;
              ctx.lineWidth = 2.75;
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
              ctx.stroke();
            });

          });

          const bestMatch = inFrameComparisons
            .filter((item) => item.comparison && item.inFrame)
            .sort((a, b) => b.comparison.similarity - a.comparison.similarity)[0];

          const fallbackMatch = bestMatch || inFrameComparisons
            .filter((item) => item.comparison)
            .sort((a, b) => b.comparison.similarity - a.comparison.similarity)[0];

          if (fallbackMatch) {
            const scorePercent = Math.round(Math.max(0, Math.min(1, fallbackMatch.comparison.similarity)) * 100);
            const nextBestScore = Math.max(bestSessionScoreRef.current || 0, scorePercent);
            bestSessionScoreRef.current = nextBestScore;
            setBestSessionScore(nextBestScore);

            const previousScore = smoothedScoreRef.current;
            const smoothedScore = previousScore === null
              ? scorePercent
              : Math.round((previousScore * (1 - SCORE_SMOOTHING)) + (scorePercent * SCORE_SMOOTHING));
            smoothedScoreRef.current = smoothedScore;
            setScore(smoothedScore);

            const worstJointIndex = fallbackMatch.comparison.landmarkErrors.reduce(
              (worstIndex, currentError, index) => (
                currentError > fallbackMatch.comparison.landmarkErrors[worstIndex] ? index : worstIndex
              ),
              0
            );
            const worstJointName = HAND_LANDMARK_NAMES[worstJointIndex] || 'wrist';
            const nextFeedback = scorePercent >= MASTERY_SCORE
              ? 'Excellent match. This one can count as mastered.'
              : scorePercent >= 85
              ? 'Great match. Hold that shape steady.'
              : getFeedbackForJoint(worstJointName);
            const now = performance.now();
            if (scorePercent >= MASTERY_SCORE || now - feedbackAtRef.current > FEEDBACK_HOLD_MS) {
              setPoseFeedback(nextFeedback);
              feedbackAtRef.current = now;
            }
          } else if (camOn) {
            if (smoothedScoreRef.current === null) {
              setScore(null);
              setPoseFeedback('Keep your hand inside the green frame.');
            }
          }

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
  }, [camOn, letter]);

  return (
    <div className="practice-mode">
      <section className="practice-camera-card card" aria-label="Practice camera">
        <div className="practice-camera-frame">
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
                className="practice-video"
              />
              <canvas ref={canvasRef} className="practice-canvas" />
              <div className="camera-guide-frame" />
              <div className="camera-live-badge">Live camera</div>
            </>
          ) : (
            <div className="camera-empty">
              <span className="camera-empty-icon" aria-hidden="true" />
              <span>Camera off</span>
            </div>
          )}
        </div>
      </section>

      <aside className="practice-sidebar">
        <div className="practice-letter-card card">
          <div className="practice-letter">{letter}</div>
        </div>

        <div className="feedback-card card">
          <div className="section-label">feedback</div>

          {score !== null ? (
            <div className="feedback-stack">
              <div className="score-ring">{score}%</div>
              <div className="feedback-summary">{scoreMsg}</div>
              {bestSessionScore !== null ? (
                <div className="best-score">Best read this round: {bestSessionScore}%</div>
              ) : null}
              <div className="hint-text">{poseFeedback}</div>
              <button className="primary-btn" type="button" onClick={handleNext}>
                Save attempt and next
              </button>
            </div>
          ) : (
            <div className="feedback-stack">
              <div className="hint-text">{camOn ? poseFeedback : 'start the camera to begin'}</div>
              {cameraError ? <div className="hint-text error-text">{cameraError}</div> : null}
            </div>
          )}

          <div className="tip-block">
            <div className="section-label">tip</div>
            <div className="hint-text">{ASL_HINTS[letter]}</div>
          </div>

          <div className="camera-actions">
            <button
              type="button"
              className={camOn ? 'ghost-btn' : 'primary-btn'}
              onClick={() => {
                setCamOn((current) => !current);
                setScore(null);
                setBestSessionScore(null);
                smoothedScoreRef.current = null;
                bestSessionScoreRef.current = null;
              }}
            >
              {camOn ? 'Stop camera' : 'Start'}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
