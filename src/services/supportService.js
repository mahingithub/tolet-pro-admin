/**
 * supportService.js
 * ──────────────────────────────────────────────────────────────────────────
 * Admin-side helpdesk client for the Support console. Hits /api/admin/helpdesk
 * (requireAdminAuth) and includes a light short-polling loop so the ticket
 * list/thread stay near-real-time without a socket.
 */

import { apiFetch } from './apiClient.js';
import { getToken } from './session.js';

// ─── Polling ────────────────────────────────────────────────────────────────
const listeners = new Set();
let pollInterval = null;

function broadcast() {
  for (const listener of listeners) {
    try { listener(); } catch (err) { console.error('Ticket listener error', err); }
  }
}

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    if (listeners.size > 0 && getToken()) broadcast();
  }, 5000);
}

export const onTicketsChanged = (listener) => {
  listeners.add(listener);
  startPolling();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };
};

// ─── Admin API ────────────────────────────────────────────────────────────
export const listAllTickets = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const data = await apiFetch(`/admin/helpdesk/cases${qs}`);
  return data.tickets;
};

export const getTicketWithContext = async (id) => {
  try {
    return await apiFetch(`/admin/helpdesk/cases/${id}`);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
};

export const sendAdminMessage = async (ticketId, text, opts = {}) => {
  const data = await apiFetch(`/admin/helpdesk/cases/${ticketId}/messages`, {
    method: 'POST',
    body: { text, markPendingUser: !!opts.markPendingUser },
  });
  broadcast();
  return data.message;
};

export const assignTicket = async (ticketId, assignee) => {
  const data = await apiFetch(`/admin/helpdesk/cases/${ticketId}/assign`, {
    method: 'POST',
    body: { adminId: assignee.adminId, adminName: assignee.adminName },
  });
  broadcast();
  return data;
};

export const resolveTicket = async (ticketId, summary) => {
  const data = await apiFetch(`/admin/helpdesk/cases/${ticketId}/resolve`, {
    method: 'POST',
    body: { summary },
  });
  broadcast();
  return data;
};

export const reopenTicket = async (ticketId) => {
  const data = await apiFetch(`/admin/helpdesk/cases/${ticketId}/reopen`, { method: 'POST' });
  broadcast();
  return data;
};
