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
 * On success, either:
 *   - Returns { requires2FA: true, tempToken } if 2FA is enabled (no session stored yet)
 *   - Stores the admin-scoped token + admin profile and returns the admin
 * A 403 (code 'admin_required') means valid credentials for a non-admin account.
 */
export async function login({ phone, password, tempToken, token, is2FAVerification }) {
  // If this is a 2FA verification step
  if (is2FAVerification && tempToken && token) {
    const data = await apiFetch('/admin/auth/verify-2fa-login', {
      method: 'POST',
      body: { tempToken, token },
      auth: false,
    });
    setSession({ token: data.token, admin: data.admin });
    return data.admin;
  }

  // Initial login with phone + password
  const data = await apiFetch('/admin/auth/login', {
    method: 'POST',
    body: { phone, password },
    auth: false,
  });

  // If 2FA is required, return the response without storing session
  if (data.requires2FA && data.tempToken) {
    return data;
  }

  // Normal login (no 2FA)
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

/** PATCH /admin/auth/me — update own profile (name/email). Refreshes the cache. */
export async function updateMe(patch) {
  const data = await apiFetch('/admin/auth/me', { method: 'PATCH', body: patch });
  setSession({ admin: data.admin });
  return data.admin;
}

/**
 * POST /admin/auth/change-password — { currentPassword, newPassword }.
 * On success the backend revokes all sessions, so the caller should log out
 * and send the user back to /login.
 */
export async function changePassword({ currentPassword, newPassword }) {
  return apiFetch('/admin/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

// ─── 2FA / Google Authenticator Management ─────────────────────────────────

/**
 * POST /admin/auth/2fa/generate — generates a new TOTP secret and QR code.
 * Returns { secret, qrCode } where qrCode is a data URL.
 */
export async function generate2FASecret() {
  return apiFetch('/admin/auth/2fa/generate', { method: 'POST' });
}

/**
 * POST /admin/auth/2fa/enable — { secret, token }.
 * Verifies the token and saves the secret, enabling 2FA for this admin.
 */
export async function enable2FA({ secret, token }) {
  const data = await apiFetch('/admin/auth/2fa/enable', {
    method: 'POST',
    body: { secret, token },
  });
  return data;
}

/**
 * POST /admin/auth/2fa/disable — { password }.
 * Disables 2FA after verifying the admin's password.
 */
export async function disable2FA({ password }) {
  const data = await apiFetch('/admin/auth/2fa/disable', {
    method: 'POST',
    body: { password },
  });
  return data;
}
