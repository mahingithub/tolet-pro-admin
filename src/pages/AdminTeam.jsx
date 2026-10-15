import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldAlert, Crown, Users,
  Loader2, UserMinus, AlertTriangle, Check, UserPlus, KeyRound, Eye, EyeOff, Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AdminAuthContext.jsx';
import {
  listTeam, searchCandidates, grantAdmin, updateAdminRole, revokeAdmin,
  createAdminAccount, setAdminPassword,
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
    phone_taken: 'This number already has an account — search for it above and grant a role instead.',
    email_taken: 'Another admin already uses this email.',
    weak_password: 'The password needs at least 8 characters.',
    invalid_phone: 'Enter a valid phone number, e.g. 01712345678.',
    invalid_email: 'Enter a valid email, or leave it blank.',
    invalid_name: 'The name needs at least 2 characters.',
    not_admin: 'Only admin team members can have their password set here.',
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
const AdminRow = ({ admin, isSelf, isLastSuperAdmin, busy, onChangeRole, onRevoke, onSetPassword }) => {
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
          icon={KeyRound}
          disabled={isSelf || busy}
          title={isSelf ? 'Change your own password in Account settings' : 'Set a new password (signs them out)'}
          onClick={() => onSetPassword(admin)}
        >
          Set password
        </Button>

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

  const handleSetPassword = async (admin) => {
    const password = window.prompt(`New password for ${admin.name} (at least 8 characters). They'll be signed out and must use it to sign in.`);
    if (password == null) return;
    setBusyId(admin.id);
    try {
      await setAdminPassword(admin.id, password);
      toast.success(`New password set for ${admin.name}. Share it with them privately.`);
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

      {/* Create a staff login */}
      <CreateAdminCard onCreated={refresh} />

      {/* Add an admin */}
      <Card>
        <CardHeader
          title="Promote an existing user"
          description="Already has a To-Let Pro account? Search them, then grant a console role. They sign in with their own password."
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
                onSetPassword={handleSetPassword}
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
};

// ─── Create a staff login (name, phone, email?, password, role) ──────────────
const EMPTY_FORM = { name: '', phone: '', email: '', password: '', role: 'moderator' };

// 12 characters from an alphabet without look-alikes (no 0/O, 1/l/I).
const generatePassword = () => {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
};

const CreateAdminCard = ({ onCreated }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  // What to hand over, shown once after creating — the password isn't kept anywhere.
  const [created, setCreated] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const admin = await createAdminAccount(form);
      setCreated({ ...admin, password: form.password });
      setForm(EMPTY_FORM);
      setShowPw(false);
      toast.success(`${admin.name} can now sign in as ${ROLE_LABEL[admin.adminRole]}.`);
      onCreated();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const copyDetails = async () => {
    const text = [
      `Admin console: ${window.location.origin}`,
      `Sign in with: ${created.phone}${created.email ? ` or ${created.email}` : ''}`,
      `Password: ${created.password}`,
      'Please change the password after your first sign-in (Account settings).',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Login details copied');
    } catch {
      toast.error('Could not copy — select the details and copy by hand');
    }
  };

  const input = 'w-full px-3 py-2.5 text-[13px] font-bold text-gray-900 border border-gray-200 rounded-xl bg-white focus:border-[#ba0036] outline-none';
  const label = 'block text-[11px] font-black text-gray-500 mb-1';

  return (
    <Card>
      <CardHeader
        title="Create admin account"
        description="Make a console login for a new team member. They sign in with the phone or the email and this password, and can change the password themselves afterwards."
        className="mb-4"
      />
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="new-admin-name" className={label}>Full name</label>
          <input id="new-admin-name" required minLength={2} value={form.name} onChange={set('name')} className={input} />
        </div>
        <div>
          <label htmlFor="new-admin-role" className={label}>Role</label>
          <Select
            id="new-admin-role"
            value={form.role}
            onChange={set('role')}
            options={ROLES.map((r) => ({ value: r.value, label: `${r.label} — ${r.hint}` }))}
          />
        </div>
        <div>
          <label htmlFor="new-admin-phone" className={label}>Phone (sign-in)</label>
          <input id="new-admin-phone" type="tel" required placeholder="01XXXXXXXXX" value={form.phone} onChange={set('phone')} className={input} />
        </div>
        <div>
          <label htmlFor="new-admin-email" className={label}>Email (optional — also works for sign-in)</label>
          <input id="new-admin-email" type="email" placeholder="name@example.com" value={form.email} onChange={set('email')} className={input} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="new-admin-password" className={label}>Password (at least 8 characters)</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input id="new-admin-password" type={showPw ? 'text' : 'password'} required minLength={8} autoComplete="new-password"
                value={form.password} onChange={set('password')} className={`${input} pr-10`} />
              <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-700">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <Button onClick={() => { setForm((f) => ({ ...f, password: generatePassword() })); setShowPw(true); }}>Generate</Button>
          </div>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" icon={UserPlus} loading={saving}>Create account</Button>
        </div>
      </form>

      {created && (
        <div className="mt-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50 space-y-1">
          <p className="text-[12px] font-black text-emerald-800">Account ready — share these details privately. The password is shown only now.</p>
          <p className="text-[12px] font-bold text-gray-700">Sign in with: {created.phone}{created.email ? ` or ${created.email}` : ''}</p>
          <p className="text-[12px] font-bold text-gray-700">Password: <span className="font-mono">{created.password}</span></p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" icon={Copy} onClick={copyDetails}>Copy login details</Button>
            <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>Done</Button>
          </div>
        </div>
      )}
    </Card>
  );
};

export default AdminTeam;
