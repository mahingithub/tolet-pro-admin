// Reports.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Admin panel for user-abuse reports raised from chat. Admins can review /
// dismiss a report and mark the reported user as "suspected" (a soft flag,
// separate from a ban).

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, Check, X, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  listReports, updateReportStatus, suspectUser, unsuspectUser,
} from '../services/adminService';
import {
  PageContainer, PageHeader, Card, Tabs, Badge, Button, SearchInput,
  LoadingState, EmptyState,
} from '../components/ui';

const STATUS_TABS = [
  { value: 'open', label: 'Open' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: '', label: 'All' },
];

// Shared status vocabulary — same tones the rest of the console uses for the
// same meanings, so "open" looks like "pending" everywhere else.
const STATUS_TONE = {
  open: 'warning',
  reviewed: 'info',
  dismissed: 'neutral',
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
    <PageContainer className="space-y-6">
      <PageHeader
        title="User Reports"
        description="Abuse reports raised from chat."
        meta={openCount > 0 ? (
          <Badge tone="warning" icon={AlertTriangle}>{openCount} open</Badge>
        ) : null}
        actions={(
          <Button icon={RefreshCw} iconClassName={loading ? 'animate-spin' : ''} onClick={load}>
            Refresh
          </Button>
        )}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs tabs={STATUS_TABS} value={status} onChange={setStatus} />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name or reason…"
        />
      </div>

      {/* List */}
      {loading ? (
        <LoadingState label="Loading reports" />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No reports here"
          description="Abuse reports raised from chat land in this queue for review."
          tone="success"
        />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const suspected = suspectedIds[r.reportedUserId];
            return (
              <Card key={r.id} padding="md" hover>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</Badge>
                  {r.reportCount > 1 && (
                    <Badge tone="danger" icon={AlertTriangle}>×{r.reportCount}</Badge>
                  )}
                  <span className="text-[11px] font-bold text-gray-400">{fmt(r.createdAt)}</span>
                </div>

                <p className="text-[15px] font-black text-gray-900 mt-2">
                  {r.reporterName || 'A user'} <span className="text-gray-400 font-bold">reported</span> {r.reportedUserName || 'a user'}
                </p>
                <p className="text-[13px] font-bold text-[#ba0036] mt-0.5">{r.reason || 'No reason given'}</p>
                {r.details && <p className="text-[12px] font-medium text-gray-500 mt-1">{r.details}</p>}

                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <Button
                    size="sm"
                    variant={suspected ? 'secondary' : 'danger'}
                    icon={suspected ? ShieldCheck : ShieldAlert}
                    onClick={() => toggleSuspect(r.reportedUserId, suspected)}
                  >
                    {suspected ? 'Un-suspect user' : 'Mark suspected'}
                  </Button>

                  {r.status !== 'reviewed' && (
                    <Button size="sm" icon={Check} onClick={() => setReportStatus(r.id, 'reviewed')}>
                      Mark reviewed
                    </Button>
                  )}
                  {r.status !== 'dismissed' && (
                    <Button size="sm" variant="ghost" icon={X} onClick={() => setReportStatus(r.id, 'dismissed')}>
                      Dismiss
                    </Button>
                  )}
                  {r.status !== 'open' && (
                    <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => setReportStatus(r.id, 'open')}>
                      Reopen
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
