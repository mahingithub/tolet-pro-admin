/**
 * session.js
 * ──────────────────────────────────────────────────────────────────────────
 * Centralised, ADMIN-namespaced session storage.
 *
 * Keys are prefixed `toletpro_admin:` so that even if the admin console ever
 * shares an origin with the public app (it shouldn't — it lives on its own
 * subdomain), the two token stores can never collide.
 *
 * This module imports nothing else in the app, so both the API client and the
 * auth service can depend on it without creating a circular import.
 */

const KEY_TOKEN = 'toletpro_admin:token';
const KEY_ADMIN = 'toletpro_admin:admin';
const EVT_CLEARED = 'toletpro-admin:session-cleared';

export const getToken = () => {
  try { return window.localStorage.getItem(KEY_TOKEN); } catch { return null; }
};

export const getAdmin = () => {
  try {
    const raw = window.localStorage.getItem(KEY_ADMIN);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** Persist token and/or admin. Pass only the fields you want to update. */
export function setSession({ token, admin } = {}) {
  try {
    if (token) window.localStorage.setItem(KEY_TOKEN, token);
    if (admin) window.localStorage.setItem(KEY_ADMIN, JSON.stringify(admin));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

/**
 * Wipe the admin session. By default this emits a `session-cleared` event so
 * the auth context can react (e.g. a 401 mid-session bounces to /login).
 * Pass { silent: true } on an explicit logout where the caller updates state
 * itself and doesn't want the event to double-fire.
 */
export function clearSession({ silent = false } = {}) {
  try {
    window.localStorage.removeItem(KEY_TOKEN);
    window.localStorage.removeItem(KEY_ADMIN);
  } catch {
    /* ignore */
  }
  if (!silent) {
    try { window.dispatchEvent(new CustomEvent(EVT_CLEARED)); } catch { /* ignore */ }
  }
}

export const onSessionCleared = (handler) => {
  window.addEventListener(EVT_CLEARED, handler);
  return () => window.removeEventListener(EVT_CLEARED, handler);
};
