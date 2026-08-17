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
  CreditCard, Send, Search, RefreshCw, Smartphone, MessageCircle, Bell,
  Check, X, Crown, Sparkles, Users, AlertTriangle, Loader2,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { listSubscriptions, sendSubscriptionOffer } from '../services/adminService';
import { useAuth } from '../context/AdminAuthContext.jsx';

const TIER_TABS = [
  { key: '', label: 'All plans' },
  { key: 'pro', label: 'Pro' },
  { key: 'plus', label: 'Plus' },
  { key: 'free', label: 'Free' },
];

const CHANNELS = [
  { key: 'inapp', label: 'In-App Pop-up', icon: Bell, hint: 'Notification row + live toast if the user is online. No consent gate.' },
  { key: 'push', label: 'Push', icon: Smartphone, hint: 'FCM + web-push. Skips users who turned marketing push off.' },
  { key: 'sms', label: 'SMS', icon: MessageCircle, hint: 'Costs money per message. Skips users with SMS alerts off.' },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, hint: 'Approved template only. Skips users who never opted in.' },
];

const tierBadge = (tier) => ({
  pro: 'bg-amber-100 text-amber-700',
  plus: 'bg-indigo-100 text-indigo-700',
}[tier] || 'bg-gray-100 text-gray-500');

const TierIcon = ({ tier }) => {
  if (tier === 'pro') return <Crown size={12} strokeWidth={2.5} />;
  if (tier === 'plus') return <Sparkles size={12} strokeWidth={2.5} />;
  return null;
};

// A yes/no cell. `title` explains WHY, since "No" has several causes
// (never installed vs. declined notifications) that matter to the admin.
const YesNo = ({ on, title }) => (
  <span
    title={title}
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
      on ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'
    }`}
  >
    {on ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
    {on ? 'Yes' : 'No'}
  </span>
);

const StatCard = ({ icon: Icon, label, value, tone = 'gray' }) => {
  const tones = {
    gray: 'text-gray-900 bg-gray-100 text-gray-500',
    amber: 'text-amber-700 bg-amber-50 text-amber-600',
    indigo: 'text-indigo-700 bg-indigo-50 text-indigo-600',
    emerald: 'text-emerald-700 bg-emerald-50 text-emerald-600',
  };
  const [valueTone, iconBg, iconColor] = (tones[tone] || tones.gray).split(' ');
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg} ${iconColor}`}>
        <Icon size={18} strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <p className={`text-xl font-black leading-none ${valueTone}`}>{value ?? '—'}</p>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{label}</p>
      </div>
    </div>
  );
};

const installLabel = (row) => {
  if (row.installState === 'native') return 'Native app registered a push token';
  if (row.installState === 'web') return 'Browser/PWA push token only — no native app';
  return 'No push token registered (may still have the app without notifications enabled)';
};

export default function Subscriptions() {
  const { hasRole } = useAuth();
  const canSend = hasRole('super_admin');

  const PAGE_SIZE = 50;

  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
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
    <div className="max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <CreditCard size={22} className="text-[#ba0036]" />
            Subscriptions
          </h1>
          <p className="text-sm font-bold text-gray-400 mt-1">
            Plans, reachability, and special-offer campaigns.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => setModalOpen(true)}
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
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#ba0036] text-white text-sm font-bold hover:bg-[#a10030] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={15} />
            Send Offer
          </button>
        </div>
      </div>

      {/* ── Headline counts (whole user base, independent of filters) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard icon={Users} label="Total users" value={counts.users} />
        <StatCard icon={Crown} label="Pro" value={counts.pro} tone="amber" />
        <StatCard icon={Sparkles} label="Plus" value={counts.plus} tone="indigo" />
        <StatCard icon={Smartphone} label="App installed" value={counts.appInstalled} tone="emerald" />
        <StatCard icon={MessageCircle} label="WhatsApp opt-in" value={counts.whatsappOptIn} tone="emerald" />
      </div>

      {/* ── Filters ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-gray-50 p-1 rounded-xl">
            {TIER_TABS.map((t) => (
              <button
                key={t.key || 'all'}
                onClick={() => changeFilter(setTier, t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  tier === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <select
            value={installed}
            onChange={(e) => changeFilter(setInstalled, e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white outline-none focus:border-gray-400"
          >
            <option value="">App: any</option>
            <option value="true">App installed</option>
            <option value="false">Not installed</option>
          </select>

          <select
            value={whatsapp}
            onChange={(e) => changeFilter(setWhatsapp, e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white outline-none focus:border-gray-400"
          >
            <option value="">WhatsApp: any</option>
            <option value="true">Opted in</option>
            <option value="false">Not opted in</option>
          </select>

          <form onSubmit={onSearch} className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, phone, or email…"
              className="w-full bg-gray-50 py-2 pl-10 pr-3 rounded-xl border border-transparent focus:border-gray-200 focus:bg-white outline-none font-bold text-xs text-gray-800 transition-all"
            />
          </form>

          {filtersActive && (
            <button
              onClick={() => {
                setPage(1);
                setTier(''); setInstalled(''); setWhatsapp('');
                setSearch(''); setSearchInput('');
              }}
              className="text-xs font-bold text-gray-400 hover:text-gray-900 transition-colors"
            >
              Clear
            </button>
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
      </div>

      {/* ── Table ── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
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
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black uppercase ${tierBadge(r.tier)}`}>
                      <TierIcon tier={r.tier} />
                      {r.tier}
                    </span>
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

                  <td className="px-4 py-3"><YesNo on={r.appInstalled} title={installLabel(r)} /></td>
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
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  aria-label="Previous page"
                  className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-[11px] font-bold text-gray-500 px-1.5">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  aria-label="Next page"
                  className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <OfferModal
          audienceSize={reachable}
          filters={filters}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Offer composer
// ─────────────────────────────────────────────────────────────────────────────
function OfferModal({ audienceSize, filters, onClose }) {
  const [channels, setChannels] = useState(['inapp']);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [smsText, setSmsText] = useState('');
  const [waTemplate, setWaTemplate] = useState('');
  const [waLang, setWaLang] = useState('en');
  const [waParams, setWaParams] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const toggle = (key) =>
    setChannels((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));

  const needsCopy = channels.some((c) => c !== 'whatsapp');
  const needsTitle = channels.includes('inapp') || channels.includes('push');

  // Mirrors the server's validation so the admin gets the reason inline
  // instead of a 400 after the fact.
  const problem =
    channels.length === 0 ? 'Pick at least one channel.'
    : needsTitle && !title.trim() ? 'A title is required for in-app and push.'
    : needsCopy && !body.trim() ? 'A message body is required.'
    : channels.includes('whatsapp') && !waTemplate.trim() ? 'WhatsApp needs an approved template name.'
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
        filters,
      };
      if (channels.includes('whatsapp')) {
        payload.whatsapp = {
          template: waTemplate.trim(),
          languageCode: waLang.trim() || 'en',
          params: waParams.split('|').map((p) => p.trim()).filter(Boolean),
        };
      }
      const res = await sendSubscriptionOffer(payload);
      setResult(res);
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
          <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
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
                        <p className="text-[10px] font-bold text-gray-400 leading-tight mt-0.5">{c.hint}</p>
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

            {channels.includes('whatsapp') && (
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
              </div>
            )}

            {problem && (
              <p className="text-[11px] font-bold text-amber-600 flex items-center gap-1.5">
                <AlertTriangle size={12} /> {problem}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!!problem || sending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ba0036] text-white text-sm font-bold hover:bg-[#a10030] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {sending ? 'Sending…' : `Send to ${audienceSize}`}
              </button>
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

      <button
        onClick={onClose}
        className="w-full px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 transition-colors"
      >
        Done
      </button>
    </div>
  );
}
