import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldAlert, Crown, Users,
  Loader2, UserMinus, AlertTriangle, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AdminAuthContext.jsx';
import {
  listTeam, searchCandidates, grantAdmin, updateAdminRole, revokeAdmin,
} from '../services/teamService.js';
import {
  PageContainer, PageHeader, Card, CardHeader, Badge, Button, Select,
  SearchInput, LoadingState, EmptyState,
} from '../components/ui';

// Admin role catalogue (least → most privileged).
const ROLES = [
  { value: 'support_agent', label: 'Support Agent', hint: 'Support tickets & AI guides' },
  { value: 'moderator',     label: 'Moderator',     hint: 'Listings, users & reports' },
  { value: 'super_admin',   label: 'Super Admin',   hint: 'Full access incl. admin team' },
];
const ROLE_LABEL = {
  support_agent: 'Support Agent',
  moderator: 'Moderator',
  super_admin: 'Super Admin',
};
// Role → shared Badge tone, so a role reads the same here, in the sidebar and
// in the user directory.
const roleTone = (role) => ({
  support_agent: 'info',
  moderator: 'indigo',
  super_admin: 'brand',
}[role] || 'neutral');

// Map backend error codes → friendly English.
const errMsg = (err) => {
  const map = {
    last_super_admin: "You can't demote or revoke the last super admin.",
    cannot_modify_self: "You can't change your own admin role.",
    invalid_role: 'Invalid admin role.',
    user_not_found: 'User not found.',
    super_admin_required: 'Only super admins can manage the admin team.',
  };
  return map[err?.code] || err?.serverMessage || err?.message || 'Action failed.';
};

const Avatar = ({ user }) => (
  <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
    {user.avatar ? (
      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
    ) : (
      <span className="text-base font-black text-[#ba0036]">{(user.name || '?').charAt(0)}</span>
    )}
  </div>
);

// ─── A row in the current-admins list ───────────────────────────────────────
const AdminRow = ({ admin, isSelf, isLastSuperAdmin, busy, onChangeRole, onRevoke }) => {
  const locked = isSelf || (admin.adminRole === 'super_admin' && isLastSuperAdmin);
  const lockReason = isSelf
    ? "You can't change your own role"
    : 'The last super admin is protected';

  return (
    <Card padding="sm" className="flex items-center gap-4 flex-wrap">
      <Avatar user={admin} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-black text-gray-900 truncate">{admin.name}</h3>
          {admin.adminRole === 'super_admin' && <Crown size={13} className="text-[#ba0036] shrink-0" />}
          {isSelf && <Badge size="sm">You</Badge>}
        </div>
        <p className="text-[11px] font-bold text-gray-500 truncate">
          {admin.phone}{admin.email ? ` • ${admin.email}` : ''}
        </p>
      </div>

      <Badge tone={roleTone(admin.adminRole)}>
        {ROLE_LABEL[admin.adminRole] || admin.adminRole}
      </Badge>

      <div className="flex items-center gap-2">
        <Select
          value={admin.adminRole || ''}
          disabled={locked || busy}
          title={locked ? lockReason : 'Change role'}
          onChange={(e) => onChangeRole(admin, e.target.value)}
          options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
        />

        <Button
          variant="danger"
          icon={UserMinus}
          loading={busy}
          disabled={locked}
          title={locked ? lockReason : 'Revoke admin access'}
          onClick={() => onRevoke(admin)}
        >
          Revoke
        </Button>
      </div>
    </Card>
  );
};

// ─── A search result you can promote ────────────────────────────────────────
const CandidateRow = ({ user, busy, onGrant }) => {
  const [role, setRole] = useState('support_agent');
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50/60 transition-all flex-wrap">
      <Avatar user={user} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-black text-gray-900 truncate">{user.name}</h4>
          {user.adminRole && (
            <Badge size="sm" tone={roleTone(user.adminRole)}>{ROLE_LABEL[user.adminRole]}</Badge>
          )}
        </div>
        <p className="text-[11px] font-bold text-gray-500 truncate">
          {user.phone}{user.email ? ` • ${user.email}` : ''}
        </p>
      </div>
      <Select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        disabled={busy}
        options={ROLES.map((r) => ({ value: r.value, label: r.label }))}
      />
      <Button variant="primary" icon={Check} loading={busy} onClick={() => onGrant(user, role)}>
        {user.adminRole ? 'Update' : 'Grant'}
      </Button>
    </div>
  );
};

const AdminTeam = () => {
  const { user, hasRole } = useAuth();
  const isSuperAdmin = hasRole('super_admin');

  const [admins, setAdmins] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(user?.id || null);
  const [superAdminCount, setSuperAdminCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTeam();
      setAdmins(data.admins);
      setCurrentUserId(data.currentUserId || user?.id || null);
      setSuperAdminCount(data.superAdminCount);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isSuperAdmin) refresh();
    else setLoading(false);
  }, [isSuperAdmin, refresh]);

  // Debounced candidate search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return undefined; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchCandidates(q));
      } catch (err) {
        toast.error(errMsg(err));
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const handleGrant = async (candidate, role) => {
    setBusyId(candidate.id);
    try {
      await grantAdmin(candidate.id, role);
      toast.success(`${candidate.name} is now ${ROLE_LABEL[role]}.`);
      setQuery('');
      setResults([]);
      await refresh();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleChangeRole = async (admin, role) => {
    if (role === admin.adminRole) return;
    setBusyId(admin.id);
    try {
      await updateAdminRole(admin.id, role);
      toast.success(`${admin.name} is now ${ROLE_LABEL[role]}.`);
      await refresh();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async (admin) => {
    if (!window.confirm(`Remove admin access from ${admin.name}? They'll become a regular user.`)) return;
    setBusyId(admin.id);
    try {
      await revokeAdmin(admin.id);
      toast.success(`Admin access removed from ${admin.name}.`);
      await refresh();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusyId(null);
    }
  };

  // Non-super-admins never see the tooling.
  if (!isSuperAdmin) {
    return (
      <PageContainer width="narrow">
        <EmptyState
          icon={ShieldAlert}
          title="Restricted"
          description="Only super admins can manage the admin team. Ask a super admin if you need access changed."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Admin Team"
        description="Designate other users as admins or sub-admins, and manage their access."
      />

      {/* Role legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ROLES.map((r) => (
          <Card key={r.value} padding="sm">
            <Badge tone={roleTone(r.value)}>{r.label}</Badge>
            <p className="text-[11px] font-bold text-gray-500 mt-2">{r.hint}</p>
          </Card>
        ))}
      </div>

      {/* Add an admin */}
      <Card>
        <CardHeader
          title="Add an admin"
          description="Search any user, then grant them a console role."
          className="mb-3"
        />
        <div className="flex">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search a user by name, phone, or email…"
          />
        </div>

        <div className="mt-3 space-y-2">
          {searching && (
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 py-3">
              <Loader2 size={14} className="animate-spin" /> Searching…
            </div>
          )}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-xs font-bold text-gray-400 py-3">No users match “{query.trim()}”.</p>
          )}
          {!searching && results.map((u) => (
            <CandidateRow key={u.id} user={u} busy={busyId === u.id} onGrant={handleGrant} />
          ))}
          {query.trim().length > 0 && query.trim().length < 2 && (
            <p className="text-xs font-bold text-gray-400 py-2">Type at least 2 characters.</p>
          )}
        </div>
      </Card>

      {/* Current admins */}
      <div className="space-y-3">
        <CardHeader
          title={`Current admins (${admins.length})`}
          description="Everyone who can reach this console."
        />

        {superAdminCount <= 1 && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl p-3 text-[12px] font-bold">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            There's only one super admin. The last super admin can't be demoted or revoked — add another first if you need to step down.
          </div>
        )}

        {loading ? (
          <LoadingState label="Loading team" />
        ) : admins.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No admins yet"
            description="Grant a user a console role above to get started."
          />
        ) : (
          <div className="space-y-2">
            {admins.map((a) => (
              <AdminRow
                key={a.id}
                admin={a}
                isSelf={String(a.id) === String(currentUserId)}
                isLastSuperAdmin={superAdminCount <= 1}
                busy={busyId === a.id}
                onChangeRole={handleChangeRole}
                onRevoke={handleRevoke}
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
};

export default AdminTeam;
