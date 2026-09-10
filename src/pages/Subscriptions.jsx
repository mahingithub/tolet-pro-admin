// Subscriptions.jsx
// ─────────────────────────────────────────────────────────────────────────────
// The subscription + marketing console. Two jobs:
//
//   1. Show who is on which plan and how they can be reached (app installed?
//      WhatsApp opted in?), filterable so an admin can isolate an audience —
//      e.g. "Free users who have the app installed" is the natural target for
//      an upgrade push.
//   2. Compose and dispatch a special offer to that audience across in-app,
//      push, SMS and WhatsApp.
//
// Two things the UI deliberately makes explicit, because getting them wrong
// costs money or a blocked WhatsApp sender:
//   • The blast targets the CURRENT FILTER, not the current page. The modal
//     states the resolved audience size before sending.
//   • Per-channel consent is shown per user, and the send result reports
//     "skipped (opted out)" separately from "failed" so a small delivered
//     count is never mistaken for a broken gateway.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, RefreshCw, Smartphone, MessageCircle, Bell,
  Check, X, Crown, Sparkles, Users, AlertTriangle,
  ChevronLeft, ChevronRight, Link2, MousePointerClick, Copy, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  listSubscriptions, sendSubscriptionOffer, listCampaignTargets, listCampaignLinks,
} from '../services/adminService';
import { useAuth } from '../context/AdminAuthContext.jsx';
import {
  PageContainer, PageHeader, Card, Tabs, Badge, Button, Select, SearchInput,
  StatCard,
} from '../components/ui';

const TIER_TABS = [
  { value: '', label: 'All plans' },
  { value: 'pro', label: 'Pro' },
  { value: 'plus', label: 'Plus' },
  { value: 'free', label: 'Free' },
];

const APP_FILTER_OPTIONS = [
  { value: '', label: 'App: any' },
  { value: 'true', label: 'App installed' },
  { value: 'false', label: 'Not installed' },
];

const WHATSAPP_FILTER_OPTIONS = [
  { value: '', label: 'WhatsApp: any' },
  { value: 'true', label: 'Opted in' },
  { value: 'false', label: 'Not opted in' },
];

const CHANNELS = [
  { key: 'inapp', label: 'In-App Pop-up', icon: Bell, hint: 'Notification row + live toast if the user is online. No consent gate.' },
  { key: 'push', label: 'Push', icon: Smartphone, hint: 'FCM + web-push. Skips users who turned marketing push off.' },
  { key: 'sms', label: 'SMS', icon: MessageCircle, hint: 'Costs money per message. Skips users with SMS alerts off.' },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, hint: 'Approved template only. Skips users who never opted in.' },
];

// The WhatsApp and SMS hints are only true for a particular server. "Approved
// template only" describes the Meta gateway; on the self-hosted OpenWA gateway
// the opposite is true — templates are the one thing it CANNOT send — so a
// fixed string sent admins looking for a template name that would have failed
// every recipient. The server reports what it can do; this renders that.
const channelHint = (channel, caps) => {
  if (channel.key === 'whatsapp') {
    const wa = caps?.whatsapp;
    if (!wa) return channel.hint;
    if (!wa.configured) return 'No WhatsApp gateway is configured on this server.';
    return wa.mode === 'text'
      ? `Plain text from your own number (${wa.provider}). Skips users who never opted in.`
      : 'Approved Meta template only. Skips users who never opted in.';
  }
  if (channel.key === 'sms' && caps?.sms && !caps.sms.configured) {
    return 'No SMS gateway is configured on this server (SMS_API_KEY is unset).';
  }
  return channel.hint;
};

// Plan → shared Badge tone.
const tierTone = (tier) => ({ pro: 'warning', plus: 'indigo' }[tier] || 'neutral');

const TierIcon = ({ tier }) => {
  if (tier === 'pro') return <Crown size={12} strokeWidth={2.5} />;
  if (tier === 'plus') return <Sparkles size={12} strokeWidth={2.5} />;
  return null;
};

// A yes/no cell. `title` explains WHY, since "No" has several causes
// (never installed vs. declined notifications) that matter to the admin.
const YesNo = ({ on, title }) => (
  <span title={title}>
    <Badge tone={on ? 'success' : 'neutral'} icon={on ? Check : X}>
      {on ? 'Yes' : 'No'}
    </Badge>
  </span>
);

// How a user is reachable, as a CATEGORY rather than a yes/no.
//
// This column used to be derived from push tokens alone, which answered a
// different question than the one it asked: a token only exists if the user
// accepted the notification prompt, so someone with the app installed who
// tapped "Don't allow" was listed as not installed — and excluded from every
// campaign aimed at app users. The server now also counts app launches
// (POST /api/app/opened), and reports which kind of client it saw.
const INSTALL_CATEGORY = {
  native: {
    label: 'Native app',
    tone: 'success',
    hint: 'The Android/iOS app has been opened on this account, or it registered a native push token.',
  },
  pwa: {
    label: 'Installed PWA',
    tone: 'indigo',
    hint: 'Added to the home screen or dock from the browser. Installed — but not the store build.',
  },
  web: {
    label: 'Browser only',
    tone: 'neutral',
    hint: 'Only ever seen in a browser tab. Reachable by web push at best, not by an app campaign.',
  },
  none: {
    label: 'Not seen',
    tone: 'neutral',
    hint: 'No app launch and no push token recorded. They may still have the app but have not opened it since this tracking shipped.',
  },
};

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

const InstallCell = ({ row }) => {
  const cat = INSTALL_CATEGORY[row.installState] || INSTALL_CATEGORY.none;
  const seen = row.lastAppOpenAt ? ` Last opened ${fmtDate(row.lastAppOpenAt)}.` : '';
  return (
    <span title={cat.hint + seen}>
      <Badge tone={cat.tone} icon={row.appInstalled ? Check : X}>{cat.label}</Badge>
    </span>
  );
};

export default function Subscriptions() {
  const { hasRole } = useAuth();
  const canSend = hasRole('super_admin');

  const PAGE_SIZE = 50;

  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  // What the SERVER can actually send with. The composer used to offer a Meta
  // template form unconditionally; on a deployment using the self-hosted OpenWA
  // gateway (which cannot render a Meta template) every WhatsApp blast was
  // accepted, dispatched, and skipped for every single recipient.
  const [caps, setCaps] = useState(null);
  const [total, setTotal] = useState(0);
  // Banned users appear in the table but are excluded from a blast, so this —
  // not `total` — is the number of people an offer will actually reach.
  const [reachable, setReachable] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters — these define the blast audience, not just the table view.
  const [tier, setTier] = useState('');
  const [installed, setInstalled] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  // Bumped after a successful send so the click panel picks up the new link
  // without a page reload.
  const [linkRefresh, setLinkRefresh] = useState(0);

  const filters = useMemo(
    () => ({ tier, installed, whatsapp, search }),
    [tier, installed, whatsapp, search],
  );

  // Monotonic request id. Filter changes fire overlapping requests and the
  // responses can land out of order, which previously left the table (and the
  // audience size handed to the blast modal) showing a stale filter's result.
  // Only the newest request is allowed to write state.
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const data = await listSubscriptions({ ...filters, page, limit: PAGE_SIZE });
      if (reqId !== reqIdRef.current) return;
      setRows(data.rows || []);
      setCounts(data.counts || {});
      setCaps(data.channels || null);
      setTotal(data.total || 0);

      // Clamp forward if the result set shrank underneath us (a Refresh after
      // users were deleted, say). Without this, `page` can sit past the end:
      // the table renders empty AND the pager hides itself because totalPages
      // has dropped to 1, leaving no way back except changing a filter.
      const maxPage = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
      if (page > maxPage) setPage(maxPage);
      // Fall back to `total` if an older backend omits `reachable`, so the
      // count degrades to the previous behaviour instead of showing 0.
      setReachable(typeof data.reachable === 'number' ? data.reachable : (data.total || 0));
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      toast.error(err.message || 'Failed to load subscriptions');
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  // Any filter change invalidates the current page — staying on page 4 of a
  // narrower result set would show an empty table. Resetting inside the setter
  // (rather than in a separate effect keyed on `filters`) keeps it to one fetch
  // per change: React batches both updates into a single render.
  const changeFilter = useCallback((setter, value) => {
    setPage(1);
    setter(value);
  }, []);

  const onSearch = (e) => {
    e.preventDefault();
    changeFilter(setSearch, searchInput.trim());
  };

  const filtersActive = Boolean(tier || installed || whatsapp || search);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const bannedInFilter = Math.max(0, total - reachable);

  return (
    <PageContainer width="wide" className="space-y-4">
      <PageHeader
        title="Subscriptions"
        description="Plans, reachability, and special-offer campaigns."
        actions={(
          <>
            <Button icon={RefreshCw} iconClassName={loading ? 'animate-spin' : ''} disabled={loading} onClick={load}>
              Refresh
            </Button>
            <Button
              variant="primary"
              icon={Send}
              disabled={!canSend || reachable === 0}
              title={
                !canSend
                  ? 'Only a super admin can send offers'
                  : reachable === 0
                    ? total > 0
                      ? 'Every user matching this filter is banned — banned accounts never receive offers'
                      : 'No users match the current filter'
                    : 'Compose a special offer'
              }
              onClick={() => setModalOpen(true)}
            >
              Send Offer
            </Button>
          </>
        )}
      />

      {/* ── Headline counts (whole user base, independent of filters) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard layout="compact" icon={Users} label="Total users" value={counts.users} />
        <StatCard layout="compact" icon={Crown} label="Pro" value={counts.pro} tone="amber" />
        <StatCard layout="compact" icon={Sparkles} label="Plus" value={counts.plus} tone="indigo" />
        <StatCard layout="compact" icon={Smartphone} label="App installed" value={counts.appInstalled} tone="emerald" />
        <StatCard layout="compact" icon={MessageCircle} label="WhatsApp opt-in" value={counts.whatsappOptIn} tone="emerald" />
      </div>

      {/* ── Filters ── */}
      <Card padding="sm">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs tabs={TIER_TABS} value={tier} onChange={(v) => changeFilter(setTier, v)} />

          <Select
            value={installed}
            onChange={(e) => changeFilter(setInstalled, e.target.value)}
            options={APP_FILTER_OPTIONS}
          />

          <Select
            value={whatsapp}
            onChange={(e) => changeFilter(setWhatsapp, e.target.value)}
            options={WHATSAPP_FILTER_OPTIONS}
          />

          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            onSubmit={onSearch}
            placeholder="Search name, phone, or email…"
          />

          {filtersActive && (
            <Button
              variant="ghost"
              onClick={() => {
                setPage(1);
                setTier(''); setInstalled(''); setWhatsapp('');
                setSearch(''); setSearchInput('');
              }}
            >
              Clear
            </Button>
          )}
        </div>

        <p className="text-[11px] font-bold text-gray-400 mt-3">
          {loading ? 'Loading…' : `${total} user${total === 1 ? '' : 's'} match this filter`}
          {!loading && filtersActive && ' — an offer sent now targets exactly this set.'}
          {!loading && bannedInFilter > 0 && (
            <span className="text-amber-600">
              {` ${bannedInFilter} banned account${bannedInFilter === 1 ? ' is' : 's are'} excluded, so an offer reaches ${reachable}.`}
            </span>
          )}
        </p>
      </Card>

      {/* ── Table ── */}
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Billing</th>
                <th className="px-4 py-3">App installed</th>
                <th className="px-4 py-3">WhatsApp</th>
                <th className="px-4 py-3">Push</th>
                <th className="px-4 py-3">SMS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-gray-400 font-black text-xs">
                        {r.avatar
                          ? <img src={r.avatar} alt="" className="w-full h-full object-cover" />
                          : (r.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-black text-gray-900 truncate max-w-[180px]">
                          {r.name}
                          {r.isBanned && (
                            <span className="ml-1.5 text-[9px] font-black text-red-600 uppercase">Banned</span>
                          )}
                        </p>
                        <p className="text-[11px] font-bold text-gray-400 truncate max-w-[180px]">{r.phone}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <Badge tone={tierTone(r.tier)}>
                      <TierIcon tier={r.tier} />
                      {r.tier}
                    </Badge>
                  </td>

                  {/* The raw billing row behind the derived tier — a 'free'
                      tier with a past_due status is a churn signal, and the
                      admin can only see that if both are shown. */}
                  <td className="px-4 py-3">
                    <p className="text-[11px] font-bold text-gray-500">{r.planId}</p>
                    {r.status && (
                      <p className="text-[10px] font-bold text-gray-400 capitalize">{r.status.replace('_', ' ')}</p>
                    )}
                  </td>

                  <td className="px-4 py-3"><InstallCell row={r} /></td>
                  <td className="px-4 py-3">
                    <YesNo
                      on={r.whatsappOptIn}
                      title={r.whatsappOptIn ? 'Opted in to WhatsApp marketing' : 'Has not opted in — WhatsApp offers are skipped'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <YesNo on={r.marketingPush} title={r.marketingPush ? 'Accepts marketing push' : 'Turned marketing push off'} />
                  </td>
                  <td className="px-4 py-3">
                    <YesNo on={r.smsAlerts} title={r.smsAlerts ? 'Accepts SMS alerts' : 'Turned SMS alerts off'} />
                  </td>
                </tr>
              ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <p className="text-sm font-bold text-gray-400">No users match this filter.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* The table pages; the blast does not. An offer always targets the whole
            filter, so paging is purely for reviewing the audience. Previously
            the request hardcoded limit:100 and never sent `page`, which made
            every user past the 100th unreachable in the UI. */}
        {total > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] font-bold text-gray-400">
              {/* Guarded on rows.length so an in-flight clamp can never render a
                  backwards range like "101–100 of 40". */}
              {rows.length > 0
                ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + rows.length} of ${total}`
                : `${total} match this filter`}
              {' — an offer still reaches all '}{reachable}{' reachable user(s).'}
            </p>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  icon={ChevronLeft}
                  aria-label="Previous page"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                />
                <span className="text-[11px] font-bold text-gray-500 px-1.5">
                  Page {page} of {totalPages}
                </span>
                <Button
                  size="sm"
                  icon={ChevronRight}
                  aria-label="Next page"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                />
              </div>
            )}
          </div>
        )}
      </Card>

      <CampaignLinkPanel refreshKey={linkRefresh} />

      {modalOpen && (
        <OfferModal
          audienceSize={reachable}
          filters={filters}
          caps={caps}
          onClose={() => setModalOpen(false)}
          onSent={() => setLinkRefresh((n) => n + 1)}
        />
      )}
    </PageContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaign links — did anyone actually tap?
// ─────────────────────────────────────────────────────────────────────────────
// SMS and WhatsApp report delivery at best and nothing after it, so the click on
// the short link is the only evidence a campaign did anything. Shown as a rate
// (clicks / audience) rather than a raw number, because "38 clicks" means
// nothing without knowing whether it went to 40 people or 4,000.
function CampaignLinkPanel({ refreshKey }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCampaignLinks(10)
      .then((res) => { if (!cancelled) setLinks(res.rows || []); })
      // Silent: this panel is supplementary, and a toast here would fire on
      // every page load for a deployment that has never sent a campaign.
      .catch(() => { if (!cancelled) setLinks([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (loading || links.length === 0) return null;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <MousePointerClick size={14} className="text-gray-400" />
        <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Campaign clicks</p>
      </div>
      <div className="divide-y divide-gray-100">
        {links.map((l) => {
          const rate = l.audienceSize > 0 ? Math.round((l.clicks / l.audienceSize) * 100) : null;
          return (
            <div key={l.code} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[13px] font-black text-gray-900 truncate max-w-[320px]">
                  {l.campaign || '(untitled campaign)'}
                </p>
                <p className="text-[11px] font-bold text-gray-400 truncate max-w-[420px]">
                  <span className="uppercase">{l.channel}</span>
                  {' → '}{l.targetPath}
                  {' · '}{fmtDate(l.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <p className="text-[13px] font-black text-gray-900">
                    {l.clicks}
                    {rate !== null && <span className="text-gray-400 font-bold"> / {l.audienceSize} ({rate}%)</span>}
                  </p>
                  <p className="text-[10px] font-bold text-gray-400">
                    {l.signedInClicks} signed in
                    {l.lastClickAt ? ` · last ${fmtDate(l.lastClickAt)}` : ''}
                  </p>
                </div>
                <CopyLink url={l.url} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Copy-to-clipboard that reports what happened. navigator.clipboard is
// unavailable on an insecure origin and can be blocked by permissions policy,
// so a silent failure here would leave the admin pasting whatever was in the
// clipboard before into a live campaign.
function CopyLink({ url }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error(`Could not copy — the link is ${url}`);
    }
  };
  return <Button size="sm" variant="ghost" icon={Copy} aria-label="Copy link" title={url} onClick={copy} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Offer composer
// ─────────────────────────────────────────────────────────────────────────────
function OfferModal({ audienceSize, filters, caps, onClose, onSent }) {
  const [channels, setChannels] = useState(['inapp']);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [smsText, setSmsText] = useState('');
  // Where a tap lands. Defaults to the plan page, which is what the server used
  // to hardcode — so an admin who ignores this section gets the old behaviour.
  const [target, setTarget] = useState('/subscription');
  const [customTarget, setCustomTarget] = useState('');
  const [targets, setTargets] = useState(null);
  const [waText, setWaText] = useState('');
  const [waTemplate, setWaTemplate] = useState('');
  const [waLang, setWaLang] = useState('en');
  const [waParams, setWaParams] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  // Which WhatsApp form to show. The server decides — it is a property of the
  // configured gateway, not a preference.
  const waMode = caps?.whatsapp?.mode || 'template';
  const waProvider = caps?.whatsapp?.provider || 'meta';
  const waMaxPerBlast = caps?.whatsapp?.maxPerBlast || 0;
  const waGapMs = caps?.whatsapp?.minGapMs || 0;

  useEffect(() => {
    let cancelled = false;
    listCampaignTargets()
      .then((t) => { if (!cancelled) setTargets(t); })
      // The picker degrades to the free-text field; the server validates either
      // way, so a failed preset fetch must not block composing.
      .catch(() => { if (!cancelled) setTargets({ routes: [], paramRoutes: [], tabs: {} }); });
    return () => { cancelled = true; };
  }, []);

  const toggle = (key) =>
    setChannels((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));

  const needsCopy = channels.some((c) => c !== 'whatsapp');
  const needsTitle = channels.includes('inapp') || channels.includes('push');
  const targetPath = (target === '__custom' ? customTarget : target).trim();
  // Who can actually open the destination. Resolved from the same list the
  // server validates against, so the warning below cannot drift from the guard
  // that produces the behaviour it warns about.
  const targetAccess = useMemo(() => {
    const bare = targetPath.split('?')[0];
    const hit = (targets?.routes || []).find((r) => r.path === bare);
    return hit ? hit.access : 'public';
  }, [targetPath, targets]);
  // A link only ships on the channels that have no tap target of their own.
  const linkedChannels = channels.filter((c) => c === 'sms' || c === 'whatsapp');

  // Mirrors the server's validation so the admin gets the reason inline
  // instead of a 400 after the fact.
  const problem =
    channels.length === 0 ? 'Pick at least one channel.'
    : needsTitle && !title.trim() ? 'A title is required for in-app and push.'
    : needsCopy && !body.trim() ? 'A message body is required.'
    : !targetPath ? 'Choose where the message opens.'
    : !targetPath.startsWith('/') ? 'The destination must be an in-app path like /subscription.'
    : channels.includes('whatsapp') && waMode === 'template' && !waTemplate.trim()
      ? 'WhatsApp needs an approved template name.'
    : channels.includes('whatsapp') && waMode === 'text' && !waText.trim() && !body.trim()
      ? 'WhatsApp needs message text.'
    : null;

  const submit = async () => {
    if (problem) return;
    setSending(true);
    try {
      const payload = {
        channels,
        title: title.trim(),
        body: body.trim(),
        smsText: smsText.trim(),
        targetPath,
        filters,
      };
      if (channels.includes('whatsapp')) {
        payload.whatsapp = waMode === 'text'
          ? { mode: 'text', body: (waText.trim() || body.trim()) }
          : {
              mode: 'template',
              template: waTemplate.trim(),
              languageCode: waLang.trim() || 'en',
              params: waParams.split('|').map((p) => p.trim()).filter(Boolean),
            };
      }
      const res = await sendSubscriptionOffer(payload);
      setResult(res);
      onSent?.();
      // `attempted` is how many users were processed, not how many were
      // reached — reporting it as a success made a fully undelivered blast
      // (unconfigured gateway, nobody opted in) look like it worked.
      const delivered = Object.values(res.sent || {}).some((s) => s.ok > 0);
      if (delivered) toast.success(`Offer dispatched to ${res.attempted} user(s)`);
      else toast.warning('Processed, but nothing was delivered — see the breakdown.');
    } catch (err) {
      toast.error(err.message || 'Failed to send offer');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
              <Send size={18} className="text-[#ba0036]" />
              Send Special Offer
            </h2>
            <p className="text-xs font-bold text-gray-400 mt-0.5">
              Reaching <span className="text-gray-900">{audienceSize}</span> user(s) matching the current filter.
            </p>
          </div>
          <Button variant="ghost" size="sm" icon={X} aria-label="Close" onClick={onClose} />
        </div>

        {result ? (
          <ResultPanel result={result} onClose={onClose} />
        ) : (
          <div className="p-6 space-y-5">
            {/* Channels */}
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Channels</label>
              <div className="grid sm:grid-cols-2 gap-2 mt-2">
                {CHANNELS.map((c) => {
                  const on = channels.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                        on ? 'border-[#ba0036] bg-[#ba0036]/5' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        on ? 'bg-[#ba0036] text-white' : 'bg-gray-100 text-gray-400'
                      }`}>
                        <c.icon size={15} strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[13px] font-black ${on ? 'text-[#ba0036]' : 'text-gray-700'}`}>{c.label}</p>
                        <p className="text-[10px] font-bold text-gray-400 leading-tight mt-0.5">{channelHint(c, caps)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Copy */}
            {needsTitle && (
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={160}
                  placeholder="🎉 Pro-তে ৫০% ছাড়!"
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gray-400 font-bold text-sm text-gray-800"
                />
              </div>
            )}

            {needsCopy && (
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Message body
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={600}
                  rows={3}
                  placeholder="আজই আপগ্রেড করুন এবং আনলিমিটেড লিস্টিং উপভোগ করুন।"
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gray-400 font-bold text-sm text-gray-800 resize-none"
                />
                <p className="text-[10px] font-bold text-gray-400 mt-1">
                  {'Use {{name}} and {{tier}} to personalise. '}{body.length}/600
                </p>
              </div>
            )}

            {/* ── Destination ──────────────────────────────────────────────
                Every channel needs one, but for different reasons. In-app and
                push carry it as a deep link the tap follows. SMS and WhatsApp
                have no tap target at all — the message IS the text — so the
                link is appended to the copy, and it is a SHORT link so it fits
                inside one billed SMS segment and its clicks can be counted. */}
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                Opens on tap
              </label>
              <Select
                className="mt-1.5 w-full"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                options={[
                  ...(targets?.routes || []).map((r) => ({ value: r.path, label: `${r.label} — ${r.path}` })),
                  { value: '__custom', label: 'Another page…' },
                ]}
              />

              {target === '__custom' && (
                <>
                  <input
                    value={customTarget}
                    onChange={(e) => setCustomTarget(e.target.value)}
                    placeholder="/property/665f1a2b3c4d5e6f"
                    className="w-full mt-2 px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gray-400 font-bold text-sm text-gray-800"
                  />
                  <p className="text-[10px] font-bold text-gray-400 mt-1 leading-snug">
                    An in-app path, not a full URL. Also allowed:{' '}
                    {(targets?.paramRoutes || []).map((p) => p.example).join(', ')}
                    {' — and '}?tab= on either dashboard.
                  </p>
                </>
              )}

              <p className="text-[10px] font-bold text-gray-400 mt-1.5 leading-snug">
                {linkedChannels.length > 0
                  ? `A short toletpro.rent/r/… link is added to the ${linkedChannels.join(' and ')} text, and its clicks are counted.`
                  : 'The notification opens this page in the app.'}
                {' '}Recipients who are signed out are sent to login first and land here afterwards.
              </p>

              {/* The failure this prevents is silent. A signed-in user without
                  the required role is not shown an error — RequireAuth just
                  redirects them to their own dashboard, so the campaign appears
                  to have worked while landing half the audience nowhere near
                  the offer. */}
              {targetAccess === 'landlord' && (
                <p className="text-[10px] font-bold text-amber-600 mt-1 flex items-start gap-1 leading-snug">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  Landlord accounts only. A tenant who taps this is redirected to their own
                  dashboard instead — filter the audience, or pick a page both can open.
                </p>
              )}
              {targetAccess === 'tenant' && (
                <p className="text-[10px] font-bold text-amber-600 mt-1 flex items-start gap-1 leading-snug">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  Tenant accounts only. A landlord who taps this is redirected away from it.
                </p>
              )}
            </div>

            {channels.includes('sms') && (
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  SMS text <span className="text-gray-300">(optional — falls back to the body)</span>
                </label>
                <textarea
                  value={smsText}
                  onChange={(e) => setSmsText(e.target.value)}
                  maxLength={600}
                  rows={2}
                  placeholder="Shorter copy for SMS…"
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gray-400 font-bold text-sm text-gray-800 resize-none"
                />
                <p className="text-[10px] font-bold text-amber-600 mt-1 flex items-start gap-1">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  SMS is billed per message and cannot be recalled once sent.
                </p>
              </div>
            )}

            {/* ── WhatsApp ────────────────────────────────────────────────
                Two different forms, and the SERVER picks which one — it is a
                property of the configured gateway, not a preference:

                  • openwa / twilio → free TEXT from our own number. There are
                    no approved templates to name (only a template's NAME ever
                    reaches us), which is why every WhatsApp blast on this
                    provider used to be silently skipped for every recipient.
                  • meta            → an approved TEMPLATE, because Meta rejects
                    free-form marketing outside the 24-hour service window. */}
            {channels.includes('whatsapp') && waMode === 'text' && (
              <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 space-y-3">
                <p className="text-[11px] font-bold text-emerald-800 leading-snug">
                  Sent as plain text from your own WhatsApp number (provider:{' '}
                  <span className="uppercase">{waProvider}</span>) to people who opted in.
                </p>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    WhatsApp text <span className="text-gray-300">(optional — falls back to the body)</span>
                  </label>
                  <textarea
                    value={waText}
                    onChange={(e) => setWaText(e.target.value)}
                    maxLength={900}
                    rows={3}
                    placeholder="প্রিয় {{name}}, Pro-তে এখন ৫০% ছাড়…"
                    className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gray-400 font-bold text-sm text-gray-800 resize-none"
                  />
                </div>
                {/* The throttle is a per-message gap, so a WhatsApp blast is
                    serial and its wall-clock cost is worth stating BEFORE the
                    admin presses send — an apparent hang is otherwise indis-
                    tinguishable from a broken gateway. */}
                <p className="text-[10px] font-bold text-amber-700 flex items-start gap-1 leading-snug">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  <span>
                    Messages are spaced ~{Math.round(waGapMs / 1000)}s apart so the number is not
                    flagged as a bot, so this takes roughly{' '}
                    <span className="text-amber-900">
                      {Math.ceil((Math.min(audienceSize, waMaxPerBlast || audienceSize) * waGapMs) / 60000)} min
                    </span>
                    {audienceSize > waMaxPerBlast && waMaxPerBlast > 0 && (
                      <> — and only the first {waMaxPerBlast} get WhatsApp. Narrow the filter and send
                      the rest separately; the other channels still reach everyone.</>
                    )}
                  </span>
                </p>
              </div>
            )}

            {channels.includes('whatsapp') && waMode === 'template' && (
              <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 space-y-3">
                <p className="text-[11px] font-bold text-emerald-800 leading-snug">
                  WhatsApp rejects free-form marketing text, so this sends a template you have
                  already had approved in Meta Business Manager.
                </p>
                <div className="grid sm:grid-cols-[1fr_100px] gap-2">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Template name</label>
                    <input
                      value={waTemplate}
                      onChange={(e) => setWaTemplate(e.target.value)}
                      placeholder="special_offer_pro"
                      className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gray-400 font-bold text-sm text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Lang</label>
                    <input
                      value={waLang}
                      onChange={(e) => setWaLang(e.target.value)}
                      placeholder="en"
                      className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gray-400 font-bold text-sm text-gray-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    Body variables <span className="text-gray-300">(pipe-separated, in order)</span>
                  </label>
                  <input
                    value={waParams}
                    onChange={(e) => setWaParams(e.target.value)}
                    placeholder="{{name}} | 50%"
                    className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gray-400 font-bold text-sm text-gray-800"
                  />
                </div>
                {/* A template's approved body cannot carry our short link, so
                    the destination only applies to the other channels here. */}
                <p className="text-[10px] font-bold text-gray-500 leading-snug">
                  The chosen destination does not apply to a Meta template — its wording is fixed on
                  Meta&apos;s side. Put the link in the template&apos;s own button when you get it approved.
                </p>
              </div>
            )}

            {problem && (
              <p className="text-[11px] font-bold text-amber-600 flex items-center gap-1.5">
                <AlertTriangle size={12} /> {problem}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button size="lg" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                size="lg"
                variant="primary"
                icon={Send}
                loading={sending}
                disabled={!!problem}
                onClick={submit}
              >
                {sending ? 'Sending…' : `Send to ${audienceSize}`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Human-readable causes for the skipped/failed buckets. The backend reports raw
// reason codes so it stays UI-agnostic; the mapping lives here.
const REASON_LABEL = {
  opted_out: 'opted out of this channel',
  not_opted_in: 'never opted in',
  no_phone: 'no phone number on file',
  no_device: 'no registered device',
  not_configured: 'channel not configured on the server',
  blast_cap: 'past this blast’s WhatsApp limit — send the rest separately',
  rate_limited: 'held back by the WhatsApp send throttle',
  template_unsupported: 'this gateway cannot send a Meta template',
  invalid_recipient: 'invalid phone number',
  push_rejected: 'rejected by the push gateway',
  push_error: 'push service error',
  push_failed: 'push transport error',
  emit_failed: 'could not be saved',
  whatsapp_failed: 'rejected by WhatsApp',
  sms_rejected: 'rejected by the SMS gateway (check balance and sender ID)',
  sms_failed: 'SMS send failed',
};

const describeReasons = (reasons = {}) =>
  Object.entries(reasons)
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `${n} ${REASON_LABEL[code] || code}`)
    .join(', ');

// Per-channel delivery breakdown. "Skipped" is kept visually distinct from
// "failed" — the first is consent working as intended, the second is a
// gateway problem worth investigating.
function ResultPanel({ result, onClose }) {
  const entries = Object.entries(result.sent || {});
  // A channel whose gateway is unset reports every recipient as skipped, which
  // otherwise reads as "they all opted out". Call it out explicitly.
  const misconfigured = entries.filter(([, s]) => s.configError).map(([ch]) => ch);
  const deliveredAny = entries.some(([, s]) => s.ok > 0);

  return (
    <div className="p-6 space-y-4">
      <div className="text-center py-2">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-2 ${
            deliveredAny ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
          }`}
        >
          {deliveredAny ? <Check size={24} strokeWidth={3} /> : <AlertTriangle size={22} strokeWidth={2.5} />}
        </div>
        <p className="text-sm font-black text-gray-900">
          {deliveredAny
            ? `Dispatched to ${result.attempted} user(s)`
            : `Processed ${result.attempted} user(s) — nothing was delivered`}
        </p>
      </div>

      {misconfigured.length > 0 && (
        <p className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>
            Server-side channel problem:{' '}
            <span className="capitalize">{misconfigured.join(', ')}</span>. These recipients were
            not reached because of a missing credential or a rejected gateway account (check the
            reason under each channel), not because they opted out — re-send once it is resolved.
          </span>
        </p>
      )}

      {result.capped && (
        <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          The audience exceeded the {result.maxRecipients}-recipient safety cap, so only the first{' '}
          {result.maxRecipients} were sent. Narrow the filter and send again to reach the rest.
        </p>
      )}

      {result.whatsappOverflow > 0 && (
        <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-1.5">
          <Clock size={13} className="mt-0.5 shrink-0" />
          WhatsApp is throttled to protect the sending number, so it went to the first{' '}
          {result.whatsappMaxPerBlast}. {result.whatsappOverflow} more still received the other
          channels — narrow the filter and send WhatsApp again to reach them.
        </p>
      )}

      {/* The exact links recipients received. Worth showing: it is the one part
          of the message an admin cannot check by looking at their own phone,
          and a wrong destination is only fixable before the next send. */}
      {result.targetPath && (
        <div className="p-3 rounded-xl border border-gray-100 bg-gray-50/60 space-y-1.5">
          <p className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5">
            <Link2 size={12} /> Opens <span className="text-gray-900">{result.targetPath}</span>
          </p>
          {Object.entries(result.links || {}).map(([ch, url]) => (
            <div key={ch} className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-gray-400 truncate">
                <span className="uppercase">{ch}</span>: {url}
              </p>
              <CopyLink url={url} />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {entries.map(([channel, s]) => {
          const why = describeReasons(s.reasons);
          return (
            <div key={channel} className="p-3 rounded-xl border border-gray-100 bg-gray-50/60">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-black text-gray-700 capitalize">{channel}</p>
                <div className="flex items-center gap-3 text-[11px] font-bold">
                  <span className={s.ok ? 'text-emerald-600' : 'text-gray-300'}>{s.ok} sent</span>
                  <span className="text-gray-400">{s.skipped} skipped</span>
                  <span className={s.failed ? 'text-red-600' : 'text-gray-300'}>{s.failed} failed</span>
                </div>
              </div>
              {/* The aggregate counts alone can't distinguish consent from a
                  broken gateway, which is the whole question an admin has when
                  a blast under-delivers. */}
              {why && (
                <p className="text-[10px] font-bold text-gray-400 mt-1.5 leading-snug">{why}</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] font-bold text-gray-400 leading-snug">
        &quot;Skipped&quot; usually means the user opted out of that channel, has no phone number on
        file, or has no registered device — expected, not an error. &quot;Failed&quot; means the
        gateway rejected the message. The reason line under each channel says which.
      </p>

      <Button size="lg" variant="primary" fullWidth onClick={onClose}>Done</Button>
    </div>
  );
}
