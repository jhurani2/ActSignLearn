const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');

const datasetPath = path.resolve(__dirname, '../training/dataset/asl_landmarks_final.csv');
const outputPath = path.resolve(__dirname, '../src/data/referencePoses.js');

function rowToLandmarks(row) {
  return Array.from({ length: 21 }, (_, index) => ({
    x: Number(row[`x${index}`]),
    y: Number(row[`y${index}`]),
    z: Number(row[`z${index}`]),
  }));
}

function normalizeLandmarks(landmarks) {
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

async function generate() {
  const sums = new Map();
  const counts = new Map();

  await new Promise((resolve, reject) => {
    fs.createReadStream(datasetPath)
      .pipe(csvParser())
      .on('data', (row) => {
        const label = String(row.label || '').trim().toUpperCase();
        if (!label) {
          return;
        }

        const landmarks = rowToLandmarks(row);
        const normalized = normalizeLandmarks(landmarks);
        const sum = sums.get(label) || Array(63).fill(0);

        for (let i = 0; i < normalized.length; i += 1) {
          sum[i] += normalized[i];
        }

        sums.set(label, sum);
        counts.set(label, (counts.get(label) || 0) + 1);
      })
      .on('end', resolve)
      .on('error', reject);
  });

  const referencePoses = {};
  [...sums.keys()].sort().forEach((label) => {
    const total = sums.get(label);
    const count = counts.get(label) || 1;
    referencePoses[label] = total.map((value) => value / count);
  });

  const fileContents = `export const referencePoses = ${JSON.stringify(referencePoses, null, 2)};\n\nexport default referencePoses;\n`;
  fs.writeFileSync(outputPath, fileContents, 'utf8');

  console.log(`Wrote ${Object.keys(referencePoses).length} reference poses to ${outputPath}`);
}

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});
