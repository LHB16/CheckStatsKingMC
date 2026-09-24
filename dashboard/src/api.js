/**
 * api.js - Client giao tiếp REST API với Master Node
 */

const TOKEN_KEY = 'kingmc_master_token';

export const authStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY) || '',
  setToken: (token) => localStorage.setItem(TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
  hasToken: () => !!localStorage.getItem(TOKEN_KEY)
};

async function apiFetch(endpoint, options = {}) {
  const token = authStorage.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'x-worker-secret': token, 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(endpoint, {
    ...options,
    headers
  });

  if (res.status === 401) {
    authStorage.clearToken();
    window.dispatchEvent(new Event('auth:unauthorized'));
    throw new Error('Phiên đăng nhập hết hạn hoặc mật khẩu không đúng.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Lỗi HTTP ${res.status}`);
  }

  return data;
}

export const api = {
  // Auth
  login: async (secret) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ secret })
    });
    if (data.token) {
      authStorage.setToken(data.token);
    }
    return data;
  },
  checkAuth: () => apiFetch('/api/auth/check'),

  // Overview
  getOverview: () => apiFetch('/api/overview'),

  // Workers
  getWorkers: () => apiFetch('/api/workers'),
  addWorker: (workerData) => apiFetch('/api/workers', {
    method: 'POST',
    body: JSON.stringify(workerData)
  }),
  deleteWorker: (id) => apiFetch(`/api/workers/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }),
  toggleWorker: (id) => apiFetch(`/api/workers/${encodeURIComponent(id)}/toggle`, {
    method: 'PUT'
  }),
  pingWorker: (id) => apiFetch(`/api/workers/${encodeURIComponent(id)}/ping`, {
    method: 'POST'
  }),
  restartWorker: (id) => apiFetch(`/api/workers/${encodeURIComponent(id)}/restart`, {
    method: 'POST'
  }),
  restartAllWorkers: () => apiFetch('/api/workers-restart-all', {
    method: 'POST'
  }),

  // Trackers
  getTrackers: () => apiFetch('/api/trackers'),
  addTracker: (playerName, initialBalance) => apiFetch('/api/trackers', {
    method: 'POST',
    body: JSON.stringify({ playerName, initialBalance })
  }),
  deleteTracker: (key) => apiFetch(`/api/trackers/${encodeURIComponent(key)}`, {
    method: 'DELETE'
  }),
  toggleTracker: (key) => apiFetch(`/api/trackers/${encodeURIComponent(key)}/toggle`, {
    method: 'PUT'
  }),
  getTrackerHistory: (key) => apiFetch(`/api/trackers/${encodeURIComponent(key)}/history`),
  checkTrackersNow: () => apiFetch('/api/trackers/check-now', {
    method: 'POST'
  }),

  // Guilds
  getGuilds: () => apiFetch('/api/guilds')
};
