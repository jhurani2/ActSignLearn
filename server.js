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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const LLM_AGENT_URL = process.env.LLM_AGENT_URL || '';
const LLM_AGENT_API_KEY = process.env.LLM_AGENT_API_KEY || '';
const PLAN_AGENT_TIMEOUT_MS = Math.max(1500, Number(process.env.PLAN_AGENT_TIMEOUT_MS || 7000));
const PLAN_AGENT_RATE_LIMIT_PAUSE_MS = Math.max(30000, Number(process.env.PLAN_AGENT_RATE_LIMIT_PAUSE_MS || 180000));
const DB_FILE = path.join(__dirname, 'data', 'app-db.json');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
let openAiPlanAgentPauseUntil = 0;
let groqPlanAgentPauseUntil = 0;
const AVAILABLE_PLAN_DECKS = [
  {
    id: 'alphabet',
    title: 'Alphabet',
    mode: 'learn',
    gameMode: '',
    description: 'A-Z hand shapes with guided steps and a visual model.',
  },
  {
    id: 'alphabet-review',
    title: 'Alphabet Review',
    mode: 'practice',
    gameMode: '',
    description: 'Camera feedback for alphabet practice.',
  },
  {
    id: 'speed-sign',
    title: 'SpeedSign',
    mode: 'practice',
    gameMode: 'speed-sign',
    description: 'Timed ASL letter rush.',
  },
  {
    id: 'sign-duel',
    title: 'Sign Duel',
    mode: 'game',
    gameMode: 'sign-duel',
    description: 'Race a friend or play left hand vs right hand.',
  },
];

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
      personalizedPlan: null,
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
      personalizedPlan: getPersonalizedPlanForUser(db, user.id),
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
    personalizedPlan: getPersonalizedPlanForUser(req.db, req.user.id),
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

app.post('/api/profile/learner', requireAuth, async (req, res) => {
  const profile = normalizeLearnerProfile(req.body?.profile || req.body, {
    existingProfile: req.db.learnerProfiles?.[req.user.id],
  });

  req.db.learnerProfiles[req.user.id] = profile;
  const progress = ensureUserProgress(req.db, req.user.id);
  const personalizedPlan = await generatePersonalizedPlan({
    user: req.user,
    learnerProfile: profile,
    progress,
    reason: 'onboarding_complete',
    existingPlan: req.db.personalizedPlans?.[req.user.id],
  });
  req.db.personalizedPlans[req.user.id] = personalizedPlan;
  writeDatabase(req.db);

  return res.json({
    learnerProfile: buildLearnerProfileSummary(profile),
    personalizedPlan,
  });
});

app.get('/api/plan/current', requireAuth, (req, res) => {
  return res.json({ personalizedPlan: getPersonalizedPlanForUser(req.db, req.user.id) });
});

app.post('/api/plan/generate', requireAuth, async (req, res) => {
  const learnerProfile = getLearnerProfileForUser(req.db, req.user.id);
  if (!learnerProfile?.onboardingComplete) {
    return res.status(409).json({ error: 'Complete learner onboarding before generating a plan.' });
  }

  const progress = ensureUserProgress(req.db, req.user.id);
  const provider = sanitizeText(req.body?.provider, 24).toLowerCase();
  const personalizedPlan = await generatePersonalizedPlan({
    user: req.user,
    learnerProfile,
    progress,
    reason: sanitizeText(req.body?.reason, 48) || 'manual_refresh',
    existingPlan: req.db.personalizedPlans?.[req.user.id],
    preferredProvider: provider === 'groq' ? 'groq' : '',
    refreshSeed: sanitizeText(req.body?.refreshSeed, 96) || crypto.randomUUID(),
  });

  req.db.personalizedPlans[req.user.id] = personalizedPlan;
  writeDatabase(req.db);

  return res.json({ personalizedPlan });
});

app.post('/api/plan/time', requireAuth, (req, res) => {
  const progress = ensureUserProgress(req.db, req.user.id);
  const plan = getPersonalizedPlanForUser(req.db, req.user.id);
  const entry = normalizePlanTimeEntry(req.body || {});

  if (!entry) {
    return res.status(400).json({ error: 'Plan time entry must include a plan ID and seconds.' });
  }

  if (!plan || plan.id !== entry.planId) {
    return res.status(404).json({ error: 'That plan is no longer active.' });
  }

  const updatedPlan = recordPlanTime(plan, entry);
  req.db.personalizedPlans[req.user.id] = updatedPlan;
  progress.planTimeSeconds = Number(progress.planTimeSeconds || 0) + entry.seconds;
  progress.lastActivityAt = new Date().toISOString();
  writeDatabase(req.db);

  return res.json({
    personalizedPlan: updatedPlan,
    progress: buildProgressSummary(progress),
  });
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
      personalizedPlans: {},
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
      personalizedPlans: parsed.personalizedPlans && typeof parsed.personalizedPlans === 'object' ? parsed.personalizedPlans : {},
    };
  } catch {
    return {
      users: [],
      sessions: [],
      progress: {},
      learnerProfiles: {},
      personalizedPlans: {},
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
    planTimeSeconds: 0,
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
    planTimeSeconds: Number(safeProgress.planTimeSeconds || 0),
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

const PROFILE_OPTION_LABELS = {
  brand_new: 'Brand new',
  alphabet_first: 'Alphabet first',
  communication: 'Everyday communication',
  school_work: 'School or work',
  speed_accuracy: 'Speed and accuracy',
  none: 'No ASL yet',
  few_letters: 'A few letters',
  alphabet_slowly: 'Alphabet slowly',
  some_signs: 'Some signs',
  reviewing: 'Reviewing',
  steps: 'Step by step',
  visual_model: 'Visual model',
  instant_feedback: 'Instant feedback',
  games: 'Games',
  repetition: 'Repetition',
  remembering: 'Remembering',
  hand_shape: 'Hand shape',
  speed: 'Speed',
  confidence: 'Confidence',
  consistency: 'Consistency',
  calm_guided: 'Calm',
  game_like: 'Game-like',
  accuracy_focused: 'Accuracy first',
  short_daily: 'Short daily',
  competitive: 'Competitive',
  five_min_daily: '5 minutes daily',
  ten_fifteen_daily: '10-15 minutes daily',
  twenty_plus_daily: '20+ minutes daily',
  few_times_week: 'A few times weekly',
  flexible: 'Flexible',
  learn_az: 'Learn A-Z',
  master_tricky: 'Master tricky letters',
  fingerspell_name: 'Fingerspell my name',
  daily_confidence: 'Daily confidence',
  high_accuracy: 'High camera accuracy',
  streaks_badges: 'Streaks',
  gentle_messages: 'Gentle reminders',
  goals_checklists: 'Checklists',
  scores_rankings: 'Scores',
  self_directed: 'Self-directed',
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
  const primaryGoal = answers.primaryGoal || answers.goal;
  const schedulePreference = answers.schedulePreference || answers.time;

  if (answers.practiceMood === 'game_like' || answers.practiceMood === 'competitive' || answers.learnBest === 'games') {
    return 'Game Sprinter';
  }
  if (primaryGoal === 'communication') {
    return 'Communication Builder';
  }
  if (answers.learnBest === 'visual_model') {
    return 'Visual Explorer';
  }
  if (answers.practiceMood === 'accuracy_focused' || primaryGoal === 'speed_accuracy') {
    return 'Accuracy Tuner';
  }
  if (schedulePreference === 'five_min_daily' || schedulePreference === 'ten_fifteen_daily') {
    return 'Consistency Learner';
  }
  return 'Guided Builder';
}

function getPersonalizedPlanForUser(db, userId) {
  const plan = db.personalizedPlans?.[userId];
  return plan && typeof plan === 'object' ? plan : null;
}

async function generatePersonalizedPlan({
  user,
  learnerProfile,
  progress,
  reason,
  existingPlan,
  preferredProvider = '',
  refreshSeed = '',
}) {
  const progressSummary = buildProgressSummary(progress);
  const profile = buildLearnerProfileSummary(learnerProfile);
  const profileInterpretation = interpretLearnerProfile(profile);
  const curriculumPlan = buildCurriculumPlan(profile, progressSummary, profileInterpretation);
  const accessibilityPlan = buildAccessibilityPlan(profile, profileInterpretation);
  const quizSummary = buildQuizSummary(profile);
  const creationSummary = buildPlanCreationSummary(profile, progressSummary, curriculumPlan);
  const requestSeed = refreshSeed || crypto.randomUUID();
  const refreshDirective = buildPlanRefreshDirective({
    reason,
    refreshSeed: requestSeed,
    existingPlan,
  });
  const agentResult = await callPlanLlmAgent({
    profile,
    progressSummary,
    curriculumPlan,
    accessibilityPlan,
    creationSummary,
    existingPlan,
    reason,
    refreshSeed: requestSeed,
    refreshDirective,
    preferredProvider,
  });
  const now = new Date().toISOString();
  const planId = crypto
    .createHash('sha1')
    .update(`${user.id}:${now}:${reason}:${requestSeed}`)
    .digest('hex')
    .slice(0, 12);
  const version = Math.max(1, Number(existingPlan?.version || 0) + 1);
  const agentCurriculumPlan = applyAgentSuggestions(curriculumPlan, agentResult.suggestions, {
    profile,
    progressSummary,
    interpretation: profileInterpretation,
  });
  const mergedCurriculumPlan = ensureRefreshVariation(agentCurriculumPlan, {
    existingPlan,
    profile,
    progressSummary,
    interpretation: profileInterpretation,
    refreshDirective,
  });
  const primaryFocusLetters = getPrimaryFocusLetters(mergedCurriculumPlan.focusLetters);

  return {
    id: `plan-${planId}`,
    version,
    source: agentResult.status === 'called' ? `${agentResult.source}+local-planner` : 'local-planner-agent',
    generatedAt: now,
    refreshedAt: now,
    reason,
    status: 'ready',
    learnerType: profile.learnerType || profileInterpretation.learnerType,
    title: mergedCurriculumPlan.title,
    summary: mergedCurriculumPlan.summary,
    weeklyGoal: mergedCurriculumPlan.weeklyGoal,
    dailySessionMinutes: profileInterpretation.sessionMinutes,
    recommendedStartDeckId: mergedCurriculumPlan.recommendedDeckOrder[0]?.deckId || 'alphabet',
    recommendedDeckOrder: mergedCurriculumPlan.recommendedDeckOrder,
    focusLetters: mergedCurriculumPlan.focusLetters,
    primaryFocusLetters,
    todaysPlan: mergedCurriculumPlan.todaysPlan,
    weeklyPlan: mergedCurriculumPlan.weeklyPlan,
    accessibility: accessibilityPlan,
    quizSummary,
    creationSummary,
    coachNote: agentResult.suggestions?.coachNote || creationSummary.summary,
    customization: buildCustomizationNotes(profile, profileInterpretation, mergedCurriculumPlan, accessibilityPlan),
    adaptationRules: buildAdaptationRules(profile, profileInterpretation),
    timeTracking: preservePlanTime(existingPlan),
    llmAgent: {
      status: agentResult.status,
      source: agentResult.source,
      model: agentResult.model,
      message: agentResult.message,
    },
    agentTrace: [
      {
        stage: 'Quiz',
        output: `${quizSummary[0]?.value || 'Goal set'}; ${quizSummary[2]?.value || 'practice style set'}.`,
      },
      {
        stage: 'Planner',
        output: `Recommended ${mergedCurriculumPlan.focusLetters.join(', ')} and ${mergedCurriculumPlan.recommendedDeckOrder[0]?.title}.`,
      },
      {
        stage: 'LLM agent',
        output: agentResult.message,
      },
    ],
  };
}

function buildQuizSummary(profile) {
  return [
    { label: 'Goal', value: labelProfileValue(profile.primaryGoal) || 'Learn ASL' },
    { label: 'Level', value: labelProfileValue(profile.experienceLevel) || 'Getting started' },
    { label: 'Practice', value: labelProfileValue(profile.practiceMood) || 'Balanced' },
    { label: 'Time', value: labelProfileValue(profile.schedulePreference) || 'Flexible' },
    { label: 'Challenge', value: labelProfileValue(profile.challengeAreas?.[0]) || 'None selected' },
  ];
}

function buildPlanCreationSummary(profile, progressSummary, curriculumPlan) {
  const scores = progressSummary.bestScores || {};
  const scoredLetters = Object.keys(scores);
  const weakestLetters = scoredLetters
    .filter((letter) => Number(scores[letter]) < 99)
    .sort((a, b) => Number(scores[a]) - Number(scores[b]))
    .slice(0, 3);

  const signals = [
    `Quiz goal: ${labelProfileValue(profile.primaryGoal) || 'learn ASL'}`,
    `Main challenge: ${labelProfileValue(profile.challengeAreas?.[0]) || 'none selected'}`,
    progressSummary.totalAttempts
      ? `Practice history: ${progressSummary.totalAttempts} attempts, ${progressSummary.averageScore}% average`
      : 'Practice history: no scored attempts yet',
    weakestLetters.length
      ? `Needs review: ${weakestLetters.join(', ')}`
      : `Next letters: ${curriculumPlan.focusLetters.slice(0, 3).join(', ')}`,
  ];

  return {
    summary: 'Built from your quiz answers, scores, and unmastered letters.',
    signals,
  };
}

function labelProfileValue(value) {
  return PROFILE_OPTION_LABELS[String(value || '').trim()] || '';
}

function applyAgentSuggestions(curriculumPlan, suggestions, context = {}) {
  if (!suggestions || typeof suggestions !== 'object') {
    return curriculumPlan;
  }

  const suggestedFocusLetters = normalizeLetterList(suggestions.focusLetters);
  const focusLetters = suggestedFocusLetters.length >= 3
    ? suggestedFocusLetters
    : curriculumPlan.focusLetters;
  const focusChanged = focusLetters.join('|') !== (curriculumPlan.focusLetters || []).join('|');
  const recommendedDeckOrder = curriculumPlan.recommendedDeckOrder;
  const baseSummary = focusChanged && context.interpretation
    ? getPlanSummary(context.profile, context.interpretation, focusLetters)
    : curriculumPlan.summary;
  const baseWeeklyGoal = focusChanged && context.progressSummary
    ? getWeeklyGoal(context.profile, focusLetters, context.progressSummary)
    : curriculumPlan.weeklyGoal;

  return {
    ...curriculumPlan,
    focusLetters,
    primaryFocusLetters: getPrimaryFocusLetters(focusLetters),
    title: sanitizeText(suggestions.title, 80) || curriculumPlan.title,
    summary: sanitizeText(suggestions.summary, 180) || baseSummary,
    weeklyGoal: sanitizeText(suggestions.weeklyGoal, 180) || baseWeeklyGoal,
    todaysPlan: focusChanged && context.profile && context.interpretation
      ? buildTodaysPlan(context.profile, context.interpretation, focusLetters, recommendedDeckOrder)
      : curriculumPlan.todaysPlan,
    weeklyPlan: focusChanged && context.profile && context.interpretation
      ? buildWeeklyPlan(context.profile, context.interpretation, focusLetters)
      : curriculumPlan.weeklyPlan,
  };
}

const PLAN_REFRESH_VARIANTS = [
  {
    name: 'confidence-check',
    instruction: 'Make this version feel like a confidence check: concise, upbeat, and focused on clean reps before speed.',
  },
  {
    name: 'speed-builder',
    instruction: 'Make this version feel like a speed builder: rotate the focus order and add a little more momentum without sounding intense.',
  },
  {
    name: 'form-reset',
    instruction: 'Make this version feel like a form reset: prioritize hand-shape clarity and a fresh set of focus letters when possible.',
  },
  {
    name: 'streak-day',
    instruction: 'Make this version feel like a streak day: short, satisfying, and noticeably different from the previous plan wording.',
  },
];

function buildPlanRefreshDirective({ reason, refreshSeed, existingPlan }) {
  if (reason !== 'dashboard_refresh') return null;

  const variantIndex = getSeedIndex(refreshSeed, PLAN_REFRESH_VARIANTS.length);
  const variant = PLAN_REFRESH_VARIANTS[variantIndex] || PLAN_REFRESH_VARIANTS[0];

  return {
    nonce: refreshSeed,
    variantIndex,
    variant: variant.name,
    instruction: variant.instruction,
    avoidTitle: sanitizeText(existingPlan?.title, 80),
    avoidSummary: sanitizeText(existingPlan?.summary, 180),
    previousFocusLetters: normalizeLetterList(existingPlan?.focusLetters || existingPlan?.primaryFocusLetters),
  };
}

function ensureRefreshVariation(curriculumPlan, context = {}) {
  const directive = context.refreshDirective;
  if (!directive || !context.existingPlan) {
    return curriculumPlan;
  }

  const existingPrimary = getPrimaryFocusLetters(context.existingPlan.focusLetters || context.existingPlan.primaryFocusLetters);
  const nextPrimary = getPrimaryFocusLetters(curriculumPlan.focusLetters);
  const hasVisibleChange =
    normalizePlanText(curriculumPlan.title) !== normalizePlanText(context.existingPlan.title) ||
    normalizePlanText(curriculumPlan.summary) !== normalizePlanText(context.existingPlan.summary) ||
    nextPrimary.join('|') !== existingPrimary.join('|');

  if (hasVisibleChange) {
    return curriculumPlan;
  }

  const focusLetters = rotatePlanLetters(curriculumPlan.focusLetters, directive.variantIndex + 1);
  const summary = getRefreshVariantSummary(context.interpretation, focusLetters, directive);

  return {
    ...curriculumPlan,
    focusLetters,
    primaryFocusLetters: getPrimaryFocusLetters(focusLetters),
    summary,
    weeklyGoal: getWeeklyGoal(context.profile, focusLetters, context.progressSummary),
    todaysPlan: buildTodaysPlan(context.profile, context.interpretation, focusLetters, curriculumPlan.recommendedDeckOrder),
    weeklyPlan: buildWeeklyPlan(context.profile, context.interpretation, focusLetters),
  };
}

function rotatePlanLetters(focusLetters, offset) {
  const letters = normalizeLetterList(focusLetters);
  if (letters.length < 2) return letters;

  const safeOffset = Math.abs(Number(offset || 0)) % letters.length;
  if (!safeOffset) return letters.slice().reverse();

  return [...letters.slice(safeOffset), ...letters.slice(0, safeOffset)];
}

function getRefreshVariantSummary(interpretation, focusLetters, directive) {
  const pace = interpretation?.pace === 'brisk' ? 'Faster' : interpretation?.pace === 'steady' ? 'Calm' : 'Balanced';
  const primaryLetters = getPrimaryFocusLetters(focusLetters).join(', ');
  if (directive.variant === 'speed-builder') return `${pace} speed round focused on ${primaryLetters}.`;
  if (directive.variant === 'form-reset') return `${pace} form reset focused on ${primaryLetters}.`;
  if (directive.variant === 'streak-day') return `${pace} streak plan focused on ${primaryLetters}.`;
  return `${pace} confidence check focused on ${primaryLetters}.`;
}

function normalizePlanText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getSeedIndex(seed, length) {
  if (!length) return 0;
  const digest = crypto.createHash('sha1').update(String(seed || '')).digest('hex');
  return parseInt(digest.slice(0, 8), 16) % length;
}

async function callPlanLlmAgent({
  profile,
  progressSummary,
  curriculumPlan,
  accessibilityPlan,
  creationSummary,
  existingPlan,
  reason,
  refreshSeed,
  refreshDirective,
  preferredProvider,
}) {
  const payload = { profile, progressSummary, curriculumPlan, accessibilityPlan, creationSummary, existingPlan, reason, refreshSeed, refreshDirective };

  if (preferredProvider === 'groq') {
    if (!GROQ_API_KEY) {
      return {
        status: 'skipped',
        source: 'groq-chat-completions',
        model: GROQ_MODEL,
        suggestions: null,
        message: 'Add GROQ_API_KEY to use Groq for refreshed plans.',
      };
    }

    return callGroqPlanAgent(payload);
  }

  if (LLM_AGENT_URL) {
    return callCustomPlanAgent(payload);
  }

  if (GROQ_API_KEY) {
    if (groqPlanAgentPauseUntil > Date.now()) {
      return {
        status: 'paused',
        source: 'groq-chat-completions',
        model: GROQ_MODEL,
        suggestions: null,
        message: 'Groq limit reached; local plan is ready.',
      };
    }

    return callGroqPlanAgent(payload);
  }

  if (OPENAI_API_KEY) {
    if (openAiPlanAgentPauseUntil > Date.now()) {
      return {
        status: 'paused',
        source: 'openai-responses',
        model: OPENAI_MODEL,
        suggestions: null,
        message: 'LLM limit reached; local plan is ready.',
      };
    }

    return callOpenAiPlanAgent(payload);
  }

  return {
    status: 'skipped',
    source: 'none',
    model: null,
    suggestions: null,
    message: 'Add GROQ_API_KEY, OPENAI_API_KEY, or LLM_AGENT_URL to use the LLM agent.',
  };
}

async function callCustomPlanAgent(payload) {
  try {
    const response = await fetchWithTimeout(LLM_AGENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(LLM_AGENT_API_KEY ? { Authorization: `Bearer ${LLM_AGENT_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        task: 'asl_personalized_plan',
        ...payload,
      }),
    });

    if (!response.ok) {
      throw new Error(await upstreamError(response, 'Custom plan agent failed'));
    }

    const data = await response.json();
    const suggestions = normalizeAgentSuggestions(data?.suggestions || data);
    return {
      status: 'called',
      source: 'custom-llm-agent',
      model: data?.model || null,
      suggestions,
      message: suggestions
        ? 'Custom LLM agent refined the plan wording.'
        : 'Custom LLM agent was called; local planner kept the final wording.',
    };
  } catch (error) {
    return {
      status: 'failed',
      source: 'custom-llm-agent',
      model: null,
      suggestions: null,
      message: 'Custom LLM agent unavailable; local plan is ready.',
    };
  }
}

async function callGroqPlanAgent(payload) {
  try {
    const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: payload.reason === 'dashboard_refresh' ? 0.65 : 0.25,
        messages: [
          {
            role: 'system',
            content: [
              'You are an ASL learning plan agent.',
              'Return only compact JSON with title, summary, weeklyGoal, coachNote, and optional focusLetters.',
              'For dashboard_refresh, follow refreshDirective exactly enough that title, summary, or focusLetters visibly change.',
              'Never repeat previousPlan title, summary, and focusLetters together.',
              'If you include focusLetters, use 3 to 6 uppercase single ASL letters.',
              'Keep deck ids from the local planner.',
              'Make every visible letter list match the chosen focusLetters.',
              'Use simple wording for a learner dashboard.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify(buildPlanAgentPayload(payload)),
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        groqPlanAgentPauseUntil = Date.now() + PLAN_AGENT_RATE_LIMIT_PAUSE_MS;
      }
      return {
        status: response.status === 429 ? 'limited' : 'failed',
        source: 'groq-chat-completions',
        model: GROQ_MODEL,
        suggestions: null,
        message: getGroqPlanAgentFallbackMessage(response.status),
      };
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const suggestions = normalizeAgentSuggestions(parseJsonObject(text));

    return {
      status: 'called',
      source: 'groq-chat-completions',
      model: data?.model || GROQ_MODEL,
      suggestions,
      message: suggestions
        ? 'Groq refined the plan wording.'
        : 'Groq was called; local planner kept the final wording.',
    };
  } catch (error) {
    return {
      status: 'failed',
      source: 'groq-chat-completions',
      model: GROQ_MODEL,
      suggestions: null,
      message: getPlanAgentErrorMessage(error),
    };
  }
}

async function callOpenAiPlanAgent(payload) {
  try {
    const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions: [
          'You are an ASL learning plan agent.',
          'Return only compact JSON with title, summary, weeklyGoal, coachNote, and optional focusLetters.',
          'For dashboard_refresh, follow refreshDirective exactly enough that title, summary, or focusLetters visibly change.',
          'Never repeat previousPlan title, summary, and focusLetters together.',
          'If you include focusLetters, use 3 to 6 uppercase single ASL letters.',
          'Keep deck ids from the local planner.',
          'Make every visible letter list match the chosen focusLetters.',
          'Use simple wording for a learner dashboard.',
        ].join(' '),
        input: JSON.stringify(buildPlanAgentPayload(payload)),
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        openAiPlanAgentPauseUntil = Date.now() + PLAN_AGENT_RATE_LIMIT_PAUSE_MS;
      }
      return {
        status: response.status === 429 ? 'limited' : 'failed',
        source: 'openai-responses',
        model: OPENAI_MODEL,
        suggestions: null,
        message: getOpenAiPlanAgentFallbackMessage(response.status),
      };
    }

    const data = await response.json();
    const text = extractResponseText(data);
    const suggestions = normalizeAgentSuggestions(parseJsonObject(text));

    return {
      status: 'called',
      source: 'openai-responses',
      model: data?.model || OPENAI_MODEL,
      suggestions,
      message: suggestions
        ? 'LLM agent refined the plan wording.'
        : 'LLM agent was called; local planner kept the final wording.',
    };
  } catch (error) {
    return {
      status: 'failed',
      source: 'openai-responses',
      model: OPENAI_MODEL,
      suggestions: null,
      message: getPlanAgentErrorMessage(error),
    };
  }
}

function buildPlanAgentPayload(payload) {
  return {
    request: {
      reason: payload.reason || 'manual_refresh',
      refreshSeed: payload.refreshSeed || '',
    },
    refreshDirective: payload.refreshDirective,
    previousPlan: payload.existingPlan ? {
      title: sanitizeText(payload.existingPlan.title, 80),
      summary: sanitizeText(payload.existingPlan.summary, 180),
      weeklyGoal: sanitizeText(payload.existingPlan.weeklyGoal, 180),
      focusLetters: normalizeLetterList(payload.existingPlan.focusLetters || payload.existingPlan.primaryFocusLetters),
    } : null,
    quiz: buildQuizSummary(payload.profile),
    progress: payload.progressSummary,
    localPlan: {
      title: payload.curriculumPlan.title,
      summary: payload.curriculumPlan.summary,
      weeklyGoal: payload.curriculumPlan.weeklyGoal,
      focusLetters: payload.curriculumPlan.focusLetters,
      todaysPlan: payload.curriculumPlan.todaysPlan,
    },
    settings: payload.accessibilityPlan,
    creationSummary: payload.creationSummary,
  };
}

function getGroqPlanAgentFallbackMessage(status) {
  if (status === 429) {
    return 'Groq limit reached; local plan is ready.';
  }
  if (status === 401) {
    return 'Groq key was rejected; local plan is ready.';
  }
  if (status === 403) {
    return 'Groq access is blocked; local plan is ready.';
  }
  if (status === 404) {
    return 'Groq model was not found; local plan is ready.';
  }
  if (status >= 500) {
    return 'Groq is temporarily unavailable; local plan is ready.';
  }
  return 'Groq unavailable; local plan is ready.';
}

function getOpenAiPlanAgentFallbackMessage(status) {
  if (status === 429) {
    return 'LLM limit reached; local plan is ready.';
  }
  if (status === 401) {
    return 'OpenAI key was rejected; local plan is ready.';
  }
  if (status === 403) {
    return 'OpenAI access is blocked; local plan is ready.';
  }
  if (status >= 500) {
    return 'OpenAI is temporarily unavailable; local plan is ready.';
  }
  return 'LLM agent unavailable; local plan is ready.';
}

function getPlanAgentErrorMessage(error) {
  if (error?.name === 'AbortError') {
    return 'LLM agent timed out; local plan is ready.';
  }
  return 'LLM agent unavailable; local plan is ready.';
}

async function fetchWithTimeout(url, options) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), PLAN_AGENT_TIMEOUT_MS)
    : null;

  try {
    return await fetch(url, {
      ...options,
      signal: controller?.signal,
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string') {
    return data.output_text;
  }

  const content = Array.isArray(data?.output)
    ? data.output.flatMap((item) => Array.isArray(item.content) ? item.content : [])
    : [];
  const textParts = content
    .map((item) => item?.text || item?.content || '')
    .filter((value) => typeof value === 'string' && value.trim());

  return textParts.join('\n').trim();
}

function parseJsonObject(text) {
  if (!text || typeof text !== 'string') return null;

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeAgentSuggestions(value) {
  if (!value || typeof value !== 'object') return null;

  const suggestions = {
    title: sanitizeText(value.title, 80),
    summary: sanitizeText(value.summary, 180),
    weeklyGoal: sanitizeText(value.weeklyGoal, 180),
    coachNote: sanitizeText(value.coachNote, 180),
    focusLetters: normalizeLetterList(value.focusLetters),
  };

  const hasSuggestion = suggestions.title ||
    suggestions.summary ||
    suggestions.weeklyGoal ||
    suggestions.coachNote ||
    suggestions.focusLetters.length > 0;

  return hasSuggestion ? suggestions : null;
}

function normalizeLetterList(value) {
  const rawLetters = Array.isArray(value)
    ? value
    : typeof value === 'string'
    ? value.split(/[^a-z]/i)
    : [];
  const letters = rawLetters
    .map((letter) => normalizeLetter(letter))
    .filter(Boolean);

  return Array.from(new Set(letters)).slice(0, 6);
}

function preservePlanTime(existingPlan) {
  const tracking = existingPlan?.timeTracking;
  if (!tracking || typeof tracking !== 'object') {
    return emptyPlanTimeTracking();
  }

  return {
    totalSeconds: Math.max(0, Number(tracking.totalSeconds || 0)),
    byStep: cleanSecondsMap(tracking.byStep),
    byLetter: cleanSecondsMap(tracking.byLetter),
    byDeck: cleanSecondsMap(tracking.byDeck),
    byMode: cleanSecondsMap(tracking.byMode),
    recent: Array.isArray(tracking.recent) ? tracking.recent.slice(0, 12) : [],
    updatedAt: sanitizeText(tracking.updatedAt, 40) || null,
  };
}

function emptyPlanTimeTracking() {
  return {
    totalSeconds: 0,
    byStep: {},
    byLetter: {},
    byDeck: {},
    byMode: {},
    recent: [],
    updatedAt: null,
  };
}

function cleanSecondsMap(value) {
  if (!value || typeof value !== 'object') return {};

  return Object.entries(value).reduce((acc, [key, seconds]) => {
    const safeKey = sanitizeText(key, 80);
    const safeSeconds = Math.max(0, Number(seconds || 0));
    if (safeKey && safeSeconds > 0) {
      acc[safeKey] = safeSeconds;
    }
    return acc;
  }, {});
}

function normalizePlanTimeEntry(value) {
  const planId = sanitizeText(value.planId, 80);
  const seconds = Math.max(0, Math.min(18000, Math.round(Number(value.seconds || 0))));

  if (!planId || seconds < 1) {
    return null;
  }

  return {
    planId,
    seconds,
    deckId: sanitizeText(value.deckId || value.sourceDeckId, 80) || 'recommended-plan',
    mode: sanitizeText(value.mode, 40) || 'practice',
    letter: normalizeLetter(value.letter),
    event: sanitizeText(value.event, 40) || 'session',
    recordedAt: new Date().toISOString(),
  };
}

function recordPlanTime(plan, entry) {
  const tracking = preservePlanTime(plan);
  const step = findPlanStepForTime(plan, entry);
  const stepKey = step ? `step-${step.step}` : entry.deckId;

  tracking.totalSeconds += entry.seconds;
  tracking.byDeck[entry.deckId] = Number(tracking.byDeck[entry.deckId] || 0) + entry.seconds;
  tracking.byMode[entry.mode] = Number(tracking.byMode[entry.mode] || 0) + entry.seconds;
  tracking.byStep[stepKey] = Number(tracking.byStep[stepKey] || 0) + entry.seconds;

  if (entry.letter) {
    tracking.byLetter[entry.letter] = Number(tracking.byLetter[entry.letter] || 0) + entry.seconds;
  }

  tracking.recent.unshift({
    seconds: entry.seconds,
    deckId: entry.deckId,
    mode: entry.mode,
    letter: entry.letter || null,
    step: step?.step || null,
    event: entry.event,
    at: entry.recordedAt,
  });
  tracking.recent = tracking.recent.slice(0, 12);
  tracking.updatedAt = entry.recordedAt;

  return {
    ...plan,
    timeTracking: tracking,
  };
}

function findPlanStepForTime(plan, entry) {
  const steps = Array.isArray(plan?.todaysPlan) ? plan.todaysPlan : [];
  if (entry.mode === 'learn') {
    return steps.find((step) => step.step === 1) || steps[0] || null;
  }
  if (entry.mode === 'practice') {
    return steps.find((step) => step.step === 2) || steps.find((step) => step.deckId === entry.deckId) || steps[0] || null;
  }
  if (entry.mode === 'speed-sign' || entry.mode === 'sign-duel') {
    return steps.find((step) => step.deckId === entry.mode) || steps.find((step) => step.step === 3) || steps[0] || null;
  }
  return steps.find((step) => step.deckId === entry.deckId) || steps[0] || null;
}

function interpretLearnerProfile(profile) {
  const answers = profile.answers || {};
  const sessionMinutes = getSessionMinutes(profile.schedulePreference);
  const pace = (
    profile.practiceMood === 'calm_guided' ||
    profile.practiceMood === 'short_daily' ||
    profile.challengeAreas?.includes('speed')
  ) ? 'steady' : profile.practiceMood === 'game_like' || profile.practiceMood === 'competitive' ? 'brisk' : 'balanced';

  return {
    learnerType: profile.learnerType || deriveLearnerType(answers),
    sessionMinutes,
    pace,
    needsExtraHints: ['steps', 'visual_model'].includes(profile.preferredPracticeStyle) ||
      profile.challengeAreas?.some((area) => ['hand_shape', 'confidence', 'remembering'].includes(area)),
    needsConfidenceSupport: profile.challengeAreas?.includes('confidence') || profile.motivationStyle === 'gentle_messages',
    likesGames: profile.preferredPracticeStyle === 'games' ||
      ['game_like', 'competitive'].includes(profile.practiceMood) ||
      profile.motivationStyle === 'scores_rankings',
  };
}

function getSessionMinutes(schedulePreference) {
  if (schedulePreference === 'five_min_daily') return 5;
  if (schedulePreference === 'ten_fifteen_daily') return 12;
  if (schedulePreference === 'twenty_plus_daily') return 22;
  if (schedulePreference === 'few_times_week') return 18;
  return 10;
}

function buildCurriculumPlan(profile, progressSummary, interpretation) {
  const focusLetters = pickFocusLetters(profile, progressSummary);
  const primaryFocusLetters = getPrimaryFocusLetters(focusLetters);
  const recommendedDeckOrder = pickRecommendedDeckOrder(profile, interpretation);
  const title = getPlanTitle(profile, interpretation);
  const weeklyGoal = getWeeklyGoal(profile, focusLetters, progressSummary);
  const summary = getPlanSummary(profile, interpretation, focusLetters);

  return {
    title,
    summary,
    weeklyGoal,
    focusLetters,
    primaryFocusLetters,
    recommendedDeckOrder,
    todaysPlan: buildTodaysPlan(profile, interpretation, focusLetters, recommendedDeckOrder),
    weeklyPlan: buildWeeklyPlan(profile, interpretation, focusLetters),
  };
}

function getPrimaryFocusLetters(focusLetters) {
  return (Array.isArray(focusLetters) ? focusLetters : [])
    .map((letter) => normalizeLetter(letter))
    .filter(Boolean)
    .slice(0, 3);
}

function pickFocusLetters(profile, progressSummary) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const mastered = new Set(progressSummary.masteredLetters || []);
  const learned = new Set(progressSummary.learnedLetters || []);
  const bestScores = progressSummary.bestScores || {};
  const challengeLetters = ['E', 'M', 'N', 'R', 'S', 'T'];

  const lowScoreLetters = Object.entries(bestScores)
    .filter(([, score]) => Number(score) < 99)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(([letter]) => normalizeLetter(letter))
    .filter(Boolean);
  const unmasteredLearned = alphabet.filter((letter) => learned.has(letter) && !mastered.has(letter));
  const unlearned = alphabet.filter((letter) => !learned.has(letter));
  const goalLetters = profile.firstMilestone === 'master_tricky' || profile.challengeAreas?.includes('hand_shape')
    ? challengeLetters
    : [];
  const ordered = [...goalLetters, ...lowScoreLetters, ...unmasteredLearned, ...unlearned, ...alphabet]
    .filter((letter) => !mastered.has(letter));

  return Array.from(new Set(ordered)).slice(0, 6);
}

function pickRecommendedDeckOrder(profile, interpretation) {
  const deckIds = [];

  if (profile.experienceLevel === 'none' || profile.primaryGoal === 'alphabet_first' || profile.primaryGoal === 'brand_new') {
    deckIds.push('alphabet');
  }

  if (profile.practiceMood === 'accuracy_focused' || profile.preferredPracticeStyle === 'instant_feedback') {
    deckIds.push('alphabet-review');
  }

  if (interpretation.likesGames || profile.primaryGoal === 'speed_accuracy') {
    deckIds.push('speed-sign');
  }

  if (profile.practiceMood === 'competitive') {
    deckIds.push('sign-duel');
  }

  deckIds.push('alphabet', 'alphabet-review', 'speed-sign');

  return Array.from(new Set(deckIds)).slice(0, 4).map((deckId) => {
    const deck = AVAILABLE_PLAN_DECKS.find((candidate) => candidate.id === deckId) || AVAILABLE_PLAN_DECKS[0];
    return {
      deckId: deck.id,
      title: deck.title,
      mode: deck.mode,
      gameMode: deck.gameMode,
      reason: getDeckReason(deck.id, profile, interpretation),
    };
  });
}

function getDeckReason(deckId, profile, interpretation) {
  if (deckId === 'alphabet') return 'Start with the clearest shapes.';
  if (deckId === 'alphabet-review') return interpretation.needsExtraHints
    ? 'Practice with camera feedback and extra hints.'
    : 'Turn letters into better scores.';
  if (deckId === 'speed-sign') return profile.primaryGoal === 'speed_accuracy'
    ? 'Add speed after the shapes feel steady.'
    : 'Use a quick round after practice.';
  if (deckId === 'sign-duel') return 'Add a friendly challenge.';
  return 'Fits your quiz answers.';
}

function getPlanTitle(profile, interpretation) {
  if (interpretation.learnerType === 'Game Sprinter') return 'Fast Practice Plan';
  if (interpretation.learnerType === 'Accuracy Tuner') return 'Accuracy Plan';
  if (interpretation.learnerType === 'Visual Explorer') return 'Visual Practice Plan';
  if (interpretation.learnerType === 'Communication Builder') return 'Communication Starter Plan';
  if (interpretation.learnerType === 'Consistency Learner') return 'Short Daily Plan';
  return 'Alphabet Starter Plan';
}

function getWeeklyGoal(profile, focusLetters, progressSummary) {
  const primaryLetters = getPrimaryFocusLetters(focusLetters);
  if (profile.firstMilestone === 'high_accuracy') {
    return `Reach 95%+ on ${Math.min(3, primaryLetters.length)} focus letters.`;
  }
  if (profile.firstMilestone === 'fingerspell_name') {
    return 'Practice the letters you need for your name.';
  }
  if (profile.firstMilestone === 'daily_confidence') {
    return 'Complete three short sessions.';
  }
  if (progressSummary.masteredCount > 0) {
    return `Master 3 more signs. Review ${primaryLetters.join(', ')}.`;
  }
  return `Learn and practice ${primaryLetters.join(', ')}.`;
}

function getPlanSummary(profile, interpretation, focusLetters) {
  const pace = interpretation.pace === 'brisk' ? 'faster' : interpretation.pace === 'steady' ? 'calm' : 'balanced';
  return `${pace} practice focused on ${getPrimaryFocusLetters(focusLetters).join(', ')} first.`;
}

function buildTodaysPlan(profile, interpretation, focusLetters, deckOrder) {
  const firstDeck = deckOrder[0] || { title: 'Alphabet', deckId: 'alphabet' };
  const reviewDeck = deckOrder.find((deck) => deck.deckId === 'alphabet-review') || deckOrder[1] || firstDeck;
  const primaryLetters = getPrimaryFocusLetters(focusLetters);

  return [
    {
      step: 1,
      title: `Warm up with ${primaryLetters.slice(0, 2).join(' and ')}`,
      durationMinutes: Math.max(2, Math.round(interpretation.sessionMinutes * 0.25)),
      deckId: firstDeck.deckId,
      activity: `Study ${primaryLetters.slice(0, 2).join(' and ')} in ${firstDeck.title}.`,
      accessibilityNote: interpretation.needsExtraHints ? 'Keep hints on.' : 'Watch the model first.',
    },
    {
      step: 2,
      title: 'Practice the focus letters',
      durationMinutes: Math.max(3, Math.round(interpretation.sessionMinutes * 0.5)),
      deckId: reviewDeck.deckId,
      activity: `Use camera feedback for ${primaryLetters.join(', ')}.`,
      accessibilityNote: 'Pause between tries.',
    },
    {
      step: 3,
      title: interpretation.likesGames ? 'End with a short game' : 'End with one best rep',
      durationMinutes: Math.max(2, Math.round(interpretation.sessionMinutes * 0.25)),
      deckId: interpretation.likesGames ? 'speed-sign' : reviewDeck.deckId,
      activity: interpretation.likesGames ? 'Try SpeedSign after two clear reps.' : 'Repeat your strongest letter.',
      accessibilityNote: interpretation.needsConfidenceSupport ? 'End on a win.' : 'Save the score.',
    },
  ];
}

function buildWeeklyPlan(profile, interpretation, focusLetters) {
  const chunks = [
    ['Foundation', focusLetters.slice(0, 2)],
    ['Feedback', focusLetters.slice(2, 4)],
    ['Review', focusLetters.slice(0, 4)],
    ['Challenge', focusLetters.slice(4, 6).length ? focusLetters.slice(4, 6) : focusLetters.slice(0, 2)],
  ];

  return chunks.map(([label, letters], index) => ({
    day: index + 1,
    label,
    focus: letters,
    durationMinutes: interpretation.sessionMinutes,
    activity: index === 0
      ? 'Study the models slowly.'
      : index === 1
      ? 'Use camera feedback.'
      : index === 2
      ? 'Review earlier letters.'
      : interpretation.likesGames
      ? 'Try SpeedSign.'
      : 'Do a mastery check.',
  }));
}

function buildAccessibilityPlan(profile, interpretation) {
  return {
    promptPace: interpretation.pace === 'brisk' ? 'balanced' : 'slow',
    hintLevel: interpretation.needsExtraHints ? 'expanded' : 'standard',
    feedbackTone: interpretation.needsConfidenceSupport ? 'gentle' : 'direct',
    sessionLength: interpretation.sessionMinutes <= 5 ? 'short' : interpretation.sessionMinutes >= 20 ? 'long' : 'standard',
    visualSupport: profile.preferredPracticeStyle === 'visual_model' || profile.challengeAreas?.includes('hand_shape')
      ? 'model first'
      : 'model and camera',
    motionPreference: profile.practiceMood === 'calm_guided' || profile.motivationStyle === 'gentle_messages'
      ? 'low pressure'
      : 'standard',
  };
}

function buildCustomizationNotes(profile, interpretation, curriculumPlan, accessibilityPlan) {
  return [
    {
      label: 'Pace',
      value: accessibilityPlan.promptPace,
      reason: `From ${labelProfileValue(profile.practiceMood) || 'balanced practice'} and ${labelProfileValue(profile.schedulePreference) || 'flexible timing'}.`,
    },
    {
      label: 'Hints',
      value: accessibilityPlan.hintLevel,
      reason: interpretation.needsExtraHints ? 'Extra hints match the quiz answers.' : 'Standard hints keep practice quick.',
    },
    {
      label: 'Focus',
      value: curriculumPlan.focusLetters.join(', '),
      reason: 'Based on the quiz, scores, and unmastered letters.',
    },
    {
      label: 'Motivation',
      value: labelProfileValue(profile.motivationStyle) || 'Checklists',
      reason: 'Used for coaching tone.',
    },
  ];
}

function buildAdaptationRules(profile, interpretation) {
  const rules = [
    'Below 80%: review the model before another try.',
    '95%+ twice: move that letter into a faster round.',
    'No practice for 3 days: use the shortest session next.',
  ];

  if (interpretation.needsExtraHints) {
    rules.push('Keep hints on until a letter reaches 90% twice.');
  }
  if (profile.practiceMood === 'competitive') {
    rules.push('Use Sign Duel after two letters reach 95%+.');
  }

  return rules;
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
  safe.planTimeSeconds = Math.max(0, Number(safe.planTimeSeconds || 0));
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
