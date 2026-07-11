import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, Crown, Users, UserPlus, Search,
  Loader2, UserMinus, AlertTriangle, Check, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AdminAuthContext.jsx';
import {
  listTeam, searchCandidates, grantAdmin, updateAdminRole, revokeAdmin,
} from '../services/teamService.js';

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
const roleBadge = (role) => ({
  support_agent: 'bg-blue-50 text-blue-700 border-blue-100',
  moderator: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  super_admin: 'bg-[#ba0036]/10 text-[#ba0036] border-[#ba0036]/20',
}[role] || 'bg-gray-100 text-gray-600 border-gray-200');

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
    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex items-center gap-4 flex-wrap">
      <Avatar user={admin} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-black text-gray-900 truncate">{admin.name}</h3>
          {admin.adminRole === 'super_admin' && <Crown size={13} className="text-[#ba0036] shrink-0" />}
          {isSelf && (
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 bg-gray-100 px-2 py-0.5 rounded">You</span>
          )}
        </div>
        <p className="text-[11px] font-bold text-gray-500 truncate">
          {admin.phone}{admin.email ? ` • ${admin.email}` : ''}
        </p>
      </div>

      <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${roleBadge(admin.adminRole)}`}>
        {ROLE_LABEL[admin.adminRole] || admin.adminRole}
      </span>

      <div className="flex items-center gap-2">
        <select
          value={admin.adminRole || ''}
          disabled={locked || busy}
          title={locked ? lockReason : 'Change role'}
          onChange={(e) => onChangeRole(admin, e.target.value)}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none focus:border-[#ba0036] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        <button
          onClick={() => onRevoke(admin)}
          disabled={locked || busy}
          title={locked ? lockReason : 'Revoke admin access'}
          className="px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg font-black text-xs hover:bg-red-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <UserMinus size={12} />}
          Revoke
        </button>
      </div>
    </div>
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
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${roleBadge(user.adminRole)}`}>
              {ROLE_LABEL[user.adminRole]}
            </span>
          )}
        </div>
        <p className="text-[11px] font-bold text-gray-500 truncate">
          {user.phone}{user.email ? ` • ${user.email}` : ''}
        </p>
      </div>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value)}
        disabled={busy}
        className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none focus:border-[#ba0036] transition-all cursor-pointer disabled:opacity-40"
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <button
        onClick={() => onGrant(user, role)}
        disabled={busy}
        className="px-4 py-2 bg-[#ba0036] text-white rounded-lg font-black text-xs hover:bg-[#90002a] transition-all disabled:opacity-50 flex items-center gap-1.5"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
        {user.adminRole ? 'Update' : 'Grant'}
      </button>
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
      <div className="max-w-2xl mx-auto pt-10">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center">
          <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={30} />
          </div>
          <h1 className="text-xl font-black text-gray-900">Restricted</h1>
          <p className="text-sm font-bold text-gray-500 mt-2 max-w-md mx-auto">
            Only super admins can manage the admin team. Ask a super admin if you need access changed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pt-4 pb-12 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <ShieldCheck size={26} className="text-[#ba0036]" /> Admin Team
        </h1>
        <p className="text-sm font-bold text-gray-500 mt-2">
          Designate other users as admins or sub-admins, and manage their access.
        </p>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ROLES.map((r) => (
          <div key={r.value} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${roleBadge(r.value)}`}>
              {r.label}
            </span>
            <p className="text-[11px] font-bold text-gray-500 mt-2">{r.hint}</p>
          </div>
        ))}
      </div>

      {/* Add an admin */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-sm font-black text-gray-900 flex items-center gap-2 mb-3">
          <UserPlus size={16} className="text-[#ba0036]" /> Add an admin
        </h2>
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a user by name, phone, or email…"
            className="w-full pl-11 pr-10 py-3 bg-gray-50 rounded-xl outline-none text-sm font-bold text-gray-800 placeholder:text-gray-400 focus:bg-white focus:border-[#ba0036] border border-transparent transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
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
      </div>

      {/* Current admins */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-gray-900 flex items-center gap-2">
            <Users size={16} className="text-[#ba0036]" /> Current admins
            <span className="text-[10px] font-black text-gray-400">({admins.length})</span>
          </h2>
        </div>

        {superAdminCount <= 1 && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl p-3 text-[12px] font-bold mb-3">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            There's only one super admin. The last super admin can't be demoted or revoked — add another first if you need to step down.
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={26} className="text-[#ba0036] animate-spin" />
          </div>
        ) : admins.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-sm">
            <Users size={30} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-bold text-gray-400">No admins yet.</p>
          </div>
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
    </div>
  );
};

export default AdminTeam;
