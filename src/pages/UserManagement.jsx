import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AdminAuthContext';
import {
  Users, ShieldCheck, ShieldX, CheckCircle2,
  XCircle, AlertTriangle, Ban, RotateCcw, FileImage, Eye, Clock,
  RefreshCw, BadgeCheck, Trash2, ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  listUsers,
  listPendingVerification,
  listPendingLandlordVerification,
  verifyUser,
  verifyLandlord,
  rejectUser,
  rejectLandlord,
  banUser,
  unbanUser,
  deleteAdminUser,
  updateUserRole,
} from '../services/adminService';
import {
  PageContainer, PageHeader, Card, Tabs, Badge, Button, Select, SearchInput,
  LoadingState, EmptyState,
} from '../components/ui';

/**
 * UserManagement — KYC queues (tenant + landlord) and the searchable user
 * directory with ban / unban / delete / role controls.
 */

const TABS = [
  { value: 'pending',          label: 'Tenant Verification' },
  { value: 'pending-landlord', label: 'Landlord Verification' },
  { value: 'all',              label: 'All Users' },
];

// The role a super admin can assign from the directory row.
const ROLE_OPTIONS = [
  { value: 'tenant',        label: 'Tenant' },
  { value: 'landlord',      label: 'Landlord' },
  { value: 'support_agent', label: 'Support Agent' },
  { value: 'moderator',     label: 'Moderator' },
  { value: 'super_admin',   label: 'Super Admin' },
];

// Role filter pills on the All Users tab.
const ROLE_FILTERS = [
  { value: '',           label: 'All' },
  { value: 'tenant',     label: 'Tenant' },
  { value: 'landlord',   label: 'Landlord' },
  { value: 'super_admin', label: 'Super Admin' },
];

// ─── Small UI atoms ─────────────────────────────────────────────────
// Verification status, in the console's shared status vocabulary.
const StatusChip = ({ status }) => {
  const map = {
    verified:   { tone: 'info',    icon: BadgeCheck,  label: 'Verified' },
    pending:    { tone: 'warning', icon: Clock,       label: 'Pending' },
    rejected:   { tone: 'brand',   icon: ShieldX,     label: 'Rejected' },
    unverified: { tone: 'neutral', icon: ShieldAlert, label: 'Unverified' },
  };
  const s = map[status] || map.unverified;
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>;
};

// ─── Document tile ──────────────────────────────────────────────────
// Three states, and the labels are always present so a reviewer can tell WHICH
// document is missing or broken:
//
//   no url    → "Not uploaded" placeholder
//   loaded    → thumbnail + hover "Open"
//   failed    → explicit "Preview failed" tile that still links out
//
// The failure state used to be `onError = opacity 0.3`, which left a grey box
// wearing a working "Open" button. That's indistinguishable from a dark image
// and gave no hint that anything was wrong — it's how the broken Profile Photo
// tile went unnoticed.
const DocPreview = ({ url, label }) => {
  const [failed, setFailed] = useState(false);

  // A new url means a new attempt — clear a stale failure.
  useEffect(() => { setFailed(false); }, [url]);

  if (!url) {
    return (
      <div>
        <div className="aspect-[4/3] rounded-xl bg-gray-50 border border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-300">
          <FileImage size={26} />
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Not uploaded</span>
        </div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1.5">{label}</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="aspect-[4/3] rounded-xl bg-amber-50 border border-amber-200 flex flex-col items-center justify-center gap-1.5 px-2 text-center hover:bg-amber-100 transition-colors"
          title={url}
        >
          <AlertTriangle size={22} className="text-amber-500" />
          <span className="text-[9px] font-black uppercase tracking-widest text-amber-700">Preview failed</span>
          <span className="text-[9px] font-bold text-amber-600/80 underline">Open directly</span>
        </a>
        <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mt-1.5">{label}</p>
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="block group relative">
      <img
        src={url}
        alt={label}
        className="aspect-[4/3] w-full object-cover rounded-xl shadow-[0_4px_15px_rgba(0,0,0,0.04)] group-hover:shadow-[0_8px_25px_rgba(0,0,0,0.08)] transition-shadow"
        onError={() => setFailed(true)}
      />
      <span className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
        <span className="bg-white/95 text-gray-900 text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1">
          <Eye size={11} /> Open
        </span>
      </span>
      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1.5">{label}</p>
    </a>
  );
};

const InfoRow = ({ label, value, mono }) => (
  <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-b-0">
    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 min-w-[110px] pt-0.5">
      {label}
    </span>
    <span className={`flex-1 text-sm font-bold text-gray-800 break-words ${mono ? 'font-mono' : ''}`}>
      {value || <span className="text-gray-300">—</span>}
    </span>
  </div>
);

const PROFESSION_LABELS = {
  student:        'Student',
  // Current profile editor values (TenantProfileFields.jsx)
  job:            'Job holder',
  business:       'Business',
  doctor:         'Doctor',
  // Legacy values kept for older records / VerificationModal
  employed:       'Employed',
  'self-employed':'Self-employed',
  other:          'Other',
};

const FAMILY_SIZE_LABELS = {
  '1':  '1 person',
  '2':  '2 people',
  '3':  '3 people',
  '4':  '4 people',
  '5+': '5+ people',
};

// ─── Pending verification card ──────────────────────────────────────
const PendingCard = ({ user, busyId, onApprove, onReject }) => {
  const v  = user.tenantProfile?.verification || {};
  const tp = user.tenantProfile || {};
  const lp = user.landlordProfile || {};
  const ec = tp.emergencyContact || {};
  const busy = busyId === user.id;
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');

  // 3, not 4 — there are only three real document slots. The old "/4" counted a
  // professionProofUrl field that no upload path can ever populate, so a
  // complete submission still displayed as "3/4 docs".
  const DOC_SLOTS = [v.photoUrl, v.nidFrontUrl, v.nidBackUrl];
  const docCount = DOC_SLOTS.filter(Boolean).length;
  const docTotal = DOC_SLOTS.length;
  const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  }) : '—';

  const hasLandlordData = !!(lp.fullName || lp.city || lp.address || (lp.preferredTenants || []).length);

  return (
    <Card padding="lg" hover>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-black text-[#ba0036]">{(user.name || '?').charAt(0)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-black text-gray-900 truncate">{user.name}</h3>
          <p className="text-xs font-bold text-gray-500">{user.phone} {user.email ? `• ${user.email}` : ''}</p>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
            Joined {memberSince} · {docCount}/{docTotal} docs
          </p>
        </div>
        <StatusChip status={v.status || 'pending'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Profile facts */}
        <div className="bg-gray-50/60 rounded-2xl p-5">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-[#ba0036] mb-3">
            Personal Information
          </h4>
          <div className="space-y-0">
            <InfoRow label="Full Name"      value={user.name} />
            <InfoRow label="Phone"          value={user.phone} mono />
            <InfoRow label="Email"          value={user.email} />
            <InfoRow label="Date of Birth"  value={user.dateOfBirth ? new Date(user.dateOfBirth).toLocaleDateString('en-GB') : ''} />
            <InfoRow label="Roles"          value={(user.roles || [user.role]).join(' · ')} />

            {(() => {
              const vv = tp.verification || {};
              const adminApproved = vv.status === 'verified';
              const isFilled = (val) => Array.isArray(val) ? val.length > 0 : val !== '' && val != null;
              const items = [
                { pts: 15, done: !!user.phone },
                { pts: 15, done: !!vv.photo },
                { pts: 30, done: adminApproved && !!(vv.nidFront && vv.nidBack) },
                { pts: 10, done: isFilled(tp.professionType) },
                { pts: 10, done: isFilled(tp.workPlace) },
                { pts: 5,  done: isFilled(tp.familySize) },
                { pts: 15, done: !!(tp.emergencyContact && tp.emergencyContact.phone) },
              ];
              const score = items.filter((i) => i.done).reduce((sum, i) => sum + i.pts, 0);
              let tier = 'bronze';
              if (score >= 90) tier = 'platinum';
              else if (score >= 70) tier = 'gold';
              else if (score >= 40) tier = 'silver';
              return <InfoRow label="Trust Score" value={`${score}/100 · ${tier}`} />;
            })()}
          </div>

          <h4 className="text-[10px] font-black uppercase tracking-widest text-[#ba0036] mt-5 mb-3">
            Profession & Household
          </h4>
          <div className="space-y-0">
            <InfoRow label="Profession"     value={PROFESSION_LABELS[tp.professionType] || tp.professionType} />
            <InfoRow label="Workplace"      value={tp.workPlace} />
            <InfoRow label="Family Size"    value={FAMILY_SIZE_LABELS[tp.familySize] || tp.familySize} />
          </div>

          <h4 className="text-[10px] font-black uppercase tracking-widest text-[#ba0036] mt-5 mb-3">
            Emergency Contact
          </h4>
          <div className="space-y-0">
            <InfoRow label="Name"       value={ec.name} />
            <InfoRow label="Phone"      value={ec.phone} mono />
            <InfoRow label="Relation"   value={ec.relation} />
          </div>

          {hasLandlordData && (
            <>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-[#ba0036] mt-5 mb-3">
                Landlord Profile
              </h4>
              <div className="space-y-0">
                <InfoRow label="Display Name"      value={lp.fullName} />
                <InfoRow label="City"              value={lp.city} />
                <InfoRow label="Address"           value={lp.address} />
                <InfoRow label="Preferred Tenants" value={(lp.preferredTenants || []).join(', ')} />
                <InfoRow label="House Rules"       value={(lp.houseRules || []).join(', ')} />
                <InfoRow label="Service Charge"    value={lp.serviceCharge != null ? `৳ ${lp.serviceCharge}` : ''} />
              </div>
            </>
          )}
        </div>

        {/* Identity documents */}
        <div className="bg-gray-50/60 rounded-2xl p-5">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-[#ba0036] mb-4">
            Identity Documents
          </h4>
          {/* Three documents, matching DOC_KINDS in the backend's
              verification.controller.js. A fourth "Profession Proof" tile used
              to sit here reading v.professionProofUrl — a field that exists in
              no schema, no upload slot and no route, so it always rendered as
              an unlabelled empty placeholder and made every submission look
              incomplete. */}
          <div className="grid grid-cols-2 gap-3">
            <DocPreview url={v.photoUrl}    label="Profile Photo" />
            <DocPreview url={v.nidFrontUrl} label="NID Front" />
            <DocPreview url={v.nidBackUrl}  label="NID Back" />
          </div>

          <h4 className="text-[10px] font-black uppercase tracking-widest text-[#ba0036] mt-5 mb-3">
            Reviewer Checklist
          </h4>
          <ul className="space-y-2 text-[12px] font-bold text-gray-700">
            <li className="flex items-start gap-2"><span className="text-[#ba0036] mt-0.5">▸</span> Name on NID matches "{user.name}"</li>
            <li className="flex items-start gap-2"><span className="text-[#ba0036] mt-0.5">▸</span> NID images are sharp + readable</li>
            <li className="flex items-start gap-2"><span className="text-[#ba0036] mt-0.5">▸</span> Profile photo shows a real face, not a logo</li>
            <li className="flex items-start gap-2"><span className="text-[#ba0036] mt-0.5">▸</span> Workplace + emergency contact look genuine</li>
          </ul>
        </div>
      </div>

      {showReject && (
        <div className="mb-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this submission being rejected? The user will see this message."
            rows={2}
            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-[#ba0036] focus:bg-white outline-none text-sm font-bold text-gray-800 placeholder:text-gray-400 transition-all"
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        {showReject ? (
          <>
            <Button
              size="lg"
              variant="ghost"
              fullWidth
              disabled={busy}
              onClick={() => { setShowReject(false); setReason(''); }}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              variant="primary"
              icon={XCircle}
              fullWidth
              loading={busy}
              disabled={!reason.trim()}
              onClick={() => onReject(user.id, reason.trim())}
            >
              Send Rejection
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" icon={XCircle} fullWidth disabled={busy} onClick={() => setShowReject(true)}>
              Reject
            </Button>
            <Button
              size="lg"
              variant="primary"
              icon={CheckCircle2}
              fullWidth
              loading={busy}
              onClick={() => onApprove(user.id)}
            >
              Approve & Verify
            </Button>
          </>
        )}
      </div>
    </Card>
  );
};

// Super admin via EITHER field. `roles[]` is the source of truth and `role` is
// the legacy fallback, so checking only one of them is how a super admin ends up
// rendering with an enabled Ban / Delete / role control.
const isSuperAdminUser = (u) =>
  u?.role === 'super_admin' || (u?.roles || []).includes('super_admin');

// ─── User directory row ─────────────────────────────────────────────
const UserRow = ({ user, busyId, onBan, onUnban, currentUser, onChangeRole }) => {
  const status = user.tenantProfile?.verification?.status || 'unverified';
  const busy   = busyId === user.id;
  const isSuperAdmin = isSuperAdminUser(currentUser);

  // Mirrors the server's rails: super admins can't be banned, deleted or
  // demoted here, and you can't act on your own account. The backend enforces
  // all of this independently — this just avoids offering a click that 4xxs.
  // Naming matches AdminTeam's AdminRow, which gates the same way.
  const isSelf     = String(user.id) === String(currentUser?.id);
  const locked     = isSuperAdminUser(user) || isSelf;
  const lockReason = isSelf
    ? "You can't act on your own account"
    : 'Super admins are protected';

  return (
    <Card padding="sm" hover className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
        {user.avatar ? (
          <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-base font-black text-[#ba0036]">{(user.name || '?').charAt(0)}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-black text-gray-900 truncate">{user.name}</h3>
          {user.isBanned && <Badge size="sm" tone="brand">Banned</Badge>}
        </div>
        <p className="text-[11px] font-bold text-gray-500 truncate">
          {user.phone}{user.email ? ` • ${user.email}` : ''}
        </p>
      </div>

      <div className="hidden md:flex items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
          {(user.roles || [user.role]).join(' · ')}
        </span>
        <StatusChip status={status} />
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {user.isBanned ? (
          <Button size="sm" icon={RotateCcw} loading={busy} onClick={() => onUnban(user.id)}>
            Unban
          </Button>
        ) : (
          <Button
            size="sm"
            icon={Ban}
            loading={busy}
            disabled={locked}
            title={locked ? lockReason : 'Ban this user'}
            onClick={() => onBan(user.id)}
          >
            Ban
          </Button>
        )}
        <Button
          size="sm"
          variant="danger"
          icon={Trash2}
          loading={busy}
          disabled={locked}
          title={locked ? lockReason : 'Permanently delete user'}
          onClick={() => onBan(user.id, true)}
        >
          Delete
        </Button>
        {isSuperAdmin && (
          <Select
            value={user.role || 'tenant'}
            onChange={(e) => onChangeRole(user.id, e.target.value)}
            disabled={busy || locked}
            title={locked ? lockReason : 'Change user role'}
            className="py-2"
            options={ROLE_OPTIONS}
          />
        )}
      </div>
    </Card>
  );
};

// ─── Landlord pending card ──────────────────────────────────────────
const LandlordPendingCard = ({ user, busyId, onApprove, onReject }) => {
  const lv = user.landlordProfile?.verification || {};
  const tv = user.tenantProfile?.verification || {};
  const tp = user.tenantProfile  || {};
  const lp = user.landlordProfile || {};
  const ec = tp.emergencyContact  || {};
  const busy = busyId === user.id;
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');

  const tenantAlreadyVerified = tv.status === 'verified';
  const pathTag = tenantAlreadyVerified ? 'A — Upgrading Tenant' : 'B — Fresh Landlord';

  const submittedAt = lv.submittedAt
    ? new Date(lv.submittedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  return (
    <Card padding="lg" hover>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-black text-[#ba0036]">{(user.name || '?').charAt(0)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-black text-gray-900 truncate">{user.name}</h3>
          <p className="text-xs font-bold text-gray-500">{user.phone} {user.email ? `• ${user.email}` : ''}</p>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">
            Submitted {submittedAt} · Path {pathTag}
          </p>
        </div>
        <StatusChip status={lv.status || 'pending'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-50/60 rounded-2xl p-5">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-[#ba0036] mb-3">
            Property Details
          </h4>
          <div className="space-y-0">
            <InfoRow label="Property Address" value={lv.propertyAddress} />
            <InfoRow label="Display Name"     value={lp.fullName} />
            <InfoRow label="City"             value={lp.city} />
          </div>

          {tenantAlreadyVerified && (
            <>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mt-5 mb-3">
                Tenant Identity (Already Approved)
              </h4>
              <div className="space-y-0">
                <InfoRow label="Full Name"     value={user.name} />
                <InfoRow label="Phone"         value={user.phone} mono />
                <InfoRow label="Profession"    value={PROFESSION_LABELS[tp.professionType] || tp.professionType} />
                <InfoRow label="Workplace"     value={tp.workPlace} />
                <InfoRow label="Family Size"   value={FAMILY_SIZE_LABELS[tp.familySize] || tp.familySize} />
                <InfoRow label="Emergency"     value={ec.name && ec.phone ? `${ec.name} · ${ec.phone}` : ''} />
              </div>
              <p className="mt-3 text-[11px] font-bold text-emerald-700/80 flex items-start gap-1.5">
                <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
                NID + profile photo + profession proof were already approved as part of tenant verification.
              </p>
            </>
          )}
        </div>

        <div className="bg-gray-50/60 rounded-2xl p-5">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-[#ba0036] mb-4">
            Submitted Documents
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <DocPreview url={lv.utilityBillUrl} label="Utility Bill" />
            {!tenantAlreadyVerified && (
              <>
                <DocPreview url={tv.photoUrl}    label="Profile Photo" />
                <DocPreview url={tv.nidFrontUrl} label="NID Front" />
                <DocPreview url={tv.nidBackUrl}  label="NID Back" />
              </>
            )}
          </div>

          <h4 className="text-[10px] font-black uppercase tracking-widest text-[#ba0036] mt-5 mb-3">
            Reviewer Checklist
          </h4>
          <ul className="space-y-2 text-[12px] font-bold text-gray-700">
            <li className="flex items-start gap-2"><span className="text-[#ba0036] mt-0.5">▸</span> Bill address matches the property address typed above</li>
            <li className="flex items-start gap-2"><span className="text-[#ba0036] mt-0.5">▸</span> Utility bill is recent + legible</li>
            <li className="flex items-start gap-2"><span className="text-[#ba0036] mt-0.5">▸</span> Bill account holder matches the user's NID name</li>
            {!tenantAlreadyVerified && (
              <li className="flex items-start gap-2"><span className="text-[#ba0036] mt-0.5">▸</span> All Path B identity documents look genuine</li>
            )}
          </ul>
        </div>
      </div>

      {showReject && (
        <div className="mb-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this landlord submission being rejected? The user will see this message."
            rows={2}
            className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-[#ba0036] focus:bg-white outline-none text-sm font-bold text-gray-800 placeholder:text-gray-400 transition-all"
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        {showReject ? (
          <>
            <Button
              size="lg"
              variant="ghost"
              fullWidth
              disabled={busy}
              onClick={() => { setShowReject(false); setReason(''); }}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              variant="primary"
              icon={XCircle}
              fullWidth
              loading={busy}
              disabled={!reason.trim()}
              onClick={() => onReject(user.id, reason.trim())}
            >
              Send Rejection
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" icon={XCircle} fullWidth disabled={busy} onClick={() => setShowReject(true)}>
              Reject
            </Button>
            <Button
              size="lg"
              variant="primary"
              icon={CheckCircle2}
              fullWidth
              loading={busy}
              onClick={() => onApprove(user.id)}
            >
              Approve as Landlord
            </Button>
          </>
        )}
      </div>
    </Card>
  );
};

// ─── Page ───────────────────────────────────────────────────────────
const UserManagement = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const initialTab = new URLSearchParams(location.search).get('tab') || 'pending';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const currentTabInUrl = new URLSearchParams(window.location.search).get('tab');
    if (currentTabInUrl !== activeTab) {
      navigate(`?tab=${activeTab}`, { replace: true, state: location.state });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const [pending,         setPending]         = useState([]);
  const [pendingLandlord, setPendingLandlord] = useState([]);
  const [allUsers,        setAllUsers]        = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [busyId,          setBusyId]          = useState(null);
  const [error,           setError]           = useState('');
  const [search,          setSearch]          = useState('');
  const [roleFilter,      setRoleFilter]      = useState('');

  // Notifications go through sonner, like every other page. This screen used to
  // ship its own fixed-position toast with its own timer and gradient, so the
  // same "user banned" outcome appeared bottom-right here and top-right
  // everywhere else — and two toasts could sit on screen at once.
  const showToast = useCallback((message, kind = 'success') => {
    if (kind === 'error') toast.error(message);
    else toast.success(message);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'pending') {
        setPending(await listPendingVerification());
      } else if (activeTab === 'pending-landlord') {
        setPendingLandlord(await listPendingLandlordVerification());
      } else {
        const data = await listUsers({ role: roleFilter, search });
        setAllUsers(data.users || []);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, roleFilter, search]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleApprove = async (id) => {
    setBusyId(id);
    try {
      await verifyUser(id);
      setPending((prev) => prev.filter((u) => u.id !== id));
      showToast('User verified. Landlord role unlocked.');
    } catch (err) {
      showToast(err?.message || 'Approval failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id, reason) => {
    setBusyId(id);
    try {
      await rejectUser(id, reason);
      setPending((prev) => prev.filter((u) => u.id !== id));
      showToast('Submission rejected. User has been notified.');
    } catch (err) {
      showToast(err?.message || 'Rejection failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  // The server's role rails, in English. Same codes the Admin Team page maps.
  const ROLE_ERRORS = {
    last_super_admin: "You can't demote the last super admin — promote someone else first.",
    cannot_modify_self: "You can't change your own role.",
    super_admin_required: 'Only super admins can change user roles.',
  };

  const handleChangeRole = async (id, newRole) => {
    setBusyId(id);
    try {
      const updated = await updateUserRole(id, newRole);
      setAllUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      showToast(`User role updated to ${newRole}.`);
    } catch (err) {
      showToast(ROLE_ERRORS[err?.code] || err?.message || 'Failed to update role.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveLandlord = async (id) => {
    setBusyId(id);
    try {
      await verifyLandlord(id);
      setPendingLandlord((prev) => prev.filter((u) => u.id !== id));
      showToast('Landlord verified. Landlord role unlocked.');
    } catch (err) {
      showToast(err?.message || 'Approval failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectLandlord = async (id, reason) => {
    setBusyId(id);
    try {
      await rejectLandlord(id, reason);
      setPendingLandlord((prev) => prev.filter((u) => u.id !== id));
      showToast('Landlord submission rejected. User has been notified.');
    } catch (err) {
      showToast(err?.message || 'Rejection failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleBan = async (id, isDelete = false) => {
    setBusyId(id);
    try {
      if (isDelete) {
        if (!window.confirm("Are you sure you want to permanently delete this user and ALL their properties? This cannot be undone.")) {
          setBusyId(null);
          return;
        }
        await deleteAdminUser(id);
        setAllUsers((prev) => prev.filter((u) => u.id !== id));
        showToast('User and properties deleted.');
      } else {
        const updated = await banUser(id, 'Banned by admin.');
        setAllUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
        showToast('User banned.');
      }
    } catch (err) {
      showToast(err?.message || (isDelete ? 'Delete failed.' : 'Ban failed.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleUnban = async (id) => {
    setBusyId(id);
    try {
      const updated = await unbanUser(id);
      setAllUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      showToast('User restored.');
    } catch (err) {
      showToast(err?.message || 'Unban failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount         = pending.length;
  const pendingLandlordCount = pendingLandlord.length;

  const tabsWithCounts = TABS.map((tab) => ({
    ...tab,
    badge: tab.value === 'pending' && pendingCount > 0 ? pendingCount
      : tab.value === 'pending-landlord' && pendingLandlordCount > 0 ? pendingLandlordCount
        : undefined,
  }));

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="User Management"
        description="Approve verifications, manage roles, and moderate accounts."
        actions={(
          <Button icon={RefreshCw} iconClassName={loading ? 'animate-spin' : ''} disabled={loading} onClick={refresh}>
            Refresh
          </Button>
        )}
      />

      <Tabs tabs={tabsWithCounts} value={activeTab} onChange={setActiveTab} />

      {/* Filters — only on All Users tab */}
      {activeTab === 'all' && (
        <Card padding="sm" className="flex flex-col md:flex-row gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, phone, or email…"
          />
          <div className="flex gap-2 flex-wrap">
            {ROLE_FILTERS.map((r) => (
              <Button
                key={r.value || 'all'}
                variant={roleFilter === r.value ? 'primary' : 'secondary'}
                onClick={() => setRoleFilter(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-[#ba0036] rounded-2xl p-4 text-sm font-bold flex items-center gap-2" role="alert">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <LoadingState label="Loading users" />
      ) : activeTab === 'pending' ? (
        pending.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No pending tenant submissions"
            description="When users submit identity documents, they'll appear here for review."
          />
        ) : (
          <div className="space-y-6">
            {pending.map((u) => (
              <PendingCard key={u.id} user={u} busyId={busyId} onApprove={handleApprove} onReject={handleReject} />
            ))}
          </div>
        )
      ) : activeTab === 'pending-landlord' ? (
        pendingLandlord.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No pending landlord submissions"
            description="Verified tenants who want to list properties — plus fresh landlord signups — appear here once they submit."
          />
        ) : (
          <div className="space-y-6">
            {pendingLandlord.map((u) => (
              <LandlordPendingCard key={u.id} user={u} busyId={busyId} onApprove={handleApproveLandlord} onReject={handleRejectLandlord} />
            ))}
          </div>
        )
      ) : (
        allUsers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users match"
            description="Try a different search or clear the role filter."
          />
        ) : (
          <div className="space-y-3">
            {allUsers.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                busyId={busyId}
                onBan={handleBan}
                onUnban={handleUnban}
                currentUser={currentUser}
                onChangeRole={handleChangeRole}
              />
            ))}
          </div>
        )
      )}

    </PageContainer>
  );
};

export default UserManagement;
