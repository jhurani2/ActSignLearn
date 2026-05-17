import { cloneElement, isValidElement, useEffect, useRef, useState } from 'react';
import { ensureMediapipeLoaded } from './mediapipe';

const CLICK_COOLDOWN_MS = 350;
const PINCH_RATIO_THRESHOLD = 0.42;
const SCROLL_PAIR_RATIO_THRESHOLD = 0.24;
const SCROLL_MIN_DELTA_PX = 10;
const SCROLL_COOLDOWN_MS = 90;
const SCROLL_GAIN = 2.8;
const CURSOR_SMOOTHING = 0.32;

function distance(pointA, pointB) {
  const deltaX = pointA.x - pointB.x;
  const deltaY = pointA.y - pointB.y;
  return Math.hypot(deltaX, deltaY);
}

function isDisabledElement(element) {
  if (!(element instanceof HTMLElement)) {
    return true;
  }

  if (element.matches(':disabled, [aria-disabled="true"]')) {
    return true;
  }

  return Boolean(element.closest(':disabled, [aria-disabled="true"]'));
}

function getInteractiveTargetFromPoint(x, y) {
  const element = document.elementFromPoint(x, y);
  if (!element) {
    return null;
  }

  const target = element.closest(
    'button, a, input, select, textarea, [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"])'
  );

  if (!target || isDisabledElement(target)) {
    return null;
  }

  return target;
}

function describeTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return 'item';
  }

  const ariaLabel = target.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel;
  }

  const text = target.textContent?.replace(/\s+/g, ' ').trim();
  if (text) {
    return text.slice(0, 40);
  }

  return target.tagName.toLowerCase();
}

function triggerClick(target) {
  if (!(target instanceof HTMLElement)) {
    return;
  }

  target.focus?.({ preventScroll: true });
  target.click();
}

function setHoveredTarget(previousTarget, nextTarget) {
  if (previousTarget instanceof HTMLElement) {
    previousTarget.classList.remove('gesture-hover-target');
  }

  if (nextTarget instanceof HTMLElement) {
    nextTarget.classList.add('gesture-hover-target');
  }
}

function isScrollableElement(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
}

function getScrollableAncestorFromPoint(x, y) {
  let element = document.elementFromPoint(x, y);

  while (element && element !== document.body) {
    if (isScrollableElement(element)) {
      return element;
    }

    element = element.parentElement;
  }

  return document.scrollingElement || document.documentElement;
}

function scrollByGesture(deltaY, x, y) {
  const scrollTarget = getScrollableAncestorFromPoint(x, y);

  if (scrollTarget && typeof scrollTarget.scrollBy === 'function') {
    scrollTarget.scrollBy({ top: deltaY, left: 0, behavior: 'auto' });
    return;
  }

  if (scrollTarget && 'scrollTop' in scrollTarget) {
    scrollTarget.scrollTop += deltaY;
    return;
  }

  window.scrollBy({ top: deltaY, left: 0, behavior: 'auto' });
}

export default function GestureController({ children, showCameraToggle = false, activeView = '' }) {
  const videoRef = useRef(null);
  const cameraRef = useRef(null);
  const handsRef = useRef(null);
  const cursorRef = useRef(null);
  const cursorPointRef = useRef(null);
  const pinchActiveRef = useRef(false);
  const lastClickAtRef = useRef(0);
  const lastScrollPointRef = useRef(null);
  const lastScrollAtRef = useRef(0);
  const activeTargetRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const stopStream = () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }

      if (handsRef.current) {
        handsRef.current.close?.();
        handsRef.current = null;
      }

      pinchActiveRef.current = false;
      lastScrollPointRef.current = null;
      lastScrollAtRef.current = 0;
      setHoveredTarget(activeTargetRef.current, null);
      activeTargetRef.current = null;

      if (cursorRef.current) {
        cursorRef.current.style.opacity = '0';
        cursorRef.current.dataset.pinch = 'false';
      }
    };

    const startStream = async () => {
      if (!cameraOn) {
        stopStream();
        setError('');
        return;
      }

      try {
        await ensureMediapipeLoaded();

        if (cancelled) {
          return;
        }

        const Camera = window.Camera;
        const Hands = window.Hands;

        if (!videoRef.current) {
          throw new Error('Gesture video surface is not ready yet.');
        }

        setError('');

        const hands = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.65,
          minTrackingConfidence: 0.65,
        });

        hands.onResults((results) => {
          const landmarks = results.multiHandLandmarks?.[0];
          const cursor = cursorRef.current;

          if (!landmarks || !cursor) {
            pinchActiveRef.current = false;
            lastScrollPointRef.current = null;
            setHoveredTarget(activeTargetRef.current, null);
            activeTargetRef.current = null;
            if (cursor) {
              cursor.style.opacity = '0';
            }
            return;
          }

          const viewportWidth = window.innerWidth;
          const viewportHeight = window.innerHeight;
          const indexTip = landmarks[8];
          const middleTip = landmarks[12];
          const thumbTip = landmarks[4];
          const palmSpan = Math.max(
            distance(landmarks[5], landmarks[17]),
            distance(landmarks[0], landmarks[9]),
            0.0001
          );
          const pinchRatio = distance(thumbTip, indexTip) / palmSpan;
          const isPinching = pinchRatio < PINCH_RATIO_THRESHOLD;
          const scrollPairRatio = distance(indexTip, middleTip) / palmSpan;
          const isScrollGesture = scrollPairRatio < SCROLL_PAIR_RATIO_THRESHOLD;

          const rawX = (1 - indexTip.x) * viewportWidth;
          const rawY = indexTip.y * viewportHeight;
          const now = performance.now();
          const previous = cursorPointRef.current || { x: rawX, y: rawY };
          const nextPoint = {
            x: previous.x + ((rawX - previous.x) * CURSOR_SMOOTHING),
            y: previous.y + ((rawY - previous.y) * CURSOR_SMOOTHING),
          };

          cursorPointRef.current = nextPoint;
          cursor.style.opacity = '1';
          cursor.dataset.pinch = isPinching ? 'true' : 'false';
          cursor.style.transform = `translate3d(${nextPoint.x}px, ${nextPoint.y}px, 0) translate(-50%, -50%)`;

          const target = getInteractiveTargetFromPoint(rawX, rawY);
          if (target !== activeTargetRef.current) {
            setHoveredTarget(activeTargetRef.current, target);
            activeTargetRef.current = target;
          }

          const scrollPointY = ((indexTip.y + middleTip.y) / 2) * viewportHeight;
          const lastScrollPoint = lastScrollPointRef.current;
          const scrollDeltaY = lastScrollPoint ? scrollPointY - lastScrollPoint.y : 0;
          const scrollDeltaX = lastScrollPoint ? rawX - lastScrollPoint.x : 0;

          if (isScrollGesture) {
            if (lastScrollPoint && Math.abs(scrollDeltaY) > SCROLL_MIN_DELTA_PX && now - lastScrollAtRef.current > SCROLL_COOLDOWN_MS) {
              const verticalIntent = Math.abs(scrollDeltaY) >= Math.abs(scrollDeltaX);
              if (verticalIntent) {
                scrollByGesture(scrollDeltaY * SCROLL_GAIN, rawX, rawY);
                lastScrollAtRef.current = now;
              }
            }

            lastScrollPointRef.current = { x: rawX, y: scrollPointY };
          } else {
            lastScrollPointRef.current = null;
          }

          if (!isScrollGesture && isPinching && !pinchActiveRef.current && now - lastClickAtRef.current > CLICK_COOLDOWN_MS) {
            if (target) {
              triggerClick(target);
              lastClickAtRef.current = now;
            }
          }

          pinchActiveRef.current = isPinching;
        });

        handsRef.current = hands;

        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (!cancelled && handsRef.current && videoRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 960,
          height: 540,
        });

        cameraRef.current = camera;
        await camera.start();
      } catch (gestureError) {
        stopStream();
        setError(gestureError?.message || 'Unable to start gesture control.');
      }
    };

    startStream();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [cameraOn, showCameraToggle]);

  useEffect(() => {
    lastScrollPointRef.current = null;
    lastScrollAtRef.current = 0;
    pinchActiveRef.current = false;
    cursorPointRef.current = null;

    setHoveredTarget(activeTargetRef.current, null);
    activeTargetRef.current = null;
  }, [activeView]);

  return (
    <>
      <div className="gesture-layer" aria-hidden="true">
        <video ref={videoRef} className="gesture-video" autoPlay muted playsInline />
        <div ref={cursorRef} className="gesture-cursor" data-pinch="false" />
      </div>
      {isValidElement(children)
        ? cloneElement(children, {
          gestureCameraOn: cameraOn,
          onGestureCameraToggle: showCameraToggle ? () => setCameraOn((current) => !current) : undefined,
        })
        : children}
    </>
  );
}