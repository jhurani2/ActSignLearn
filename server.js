const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
const DB_FILE = path.join(__dirname, 'data', 'app-db.json');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

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
app.use(express.json());

ensureDatabase();

app.post('/api/auth/signup', (req, res) => {
  try {
    const username = sanitizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const avatar = sanitizeAvatar(req.body?.avatar);

    if (!username) {
      return res.status(400).json({ error: 'Username must be 3-24 characters using letters, numbers, or underscores.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const db = readDatabase();
    const existingUser = db.users.find((user) => user.username === username);
    if (existingUser) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }

    const passwordSalt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, passwordSalt);
    const newUser = {
      id: crypto.randomUUID(),
      username,
      avatar,
      passwordHash,
      passwordSalt,
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    db.progress[newUser.id] = defaultProgress();
    db.learnerProfiles[newUser.id] = defaultLearnerProfile();
    const session = createSession(newUser.id);
    db.sessions.push(session);
    writeDatabase(db);

    return res.status(201).json({
      token: session.token,
      user: toPublicUser(newUser),
      progress: buildProgressSummary(db.progress[newUser.id]),
      learnerProfile: buildLearnerProfileSummary(db.learnerProfiles[newUser.id]),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to create account right now.' });
  }
});

app.post('/api/auth/signin', (req, res) => {
  try {
    const username = sanitizeUsername(req.body?.username);
    const password = String(req.body?.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const db = readDatabase();
    const user = db.users.find((candidate) => candidate.username === username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const incomingHash = hashPassword(password, user.passwordSalt);
    if (incomingHash !== user.passwordHash) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    purgeExpiredSessions(db);
    const session = createSession(user.id);
    db.sessions.push(session);
    if (!db.progress[user.id]) {
      db.progress[user.id] = defaultProgress();
    }
    writeDatabase(db);

    return res.json({
      token: session.token,
      user: toPublicUser(user),
      progress: buildProgressSummary(db.progress[user.id]),
      learnerProfile: getLearnerProfileForUser(db, user.id),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to sign in right now.' });
  }
});

app.get('/api/auth/session', requireAuth, (req, res) => {
  return res.json({
    user: toPublicUser(req.user),
    learnerProfile: getLearnerProfileForUser(req.db, req.user.id),
  });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const db = req.db;
  db.sessions = db.sessions.filter((session) => session.token !== req.session.token);
  writeDatabase(db);
  return res.json({ ok: true });
});

app.get('/api/progress/summary', requireAuth, (req, res) => {
  const progress = req.db.progress[req.user.id] || defaultProgress();
  if (!req.db.progress[req.user.id]) {
    req.db.progress[req.user.id] = progress;
    writeDatabase(req.db);
  }
  return res.json({ progress: buildProgressSummary(progress) });
});

app.get('/api/profile/learner', requireAuth, (req, res) => {
  return res.json({ learnerProfile: getLearnerProfileForUser(req.db, req.user.id) });
});

app.post('/api/profile/learner', requireAuth, (req, res) => {
  const profile = normalizeLearnerProfile(req.body?.profile || req.body, {
    existingProfile: req.db.learnerProfiles?.[req.user.id],
  });

  req.db.learnerProfiles[req.user.id] = profile;
  writeDatabase(req.db);

  return res.json({ learnerProfile: buildLearnerProfileSummary(profile) });
});

app.post('/api/progress/learn', requireAuth, (req, res) => {
  const letter = normalizeLetter(req.body?.letter);
  if (!letter) {
    return res.status(400).json({ error: 'Letter must be A-Z.' });
  }

  const progress = ensureUserProgress(req.db, req.user.id);
  if (!progress.learnedLetters.includes(letter)) {
    progress.learnedLetters.push(letter);
  }
  progress.lastActivityAt = new Date().toISOString();
  writeDatabase(req.db);

  return res.json({ progress: buildProgressSummary(progress) });
});

app.post('/api/progress/practice', requireAuth, (req, res) => {
  const letter = normalizeLetter(req.body?.letter);
  const numericScore = Number(req.body?.score);
  const passed = Boolean(req.body?.passed);

  if (!letter) {
    return res.status(400).json({ error: 'Letter must be A-Z.' });
  }
  if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
    return res.status(400).json({ error: 'Score must be a number between 0 and 100.' });
  }

  const progress = ensureUserProgress(req.db, req.user.id);
  const score = Math.round(numericScore);
  if (!progress.learnedLetters.includes(letter)) {
    progress.learnedLetters.push(letter);
  }
  progress.practiceAttempts += 1;
  progress.totalScore += score;
  progress.practiceCounts[letter] = Number(progress.practiceCounts[letter] || 0) + 1;
  progress.bestScores[letter] = Math.max(progress.bestScores[letter] || 0, score);
  if (score >= 99) {
    progress.masteryRecords[letter] = {
      score,
      masteredAt: new Date().toISOString(),
    };
    if (!progress.masteredLetters.includes(letter)) {
      progress.masteredLetters.push(letter);
    }
  }
  progress.lastActivityAt = new Date().toISOString();
  progress.recentPractice.unshift({
    letter,
    score,
    passed: passed || score >= 99,
    practiceCount: progress.practiceCounts[letter],
    mastered: score >= 99,
    at: progress.lastActivityAt,
  });
  progress.recentPractice = progress.recentPractice.slice(0, 24);
  writeDatabase(req.db);

  return res.json({ progress: buildProgressSummary(progress) });
});

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

function ensureDatabase() {
  const directory = path.dirname(DB_FILE);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    writeDatabase({
      users: [],
      sessions: [],
      progress: {},
      learnerProfiles: {},
    });
  }
}

function readDatabase() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      progress: parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : {},
      learnerProfiles: parsed.learnerProfiles && typeof parsed.learnerProfiles === 'object' ? parsed.learnerProfiles : {},
    };
  } catch {
    return {
      users: [],
      sessions: [],
      progress: {},
      learnerProfiles: {},
    };
  }
}

function writeDatabase(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function defaultProgress() {
  return {
    learnedLetters: [],
    masteredLetters: [],
    practiceAttempts: 0,
    totalScore: 0,
    bestScores: {},
    practiceCounts: {},
    masteryRecords: {},
    recentPractice: [],
    lastActivityAt: new Date().toISOString(),
  };
}

function ensureUserProgress(db, userId) {
  if (!db.progress[userId]) {
    db.progress[userId] = defaultProgress();
  }
  db.progress[userId] = normalizeProgress(db.progress[userId]);
  return db.progress[userId];
}

function buildProgressSummary(progress) {
  const safeProgress = normalizeProgress(progress || defaultProgress());
  const attempts = Number(safeProgress.practiceAttempts || 0);
  const totalScore = Number(safeProgress.totalScore || 0);
  const averageScore = attempts ? Math.round(totalScore / attempts) : 0;

  return {
    learnedCount: safeProgress.learnedLetters.length,
    learnedLetters: safeProgress.learnedLetters.slice(),
    masteredCount: safeProgress.masteredLetters.length,
    masteredLetters: safeProgress.masteredLetters.slice(),
    totalAttempts: attempts,
    averageScore,
    bestScores: { ...(safeProgress.bestScores || {}) },
    practiceCounts: { ...(safeProgress.practiceCounts || {}) },
    masteryRecords: { ...(safeProgress.masteryRecords || {}) },
    recentPractice: Array.isArray(safeProgress.recentPractice) ? safeProgress.recentPractice.slice(0, 10) : [],
    lastActivityAt: safeProgress.lastActivityAt || null,
  };
}

function defaultLearnerProfile() {
  const timestamp = new Date().toISOString();
  return {
    onboardingComplete: false,
    learnerType: '',
    experienceLevel: '',
    primaryGoal: '',
    preferredPracticeStyle: '',
    practiceMood: '',
    schedulePreference: '',
    motivationStyle: '',
    firstMilestone: '',
    challengeAreas: [],
    answers: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const LEARNER_PROFILE_OPTIONS = {
  goal: ['brand_new', 'alphabet_first', 'communication', 'school_work', 'speed_accuracy'],
  experience: ['none', 'few_letters', 'alphabet_slowly', 'some_signs', 'reviewing'],
  learnBest: ['steps', 'visual_model', 'instant_feedback', 'games', 'repetition'],
  challenge: ['remembering', 'hand_shape', 'speed', 'confidence', 'consistency'],
  practiceMood: ['calm_guided', 'game_like', 'accuracy_focused', 'short_daily', 'competitive'],
  time: ['five_min_daily', 'ten_fifteen_daily', 'twenty_plus_daily', 'few_times_week', 'flexible'],
  milestone: ['learn_az', 'master_tricky', 'fingerspell_name', 'daily_confidence', 'high_accuracy'],
  motivation: ['streaks_badges', 'gentle_messages', 'goals_checklists', 'scores_rankings', 'self_directed'],
};

function getLearnerProfileForUser(db, userId) {
  const profile = db.learnerProfiles?.[userId];
  return profile ? buildLearnerProfileSummary(profile) : null;
}

function buildLearnerProfileSummary(profile) {
  return normalizeLearnerProfile(profile, { preserveCompletion: true });
}

function normalizeLearnerProfile(profile, options = {}) {
  const existingProfile = options.existingProfile && typeof options.existingProfile === 'object'
    ? options.existingProfile
    : null;
  const base = existingProfile || defaultLearnerProfile();
  const source = profile && typeof profile === 'object' ? profile : {};
  const answers = source.answers && typeof source.answers === 'object' ? source.answers : {};
  const now = new Date().toISOString();

  const normalizedAnswers = Object.entries(LEARNER_PROFILE_OPTIONS).reduce((acc, [key, allowedValues]) => {
    acc[key] = sanitizeOption(answers[key] || source[key], allowedValues);
    return acc;
  }, {});

  const challengeArea = normalizedAnswers.challenge;
  const learnerType = sanitizeText(source.learnerType, 48) || deriveLearnerType(normalizedAnswers);

  return {
    onboardingComplete: options.preserveCompletion
      ? Boolean(source.onboardingComplete)
      : true,
    learnerType,
    experienceLevel: normalizedAnswers.experience,
    primaryGoal: normalizedAnswers.goal,
    preferredPracticeStyle: normalizedAnswers.learnBest,
    practiceMood: normalizedAnswers.practiceMood,
    schedulePreference: normalizedAnswers.time,
    motivationStyle: normalizedAnswers.motivation,
    firstMilestone: normalizedAnswers.milestone,
    challengeAreas: challengeArea ? [challengeArea] : [],
    answers: normalizedAnswers,
    createdAt: sanitizeText(source.createdAt || base.createdAt, 40) || now,
    updatedAt: options.preserveCompletion
      ? sanitizeText(source.updatedAt || base.updatedAt, 40) || now
      : now,
  };
}

function sanitizeOption(value, allowedValues) {
  const safe = String(value || '').trim();
  return allowedValues.includes(safe) ? safe : '';
}

function sanitizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function deriveLearnerType(answers) {
  if (answers.practiceMood === 'game_like' || answers.practiceMood === 'competitive' || answers.learnBest === 'games') {
    return 'Game Sprinter';
  }
  if (answers.primaryGoal === 'communication') {
    return 'Communication Builder';
  }
  if (answers.learnBest === 'visual_model') {
    return 'Visual Explorer';
  }
  if (answers.practiceMood === 'accuracy_focused' || answers.primaryGoal === 'speed_accuracy') {
    return 'Accuracy Tuner';
  }
  if (answers.schedulePreference === 'five_min_daily' || answers.schedulePreference === 'ten_fifteen_daily') {
    return 'Consistency Learner';
  }
  return 'Guided Builder';
}

function normalizeProgress(progress) {
  const base = defaultProgress();
  const safe = {
    ...base,
    ...(progress && typeof progress === 'object' ? progress : {}),
  };

  safe.learnedLetters = uniqueLetters(safe.learnedLetters);
  safe.practiceAttempts = Number(safe.practiceAttempts || 0);
  safe.totalScore = Number(safe.totalScore || 0);
  safe.bestScores = safe.bestScores && typeof safe.bestScores === 'object' ? safe.bestScores : {};
  safe.practiceCounts = safe.practiceCounts && typeof safe.practiceCounts === 'object' ? safe.practiceCounts : {};
  safe.masteryRecords = safe.masteryRecords && typeof safe.masteryRecords === 'object' ? safe.masteryRecords : {};
  safe.recentPractice = Array.isArray(safe.recentPractice) ? safe.recentPractice : [];

  Object.entries(safe.bestScores).forEach(([letter, score]) => {
    const normalizedLetter = normalizeLetter(letter);
    if (!normalizedLetter || Number(score) < 99) return;
    if (!safe.masteryRecords[normalizedLetter]) {
      safe.masteryRecords[normalizedLetter] = {
        score: Number(score),
        masteredAt: safe.lastActivityAt || new Date().toISOString(),
      };
    }
  });

  safe.masteredLetters = Object.keys(safe.masteryRecords)
    .map((letter) => normalizeLetter(letter))
    .filter(Boolean)
    .sort();

  return safe;
}

function uniqueLetters(value) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((letter) => normalizeLetter(letter))
      .filter(Boolean)
  )).sort();
}

function sanitizeUsername(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
    return '';
  }
  return normalized;
}

function sanitizeAvatar(value) {
  const safe = String(value || '').trim().toLowerCase();
  if (['otter', 'ray', 'octo'].includes(safe)) {
    return safe;
  }
  return 'otter';
}

function toPublicUser(user) {
  return {
    id: user.id,
    username: user.username,
    avatar: user.avatar || 'otter',
    createdAt: user.createdAt || null,
  };
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 120000, 64, 'sha512').toString('hex');
}

function createSession(userId) {
  const timestamp = new Date().toISOString();
  return {
    token: crypto.randomBytes(32).toString('hex'),
    userId,
    createdAt: timestamp,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    lastSeenAt: timestamp,
  };
}

function parseAuthToken(req) {
  const header = String(req.headers.authorization || '');
  const [scheme, value] = header.split(' ');
  if (scheme !== 'Bearer' || !value) {
    return '';
  }
  return value.trim();
}

function purgeExpiredSessions(db) {
  const now = Date.now();
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((session) => Date.parse(session.expiresAt || '') > now);
  return before !== db.sessions.length;
}

function requireAuth(req, res, next) {
  const token = parseAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing session token.' });
  }

  const db = readDatabase();
  const didPurge = purgeExpiredSessions(db);
  const session = db.sessions.find((candidate) => candidate.token === token);
  if (!session) {
    if (didPurge) {
      writeDatabase(db);
    }
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }

  const user = db.users.find((candidate) => candidate.id === session.userId);
  if (!user) {
    db.sessions = db.sessions.filter((candidate) => candidate.token !== token);
    writeDatabase(db);
    return res.status(401).json({ error: 'Invalid session user.' });
  }

  session.lastSeenAt = new Date().toISOString();
  req.db = db;
  req.user = user;
  req.session = session;
  writeDatabase(db);
  next();
}

function normalizeLetter(value) {
  const letter = String(value || '').trim().toUpperCase();
  return /^[A-Z]$/.test(letter) ? letter : '';
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
