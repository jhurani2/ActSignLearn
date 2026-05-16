const fs = require('fs/promises');
const path = require('path');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

dotenv.config();

const BASE_URL = 'https://api.iconscout.com/v3';
const LETTER = String(process.argv[2] || 'A').trim().toUpperCase();
const MODEL_PATH = path.resolve(process.cwd(), `public/models/${LETTER}.glb`);
const CLIENT_ID =
  process.env.ICONSCOUT_CLIENT_ID ||
  process.env.REACT_APP_ICONSCOUT_CLIENT_ID ||
  process.env.REACT_APP_ICONSCOUT_API_KEY;
const CLIENT_SECRET =
  process.env.ICONSCOUT_CLIENT_SECRET ||
  process.env.REACT_APP_ICONSCOUT_CLIENT_SECRET ||
  process.env.REACT_APP_ICONSCOUT_API_SECRET;

function assertConfigured() {
  if (!/^[A-Z]$/.test(LETTER)) {
    throw new Error('Usage: npm run download-model -- A');
  }

  if (!CLIENT_ID) {
    throw new Error('Set ICONSCOUT_CLIENT_ID in .env before downloading.');
  }

  if (!CLIENT_SECRET) {
    throw new Error('Set ICONSCOUT_CLIENT_SECRET in .env before downloading.');
  }
}

async function searchModels(query) {
  const assetTypes = ['3d', 'model'];
  let lastError = null;

  for (const assetType of assetTypes) {
    const params = new URLSearchParams({
      query,
      product_type: 'item',
      asset: assetType,
      per_page: '10',
      page: '1',
    });

    const response = await fetch(`${BASE_URL}/search?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Client-ID': CLIENT_ID,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      lastError = new Error(`Search failed: ${response.status} ${response.statusText} ${text.slice(0, 500)}`);
      continue;
    }

    const data = await response.json();
    const items = getSearchItems(data);
    if (items.length) return items;
  }

  if (lastError) throw lastError;
  return [];
}

async function requestDownloadUrl(item) {
  const itemId = getItemId(item);
  if (!itemId) return null;

  const formats = ['glb', 'gltf'];
  let lastError = null;

  for (const format of formats) {
    const response = await fetch(`${BASE_URL}/items/${encodeURIComponent(itemId)}/api-download`, {
      method: 'POST',
      headers: {
        'Client-ID': CLIENT_ID,
        'Client-Secret': CLIENT_SECRET,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ format }),
    });

    if (!response.ok) {
      const text = await response.text();
      lastError = new Error(`Download request failed: ${response.status} ${response.statusText} ${text.slice(0, 500)}`);
      continue;
    }

    const data = await response.json();
    return getModelUrl(data.response?.download || data);
  }

  if (lastError) throw lastError;
  return null;
}

function getSearchItems(data) {
  const items =
    data?.response?.items?.data ||
    data?.response?.items ||
    data?.items?.data ||
    data?.items ||
    [];

  return Array.isArray(items) ? items.filter(Boolean) : [];
}

function getItemId(item) {
  return item?.uuid || item?.id || item?.item_uuid || item?.item_id || item?.slug || null;
}

function getModelUrl(item) {
  if (!item) return null;

  const directCandidates = [
    item.urls?.glb,
    item.urls?.gltf,
    item.urls?.download,
    item.download?.download_url,
    item.download_url,
    item.url,
    item.response?.download?.download_url,
  ];

  return directCandidates.find(isModelUrl) || findModelUrl(item);
}

function isModelUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const withoutQuery = url.split('?')[0].toLowerCase();
  return withoutQuery.endsWith('.glb') || withoutQuery.endsWith('.gltf');
}

function findModelUrl(value) {
  if (!value || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = findModelUrl(entry);
      if (url) return url;
    }
    return null;
  }

  for (const entry of Object.values(value)) {
    if (isModelUrl(entry)) return entry;
    const nestedUrl = findModelUrl(entry);
    if (nestedUrl) return nestedUrl;
  }

  return null;
}

async function downloadFile(url, dest) {
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Model download failed: ${response.status} ${response.statusText} ${text.slice(0, 500)}`);
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, await response.buffer());
}

async function run() {
  assertConfigured();

  const query = `ASL hand sign ${LETTER}`;
  console.log(`Searching IconScout for: ${query}`);

  const items = await searchModels(query);
  const item = items.find((candidate) => getModelUrl(candidate)) || items[0];

  if (!item) {
    throw new Error('No model item returned from IconScout search.');
  }

  const modelUrl = getModelUrl(item) || await requestDownloadUrl(item);
  if (!modelUrl) {
    throw new Error('No downloadable GLB or glTF URL found.');
  }

  console.log(`Downloading ${LETTER}.glb`);
  await downloadFile(modelUrl, MODEL_PATH);
  console.log(`Saved ${MODEL_PATH}`);
}

run().catch((error) => {
  console.error('\nSCRIPT FAILED:\n');
  console.error(error.message || error);
  process.exit(1);
});
