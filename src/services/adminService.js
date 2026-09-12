/**
 * adminService.js
 * ──────────────────────────────────────────────────────────────────────────
 * Admin data API client. Every call hits /api/admin/* — all protected
 * server-side by requireAdminAuth (admin-scoped token + live RBAC), so a 401
 * here means the session expired and a 403 means the account lost its admin
 * role.
 */

import { apiFetch } from './apiClient.js';

// All endpoints live under /admin.
const admin = (path, opts) => apiFetch(`/admin${path}`, opts);

// Build a query string from a shallow filter object, skipping empty values.
const toQuery = (filter = {}) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') qs.set(k, String(v));
  }
  return qs.toString();
};

// ─── Dashboard ──────────────────────────────────────────────────────────────
export const getOverviewStats = async () => {
  const data = await admin('/overview');
  return data.stats || {};
};

// ─── Feature usage tracking ─────────────────────────────────────────────────
// How many landlords run the management system, how many buildings it keeps,
// and how many people are on each Living wallet. The server returns COUNTS
// only — there is no identity in this payload to render.
// Returns { management, living, definitions, activeWindowDays, generatedAt }.
export const getUsageStats = async () => {
  const data = await admin('/usage');
  return data.stats || {};
};

// "Interested in selling" demand gauge (Coming Soon lead capture).
// Returns { stats: { total, registered, guests, last7d }, recent: [...] }.
export const getSellInterest = async (kind = 'sell') => {
  const qs = toQuery({ kind });
  return admin(qs ? `/sell-interest?${qs}` : '/sell-interest');
};

// ─── Users + KYC ────────────────────────────────────────────────────────────
export const listUsers = async (filter = {}) => {
  const qs = toQuery(filter);
  return admin(qs ? `/users?${qs}` : '/users');
};

export const listPendingVerification = async () => {
  const data = await admin('/users/pending-verification');
  return data.users || [];
};

export const listPendingLandlordVerification = async () => {
  const data = await admin('/users/pending-landlord-verification');
  return data.users || [];
};

export const verifyUser = async (userId) =>
  (await admin(`/users/${encodeURIComponent(userId)}/verify`, { method: 'POST' })).user;

export const verifyLandlord = async (userId) =>
  (await admin(`/users/${encodeURIComponent(userId)}/verify-landlord`, { method: 'POST' })).user;

export const rejectUser = async (userId, reason) =>
  (await admin(`/users/${encodeURIComponent(userId)}/reject`, {
    method: 'POST',
    body: { reason },
  })).user;

export const rejectLandlord = async (userId, reason) =>
  (await admin(`/users/${encodeURIComponent(userId)}/reject-landlord`, {
    method: 'POST',
    body: { reason },
  })).user;

export const banUser = async (userId, reason) =>
  (await admin(`/users/${encodeURIComponent(userId)}/ban`, {
    method: 'POST',
    body: { reason },
  })).user;

export const unbanUser = async (userId) =>
  (await admin(`/users/${encodeURIComponent(userId)}/unban`, { method: 'POST' })).user;

export const updateUserRole = async (userId, role) =>
  (await admin(`/users/${encodeURIComponent(userId)}/role`, {
    method: 'PUT',
    body: { role },
  })).user;

export const deleteAdminUser = async (userId) =>
  admin(`/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });

// ─── Properties (moderation) ────────────────────────────────────────────────
export const listAdminProperties = async (filter = {}) => {
  const qs = toQuery(filter);
  return admin(qs ? `/properties?${qs}` : '/properties');
};

export const moderateProperty = async (propertyId, action, reason = '') =>
  (await admin(`/properties/${encodeURIComponent(propertyId)}/moderate`, {
    method: 'POST',
    body: { action, reason },
  })).property;

export const deleteAdminProperty = async (propertyId) =>
  admin(`/properties/${encodeURIComponent(propertyId)}`, { method: 'DELETE' });

// ─── User reports + suspected flag ──────────────────────────────────────────
export const listReports = async (filter = {}) => {
  const qs = toQuery(filter);
  return admin(qs ? `/reports?${qs}` : '/reports');
};

export const updateReportStatus = async (reportId, status) =>
  (await admin(`/reports/${encodeURIComponent(reportId)}/status`, {
    method: 'POST',
    body: { status },
  })).report;

export const suspectUser = async (userId, reason) =>
  (await admin(`/users/${encodeURIComponent(userId)}/suspect`, {
    method: 'POST',
    body: { reason },
  })).user;

export const unsuspectUser = async (userId) =>
  (await admin(`/users/${encodeURIComponent(userId)}/unsuspect`, { method: 'POST' })).user;

// ─── Audit log ────────────────────────────────────────────────────────────
// Best-effort: tolerates either logAuditAction('x', {...}) or the object form
// logAuditAction({ action, targetType, targetId }). Never throws (the audit
// endpoint is optional) so a missing route can't break a user action.
export const logAuditAction = async (action, details = {}) => {
  try {
    const body = typeof action === 'object' && action !== null ? action : { action, ...details };
    return await admin('/audit-log', { method: 'POST', body });
  } catch {
    return null;
  }
};

// ─── Subscriptions + marketing ──────────────────────────────────────────────
// The plan/reachability table behind the Subscriptions page. `filter` accepts
// { tier, installed, whatsapp, search, page, limit } and returns
// { rows, total, page, limit, counts }.
export const listSubscriptions = async (filter = {}) => {
  const qs = toQuery(filter);
  return admin(qs ? `/subscriptions?${qs}` : '/subscriptions');
};

// The destinations a campaign is allowed to point at, straight from the list
// the server validates against — so the picker can never offer a page the send
// endpoint will reject. Returns { routes[], paramRoutes[], tabs{} }.
export const listCampaignTargets = async () => admin('/subscriptions/targets');

// Click counts for recent campaign short links. SMS and WhatsApp report
// delivery at best, so this is the only evidence a campaign was acted on.
// Returns { rows: [{ code, url, campaign, channel, targetPath, audienceSize,
//                    clicks, signedInClicks, lastClickAt, createdAt }] }.
export const listCampaignLinks = async (limit) =>
  admin(limit ? `/subscriptions/links?limit=${encodeURIComponent(limit)}` : '/subscriptions/links');

// Dispatch a composed offer. `payload` is
//   { channels[], title, body, smsText?, targetPath?,
//     whatsapp?: { mode: 'text'|'template', body?, template?, languageCode?, params[] },
//     userIds?[], filters?{} }
// Resolves to { attempted, capped, maxRecipients, targetPath, links{},
//               whatsappOverflow, sent: { <channel>: {ok,skipped,failed} } }.
// Super-admin only server-side — a 403 here means the account lacks that role.
export const sendSubscriptionOffer = async (payload) =>
  admin('/subscriptions/send-offer', { method: 'POST', body: payload });

// ─── Service provider verification ──────────────────────────────────────────
// The ONE point at which admin touches a provider: identity checked once, fee
// confirmed once, then out of the way. Nothing here is reachable per order.
//
// Note the payload is fuller than the tenant-facing one — Provider.toJSON
// strips the NID/selfie URLs and the TrxID so they cannot leak, and the server
// rebuilds them explicitly for this console. Treat everything in
// `verification` and `registration` as sensitive: it is somebody's ID.

// filter: { status, category, q, page, limit }. Defaults to the review queue.
// Returns { providers[], page, limit, total, hasMore }.
export const listAdminProviders = async (filter = {}) => {
  const qs = toQuery(filter);
  return admin(qs ? `/providers?${qs}` : '/providers');
};

// Header counts. Returns { pendingReview, awaitingPayment, active, suspended,
// rejected, expiringSoon }.
export const getProviderQueueStats = async () => {
  const data = await admin('/providers/stats');
  return data.stats || {};
};

// Returns { provider, owner, canGrantFullTier }. `canGrantFullTier` is the
// server's own answer to "are the documents actually here" — the UI must ask
// rather than infer it, because the server refuses the badge on the same rule.
export const getAdminProvider = async (id) => admin(`/providers/${id}`);

// tier: 'basic' (listed, unbadged) | 'full' (the green ভেরিফাইড badge).
// A 'full' request with no NID + selfie on file is refused server-side with
// `insufficient_documents` — that refusal is what makes the badge mean
// something to the tenant relying on it.
export const approveProvider = async (id, tier = 'basic') =>
  admin(`/providers/${id}/approve`, { method: 'POST', body: { tier } });

// `reason` is REQUIRED and is shown to the provider verbatim, so it has to say
// what to fix — "photo is blurry" not "rejected".
export const rejectProvider = async (id, reason) =>
  admin(`/providers/${id}/reject`, { method: 'POST', body: { reason } });

// Confirms the manual registration fee and takes the provider live. There is
// no payment gateway; the provider sends money and a reference, an admin
// confirms it. `{ waived: true }` covers a launch promotion — and still sets
// an expiry, because the expiry is about the listing going stale, not the fee.
export const confirmProviderPayment = async (id, payload) =>
  admin(`/providers/${id}/payment`, { method: 'POST', body: payload });

export const suspendProvider = async (id, reason) =>
  admin(`/providers/${id}/suspend`, { method: 'POST', body: { reason } });

export const unsuspendProvider = async (id) =>
  admin(`/providers/${id}/unsuspend`, { method: 'POST' });
