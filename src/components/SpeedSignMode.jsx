import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ASL_HINTS, LETTERS } from '../data/aslData';
import { OCEAN_BUDDIES } from '../data/decks';
import referencePoses from '../data/referencePoses';
import { HAND_LANDMARK_NAMES, compareLandmarkVectors } from '../utils/poseMath';
import { ensureMediapipeLoaded } from '../utils/mediapipeLoader';

const ROUND_OPTIONS = [
  { seconds: 30, label: '30 sec', description: 'Warm-up sprint' },
  { seconds: 45, label: '45 sec', description: 'Steady rush' },
  { seconds: 60, label: '60 sec', description: 'Classic round' },
  { seconds: 90, label: '90 sec', description: 'Endurance run' },
];

const PASS_SCORE = 95;
const SCORE_SMOOTHING = 0.28;
const CORRECT_COOLDOWN_MS = 850;
const FEEDBACK_HOLD_MS = 620;
const LANDMARK_ERROR_THRESHOLD = 0.18;

function shuffleLetters(letters, previousLetter) {
  const shuffled = [...letters];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  if (shuffled.length > 1 && shuffled[0] === previousLetter) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }

  return shuffled;
}

function getFeedbackForJoint(jointName) {
  if (jointName.includes('thumb')) return 'Thumb check: tuck or open it just a little.';
  if (jointName.includes('index')) return 'Index finger is the clue. Shape it clearly.';
  if (jointName.includes('middle')) return 'Middle finger needs a cleaner line.';
  if (jointName.includes('ring')) return 'Ring finger is drifting. Bring it with the group.';
  if (jointName.includes('pinky')) return 'Pinky is the sneaky one. Set it carefully.';
  return 'Center your hand in the green frame.';
}

function getCoachMessage(streak, letter) {
  if (streak >= 8) return `Streak ${streak}. You are flying through these signs.`;
  if (streak >= 5) return `Five-plus streak. Keep the ${letter} energy steady.`;
  if (streak >= 3) return `Three in a row. Smooth hands, quick eyes.`;
  return `${letter} counted. Breathe once and catch the next prompt.`;
}

function getFinishMessage(correctCount, bestStreak) {
  if (correctCount === 0) return 'Round complete. Start with slow shapes, then speed comes along.';
  if (bestStreak >= 8) return `Round complete. Best streak ${bestStreak}. That was a real rush.`;
  if (correctCount >= 10) return `Round complete. ${correctCount} correct signs is a strong run.`;
  return `Round complete. ${correctCount} correct. Nice foundation for the next round.`;
}

export default function SpeedSignMode({ user, letters = LETTERS, onRoundComplete }) {
  const [roundSeconds, setRoundSeconds] = useState(45);
  const [status, setStatus] = useState('setup');
  const [timeLeft, setTimeLeft] = useState(45);
  const [currentLetter, setCurrentLetter] = useState('A');
  const [liveScore, setLiveScore] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [skipCount, setSkipCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedback, setFeedback] = useState('Choose a round, then start the camera.');
  const [coachMessage, setCoachMessage] = useState('I will call the letters. You make the signs.');
  const [cameraError, setCameraError] = useState('');
  const [savingRound, setSavingRound] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const handsRef = useRef(null);
  const statusRef = useRef(status);
  const activeLettersRef = useRef(letters);
  const currentLetterRef = useRef(currentLetter);
  const letterQueueRef = useRef([]);
  const lastCorrectAtRef = useRef(0);
  const feedbackAtRef = useRef(0);
  const smoothedScoreRef = useRef(null);
  const correctCountRef = useRef(0);
  const bestStreakRef = useRef(0);
  const correctLetterScoresRef = useRef({});

  const activeLetters = useMemo(() => {
    const allowed = letters.filter((letter) => /^[A-Z]$/.test(letter));
    return allowed.length ? allowed : LETTERS;
  }, [letters]);

  const coach = useMemo(
    () => OCEAN_BUDDIES.find((buddy) => buddy.id === user?.avatar) || OCEAN_BUDDIES[1] || OCEAN_BUDDIES[0],
    [user]
  );

  const progressPercent = roundSeconds > 0 ? Math.max(0, Math.min(100, (timeLeft / roundSeconds) * 100)) : 0;
  const isCameraActive = status === 'starting' || status === 'running';
  const canChangeSetup = status === 'setup' || status === 'finished';

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    activeLettersRef.current = activeLetters;
    if (statusRef.current === 'setup' || statusRef.current === 'finished') {
      const nextLetter = activeLetters[0] || 'A';
      currentLetterRef.current = nextLetter;
      setCurrentLetter(nextLetter);
    }
  }, [activeLetters]);

  useEffect(() => {
    currentLetterRef.current = currentLetter;
  }, [currentLetter]);

  const chooseNextLetter = useCallback((previousLetter = currentLetterRef.current) => {
    const pool = activeLettersRef.current.length ? activeLettersRef.current : LETTERS;
    if (!letterQueueRef.current.length) {
      letterQueueRef.current = shuffleLetters(pool, previousLetter);
    }

    const nextLetter = letterQueueRef.current.shift() || pool[0] || 'A';
    currentLetterRef.current = nextLetter;
    smoothedScoreRef.current = null;
    setCurrentLetter(nextLetter);
    setLiveScore(null);
    setFeedback(`Make ${nextLetter}. ${ASL_HINTS[nextLetter] || 'Hold the shape clearly.'}`);
    setLiveAnnouncement(`Next letter ${nextLetter}`);
  }, []);

  const finishRound = useCallback(async () => {
    if (statusRef.current === 'setup' || statusRef.current === 'finished') return;

    statusRef.current = 'finished';
    setStatus('finished');
    setLiveScore(null);
    setFeedback('Round finished. Review your score, then run it back.');
    setCoachMessage(getFinishMessage(correctCountRef.current, bestStreakRef.current));
    setLiveAnnouncement(`Round complete. ${correctCountRef.current} correct signs.`);

    const correctLetters = { ...correctLetterScoresRef.current };
    if (!Object.keys(correctLetters).length || typeof onRoundComplete !== 'function') return;

    setSavingRound(true);
    try {
      await onRoundComplete({
        correctLetters,
        correctCount: correctCountRef.current,
        bestStreak: bestStreakRef.current,
        seconds: roundSeconds,
      });
    } catch {
      setCameraError('Round finished, but progress could not be saved.');
    } finally {
      setSavingRound(false);
    }
  }, [onRoundComplete, roundSeconds]);

  const markCorrect = useCallback((letter, scorePercent) => {
    const now = performance.now();
    if (statusRef.current !== 'running' || now - lastCorrectAtRef.current < CORRECT_COOLDOWN_MS) return;

    lastCorrectAtRef.current = now;
    correctLetterScoresRef.current = {
      ...correctLetterScoresRef.current,
      [letter]: Math.max(correctLetterScoresRef.current[letter] || 0, scorePercent),
    };

    const nextCount = correctCountRef.current + 1;
    correctCountRef.current = nextCount;
    setCorrectCount(nextCount);

    setStreak((currentStreak) => {
      const nextStreak = currentStreak + 1;
      bestStreakRef.current = Math.max(bestStreakRef.current, nextStreak);
      setBestStreak(bestStreakRef.current);
      setCoachMessage(getCoachMessage(nextStreak, letter));
      return nextStreak;
    });

    setFeedback(`${letter} counted at ${scorePercent}%. Next one.`);
    setLiveAnnouncement(`${letter} correct at ${scorePercent} percent.`);
    chooseNextLetter(letter);
  }, [chooseNextLetter]);

  const startRound = () => {
    letterQueueRef.current = [];
    correctLetterScoresRef.current = {};
    correctCountRef.current = 0;
    bestStreakRef.current = 0;
    smoothedScoreRef.current = null;
    lastCorrectAtRef.current = 0;
    feedbackAtRef.current = 0;

    setTimeLeft(roundSeconds);
    setCorrectCount(0);
    setSkipCount(0);
    setStreak(0);
    setBestStreak(0);
    setLiveScore(null);
    setCameraError('');
    setSavingRound(false);
    setCoachMessage('Camera on. I will cheer the streaks.');
    setFeedback('Starting camera...');
    chooseNextLetter('');
    setStatus('starting');
  };

  const stopRound = () => {
    finishRound();
  };

  const skipLetter = () => {
    if (status !== 'running' && status !== 'starting') return;
    setSkipCount((count) => count + 1);
    setStreak(0);
    lastCorrectAtRef.current = performance.now();
    setCoachMessage('Good skip. Keep the round moving.');
    chooseNextLetter(currentLetterRef.current);
  };

  useEffect(() => {
    if (status !== 'running') return undefined;

    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          finishRound();
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [finishRound, status]);

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
          minDetectionConfidence: 0.58,
          minTrackingConfidence: 0.58,
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

          const activeLetter = currentLetterRef.current;
          const referenceVector = referencePoses[activeLetter];
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

            if (!inFrame) return;

            const comparison = referenceVector ? compareLandmarkVectors(landmarks, referenceVector) : null;
            if (comparison) {
              inFrameComparisons.push({ handIndex, landmarks, comparison });
            }

            const landmarkColors = comparison
              ? comparison.landmarkErrors.map((error) => (error > LANDMARK_ERROR_THRESHOLD ? '#ff6b7a' : '#9dff8d'))
              : landmarks.map(() => '#9dff8d');

            HAND_CONNECTIONS.forEach(([start, end]) => {
              const startError = comparison ? comparison.landmarkErrors[start] : 0;
              const endError = comparison ? comparison.landmarkErrors[end] : 0;
              const isOff = startError > LANDMARK_ERROR_THRESHOLD || endError > LANDMARK_ERROR_THRESHOLD;
              const lineColor = isOff ? 'rgba(255, 107, 122, 1)' : 'rgba(157, 255, 141, 1)';

              drawConnectors(ctx, [landmarks[start], landmarks[end]], [[0, 1]], {
                color: 'rgba(1, 12, 26, 0.55)',
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
              ctx.arc(x, y, 8, 0, Math.PI * 2);
              ctx.fillStyle = dotColor;
              ctx.shadowColor = dotColor;
              ctx.shadowBlur = 14;
              ctx.fill();
              ctx.shadowBlur = 0;
              ctx.lineWidth = 2.5;
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.94)';
              ctx.stroke();
            });
          });

          const bestMatch = inFrameComparisons
            .filter((item) => item.comparison)
            .sort((a, b) => b.comparison.similarity - a.comparison.similarity)[0];

          if (bestMatch) {
            const scorePercent = Math.round(Math.max(0, Math.min(1, bestMatch.comparison.similarity)) * 100);
            const previousScore = smoothedScoreRef.current;
            const smoothedScore = previousScore === null
              ? scorePercent
              : Math.round((previousScore * (1 - SCORE_SMOOTHING)) + (scorePercent * SCORE_SMOOTHING));
            smoothedScoreRef.current = smoothedScore;
            setLiveScore(smoothedScore);

            if (scorePercent >= PASS_SCORE) {
              markCorrect(activeLetter, scorePercent);
            } else if (statusRef.current === 'running') {
              const worstJointIndex = bestMatch.comparison.landmarkErrors.reduce(
                (worstIndex, currentError, index) => (
                  currentError > bestMatch.comparison.landmarkErrors[worstIndex] ? index : worstIndex
                ),
                0
              );
              const now = performance.now();
              if (now - feedbackAtRef.current > FEEDBACK_HOLD_MS) {
                const jointName = HAND_LANDMARK_NAMES[worstJointIndex] || 'wrist';
                setFeedback(
                  scorePercent >= 88
                    ? `So close at ${scorePercent}%. Hold ${activeLetter} steady.`
                    : getFeedbackForJoint(jointName)
                );
                feedbackAtRef.current = now;
              }
            }
          } else if (statusRef.current === 'running' && smoothedScoreRef.current === null) {
            setLiveScore(null);
            setFeedback('Bring your hand into the green frame.');
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
        if (!cancelled) {
          setStatus('running');
          setFeedback(`Make ${currentLetterRef.current}. ${ASL_HINTS[currentLetterRef.current] || ''}`);
        }
      } catch (error) {
        stopStream();
        setCameraError(error?.message || 'Unable to start the camera.');
        setStatus('setup');
        setFeedback('Camera could not start. Check browser permission and try again.');
      }
    };

    if (isCameraActive) {
      startStream();
    } else {
      stopStream();
    }

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [isCameraActive, markCorrect]);

  return (
    <div className="speed-sign-mode">
      <section className="speed-setup-card card" aria-labelledby="speed-sign-title">
        <div>
          <p className="eyebrow">SpeedSign</p>
          <h2 id="speed-sign-title">Timed ASL letter rush</h2>
          <p className="hint-text">A sign counts when the camera reads {PASS_SCORE}% or higher. Move quickly, but keep the hand shape clear.</p>
        </div>

        <div className="speed-setup-controls">
          <div className="speed-option-group" role="radiogroup" aria-label="Round length">
            {ROUND_OPTIONS.map((option) => (
              <button
                key={option.seconds}
                type="button"
                className={`speed-option ${roundSeconds === option.seconds ? 'active' : ''}`}
                aria-pressed={roundSeconds === option.seconds}
                disabled={!canChangeSetup}
                onClick={() => {
                  setRoundSeconds(option.seconds);
                  setTimeLeft(option.seconds);
                }}
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="speed-game-grid">
        <section className="speed-camera-card card" aria-label="SpeedSign camera">
          <div className="speed-camera-topline">
            <div className="speed-timer" aria-label={`${timeLeft} seconds left`}>
              <strong>{timeLeft}</strong>
              <span>seconds</span>
            </div>
            <div className="speed-meter" aria-hidden="true">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="speed-live-score">
              <strong>{liveScore !== null ? `${liveScore}%` : '--'}</strong>
              <span>live match</span>
            </div>
          </div>

          <div className="practice-camera-frame speed-camera-frame">
            {isCameraActive ? (
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
                <div className="camera-live-badge">{status === 'starting' ? 'Starting camera' : 'Speed round live'}</div>
              </>
            ) : (
              <div className="camera-empty">
                <span className="camera-empty-icon" aria-hidden="true" />
                <span>{status === 'finished' ? 'Round finished' : 'Camera off'}</span>
              </div>
            )}
          </div>

          {cameraError ? <p className="hint-text error-text speed-error" role="status">{cameraError}</p> : null}
        </section>

        <aside className="speed-hud" aria-label="SpeedSign prompt and score">
          <div className="speed-prompt-card card">
            <div className="section-label">current prompt</div>
            <div className="speed-prompt-letter">{currentLetter}</div>
            <p className="hint-text">
              {status === 'setup'
                ? 'Start the round to get live hints.'
                : ASL_HINTS[currentLetter] || 'Hold the shape clearly.'}
            </p>
          </div>

          <div className="speed-score-card card">
            <div className="speed-stat-grid">
              <div>
                <strong>{correctCount}</strong>
                <span>correct</span>
              </div>
              <div>
                <strong>{streak}</strong>
                <span>streak</span>
              </div>
              <div>
                <strong>{bestStreak}</strong>
                <span>best</span>
              </div>
              <div>
                <strong>{skipCount}</strong>
                <span>skips</span>
              </div>
            </div>

            <p className="speed-feedback" role="status" aria-live="polite">{feedback}</p>

            <div className="speed-actions">
              {status === 'running' || status === 'starting' ? (
                <>
                  <button className="ghost-btn" type="button" onClick={skipLetter}>Skip</button>
                  <button className="primary-btn" type="button" onClick={stopRound}>Finish</button>
                </>
              ) : (
                <button className="primary-btn" type="button" onClick={startRound}>
                  {status === 'finished' ? 'Play again' : 'Start round'}
                </button>
              )}
            </div>

            {savingRound ? <p className="saving-progress">Saving round...</p> : null}
          </div>
        </aside>
      </div>

      <section className="speed-coach-card card" aria-label={`${coach.name} encouragement`}>
        <img src={coach.sprite} alt="" aria-hidden="true" />
        <div>
          <div className="section-label">{coach.name}</div>
          <p>{coachMessage}</p>
        </div>
      </section>

      <div className="sr-only" role="status" aria-live="polite">
        {liveAnnouncement}
      </div>
    </div>
  );
}
