/**
 * teamService.js
 * ──────────────────────────────────────────────────────────────────────────
 * Admin-team management — hits /api/admin/team/* (super-admin only on the
 * backend). Used by the Admin Team page to designate/revoke admins.
 */

import { apiFetch } from './apiClient.js';

const team = (path, opts) => apiFetch(`/admin/team${path}`, opts);

/** Current admin roster + the caller's id + how many super admins exist. */
export const listTeam = async () => {
  const data = await team('');
  return {
    admins: data.admins || [],
    currentUserId: data.currentUserId || null,
    superAdminCount: data.superAdminCount || 0,
  };
};

/** Search users (name/phone/email) to promote. Returns [] for queries < 2 chars. */
export const searchCandidates = async (q) => {
  const data = await team(`/candidates?q=${encodeURIComponent(q)}`);
  return data.users || [];
};

/** Promote a user to an admin role. role ∈ support_agent|moderator|super_admin */
export const grantAdmin = async (userId, role) =>
  (await team('/grant', { method: 'POST', body: { userId, role } })).admin;

/** Change an existing admin's role. */
export const updateAdminRole = async (id, role) =>
  (await team(`/${encodeURIComponent(id)}/role`, { method: 'PUT', body: { role } })).admin;

/**
 * Create a staff login outright: { name, phone, email?, password, role }.
 * They sign in with the phone or the email. 409 'phone_taken' means the
 * number already has an app account — promote it with grantAdmin instead.
 */
export const createAdminAccount = async (payload) =>
  (await team('/create', { method: 'POST', body: payload })).admin;

/** Set a new password for a team member (signs them out everywhere). */
export const setAdminPassword = async (id, password) =>
  (await team(`/${encodeURIComponent(id)}/password`, { method: 'POST', body: { password } })).admin;

/** Remove all admin roles from a user (back to a normal account). */
export const revokeAdmin = async (id) =>
  (await team(`/${encodeURIComponent(id)}/revoke`, { method: 'POST' })).admin;
