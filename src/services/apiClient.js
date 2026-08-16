/**
 * apiClient.js
 * ──────────────────────────────────────────────────────────────────────────
 * The single fetch wrapper for the admin console. Every service goes through
 * `apiFetch`, which:
 *   - resolves paths against VITE_API_BASE_URL (e.g. http://localhost:5000/api)
 *   - attaches the admin Bearer token (audience 'tolet-pro-admin')
 *   - normalises errors to `{ message, code, status, serverMessage }`
 *   - on a 401, refreshes the admin access token once and replays the request
 *
 * It deliberately does NOT clear the session. Three separate bugs here used to
 * make a single 401 an instant logout:
 *
 *   1. The refresh POST went to `/auth/admin/refresh`, but the admin surface is
 *      mounted at `/api/admin/auth` — and no refresh route existed at all. So
 *      the request could never succeed.
 *   2. The failure branch called clearSession(), which fires `session-cleared`,
 *      which drops the admin straight to /login. Any hiccup ended the session.
 *   3. Subscribers were registered AFTER the refresh had already flushed them,
 *      so concurrent 401s produced promises that never settled and screens hung
 *      on their spinners forever.
 *
 * Now: the refresh hits the real endpoint, single-flighting is done with a
 * shared promise (which cannot deadlock), and ending the session is
 * AdminAuthContext's decision, made only when the server says it is over.
 */

import { getToken, setSession } from './session.js';

export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
).replace(/\/$/, '');

const REFRESH_PATH = '/admin/auth/refresh';

// Paths that must never trigger a refresh-and-retry, or we'd recurse.
const NO_REFRESH_PATHS = [
  '/admin/auth/login',
  '/admin/auth/verify-2fa-login',
  REFRESH_PATH,
];

/**
 * Codes that mean the admin session is genuinely finished. Anything else — a
 * 429, a 5xx, a dropped connection — is transient and must leave the session
 * alone.
 */
const TERMINAL_REFRESH_CODES = new Set([
  'missing_refresh_token',
  'invalid_refresh_token',
  'token_reuse_detected',
  'user_not_found',
  'account_banned',
  'admin_required',
]);

/** null when the last refresh succeeded; otherwise details about the failure. */
let lastRefreshOutcome = null;

/** True only when the server positively told us the admin session is over. */
export function isAdminSessionTerminated() {
  return lastRefreshOutcome?.terminal === true;
}

export function getLastRefreshOutcome() {
  return lastRefreshOutcome;
}

const buildUrl = (path) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

const shouldSkipRefresh = (path) => NO_REFRESH_PATHS.some((p) => path.includes(p));

function toError(status, data) {
  const err = new Error(data.message || data.code || `Request failed (HTTP ${status}).`);
  err.code = data.code;
  err.status = status;
  err.serverMessage = data.message;
  err.details = data.details;
  return err;
}

// ─── Single-flight refresh ──────────────────────────────────────────────────
// A shared promise instead of a subscriber list: every concurrent 401 awaits
// the same promise, so none of them can miss a flush and hang.
let refreshPromise = null;

/** Resolves to `null` on success, or to the Error that stopped it. */
async function performRefresh() {
  let res;
  let data = {};
  try {
    res = await fetch(buildUrl(REFRESH_PATH), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // the httpOnly adminRefreshToken cookie
    });
    data = await res.json().catch(() => ({}));
  } catch (netErr) {
    // Never reached the server, so this says nothing about the session.
    lastRefreshOutcome = { terminal: false, code: 'network_error', status: null, at: Date.now() };
    return netErr;
  }

  if (res.ok && data.token) {
    setSession({ token: data.token, admin: data.admin });
    lastRefreshOutcome = null;
    return null;
  }

  if (res.ok) {
    // 200 without a token shouldn't happen; don't end a session over it.
    lastRefreshOutcome = { terminal: false, code: 'no_token_returned', status: res.status, at: Date.now() };
    return new Error('Admin refresh returned no token');
  }

  lastRefreshOutcome = {
    terminal: TERMINAL_REFRESH_CODES.has(data.code),
    code: data.code || null,
    status: res.status,
    at: Date.now(),
  };
  return toError(res.status, data);
}

function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function apiFetch(path, options = {}) {
  const {
    method = 'GET',
    body,
    auth = true,
    headers = {},
    // Set internally when replaying after a successful refresh, so one failed
    // retry can't loop.
    _isRetry = false,
  } = options;

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
      // Always include credentials so the admin refresh cookie travels.
      credentials: 'include',
    });
  } catch (netErr) {
    const err = new Error('Network error — is the API reachable?');
    err.code = 'network_error';
    err.cause = netErr;
    throw err;
  }

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (res.ok) return data;

  // ─── 401: try exactly one refresh, then replay ────────────────────────────
  // An expired 12h admin access token is a normal event, not a dead session.
  if (res.status === 401 && auth && !_isRetry && getToken() && !shouldSkipRefresh(path)) {
    const refreshErr = await refreshOnce();
    if (!refreshErr) {
      return apiFetch(path, { ...options, _isRetry: true });
    }
    // Refresh failed. Surface the ORIGINAL 401 and let AdminAuthContext decide
    // whether that ends the session (it checks isAdminSessionTerminated()).
  }

  throw toError(res.status, data);
}
