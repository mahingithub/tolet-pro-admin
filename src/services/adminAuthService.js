/**
 * adminAuthService.js
 * ──────────────────────────────────────────────────────────────────────────
 * Talks to the backend's DEDICATED admin auth surface (/api/admin/auth/*).
 * This is separate from the public app's auth: login here only succeeds for
 * privileged roles and returns an admin-scoped token.
 */

import { apiFetch } from './apiClient.js';
import { setSession, clearSession, getAdmin, getToken } from './session.js';

// Re-export the cached getters so consumers have one import surface.
export { getAdmin, getToken };

/**
 * POST /admin/auth/login — { phone, password }.
 * On success stores the admin-scoped token + admin profile and returns the
 * admin. A 403 (code 'admin_required') means valid credentials for a
 * non-admin account.
 */
export async function login({ phone, password }) {
  const data = await apiFetch('/admin/auth/login', {
    method: 'POST',
    body: { phone, password },
    auth: false,
  });
  setSession({ token: data.token, admin: data.admin });
  return data.admin;
}

/** GET /admin/auth/me — validates the stored token and refreshes the profile. */
export async function fetchMe() {
  const data = await apiFetch('/admin/auth/me', { method: 'GET' });
  setSession({ admin: data.admin });
  return data.admin;
}

/** POST /admin/auth/logout — revokes this session server-side, then clears local. */
export async function logout() {
  try { await apiFetch('/admin/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  clearSession({ silent: true });
  return { ok: true };
}
