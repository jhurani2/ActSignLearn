const MEDIAPIPE_SCRIPT_URLS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
];

let mediaPipeReadyPromise = null;

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-mediapipe-src="${src}"]`);
    if (existing) {
      if (existing.getAttribute('data-loaded') === 'true') {
        resolve();
        return;
      }

      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-mediapipe-src', src);
    script.addEventListener('load', () => {
      script.setAttribute('data-loaded', 'true');
      resolve();
    });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
    document.body.appendChild(script);
  });
}

export async function ensureMediapipeLoaded() {
  if (!mediaPipeReadyPromise) {
    mediaPipeReadyPromise = Promise.all(MEDIAPIPE_SCRIPT_URLS.map(loadExternalScript)).then(() => {
      if (!window.Camera || !window.Hands || !window.HAND_CONNECTIONS || !window.drawConnectors) {
        throw new Error('MediaPipe scripts loaded but required globals are missing.');
      }
    });
  }

  return mediaPipeReadyPromise;
}