const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const ICONSCOUT_BASE_URL = 'https://api.iconscout.com/v3';
const CLIENT_ID =
  process.env.ICONSCOUT_CLIENT_ID ||
  process.env.REACT_APP_ICONSCOUT_CLIENT_ID ||
  process.env.REACT_APP_ICONSCOUT_API_KEY;
const CLIENT_SECRET =
  process.env.ICONSCOUT_CLIENT_SECRET ||
  process.env.REACT_APP_ICONSCOUT_CLIENT_SECRET ||
  process.env.REACT_APP_ICONSCOUT_API_SECRET;
const API_KEY =
  process.env.ICONSCOUT_API_KEY ||
  process.env.REACT_APP_ICONSCOUT_API_KEY ||
  CLIENT_ID;

if (!CLIENT_ID) {
  console.warn('Warning: IconScout client ID is missing. Set ICONSCOUT_CLIENT_ID in .env');
}

if (!CLIENT_SECRET) {
  if (!API_KEY) {
    console.warn('Warning: IconScout client secret is missing. Downloads may fail without ICONSCOUT_CLIENT_SECRET in .env');
  } else {
    console.log('Info: IconScout client secret not set. Using API key fallback flow.');
  }
}

if (!API_KEY) {
  console.warn('Warning: IconScout API key is missing. Set ICONSCOUT_API_KEY in .env');
}

app.use(cors());
app.get('/api/iconscout/letter/:letter/download', async (req, res) => {
  try {
    if (!CLIENT_ID && !API_KEY) {
      return res.status(500).json({
        error: 'Missing IconScout credentials on backend. Set ICONSCOUT_CLIENT_ID or ICONSCOUT_API_KEY in .env',
      });
    }

    const letter = String(req.params.letter || 'A').trim().toUpperCase();
    if (!/^[A-Z]$/.test(letter)) {
      return res.status(400).json({ error: 'Letter must be A-Z.' });
    }

    const query = `ASL hand sign ${letter}`;
    const searchData = await searchIconScout(query);
    const items = getSearchItems(searchData);
    if (!items.length) {
      const proxied = await tryProxyIconFallback(letter, res);
      if (proxied) return;
      return res.status(404).json({ error: 'No IconScout model or icon items found for this letter.' });
    }

    const item = pickBestLetterItem(items, letter);
    let modelUrl = getModelUrl(item);

    if (!modelUrl) {
      try {
        modelUrl = await requestDownloadUrl(item);
      } catch (error) {
        if (error instanceof IconScoutSubscriptionError) {
          const proxied = await tryProxyIconFallback(letter, res);
          if (proxied) return;
        }
        throw error;
      }
    }

    if (!modelUrl) {
      const proxied = await tryProxyIconFallback(letter, res);
      if (proxied) return;
      return res.status(404).json({ error: 'No downloadable GLB, glTF, PNG, or SVG URL found for this item.' });
    }

    return proxyUrl(modelUrl, res, 'model');
  } catch (error) {
    if (error instanceof IconScoutSubscriptionError) {
      const letter = String(req.params.letter || 'A').trim().toUpperCase();
      const proxied = await tryProxyIconFallback(letter, res);
      if (proxied) return;

      return res.status(402).json({
        error: 'IconScout API subscription required for model downloads on this account.',
        details: error.message,
      });
    }

    console.error(error);
    res.status(500).json({ error: error.message || 'IconScout backend error' });
  }
});

app.get('/api/iconscout/letter/:letter/icon-link', async (req, res) => {
  try {
    if (!CLIENT_ID && !API_KEY) {
      return res.status(500).json({
        error: 'Missing IconScout credentials on backend. Set ICONSCOUT_CLIENT_ID or ICONSCOUT_API_KEY in .env',
      });
    }

    const letter = String(req.params.letter || 'A').trim().toUpperCase();
    if (!/^[A-Z]$/.test(letter)) {
      return res.status(400).json({ error: 'Letter must be A-Z.' });
    }

    const iconResult = await findIconForLetter(letter);
    if (!iconResult) {
      return res.status(404).json({ error: `No icon URL found for letter ${letter}.` });
    }

    return res.json({
      status: 'success',
      letter,
      query: iconResult.query,
      icon_url: iconResult.iconUrl,
      source_item: {
        id: iconResult.item?.id || null,
        uuid: iconResult.item?.uuid || null,
        name: iconResult.item?.name || null,
        slug: iconResult.item?.slug || null,
        asset: iconResult.item?.asset || null,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'IconScout icon lookup failed' });
  }
});

app.get('/api/iconscout/letter/:letter/3d-search', async (req, res) => {
  try {
    if (!CLIENT_ID && !API_KEY) {
      return res.status(500).json({
        error: 'Missing IconScout credentials on backend. Set ICONSCOUT_CLIENT_ID or ICONSCOUT_API_KEY in .env',
      });
    }

    const letter = String(req.params.letter || 'A').trim().toUpperCase();
    if (!/^[A-Z]$/.test(letter)) {
      return res.status(400).json({ error: 'Letter must be A-Z.' });
    }

    const query = `ASL hand sign ${letter}`;
    const searchData = await searchIconScout(query);
    const items = getSearchItems(searchData);

    return res.json({
      status: 'success',
      letter,
      query,
      count: items.length,
      best_match: summarizeIconScoutItem(pickBestLetterItem(items, letter)),
      items: items.slice(0, 5).map((item) => ({
        id: item.id || null,
        uuid: item.uuid || null,
        name: item.name || null,
        slug: item.slug || null,
        asset: item.asset || null,
        price: item.price ?? null,
        public_page_url: getIconScoutPublicPageUrl(item),
        direct_model_url: getModelUrl(item),
        urls: item.urls || null,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'IconScout 3D search lookup failed' });
  }
});

app.get('/api/iconscout/item/:uuid/download-link', async (req, res) => {
  try {
    if (!CLIENT_ID && !API_KEY) {
      return res.status(500).json({
        error: 'Missing IconScout credentials on backend. Set ICONSCOUT_CLIENT_ID or ICONSCOUT_API_KEY in .env',
      });
    }

    const uuid = String(req.params.uuid || '').trim();
    const format = String(req.query.format || 'glb').trim().toLowerCase();
    if (!uuid) {
      return res.status(400).json({ error: 'Missing IconScout item UUID.' });
    }

    const result = await requestIconScoutDownloadLink(uuid, format);
    return res.status(result.ok ? 200 : result.status).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'IconScout download-link lookup failed' });
  }
});

async function searchIconScout(query) {
  const assetTypes = ['3d'];
  const authHeaders = getSearchHeaderCandidates();
  let lastError = null;

  for (const assetType of assetTypes) {
    const params = new URLSearchParams({
      query,
      product_type: 'item',
      asset: assetType,
      per_page: '10',
      page: '1',
    });
    const searchUrl = `${ICONSCOUT_BASE_URL}/search?${params.toString()}`;

    for (const headers of authHeaders) {
      const response = await fetch(searchUrl, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        lastError = new Error(await upstreamError(response, 'IconScout search failed'));
        continue;
      }

      const data = await response.json();
      if (getSearchItems(data).length) {
        return data;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  return { response: { items: { data: [] } } };
}

async function searchIconScoutIcons(query) {
  const authHeaders = getSearchHeaderCandidates();
  let lastError = null;

  const params = new URLSearchParams({
    query,
    product_type: 'item',
    asset: 'icon',
    per_page: '20',
    page: '1',
    sort: 'relevant',
    quality: '0',
  });
  params.append('formats[]', 'png');
  params.append('formats[]', 'svg');
  const searchUrl = `${ICONSCOUT_BASE_URL}/search?${params.toString()}`;

  for (const headers of authHeaders) {
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      lastError = new Error(await upstreamError(response, 'IconScout icon search failed'));
      continue;
    }

    const data = await response.json();
    if (getSearchItems(data).length) {
      return data;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return { response: { items: { data: [] } } };
}

async function requestDownloadUrl(item) {
  const itemId = getItemId(item);
  if (!itemId) {
    return null;
  }

  const errors = [];
  const resolvedClientId = CLIENT_ID || API_KEY;
  const resolvedClientSecret = CLIENT_SECRET || API_KEY;

  // Flow 0: /items/{uuid}/api-download using client-id + (client-secret or api-key fallback)
  if (resolvedClientId && resolvedClientSecret) {
    const apiDownloadUrl = `${ICONSCOUT_BASE_URL}/items/${encodeURIComponent(itemId)}/api-download`;
    const commonHeaders = {
      'Client-ID': resolvedClientId,
      'Client-Secret': resolvedClientSecret,
      Accept: 'application/json',
    };

    const requestedFormats = ['glb', 'compressed-glb', 'gltf', 'fbx', 'blend'];
    const apiDownloadAttempts = requestedFormats.map((format) => ({
      method: 'POST',
      url: apiDownloadUrl,
      format,
      headers: { ...commonHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ format }),
    }));
    apiDownloadAttempts.push({
      method: 'POST',
      url: apiDownloadUrl,
      format: 'glb',
      headers: {
        ...commonHeaders,
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ format: 'glb' }),
    });
    apiDownloadAttempts.push({
      method: 'GET',
      url: `${apiDownloadUrl}?format=glb`,
      format: 'glb',
      headers: commonHeaders,
    });
    apiDownloadAttempts.push({
      method: 'GET',
      url: apiDownloadUrl,
      format: 'unknown',
      headers: commonHeaders,
    });

    for (const attempt of apiDownloadAttempts) {
      const response = await fetch(attempt.url, attempt);
      if (!response.ok) {
        const errorText = await upstreamError(response, `IconScout /items/:id/api-download failed (${attempt.method}/${attempt.format || 'n/a'})`);
        if (isSubscriptionBlocked(errorText)) {
          throw new IconScoutSubscriptionError(errorText);
        }
        errors.push(errorText);
        continue;
      }

      const data = await safeJson(response);
      const url = getModelUrl(data?.response?.download || data);
      if (url) {
        return url;
      }
    }
  }

  // Flow 1 (preferred for your setup): legacy API key endpoint
  if (API_KEY) {
    const legacyDownloadUrl = `${ICONSCOUT_BASE_URL}/download/${encodeURIComponent(itemId)}`;
    const legacyHeaders = {
      Authorization: `Bearer ${API_KEY}`,
      'Client-ID': CLIENT_ID || API_KEY,
      Accept: 'application/json',
    };

    const attempts = [
      {
        method: 'POST',
        url: legacyDownloadUrl,
        headers: { ...legacyHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ download: 1 }),
      },
      {
        method: 'GET',
        url: `${legacyDownloadUrl}?download=1`,
        headers: legacyHeaders,
      },
      {
        method: 'GET',
        url: legacyDownloadUrl,
        headers: legacyHeaders,
      },
      {
        method: 'POST',
        url: `${legacyDownloadUrl}?download=1`,
        headers: { ...legacyHeaders, 'Content-Type': 'application/json' },
      },
    ];

    for (const attempt of attempts) {
      const legacyResponse = await fetch(attempt.url, attempt);
      if (!legacyResponse.ok) {
        const errorText = await upstreamError(legacyResponse, `IconScout /download failed (${attempt.method})`);
        if (isSubscriptionBlocked(errorText)) {
          throw new IconScoutSubscriptionError(errorText);
        }
        errors.push(errorText);
        continue;
      }

      const legacyData = await safeJson(legacyResponse);
      const url = getModelUrl(legacyData?.response?.download || legacyData);
      if (url) {
        return url;
      }
    }
  }

  // Flow 2: Newer "client id + client secret" endpoint
  if (CLIENT_ID && CLIENT_SECRET) {
    const formats = ['glb', 'compressed-glb', 'gltf', 'fbx', 'blend'];
    for (const format of formats) {
      const downloadUrl = `${ICONSCOUT_BASE_URL}/items/${encodeURIComponent(itemId)}/api-download`;
      const downloadResponse = await fetch(downloadUrl, {
        method: 'POST',
        headers: {
          'Client-ID': CLIENT_ID,
          'Client-Secret': CLIENT_SECRET,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ format }),
      });

      if (!downloadResponse.ok) {
        const errorText = await upstreamError(downloadResponse, 'IconScout /api-download failed');
        if (isSubscriptionBlocked(errorText)) {
          throw new IconScoutSubscriptionError(errorText);
        }
        errors.push(errorText);
        continue;
      }

      const downloadData = await downloadResponse.json();
      const url = getModelUrl(downloadData.response?.download || downloadData);
      if (url) return url;
    }
  }

  if (errors.length) {
    throw new Error(errors.join(' | ').slice(0, 1500));
  }

  return null;
}

async function requestIconScoutDownloadLink(itemUuid, format) {
  const resolvedClientId = CLIENT_ID || API_KEY;
  const resolvedClientSecret = CLIENT_SECRET || API_KEY || '';
  const apiDownloadUrl = `${ICONSCOUT_BASE_URL}/items/${encodeURIComponent(itemUuid)}/api-download`;

  const attempts = [
    {
      label: 'client-id/client-secret',
      method: 'POST',
      headers: {
        'Client-ID': resolvedClientId,
        'Client-Secret': resolvedClientSecret,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ format }),
    },
    {
      label: 'client-id/api-key-bearer',
      method: 'POST',
      headers: {
        'Client-ID': resolvedClientId,
        'Client-Secret': resolvedClientSecret,
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ format }),
    },
  ];

  const errors = [];

  for (const attempt of attempts) {
    const response = await fetch(apiDownloadUrl, {
      method: attempt.method,
      headers: attempt.headers,
      body: attempt.body,
    });

    const body = await readResponseBody(response);
    if (!response.ok) {
      errors.push({
        auth_mode: attempt.label,
        status: response.status,
        status_text: response.statusText,
        body,
      });
      continue;
    }

    const download = body?.response?.download || body;
    return {
      ok: true,
      item_uuid: itemUuid,
      format,
      auth_mode: attempt.label,
      download_url: getModelUrl(download) || download?.download_url || download?.url || null,
      raw: body,
    };
  }

  return {
    ok: false,
    status: errors[0]?.status || 500,
    item_uuid: itemUuid,
    format,
    errors,
  };
}

function getSearchHeaderCandidates() {
  const candidates = [];

  if (CLIENT_ID) {
    candidates.push({
      'Client-ID': CLIENT_ID,
      Accept: 'application/json',
    });
  }

  if (API_KEY) {
    candidates.push({
      Authorization: `Bearer ${API_KEY}`,
      'Client-ID': CLIENT_ID || API_KEY,
      Accept: 'application/json',
    });
  }

  if (!candidates.length) {
    candidates.push({ Accept: 'application/json' });
  }

  return candidates;
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

function pickBestLetterItem(items, letter) {
  if (!Array.isArray(items) || !items.length) return null;

  const normalizedLetter = String(letter || '').trim().toLowerCase();
  const exactPatterns = [
    `gesture ${normalizedLetter}`,
    `letter ${normalizedLetter}`,
    `alphabet ${normalizedLetter}`,
    `alphabets gesture ${normalizedLetter}`,
  ];

  return items.find((item) => {
    const haystack = `${item?.name || ''} ${item?.slug || ''}`.toLowerCase();
    return exactPatterns.some((pattern) => haystack.includes(pattern));
  }) || items.find((item) => getModelUrl(item)) || items[0];
}

function summarizeIconScoutItem(item) {
  if (!item) return null;

  return {
    id: item.id || null,
    uuid: item.uuid || null,
    name: item.name || null,
    slug: item.slug || null,
    asset: item.asset || null,
    price: item.price ?? null,
    public_page_url: getIconScoutPublicPageUrl(item),
    direct_model_url: getModelUrl(item),
    urls: item.urls || null,
  };
}

function getIconScoutPublicPageUrl(item) {
  if (!item?.slug) return null;
  const slug = String(item.slug).replace(/-\d+$/, '');

  if (item.asset === '3d') {
    return `https://iconscout.com/3d-icons/${slug}`;
  }

  if (item.asset === 'icon') {
    return `https://iconscout.com/icons/${slug}`;
  }

  return `https://iconscout.com/search?q=${encodeURIComponent(item.slug)}`;
}

function getModelUrl(item) {
  if (!item) return null;

  const directCandidates = [
    item.urls?.glb,
    item.urls?.gltf,
    item.urls?.fbx,
    item.urls?.download,
    item.download?.download_url,
    item.download_url,
    item.url,
    item.response?.download?.download_url,
  ];

  return directCandidates.find(isModelUrl) || findModelUrl(item);
}

function getIconPreviewUrl(item) {
  if (!item) return null;

  const directCandidates = [
    item.urls?.png_512,
    item.urls?.png_256,
    item.urls?.png_128,
    item.urls?.png_64,
    item.urls?.svg,
    item.download?.download_url,
    item.download_url,
    item.url,
  ];

  return directCandidates.find(isImageUrl) || findImageUrl(item);
}

function isModelUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const withoutQuery = url.split('?')[0].toLowerCase();
  if (
    withoutQuery.endsWith('.glb')
    || withoutQuery.endsWith('.gltf')
    || withoutQuery.endsWith('.fbx')
    || withoutQuery.endsWith('.glb.gz')
  ) {
    return true;
  }

  // Some IconScout download URLs wrap the real file URL as ?url=...
  try {
    const parsed = new URL(url);
    const nested = parsed.searchParams.get('url');
    if (!nested) return false;

    const nestedPath = decodeURIComponent(nested).split('?')[0].toLowerCase();
    return (
      nestedPath.endsWith('.glb')
      || nestedPath.endsWith('.gltf')
      || nestedPath.endsWith('.fbx')
      || nestedPath.endsWith('.glb.gz')
    );
  } catch {
    return false;
  }
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

function isImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const withoutQuery = url.split('?')[0].toLowerCase();
  return withoutQuery.endsWith('.png')
    || withoutQuery.endsWith('.svg')
    || withoutQuery.endsWith('.jpg')
    || withoutQuery.endsWith('.jpeg')
    || withoutQuery.endsWith('.webp');
}

function findImageUrl(value) {
  if (!value || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const url = findImageUrl(entry);
      if (url) return url;
    }
    return null;
  }

  for (const entry of Object.values(value)) {
    if (isImageUrl(entry)) return entry;
    const nestedUrl = findImageUrl(entry);
    if (nestedUrl) return nestedUrl;
  }

  return null;
}

async function proxyUrl(url, res, assetType = 'model') {
  const downloadResponse = await fetch(url);
  if (!downloadResponse.ok) {
    const text = await downloadResponse.text();
    return res.status(downloadResponse.status).send(text);
  }

  const contentType = downloadResponse.headers.get('content-type') || contentTypeForAssetUrl(url, assetType);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-IconScout-Asset-Type', assetType);
  res.setHeader('X-IconScout-Asset-Format', inferAssetFormat(url, assetType));

  const body = await downloadResponse.buffer();
  return res.send(body);
}

async function upstreamError(response, prefix) {
  const text = await response.text();
  const details = text ? ` ${text.slice(0, 500)}` : '';
  return `${prefix}: ${response.status} ${response.statusText}${details}`;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isSubscriptionBlocked(message) {
  if (!message || typeof message !== 'string') return false;
  const lower = message.toLowerCase();
  return lower.includes("didn't find any subscription")
    || lower.includes('did not find any subscription')
    || lower.includes('please subscribe');
}

class IconScoutSubscriptionError extends Error {}

function contentTypeForModelUrl(url) {
  const pathname = extractPathFromUrl(url);
  if (pathname.endsWith('.gltf')) return 'model/gltf+json';
  if (pathname.endsWith('.fbx')) return 'application/octet-stream';
  if (pathname.endsWith('.glb')) return 'model/gltf-binary';
  if (pathname.endsWith('.glb.gz')) return 'model/gltf-binary';
  return 'application/octet-stream';
}

function contentTypeForAssetUrl(url, assetType) {
  if (assetType === 'image') {
    const pathname = extractPathFromUrl(url);
    if (pathname.endsWith('.svg')) return 'image/svg+xml';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
    if (pathname.endsWith('.webp')) return 'image/webp';
    return 'image/png';
  }
  return contentTypeForModelUrl(url);
}

function extractPathFromUrl(url) {
  try {
    const parsed = new URL(url);
    const nested = parsed.searchParams.get('url');
    if (nested) {
      return decodeURIComponent(nested).split('?')[0].toLowerCase();
    }
    return parsed.pathname.toLowerCase();
  } catch {
    return (url || '').split('?')[0].toLowerCase();
  }
}

function inferAssetFormat(url, assetType) {
  const pathname = extractPathFromUrl(url);

  if (assetType === 'image') {
    if (pathname.endsWith('.svg')) return 'svg';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'jpg';
    if (pathname.endsWith('.webp')) return 'webp';
    return 'png';
  }

  if (pathname.endsWith('.fbx')) return 'fbx';
  if (pathname.endsWith('.gltf')) return 'gltf';
  if (pathname.endsWith('.glb') || pathname.endsWith('.glb.gz')) return 'glb';
  if (pathname.endsWith('.blend')) return 'blend';
  return 'unknown';
}

async function tryProxyIconFallback(letter, res) {
  const iconResult = await findIconForLetter(letter);
  if (!iconResult?.iconUrl) return false;
  await proxyUrl(iconResult.iconUrl, res, 'image');
  return true;
}

async function findIconForLetter(letter) {
  const queries = [
    `ASL letter ${letter} icon`,
    `letter ${letter}`,
    `alphabet ${letter} icon`,
  ];

  for (const query of queries) {
    const data = await searchIconScoutIcons(query);
    const items = getSearchItems(data);
    const item = items.find((candidate) => getIconPreviewUrl(candidate)) || items[0];
    const iconUrl = getIconPreviewUrl(item);
    if (!iconUrl) continue;
    return { query, iconUrl, item };
  }

  return false;
}

const server = app.listen(PORT, () => {
  console.log(`IconScout backend listening at http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Reuse the running backend process or stop it before starting a new one.`);
    return;
  }
  throw error;
});
