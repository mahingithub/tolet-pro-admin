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

import { getToken, setSession, clearSession } from './session.js';

export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
).replace(/\/$/, '');

let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (cb) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = (err) => {
  refreshSubscribers.forEach((cb) => cb(err));
  refreshSubscribers = [];
};

const buildUrl = (path) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

export async function apiFetch(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const finalHeaders = { 'Content-Type': 'application/json', ...headers };
  if (auth) {
    const token = getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    const fetchOptions = {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
    
    // Always include credentials for API calls to send cookies
    fetchOptions.credentials = 'include';
    
    res = await fetch(buildUrl(path), fetchOptions);
  } catch (netErr) {
    const err = new Error('Network error — is the API reachable?');
    err.code = 'network_error';
    err.cause = netErr;
    throw err;
  }

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (!res.ok) {
    // Intercept 401 Unauthorized for token refresh
    if (res.status === 401 && auth && getToken() && !path.includes('/auth/admin/login') && !path.includes('/auth/admin/refresh')) {
      if (!isRefreshing) {
        isRefreshing = true;
        
        try {
          const refreshRes = await fetch(buildUrl('/auth/admin/refresh'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          });
          
          if (!refreshRes.ok) {
            throw new Error('Admin refresh failed');
          }
          
          const refreshData = await refreshRes.json();
          if (refreshData.token) {
            setSession({ token: refreshData.token });
            onRefreshed(null);
          } else {
            throw new Error('No admin token returned');
          }
        } catch (err) {
          onRefreshed(err);
          clearSession();
        } finally {
          isRefreshing = false;
        }
      }

      return new Promise((resolve, reject) => {
        subscribeTokenRefresh(async (err) => {
          if (err) {
            // Failed to refresh, return the original error to bubble up
            const origErr = new Error(data.message || data.code || `Request failed (HTTP ${res.status}).`);
            origErr.code = data.code;
            origErr.status = res.status;
            origErr.serverMessage = data.message;
            origErr.details = data.details;
            reject(origErr);
          } else {
            // Retry request with new token
            try {
              const retryData = await apiFetch(path, { method, body, auth, headers });
              resolve(retryData);
            } catch (retryErr) {
              reject(retryErr);
            }
          }
        });
      });
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
