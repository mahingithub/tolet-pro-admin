import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2, XCircle, MapPin, Phone, ShieldCheck, ShieldAlert,
  Wallet, Ban, RotateCcw, RefreshCw, ExternalLink, Clock, AlertCircle, Store,
} from 'lucide-react';

import {
  listAdminProviders, getProviderQueueStats, getAdminProvider,
  approveProvider, rejectProvider, confirmProviderPayment,
  suspendProvider, unsuspendProvider,
} from '../services/adminService';
import {
  PageContainer, PageHeader, Card, Tabs, Badge, Button,
  SearchInput, EmptyState, LoadingState, ErrorState, StatCard,
} from '../components/ui';

/**
 * ProviderVerification — the service provider queue.
 * ──────────────────────────────────────────────────────────────────────────
 * The one screen where admin touches a provider. Identity is checked once, the
 * registration fee is confirmed once, and after that every order runs
 * provider↔tenant with nobody in between. Nothing on this page is reachable
 * per transaction — which is what stops the marketplace being capped by the
 * size of the support team.
 *
 * The review itself is a comparison: does the NID match the selfie, and was
 * that selfie taken where the pin is? So the documents sit side by side with
 * the map link, and the two approve buttons say plainly what each one grants.
 *
 * NOTE this page renders somebody's identity documents. They are deliberately
 * absent from every other surface — Provider.toJSON strips them — and the
 * server rebuilds them only for this console.
 */

const STATUS_TABS = [
  { value: 'pending_review',   label: 'Awaiting review' },
  { value: 'awaiting_payment', label: 'Awaiting payment' },
  { value: 'active',           label: 'Active' },
  { value: 'suspended',        label: 'Suspended' },
  { value: 'rejected',         label: 'Rejected' },
  { value: 'all',              label: 'All' },
];

const STATUS_TONE = {
  draft:            'neutral',
  pending_review:   'warning',
  awaiting_payment: 'info',
  active:           'success',
  suspended:        'danger',
  rejected:         'danger',
  expired:          'neutral',
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric',
}) : '—');

const fmtMoney = (n) => `৳${Number(n || 0).toLocaleString('en-IN')}`;

/** One identity document, or a plain note that it was not submitted. */
function DocThumb({ label, url }) {
  if (!url) {
    return (
      <div className="flex-1 min-w-[120px] rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center">
        <p className="text-[11px] font-bold text-gray-400">{label}</p>
        <p className="text-[10px] text-gray-400 mt-0.5">not submitted</p>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex-1 min-w-[120px] group"
      title={`Open ${label} full size`}
    >
      <p className="text-[11px] font-bold text-gray-600 mb-1 flex items-center gap-1">
        {label}
        <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      </p>
      <img
        src={url}
        alt={label}
        className="w-full h-24 object-cover rounded-lg border border-gray-200 group-hover:border-[#ba0036] transition-colors"
      />
    </a>
  );
}

/** The category's own answers, rendered generically — prices included. */
function FieldSummary({ fields }) {
  const entries = Object.entries(fields || {});
  if (!entries.length) {
    return <p className="text-xs text-gray-400">No details submitted.</p>;
  }
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-[11px] font-bold text-gray-500 truncate">{key}</dt>
          <dd className="text-[11px] text-gray-800 tabular-nums">
            {value && typeof value === 'object' && !Array.isArray(value)
              ? Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ')
              : Array.isArray(value) ? value.join(', ') : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ProviderCard({ p, onAction, busy }) {
  const [detail, setDetail] = useState(null);
  const [open, setOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const expand = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (detail) return;
    setLoadingDetail(true);
    try {
      setDetail(await getAdminProvider(p.id));
    } finally {
      setLoadingDetail(false);
    }
  };

  const v = detail?.provider?.verification || p.verification || {};
  // The server's own answer, never inferred here — it refuses the badge on
  // exactly this rule, so the UI must not offer a button the API will reject.
  const canFull = detail?.canGrantFullTier;

  const reject = () => {
    // eslint-disable-next-line no-alert
    const reason = window.prompt(
      'Why is this being rejected?\nThe provider sees this text verbatim, so say what to fix.',
    );
    if (reason && reason.trim().length >= 5) onAction('reject', p, reason.trim());
    else if (reason !== null) window.alert('Please give a reason of at least 5 characters.');
  };

  const confirmFee = () => {
    // eslint-disable-next-line no-alert
    const trxId = window.prompt('bKash/Nagad transaction ID (leave blank to WAIVE the fee):');
    if (trxId === null) return;
    if (!trxId.trim()) {
      if (window.confirm('Waive the registration fee for this provider?')) {
        onAction('payment', p, { waived: true });
      }
      return;
    }
    const amount = window.prompt('Amount received (৳):', '500');
    if (amount === null) return;
    onAction('payment', p, { amount: Number(amount), method: 'bkash', trxId: trxId.trim() });
  };

  const suspend = () => {
    // eslint-disable-next-line no-alert
    const reason = window.prompt('Why is this provider being suspended?');
    if (reason && reason.trim().length >= 5) onAction('suspend', p, reason.trim());
  };

  return (
    <Card className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-black text-gray-900 truncate">{p.name}</h3>
            <Badge tone={STATUS_TONE[p.status] || 'neutral'}>{p.status.replace(/_/g, ' ')}</Badge>
            {v.tier === 'full' && v.status === 'verified' ? (
              <Badge tone="success"><ShieldCheck size={11} /> Verified</Badge>
            ) : (
              <Badge tone="neutral"><ShieldAlert size={11} /> Unverified</Badge>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {p.categoryLabel?.en || p.category}
            {p.interaction ? <span className="text-gray-400"> · {p.interaction}</span> : null}
            <span className="text-gray-400"> · submitted {fmtDate(p.createdAt)}</span>
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={expand}>
          {open ? 'Hide' : 'Review'}
        </Button>
      </div>

      {/* Always-visible essentials */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-gray-600">
        <span className="flex items-center gap-1.5">
          <Phone size={12} className="text-gray-400" />
          {p.phone || '—'} <span className="text-gray-400">({p.ownerName})</span>
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin size={12} className="text-gray-400" />
          {[p.area, p.thana].filter(Boolean).join(', ') || p.addressText || '—'}
        </span>
        {p.lat != null ? (
          <a
            className="flex items-center gap-1.5 text-[#ba0036] font-bold hover:underline"
            href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={11} /> Open pin
          </a>
        ) : null}
      </div>

      {p.status === 'rejected' && v.rejectionReason ? (
        <p className="text-[11px] bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-red-800">
          <span className="font-black">Rejected:</span> {v.rejectionReason}
        </p>
      ) : null}

      {p.status === 'suspended' && p.suspendedReason ? (
        <p className="text-[11px] bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-red-800">
          <span className="font-black">Suspended:</span> {p.suspendedReason}
        </p>
      ) : null}

      {/* Rows above a published government ceiling. ADVISORY — a cap is a
          maximum, most flags are a forgotten price list, and nothing here
          says to suspend anybody. It is shown because a reviewer deciding
          whether to renew or suspend this provider should not have to go
          looking for it on another page. Full detail lives at
          /regulated-rates. */}
      {p.priceCompliance?.overCapRows?.length ? (
        <p className="text-[11px] bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-amber-900">
          <span className="font-black">
            {p.priceCompliance.overCapRows.length} price
            {p.priceCompliance.overCapRows.length === 1 ? '' : 's'} above the published cap:
          </span>{' '}
          {p.priceCompliance.overCapRows
            .map((r) => `${r.label?.bn || r.row} ${fmtMoney(r.price)} vs ${fmtMoney(r.cap)}`)
            .join(' · ')}
          <span className="text-amber-700">
            {' '}— prices last updated {fmtDate(p.pricesUpdatedAt)}.
          </span>
        </p>
      ) : null}

      {/* Expanded review panel */}
      {open ? (
        loadingDetail ? <LoadingState label="Loading documents" /> : (
          <div className="space-y-3 pt-2 border-t border-gray-100">
            {/* The comparison the review actually is */}
            <div>
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-wider mb-2">
                Documents
              </p>
              <div className="flex gap-2 flex-wrap">
                <DocThumb label="Shop / photo" url={v.photoUrl} />
                <DocThumb label="NID front" url={v.nidFrontUrl} />
                <DocThumb label="NID back" url={v.nidBackUrl} />
                <DocThumb label="Geo selfie" url={v.selfieUrl} />
              </div>
              {v.selfieLat != null ? (
                <a
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-[#ba0036] hover:underline mt-1.5"
                  href={`https://www.google.com/maps?q=${v.selfieLat},${v.selfieLng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin size={10} /> Selfie was taken here — compare with the pin
                </a>
              ) : null}
            </div>

            {detail?.owner ? (
              <div className="text-[11px] text-gray-600 bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
                <p>
                  {/* A merchant account is a LOGIN — there is no personal KYC
                      status on it, and the server never sends one (see the
                      note in admin.provider.controller.getProvider). The
                      identity being checked belongs to the BUSINESS, in the
                      Documents panel above; this line printed "KYC undefined"
                      while implying a second check that does not exist. */}
                  <span className="font-black text-gray-700">Owner account:</span>{' '}
                  {detail.owner.name} · member since {fmtDate(detail.owner.memberSince)} ·
                  {' '}phone {detail.owner.phoneVerified ? 'verified' : 'unverified'}
                </p>
                {detail.owner.isBanned ? (
                  <p className="text-red-700 font-black flex items-center gap-1">
                    <AlertCircle size={11} /> This account is banned — {detail.owner.banReason}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div>
              <p className="text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5">
                Submitted details
              </p>
              <FieldSummary fields={detail?.provider?.fields || p.fields} />
            </div>

            {detail?.provider?.registration?.paidAt ? (
              <p className="text-[11px] text-gray-600">
                <span className="font-black text-gray-700">Fee:</span>{' '}
                {fmtMoney(detail.provider.registration.amount)} via{' '}
                {detail.provider.registration.method || '—'}
                {detail.provider.registration.trxId ? ` · ${detail.provider.registration.trxId}` : ''}
                {' · expires '}{fmtDate(detail.provider.registration.expiresAt)}
              </p>
            ) : null}
          </div>
        )
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        {p.status === 'pending_review' ? (
          <>
            <Button
              size="sm" variant="primary" icon={CheckCircle2}
              loading={busy === 'approve-basic'}
              onClick={() => onAction('approve', p, 'basic')}
            >
              Approve — listed
            </Button>
            <Button
              size="sm" variant="secondary" icon={ShieldCheck}
              loading={busy === 'approve-full'}
              // Hidden until the panel is open: the button grants a badge, and
              // nobody should grant it without having looked at the documents.
              disabled={!open || canFull === false}
              title={
                !open ? 'Open Review first — check the documents before granting the badge'
                  : canFull === false ? 'Needs NID (both sides) + a geo-stamped selfie'
                    : 'Grants the green Verified badge'
              }
              onClick={() => onAction('approve', p, 'full')}
            >
              Approve + Verify
            </Button>
            <Button size="sm" variant="danger" icon={XCircle} onClick={reject}>
              Reject
            </Button>
          </>
        ) : null}

        {p.status === 'awaiting_payment' ? (
          <>
            <Button
              size="sm" variant="primary" icon={Wallet}
              loading={busy === 'payment'}
              onClick={confirmFee}
            >
              Confirm fee → go live
            </Button>
            <Button size="sm" variant="danger" icon={XCircle} onClick={reject}>
              Reject
            </Button>
          </>
        ) : null}

        {p.status === 'active' ? (
          <>
            <Button size="sm" variant="secondary" icon={Wallet} onClick={confirmFee}>
              Renew registration
            </Button>
            <Button size="sm" variant="danger" icon={Ban} onClick={suspend}>
              Suspend
            </Button>
          </>
        ) : null}

        {p.status === 'suspended' ? (
          <Button
            size="sm" variant="secondary" icon={RotateCcw}
            loading={busy === 'unsuspend'}
            onClick={() => onAction('unsuspend', p)}
          >
            Lift suspension
          </Button>
        ) : null}

        {p.status === 'expired' ? (
          <Button size="sm" variant="primary" icon={Wallet} onClick={confirmFee}>
            Renew registration
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

const ProviderVerification = () => {
  const [tab, setTab] = useState('pending_review');
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const [data, s] = await Promise.all([
        listAdminProviders({ status: tab, q, limit: 50 }),
        getProviderQueueStats().catch(() => ({})),
      ]);
      setItems(Array.isArray(data.providers) ? data.providers : []);
      setStats(s);
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to load providers.');
    } finally {
      setLoading(false);
    }
  }, [tab, q]);

  useEffect(() => { hydrate(); }, [hydrate]);

  const onAction = async (action, provider, arg) => {
    setBusyId(provider.id);
    setBusyAction(action === 'approve' ? `approve-${arg}` : action);
    try {
      if (action === 'approve') await approveProvider(provider.id, arg);
      if (action === 'reject') await rejectProvider(provider.id, arg);
      if (action === 'payment') await confirmProviderPayment(provider.id, arg);
      if (action === 'suspend') await suspendProvider(provider.id, arg);
      if (action === 'unsuspend') await unsuspendProvider(provider.id);
      await hydrate();
    } catch (err) {
      // Surfaced rather than swallowed: `insufficient_documents` is a
      // deliberate refusal the reviewer needs to read, not a glitch.
      // eslint-disable-next-line no-alert
      window.alert(err?.message || 'Action failed.');
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Service Providers"
        description="Verify identity once, confirm the fee once. Every order after that runs provider↔tenant."
        actions={(
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={hydrate}>
            Refresh
          </Button>
        )}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Awaiting review" value={stats.pendingReview ?? 0} icon={Clock} />
        <StatCard label="Awaiting payment" value={stats.awaitingPayment ?? 0} icon={Wallet} />
        <StatCard label="Active" value={stats.active ?? 0} icon={CheckCircle2} />
        <StatCard label="Expiring in 30d" value={stats.expiringSoon ?? 0} icon={AlertCircle} />
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <Tabs tabs={STATUS_TABS} value={tab} onChange={setTab} />
        <div className="md:ml-auto md:w-72">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Name, owner, phone or thana"
          />
        </div>
      </div>

      {loading ? <LoadingState label="Loading providers" />
        : error ? <ErrorState message={error} onRetry={hydrate} />
          : !items.length ? (
            <EmptyState
              icon={tab === 'pending_review' ? CheckCircle2 : Store}
              tone={tab === 'pending_review' ? 'success' : 'neutral'}
              title={tab === 'pending_review' ? 'Nothing waiting for review' : 'No providers here'}
              description={tab === 'pending_review'
                ? 'New registrations appear here as soon as a provider submits.'
                : 'Try another tab or clear the search.'}
            />
          ) : (
            <div className="space-y-3">
              {items.map((p) => (
                <ProviderCard
                  key={p.id}
                  p={p}
                  onAction={onAction}
                  busy={busyId === p.id ? busyAction : null}
                />
              ))}
            </div>
          )}
    </PageContainer>
  );
};

export default ProviderVerification;
