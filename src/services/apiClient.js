/**
 * apiClient.js
 * ──────────────────────────────────────────────────────────────────────────
 * The single fetch wrapper for the admin console. Every service goes through
 * `apiFetch`, which:
 *   - resolves paths against VITE_API_BASE_URL (e.g. http://localhost:5000/api)
 *   - attaches the admin Bearer token (audience 'tolet-pro-admin')
 *   - normalises errors to `{ message, code, status, serverMessage }`
 *   - on a 401 for an authenticated call, nukes the session so the app
 *     bounces to /login (handles token expiry / revocation gracefully)
 */

import { getToken, clearSession } from './session.js';

export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
).replace(/\/$/, '');

const buildUrl = (path) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

export async function apiFetch(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const finalHeaders = { 'Content-Type': 'application/json', ...headers };
  if (auth) {
    const token = getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(buildUrl(path), {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (netErr) {
    const err = new Error('Network error — is the API reachable?');
    err.code = 'network_error';
    err.cause = netErr;
    throw err;
  }

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok) {
    // Dead / expired / revoked admin token on an authed request → clear the
    // session. The auth context listens for this and drops the user to /login.
    // Skipped for the login call itself (auth:false), whose 401 is a bad
    // password, not an expired session.
    if (res.status === 401 && auth && getToken()) {
      clearSession();
    }
    const err = new Error(data.message || data.code || `Request failed (HTTP ${res.status}).`);
    err.code = data.code;
    err.status = res.status;
    err.serverMessage = data.message;
    err.details = data.details;
    throw err;
  }

  return data;
}
