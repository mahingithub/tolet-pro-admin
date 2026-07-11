/**
 * aiGuideService.js
 * ──────────────────────────────────────────────────────────────────────────
 * Admin CRUD for the AI video guides managed inside the Support console.
 * Hits /api/ai-guides/* admin routes (requireAdminAuth on the backend).
 */

import { apiFetch } from './apiClient.js';

/** All guides (active + hidden) for the admin manager table. Returns an array. */
export const listAdminGuides = async () => apiFetch('/ai-guides/admin');

export const createGuide = async (guide) =>
  apiFetch('/ai-guides', { method: 'POST', body: guide });

export const updateGuide = async (id, guide) =>
  apiFetch(`/ai-guides/${encodeURIComponent(id)}`, { method: 'PUT', body: guide });

export const deleteGuide = async (id) =>
  apiFetch(`/ai-guides/${encodeURIComponent(id)}`, { method: 'DELETE' });
