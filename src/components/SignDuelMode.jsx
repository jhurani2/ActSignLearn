import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ASL_HINTS, LETTERS } from '../data/aslData';
import { OCEAN_BUDDIES } from '../data/decks';
import referencePoses from '../data/referencePoses';
import { compareLandmarkVectors } from '../utils/poseMath';
import { ensureMediapipeLoaded } from '../utils/mediapipeLoader';

const PASS_SCORE = 95;
const MATCH_TARGET = 5;
const ROUND_ADVANCE_MS = 1350;
const LANDMARK_ERROR_THRESHOLD = 0.18;
const DUEL_MODES = {
  friends: {
    label: 'Two players',
    description: 'Race side by side.',
    setupFeedback: 'Stand side by side. First to five signs wins.',
    setupHint: 'Move both players into frame before starting.',
  },
  solo: {
    label: 'Solo hands',
    description: 'Left hand vs right hand.',
    setupFeedback: 'Play left hand against right hand. Keep each hand in its half.',
    setupHint: 'Keep your left hand on the left and right hand on the right.',
  },
};
const SIDE_CHARACTERS = {
  left: OCEAN_BUDDIES[0],
  right: OCEAN_BUDDIES[1],
};

function getSideLabels(mode) {
  return mode === 'solo'
    ? { left: 'Left hand', right: 'Right hand' }
    : { left: 'Left player', right: 'Right player' };
}

function getReadyFeedback(labels) {
  return {
    left: `${SIDE_CHARACTERS.left.name}: ${labels.left} ready.`,
    right: `${SIDE_CHARACTERS.right.name}: ${labels.right} ready.`,
  };
}

function buildSideFeedback(side, score, label, letter) {
  const coachName = SIDE_CHARACTERS[side].name;
  if (!score) return `${coachName}: ${label}, move into your half.`;
  if (score >= PASS_SCORE) return `${coachName}: locked at ${score}%.`;
  if (score >= 88) return `${coachName}: close at ${score}%. Hold ${letter}.`;
  return `${coachName}: ${ASL_HINTS[letter] || 'Shape the hand clearly.'}`;
}

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

function getNextLetter(queue, letters, previousLetter, disallowedLetter = '') {
  const pool = letters.length ? letters : LETTERS;
  if (!queue.length) {
    queue.push(...shuffleLetters(pool, previousLetter));
  }

  let nextIndex = 0;
  if (pool.length > 1 && disallowedLetter) {
    nextIndex = queue.findIndex((letter) => letter !== disallowedLetter);
    if (nextIndex === -1) {
      queue.push(...shuffleLetters(pool, previousLetter));
      nextIndex = queue.findIndex((letter) => letter !== disallowedLetter);
    }
  }

  if (nextIndex > 0) {
    return queue.splice(nextIndex, 1)[0];
  }

  return queue.shift() || pool.find((letter) => letter !== disallowedLetter) || pool[0] || 'A';
}

function getNextDuelLetters(queues, letters, previousLetters) {
  const pool = letters.length ? letters : LETTERS;
  const left = getNextLetter(queues.left, pool, previousLetters.left);
  const right = getNextLetter(queues.right, pool, previousLetters.right, left);

  return { left, right };
}

export default function SignDuelMode({ letters = LETTERS, onMatchComplete }) {
  const [status, setStatus] = useState('setup');
  const [duelMode, setDuelMode] = useState('friends');
  const [currentLetters, setCurrentLetters] = useState({ left: 'A', right: 'B' });
  const [scores, setScores] = useState({ left: 0, right: 0 });
  const [liveScores, setLiveScores] = useState({ left: null, right: null });
  const [roundWinner, setRoundWinner] = useState('');
  const [matchWinner, setMatchWinner] = useState('');
  const [feedback, setFeedback] = useState(DUEL_MODES.friends.setupFeedback);
  const [sideFeedback, setSideFeedback] = useState(() => getReadyFeedback(getSideLabels('friends')));
  const [cameraError, setCameraError] = useState('');
  const [savingMatch, setSavingMatch] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraRef = useRef(null);
  const handsRef = useRef(null);
  const statusRef = useRef(status);
  const duelModeRef = useRef(duelMode);
  const currentLettersRef = useRef(currentLetters);
  const scoresRef = useRef(scores);
  const sideLabelsRef = useRef(getSideLabels('friends'));
  const letterQueuesRef = useRef({ left: [], right: [] });
  const roundAdvanceTimerRef = useRef(null);
  const wonLetterScoresRef = useRef({});

  const activeLetters = useMemo(() => {
    const safeLetters = letters.filter((letter) => /^[A-Z]$/.test(letter));
    return safeLetters.length ? safeLetters : LETTERS;
  }, [letters]);

  const sideLabels = useMemo(() => getSideLabels(duelMode), [duelMode]);
  const canChangeMode = status === 'setup' || status === 'match-over';
  const isCameraActive = status === 'starting' || status === 'running' || status === 'round-won';

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    duelModeRef.current = duelMode;
    sideLabelsRef.current = sideLabels;
  }, [duelMode, sideLabels]);

  useEffect(() => {
    currentLettersRef.current = currentLetters;
  }, [currentLetters]);

  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  useEffect(() => () => {
    if (roundAdvanceTimerRef.current) {
      window.clearTimeout(roundAdvanceTimerRef.current);
    }
  }, []);

  const chooseNextPrompt = useCallback(() => {
    const previousLetters = currentLettersRef.current;
    const nextLetters = getNextDuelLetters(letterQueuesRef.current, activeLetters, previousLetters);
    currentLettersRef.current = nextLetters;
    setCurrentLetters(nextLetters);
    setLiveScores({ left: null, right: null });
    setRoundWinner('');
    setSideFeedback({
      left: `${SIDE_CHARACTERS.left.name}: ${sideLabelsRef.current.left}, find ${nextLetters.left}.`,
      right: `${SIDE_CHARACTERS.right.name}: ${sideLabelsRef.current.right}, find ${nextLetters.right}.`,
    });
    setFeedback('Ready!');
    setLiveAnnouncement(`Next duel. ${SIDE_CHARACTERS.left.name}: ${nextLetters.left}. ${SIDE_CHARACTERS.right.name}: ${nextLetters.right}.`);
  }, [activeLetters]);

  const finishMatch = useCallback(async (winnerSide, finalScores) => {
    const winnerLabel = sideLabelsRef.current[winnerSide];
    statusRef.current = 'match-over';
    setStatus('match-over');
    setMatchWinner(winnerSide);
    setRoundWinner(winnerSide);
    setFeedback(`🎉 ${winnerLabel} wins the match!`);
    setSideFeedback((current) => ({
      ...current,
      [winnerSide]: `${SIDE_CHARACTERS[winnerSide].name}: match point complete.`,
    }));
    setLiveAnnouncement(`${winnerLabel} wins Sign Duel.`);

    const correctLetters = { ...wonLetterScoresRef.current };
    if (!Object.keys(correctLetters).length || typeof onMatchComplete !== 'function') return;

    setSavingMatch(true);
    try {
      await onMatchComplete({
        correctLetters,
        winner: winnerSide,
        leftScore: finalScores.left,
        rightScore: finalScores.right,
      });
    } catch {
      setCameraError('Match finished, but progress could not be saved.');
    } finally {
      setSavingMatch(false);
    }
  }, [onMatchComplete]);

  const awardRound = useCallback((winnerSide, scorePercent) => {
    if (statusRef.current !== 'running') return;

    const letter = currentLettersRef.current[winnerSide];
    const winnerLabel = sideLabelsRef.current[winnerSide];
    const nextScores = {
      ...scoresRef.current,
      [winnerSide]: scoresRef.current[winnerSide] + 1,
    };

    scoresRef.current = nextScores;
    wonLetterScoresRef.current = {
      ...wonLetterScoresRef.current,
      [letter]: Math.max(wonLetterScoresRef.current[letter] || 0, scorePercent),
    };

    setScores(nextScores);
    setRoundWinner(winnerSide);
    setFeedback(`${winnerLabel} wins ${letter} at ${scorePercent}%.`);
    setSideFeedback((current) => ({
      ...current,
      [winnerSide]: `${SIDE_CHARACTERS[winnerSide].name}: ${letter} locked in.`,
    }));
    setLiveAnnouncement(`${winnerLabel} wins letter ${letter}.`);

    if (nextScores[winnerSide] >= MATCH_TARGET) {
      finishMatch(winnerSide, nextScores);
      return;
    }

    statusRef.current = 'round-won';
    setStatus('round-won');
    roundAdvanceTimerRef.current = window.setTimeout(() => {
      chooseNextPrompt();
      statusRef.current = 'running';
      setStatus('running');
    }, ROUND_ADVANCE_MS);
  }, [chooseNextPrompt, finishMatch]);

  const startMatch = () => {
    if (roundAdvanceTimerRef.current) {
      window.clearTimeout(roundAdvanceTimerRef.current);
    }

    letterQueuesRef.current = { left: [], right: [] };
    const firstLetters = getNextDuelLetters(letterQueuesRef.current, activeLetters, { left: '', right: '' });
    currentLettersRef.current = firstLetters;
    scoresRef.current = { left: 0, right: 0 };
    wonLetterScoresRef.current = {};

    setCurrentLetters(firstLetters);
    setScores({ left: 0, right: 0 });
    setLiveScores({ left: null, right: null });
    setRoundWinner('');
    setMatchWinner('');
    setCameraError('');
    setSavingMatch(false);
    setFeedback('Starting camera...');
    setSideFeedback({
      left: `${SIDE_CHARACTERS.left.name}: ${sideLabelsRef.current.left}, get ready.`,
      right: `${SIDE_CHARACTERS.right.name}: ${sideLabelsRef.current.right}, get ready.`,
    });
    setStatus('starting');
  };

  const resetMatch = () => {
    if (roundAdvanceTimerRef.current) {
      window.clearTimeout(roundAdvanceTimerRef.current);
    }

    statusRef.current = 'setup';
    setStatus('setup');
    setScores({ left: 0, right: 0 });
    setLiveScores({ left: null, right: null });
    setRoundWinner('');
    setMatchWinner('');
    setCameraError('');
    setFeedback(DUEL_MODES[duelModeRef.current].setupFeedback);
    setSideFeedback(getReadyFeedback(sideLabelsRef.current));
  };

  const handleModeChange = (modeId) => {
    if (!canChangeMode) return;

    const nextLabels = getSideLabels(modeId);
    setDuelMode(modeId);
    if (status === 'setup') {
      setFeedback(DUEL_MODES[modeId].setupFeedback);
      setSideFeedback(getReadyFeedback(nextLabels));
    }
  };

  useEffect(() => {
    let cancelled = false;
    const detectionFrame = { xMin: 0.08, xMax: 0.92, yMin: 0.1, yMax: 0.92 };

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

          const leftRefVector = referencePoses[currentLettersRef.current.left];
          const rightRefVector = referencePoses[currentLettersRef.current.right];
          const bestBySide = {
            left: { score: 0, comparison: null },
            right: { score: 0, comparison: null },
          };

          results.multiHandLandmarks?.forEach((landmarks) => {
            const centroid = landmarks.reduce(
              (acc, point) => ({
                x: acc.x + point.x / landmarks.length,
                y: acc.y + point.y / landmarks.length,
              }),
              { x: 0, y: 0 }
            );

            const visualX = 1 - centroid.x;
            const side = visualX < 0.5 ? 'left' : 'right';
            const inFrame =
              centroid.x >= detectionFrame.xMin &&
              centroid.x <= detectionFrame.xMax &&
              centroid.y >= detectionFrame.yMin &&
              centroid.y <= detectionFrame.yMax;

            if (!inFrame) return;

            const refVector = side === 'left' ? leftRefVector : rightRefVector;
            const comparison = refVector ? compareLandmarkVectors(landmarks, refVector) : null;
            const scorePercent = comparison
              ? Math.round(Math.max(0, Math.min(1, comparison.similarity)) * 100)
              : 0;

            if (comparison && scorePercent > bestBySide[side].score) {
              bestBySide[side] = { score: scorePercent, comparison };
            }

            const sideColor = side === 'left' ? '#8ee7ff' : '#ffd166';
            const landmarkColors = comparison
              ? comparison.landmarkErrors.map((error) => (error > LANDMARK_ERROR_THRESHOLD ? '#ff6b7a' : sideColor))
              : landmarks.map(() => sideColor);

            HAND_CONNECTIONS.forEach(([start, end]) => {
              drawConnectors(ctx, [landmarks[start], landmarks[end]], [[0, 1]], {
                color: 'rgba(1, 12, 26, 0.55)',
                lineWidth: 10,
              });
              drawConnectors(ctx, [landmarks[start], landmarks[end]], [[0, 1]], {
                color: sideColor,
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

          setLiveScores({
            left: bestBySide.left.score || null,
            right: bestBySide.right.score || null,
          });

          if (statusRef.current === 'running') {
            const activeLetters = currentLettersRef.current;
            const labels = sideLabelsRef.current;
            const nextSideFeedback = {
              left: buildSideFeedback('left', bestBySide.left.score, labels.left, activeLetters.left),
              right: buildSideFeedback('right', bestBySide.right.score, labels.right, activeLetters.right),
            };

            setSideFeedback((current) => (
              current.left === nextSideFeedback.left && current.right === nextSideFeedback.right
                ? current
                : nextSideFeedback
            ));

            const leftPass = bestBySide.left.score >= PASS_SCORE;
            const rightPass = bestBySide.right.score >= PASS_SCORE;

            if (leftPass || rightPass) {
              if (leftPass && rightPass) {
                const winnerSide = bestBySide.left.score >= bestBySide.right.score ? 'left' : 'right';
                awardRound(winnerSide, bestBySide[winnerSide].score);
              } else {
                const winnerSide = leftPass ? 'left' : 'right';
                awardRound(winnerSide, bestBySide[winnerSide].score);
              }
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
        if (!cancelled) {
          setStatus('running');
          statusRef.current = 'running';
          setFeedback('Ready!');
        }
      } catch (error) {
        stopStream();
        setCameraError(error?.message || 'Unable to start the camera.');
        setStatus('setup');
        statusRef.current = 'setup';
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
  }, [awardRound, isCameraActive]);

  const arenaClass = [
    'duel-arena',
    roundWinner ? `${roundWinner}-won` : '',
    matchWinner ? 'match-over' : '',
  ].filter(Boolean).join(' ');
  const modeHint = status === 'setup'
    ? DUEL_MODES[duelMode].setupHint
    : status === 'match-over'
      ? 'Choose a mode for the next match or start a rematch.'
      : 'Match the sign pose on screen.';

  return (
    <div className="sign-duel-mode">
      <section className="duel-top-card card" aria-labelledby="sign-duel-title">
        <div>
          <p className="eyebrow">Sign Duel</p>
          <h2 id="sign-duel-title">First to five wins</h2>
          <p className="hint-text">{DUEL_MODES[duelMode].description} First side to hit {PASS_SCORE}% wins the letter.</p>
        </div>
        <div className="duel-mode-options" role="radiogroup" aria-label="Choose Sign Duel mode">
          {Object.entries(DUEL_MODES).map(([modeId, mode]) => (
            <button
              aria-checked={duelMode === modeId}
              className={`duel-mode-option ${duelMode === modeId ? 'active' : ''}`}
              disabled={!canChangeMode}
              key={modeId}
              onClick={() => handleModeChange(modeId)}
              role="radio"
              type="button"
            >
              <strong>{mode.label}</strong>
              <span>{mode.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="duel-scoreboard card" aria-label="Sign Duel score">
        <div className={`duel-score left ${roundWinner === 'left' ? 'active' : ''}`}>
          <img src={SIDE_CHARACTERS.left.sprite} alt="" aria-hidden="true" />
          <span>{sideLabels.left}</span>
          <strong>{scores.left}</strong>
          <small>{liveScores.left !== null ? `${liveScores.left}%` : 'ready'}</small>
          <em>{sideFeedback.left}</em>
        </div>
        <div className="duel-target">first to {MATCH_TARGET}</div>
        <div className={`duel-score right ${roundWinner === 'right' ? 'active' : ''}`}>
          <img src={SIDE_CHARACTERS.right.sprite} alt="" aria-hidden="true" />
          <span>{sideLabels.right}</span>
          <strong>{scores.right}</strong>
          <small>{liveScores.right !== null ? `${liveScores.right}%` : 'ready'}</small>
          <em>{sideFeedback.right}</em>
        </div>
      </section>

      <section className="duel-control-card card" aria-label="Sign Duel controls">
        <p className="hint-text">{modeHint}</p>
        {cameraError ? <p className="hint-text error-text" role="status">{cameraError}</p> : null}
        <div className="speed-actions">
          {status === 'setup' || status === 'match-over' ? (
            <button className="primary-btn" type="button" onClick={startMatch}>
              {status === 'match-over' ? 'Rematch' : 'Start duel'}
            </button>
          ) : (
            <button className="ghost-btn" type="button" onClick={resetMatch}>End match</button>
          )}
        </div>
        {savingMatch ? <p className="saving-progress">Saving match...</p> : null}
      </section>

      <section className="duel-camera-card card" aria-label="Split camera duel arena">
        <div className="duel-side-labels-top" aria-hidden="true">
          <div className="side-label-top left">{sideLabels.left}</div>
          <div className="side-label-top right">{sideLabels.right}</div>
        </div>
        <div className="duel-camera-prompts" aria-label="Current letters and feedback">
          <article className={`duel-prompt-panel left ${roundWinner === 'left' ? 'active' : ''}`}>
            <span className="duel-prompt-kicker">Sign</span>
            <strong aria-label={`${sideLabels.left} signs ${currentLetters.left}`}>{currentLetters.left}</strong>
            <p>{sideFeedback.left}</p>
          </article>
          <article className={`duel-prompt-panel right ${roundWinner === 'right' ? 'active' : ''}`}>
            <span className="duel-prompt-kicker">Sign</span>
            <strong aria-label={`${sideLabels.right} signs ${currentLetters.right}`}>{currentLetters.right}</strong>
            <p>{sideFeedback.right}</p>
          </article>
          <p className="duel-round-message" role="status" aria-live="polite">{feedback}</p>
        </div>
        <div className={arenaClass}>
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
                className="duel-video"
              />
              <canvas ref={canvasRef} className="duel-canvas" />
              <div className="duel-divider" aria-hidden="true" />
              <div className="camera-live-badge">{status === 'starting' ? 'Starting camera' : 'Duel live'}</div>
            </>
          ) : (
            <div className="camera-empty">
              <span className="camera-empty-icon" aria-hidden="true" />
              <span>{status === 'match-over' ? 'Match finished' : 'Camera off'}</span>
            </div>
          )}
        </div>
      </section>

      <div className="sr-only" role="status" aria-live="polite">
        {liveAnnouncement}
      </div>
    </div>
  );
}
