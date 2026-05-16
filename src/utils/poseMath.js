export const HAND_LANDMARK_NAMES = [
  'wrist',
  'thumb_cmc',
  'thumb_mcp',
  'thumb_ip',
  'thumb_tip',
  'index_mcp',
  'index_pip',
  'index_dip',
  'index_tip',
  'middle_mcp',
  'middle_pip',
  'middle_dip',
  'middle_tip',
  'ring_mcp',
  'ring_pip',
  'ring_dip',
  'ring_tip',
  'pinky_mcp',
  'pinky_pip',
  'pinky_dip',
  'pinky_tip',
];

export function landmarksToVector(landmarks) {
  return landmarks.flatMap((point) => [point.x, point.y, point.z]);
}

export function normalizeLandmarks(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length !== 21) {
    return null;
  }

  const wrist = landmarks[0];
  const centered = landmarks.map((point) => ({
    x: point.x - wrist.x,
    y: point.y - wrist.y,
    z: point.z - wrist.z,
  }));

  const handSize = Math.max(
    ...centered.map((point) => Math.hypot(point.x, point.y, point.z))
  ) || 1;

  return centered.flatMap((point) => [
    point.x / handSize,
    point.y / handSize,
    point.z / handSize,
  ]);
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const valueA = a[i];
    const valueB = b[i];
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (!denominator) {
    return 0;
  }

  return dot / denominator;
}

export function compareLandmarkVectors(liveLandmarks, referenceVector) {
  const normalizedLive = normalizeLandmarks(liveLandmarks);
  if (!normalizedLive || !referenceVector || referenceVector.length !== 63) {
    return null;
  }

  const landmarkErrors = Array.from({ length: 21 }, (_, index) => {
    const offset = index * 3;
    const dx = normalizedLive[offset] - referenceVector[offset];
    const dy = normalizedLive[offset + 1] - referenceVector[offset + 1];
    const dz = normalizedLive[offset + 2] - referenceVector[offset + 2];
    return Math.hypot(dx, dy, dz);
  });

  return {
    normalizedLive,
    similarity: cosineSimilarity(normalizedLive, referenceVector),
    landmarkErrors,
  };
}
