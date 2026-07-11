// Reports.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin panel for user-abuse reports raised from chat. Admins can review /
// dismiss a report and mark the reported user as "suspected" (a soft flag,
// separate from a ban).

import React, { useCallback, useEffect, useState } from 'react';
import { Flag, ShieldAlert, ShieldCheck, Check, X, RefreshCw, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  listReports, updateReportStatus, suspectUser, unsuspectUser,
} from '../services/adminService';

const STATUS_TABS = [
  { key: 'open', label: 'Open' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: '', label: 'All' },
];

const statusBadge = (status) => {
  const map = {
    open: 'bg-amber-100 text-amber-700',
    reviewed: 'bg-blue-100 text-blue-700',
    dismissed: 'bg-gray-100 text-gray-500',
  };
  return map[status] || 'bg-gray-100 text-gray-500';
};

const fmt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
};

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('open');
  const [search, setSearch] = useState('');
  const [openCount, setOpenCount] = useState(0);
  const [suspectedIds, setSuspectedIds] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listReports({ status, search });
      setReports(data.reports || []);
      setOpenCount(data.openCount || 0);
    } catch (err) {
      toast.error(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => { load(); }, [load]);

  const setReportStatus = async (id, next) => {
    try {
      await updateReportStatus(id, next);
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)));
      toast.success(next === 'reviewed' ? 'Marked as reviewed' : next === 'dismissed' ? 'Report dismissed' : 'Reopened');
    } catch (err) {
      toast.error(err.message || 'Action failed');
    }
  };

  const toggleSuspect = async (userId, currentlySuspected) => {
    try {
      if (currentlySuspected) {
        await unsuspectUser(userId);
        setSuspectedIds((p) => ({ ...p, [userId]: false }));
        toast.success('User un-suspected');
      } else {
        await suspectUser(userId, 'Flagged from a user report');
        setSuspectedIds((p) => ({ ...p, [userId]: true }));
        toast.success('User marked as suspected');
      }
    } catch (err) {
      toast.error(err.message || 'Action failed');
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Flag size={22} className="text-[#ba0036]" /> User Reports
          </h1>
          <p className="text-sm font-bold text-gray-400 mt-1">
            Abuse reports raised from chat. {openCount > 0 && <span className="text-amber-600">{openCount} open</span>}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-1 p-1 bg-white border border-gray-200 rounded-xl">
          {STATUS_TABS.map((tb) => (
            <button
              key={tb.key || 'all'}
              onClick={() => setStatus(tb.key)}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-black transition-all ${
                status === tb.key ? 'bg-[#ba0036] text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or reason…"
            className="w-full bg-white border border-gray-200 rounded-xl py-2 pl-10 pr-3 text-sm font-bold text-gray-800 outline-none focus:border-[#ba0036]/40"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-16 text-center text-sm font-bold text-gray-400">Loading reports…</div>
      ) : reports.length === 0 ? (
        <div className="py-16 text-center">
          <ShieldCheck size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-bold text-gray-400">No reports here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const suspected = suspectedIds[r.reportedUserId];
            return (
              <div key={r.id} className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                      {r.reportCount > 1 && (
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                          <AlertTriangle size={11} /> ×{r.reportCount}
                        </span>
                      )}
                      <span className="text-[11px] font-bold text-gray-400">{fmt(r.createdAt)}</span>
                    </div>
                    <p className="text-[15px] font-black text-gray-900 mt-2">
                      {r.reporterName || 'A user'} <span className="text-gray-400 font-bold">reported</span> {r.reportedUserName || 'a user'}
                    </p>
                    <p className="text-[13px] font-bold text-[#ba0036] mt-0.5">{r.reason || 'No reason given'}</p>
                    {r.details && <p className="text-[12px] font-medium text-gray-500 mt-1">{r.details}</p>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <button
                    onClick={() => toggleSuspect(r.reportedUserId, suspected)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-black transition-colors ${
                      suspected
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                    }`}
                  >
                    {suspected ? <><ShieldCheck size={14} /> Un-suspect user</> : <><ShieldAlert size={14} /> Mark suspected</>}
                  </button>

                  {r.status !== 'reviewed' && (
                    <button
                      onClick={() => setReportStatus(r.id, 'reviewed')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-black bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                    >
                      <Check size={14} /> Mark reviewed
                    </button>
                  )}
                  {r.status !== 'dismissed' && (
                    <button
                      onClick={() => setReportStatus(r.id, 'dismissed')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-black bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      <X size={14} /> Dismiss
                    </button>
                  )}
                  {r.status !== 'open' && (
                    <button
                      onClick={() => setReportStatus(r.id, 'open')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-black bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                    >
                      <RefreshCw size={13} /> Reopen
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
