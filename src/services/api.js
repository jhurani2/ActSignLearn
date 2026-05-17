const API_ROOT = '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

export async function signUp({ username, password, avatar }) {
  return request('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ username, password, avatar }),
  });
}

export async function signIn({ username, password }) {
  return request('/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logout(token) {
  return request('/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function getSession(token) {
  return request('/auth/session', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function getProgress(token) {
  return request('/progress/summary', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function getLearnerProfile(token) {
  return request('/profile/learner', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function saveLearnerProfile(token, profile) {
  return request('/profile/learner', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ profile }),
  });
}

export async function markLearned(token, letter) {
  return request('/progress/learn', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ letter }),
  });
}

export async function recordPractice(token, letter, score, passed) {
  return request('/progress/practice', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ letter, score, passed }),
  });
}
