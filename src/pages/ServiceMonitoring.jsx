import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Store, Users, Zap, RefreshCw, PhoneOff, TrendingUp, MapPin, Package,
  Eye, Repeat, Clock, AlertTriangle, Wallet, ShoppingBag, Layers, UserPlus,
} from 'lucide-react';

import { getMarketplaceStats } from '../services/adminService';
import {
  PageContainer, PageHeader, Card, CardHeader, SectionHeader, StatCard,
  Tabs, Badge, Button, LoadingState, ErrorState, EmptyState,
} from '../components/ui';

/**
 * Service Monitoring — কত প্রোভাইডার × কত ইউজার × কত সংযোগ.
 * ──────────────────────────────────────────────────────────────────────────
 * Admin verifies a provider once, confirms a fee once, and then gets out of
 * the way: every order after that runs provider↔tenant with nobody in the
 * middle. That is the decision that lets the marketplace grow past the size of
 * the support team — and it costs us the thing a middleman gets for free,
 * which is any idea whether the thing is working.
 *
 * This page is that idea, rebuilt from the ContactEvent ledger. It is read in
 * one order, top to bottom:
 *
 *   1. THE THREE NUMBERS — live shops, real people, actual connections.
 *   2. SILENT PROVIDERS — shops that paid and got nothing. The only figure on
 *      this page that should ever cause a phone call, so it is not buried in
 *      a table.
 *   3. Supply, demand, orders — each one's own band.
 *   4. Category and area tables, which is where recruitment decisions live.
 *
 * ── Every hint comes from the server ──────────────────────────────────────
 * The definitions under these numbers are `stats.definitions`, shipped by the
 * same file that ran the aggregation. Do not retype them here: a label that
 * drifts from the query behind it is how a dashboard quietly starts lying,
 * and this one is used to decide where to spend recruitment effort.
 *
 * ── Providers are named, users are not ────────────────────────────────────
 * There is no user identity in this payload to render, by design. A provider
 * is a public business listing that paid to be found; the tenants who
 * contacted it did not sign up for that.
 */

const WINDOW_TABS = [
  { value: 7, label: '৭ দিন' },
  { value: 30, label: '৩০ দিন' },
  { value: 90, label: '৯০ দিন' },
];

// Counts stay readable at every scale — same rule as UsageTracking.
const fmt = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 100_000) return `${(v / 1_000).toFixed(0)}K`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString('en-IN');
};

const money = (n) => `৳${Number(n || 0).toLocaleString('en-IN')}`;

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  });
};

/**
 * The connection trend, drawn as bars.
 *
 * Every day in the window is present — the server zero-fills — because a
 * sparse series draws a straight line from a quiet Friday to the next busy
 * day, which reads as growth that never happened.
 */
function Trend({ points }) {
  const peak = Math.max(1, ...points.map((p) => p.connections));
  return (
    <div>
      <div className="flex items-end gap-[2px] h-24">
        {points.map((p) => (
          <div
            key={p.dayKey}
            className="flex-1 min-w-0 bg-gray-100 rounded-sm relative group"
            style={{ height: '100%' }}
            title={`${p.dayKey} · ${p.connections} সংযোগ · ${p.people} জন · ${p.views} ভিউ`}
          >
            <div
              className="absolute bottom-0 inset-x-0 bg-[#ba0036] rounded-sm transition-all group-hover:bg-[#8d0029]"
              // A day with one connection still gets a visible sliver: a bar
              // rounded to zero pixels is indistinguishable from a dead day.
              style={{ height: `${p.connections ? Math.max(4, (p.connections / peak) * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[10px] font-bold text-gray-400">
        <span>{points[0]?.dayKey}</span>
        <span>peak {peak}/day</span>
        <span>{points.at(-1)?.dayKey}</span>
      </div>
    </div>
  );
}

/** One rung of a funnel, measured against the widest rung above it. */
function FunnelRow({ label, value, total, hint, tone = 'bg-[#ba0036]' }) {
  const share = total > 0 ? Math.round((value * 100) / total) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-1.5">
        <p className="text-sm font-black text-gray-800">{label}</p>
        <div className="flex items-baseline gap-2 shrink-0">
          <span className="text-lg font-black text-gray-900">{fmt(value)}</span>
          <span className="text-[11px] font-black text-gray-400">{share}%</span>
        </div>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tone}`}
          style={{ width: `${Math.max(share, value > 0 ? 2 : 0)}%` }}
        />
      </div>
      {hint ? <p className="text-[11px] font-bold text-gray-400 mt-1.5 leading-snug">{hint}</p> : null}
    </div>
  );
}

/** A small labelled figure, for the dense rows under each section header. */
function Figure({ label, value, hint, tone = 'text-gray-900' }) {
  return (
    <div className="min-w-0">
      <p className={`text-lg font-black leading-none ${tone}`}>{value}</p>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1.5">{label}</p>
      {hint ? <p className="text-[10px] font-bold text-gray-400 mt-1 leading-snug">{hint}</p> : null}
    </div>
  );
}

const ServiceMonitoring = () => {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // `refreshing` is set on EVERY fetch, not just the explicit Refresh button.
  // Switching the window flips `days` immediately — so the labels say "7 days"
  // — while `stats` still holds the previous payload, and for that moment the
  // page shows 30 days of connections under a 7-day heading with nothing to
  // say it is stale. On a dashboard people read as fact, that is not a
  // cosmetic flicker; the numbers are dimmed until the real ones land.
  const hydrate = useCallback(async () => {
    setRefreshing(true);
    try {
      setStats(await getMarketplaceStats(days));
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to load marketplace stats.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => { hydrate(); }, [hydrate]);

  const def = stats?.definitions || {};

  // Categories worth a row: anything live, plus anything with real activity.
  // The seven `planned` categories would otherwise pad the table with fifteen
  // rows of zeroes and bury the eight that are actually open.
  const categoryRows = useMemo(() => {
    const rows = (stats?.categories || []).filter(
      (c) => c.categoryStatus === 'live' || c.providers > 0 || c.connections > 0,
    );
    return rows.sort((a, b) => (b.connections - a.connections) || (b.active - a.active));
  }, [stats]);

  if (loading) return <LoadingState label="Loading marketplace…" fullHeight />;

  if (error && !stats) {
    return (
      <PageContainer>
        <ErrorState
          title="Marketplace stats unavailable"
          description={error}
          onRetry={() => { setLoading(true); hydrate(); }}
        />
      </PageContainer>
    );
  }

  const head = stats.headline || {};
  const supply = stats.supply || {};
  const demand = stats.demand || {};
  const liq = stats.liquidity || {};
  const orders = stats.orders || {};
  const pipeline = supply.byStatus || {};

  return (
    // `wide`, like Subscriptions and the support inbox: the category table has
    // nine columns and loses two of them at the default 6xl.
    <PageContainer width="wide" className="space-y-8">
      <PageHeader
        title="Service Marketplace"
        description="কত প্রোভাইডার · কত ইউজার · কত সংযোগ — rebuilt from the connection ledger, because admin is not in the middle of any of it."
        actions={(
          <div className="flex items-center gap-3">
            {stats.generatedAt ? (
              <span className="text-[11px] font-bold text-gray-400 hidden sm:inline">
                as of {fmtTime(stats.generatedAt)}
              </span>
            ) : null}
            <Button
              size="sm" variant="secondary" icon={RefreshCw}
              loading={refreshing}
              onClick={hydrate}
            >
              Refresh
            </Button>
          </div>
        )}
      />

      <Tabs
        tabs={WINDOW_TABS.map((t) => ({ ...t, value: String(t.value) }))}
        value={String(days)}
        onChange={(v) => setDays(Number(v))}
      />

      {/* Everything below is dimmed while a window change is in flight — the
          headings already say the new window, and the figures under them are
          still the old one's until the fetch lands. */}
      <div
        aria-busy={refreshing}
        className={`space-y-8 transition-opacity duration-200 ${
          refreshing ? 'opacity-40' : 'opacity-100'
        }`}
      >

      {/* ── 1. The three numbers ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={Store} tone="brand"
          label="Live providers"
          value={fmt(head.providers)}
          hint={def.providers}
        />
        <StatCard
          icon={Users} tone="indigo"
          label={`People reached in ${days} days`}
          value={fmt(head.people)}
          hint={def.people}
        />
        <StatCard
          icon={Zap} tone="emerald"
          label="Connections"
          value={fmt(head.connections)}
          hint={def.connections}
        />
      </div>

      {/* ── 2. The number that causes a phone call ───────────────────────── */}
      {liq.silentProviders > 0 ? (
        <Card className="border-[#ba0036]/30 bg-[#ba0036]/[0.03]">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#ba0036]/10 text-[#ba0036] flex items-center justify-center shrink-0">
              <PhoneOff size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-gray-900">
                {fmt(liq.silentProviders)} active {liq.silentProviders === 1 ? 'provider' : 'providers'}
                {' '}got nothing in {days} days
                <span className="text-gray-400 font-bold"> · {liq.silentRate}% of live listings</span>
              </p>
              <p className="text-[11px] font-bold text-gray-500 mt-1 leading-snug">
                {def.silentProviders} They paid a registration fee and the platform delivered
                no customer — this is the renewal risk, and ringing them is cheaper than
                re-recruiting the thana.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {/* ── 3a. Supply ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader
          icon={Store} title="Supply" eyebrow="the businesses on the platform"
          action={(
            <Badge tone="neutral">{fmt(supply.total)} registrations all time</Badge>
          )}
        />

        <Card className="space-y-5">
          <CardHeader
            title="The registration pipeline"
            description="Status is a state, not an event — these counts are all-time and do not move with the window."
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Figure label="Draft" value={fmt(pipeline.draft)} />
            <Figure label="Awaiting review" value={fmt(pipeline.pendingReview)} tone="text-amber-600" />
            <Figure label="Awaiting payment" value={fmt(pipeline.awaitingPayment)} tone="text-blue-600" />
            <Figure label="Active" value={fmt(pipeline.active)} tone="text-emerald-600" />
            <Figure label="Suspended" value={fmt(pipeline.suspended)} tone="text-[#ba0036]" />
            <Figure label="Expired" value={fmt(pipeline.expired)} />
          </div>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            layout="compact" icon={Package} tone="emerald"
            label="Verified badge" value={fmt(supply.verified)}
          />
          <StatCard
            layout="compact" icon={Clock} tone="amber"
            label="Stale prices" value={fmt(supply.stalePrices)}
          />
          <StatCard
            layout="compact" icon={AlertTriangle} tone="brand"
            label="Expiring in 30d" value={fmt(supply.expiringSoon)}
          />
          <StatCard
            layout="compact" icon={Wallet} tone="blue"
            label={`Fees in ${days}d`} value={money(supply.feeCollected)}
          />
        </div>

        <Card>
          <CardHeader
            title="Where registrations are lost"
            description="Two different drop-offs with two different fixes — one is the form, one is the queue."
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <Figure
              label="Idle logins" value={fmt(supply.merchantsIdle)}
              hint={def.merchantsIdle}
            />
            <Figure
              label="Abandoned drafts" value={fmt(supply.abandonedDrafts)}
              hint={def.abandonedDrafts}
            />
            <Figure label={`New in ${days}d`} value={fmt(supply.newInWindow)} />
            <Figure label={`Went live in ${days}d`} value={fmt(supply.activatedInWindow)} />
          </div>
        </Card>
      </section>

      {/* ── 3b. Demand ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader
          icon={Users} tone="indigo" title="Demand" eyebrow={`the last ${days} days`}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="space-y-5">
            <CardHeader
              title="Looked → reached out"
              description={def.viewToContactRate}
            />
            {/* Measured against `registeredViewers`, NOT `viewers`: the latter
                includes guests, who cannot be followed from a view to a call,
                and drawing the bar against it printed 44% on a card whose own
                rate said 91%. */}
            <FunnelRow
              label="Opened a card" value={demand.registeredViewers} total={demand.registeredViewers}
              tone="bg-indigo-400"
            />
            <FunnelRow
              label="Then actually contacted somebody"
              value={demand.viewersWhoContacted} total={demand.registeredViewers}
              hint={`${fmt(demand.views)} card opens in total, ${fmt(demand.viewers)} viewers including guests. Opening a card is a view, never a connection.`}
            />
          </Card>

          <Card>
            <CardHeader
              title="Who these people are"
              description="Counts only — there is no identity in this payload to click through to."
            />
            <div className="grid grid-cols-2 gap-5 mt-4">
              <Figure
                label="Total people" value={fmt(demand.people)}
                hint={def.people}
              />
              <Figure
                label="First time" value={fmt(demand.newPeople)}
                hint={def.newPeople}
              />
              <Figure
                label="Came back" value={fmt(demand.repeatPeople)}
                tone="text-emerald-600"
                hint={`${demand.repeatRate}% of everyone who reached out.`}
              />
              <Figure
                label="Guest contacts" value={fmt(demand.guestConnections)}
                hint="Logged out, so they cannot be deduped — each counts as one person."
              />
            </div>
          </Card>
        </div>

        <Card className="space-y-4">
          <CardHeader
            title="Connections per day"
            description={`Calls, requests and orders across the whole platform. ${fmt(demand.views)} card opens in the same period.`}
            action={(
              <div className="flex items-center gap-4 text-[11px] font-black text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Repeat size={12} /> {liq.connectionsPerActiveProvider} per live provider
                </span>
                <span className="flex items-center gap-1.5">
                  <Eye size={12} /> {fmt(demand.viewers)} viewers
                </span>
              </div>
            )}
          />
          {stats.trend?.length ? <Trend points={stats.trend} /> : null}
        </Card>
      </section>

      {/* ── 3c. Orders ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader
          icon={ShoppingBag} tone="amber" title="Orders" eyebrow="request and order tier only"
        />
        <Card>
          <CardHeader
            title="The order loop"
            description="Four of the live categories are contact-tier — গৃহকর্মী, ইলেকট্রিশিয়ান, প্লাম্বার, ইন্টারনেট — and never produce an order. A low count here is only bad news read against the category mix."
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-4">
            <Figure label="Placed" value={fmt(orders.placed)} />
            <Figure label="Still open" value={fmt(orders.open)} tone="text-blue-600" />
            <Figure label="Completed" value={fmt(orders.completed)} tone="text-emerald-600" />
            <Figure label="Declined" value={fmt(orders.declined)} />
            <Figure
              label="No answer" value={fmt(orders.expired)} tone="text-[#ba0036]"
              hint={def.expired}
            />
            <Figure label="Sales" value={money(orders.gmv)} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 pt-4 border-t border-gray-100 text-[11px] font-bold text-gray-500">
            <span>Completion <span className="text-gray-900 font-black">{orders.completionRate}%</span></span>
            <span>Silence <span className="text-gray-900 font-black">{orders.silenceRate}%</span></span>
            <span>
              Average answer{' '}
              <span className="text-gray-900 font-black">
                {orders.avgResponseMin != null ? `${orders.avgResponseMin} min` : '—'}
              </span>
              {' '}<span className="text-gray-400">({fmt(orders.answered)} answered)</span>
            </span>
          </div>
        </Card>
      </section>

      {/* ── 4a. Categories ───────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader icon={Layers} tone="gray" title="By category" eyebrow="supply against demand" />
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  <th className="px-5 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Live</th>
                  <th className="px-4 py-3 text-right">Verified</th>
                  <th className="px-4 py-3 text-right">Open</th>
                  <th className="px-4 py-3 text-right">Views</th>
                  <th className="px-4 py-3 text-right">Connections</th>
                  <th className="px-4 py-3 text-right">People</th>
                  <th className="px-4 py-3 text-right">Orders</th>
                  <th className="px-5 py-3 text-right">Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categoryRows.map((c) => (
                  <tr key={c.id} className="text-xs hover:bg-gray-50/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-gray-900">{c.label?.bn || c.id}</span>
                        {/* A live category with nobody in it is the finding on
                            this table — the row exists precisely so it shows. */}
                        {c.categoryStatus === 'live' && c.active === 0 ? (
                          <Badge tone="warning">no provider</Badge>
                        ) : null}
                        {c.categoryStatus !== 'live' ? (
                          <Badge tone="neutral">planned</Badge>
                        ) : null}
                      </div>
                      <p className="text-[10px] font-bold text-gray-400 mt-0.5">
                        {c.label?.en} · {c.interaction}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-gray-900 tabular-nums">{fmt(c.active)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500">{fmt(c.verified)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500">{fmt(c.openNow)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500">{fmt(c.views)}</td>
                    <td className="px-4 py-3 text-right font-black text-gray-900 tabular-nums">{fmt(c.connections)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500">{fmt(c.people)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500">{fmt(c.orders)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-500">{money(c.gmv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-[10px] font-bold text-gray-400 leading-snug">
            {def.perCategoryPeople}
          </p>
        </Card>
      </section>

      {/* ── 4b. Areas ────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader icon={MapPin} tone="indigo" title="By area" eyebrow="where to recruit next" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card padding="none" className="overflow-hidden">
            <CardHeader
              className="p-5"
              title="Thana"
              description={def.areas}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-y border-gray-200">
                  <tr className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    <th className="px-5 py-2.5">Thana</th>
                    <th className="px-4 py-2.5 text-right">Shops</th>
                    <th className="px-4 py-2.5 text-right">Live</th>
                    <th className="px-4 py-2.5 text-right">Connections</th>
                    <th className="px-5 py-2.5 text-right">People</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(stats.areas || []).map((a) => (
                    <tr key={a.thana} className="text-xs hover:bg-gray-50/60">
                      <td className="px-5 py-2.5 font-black text-gray-900">{a.thana}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{fmt(a.providers)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 font-black">{fmt(a.active)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 font-black">{fmt(a.connections)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-gray-500">{fmt(a.people)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stats.unlocatedConnections > 0 ? (
              <p className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-[10px] font-bold text-gray-400">
                {/* Reported so this table can be added up against the headline
                    instead of mysteriously falling short. */}
                + {fmt(stats.unlocatedConnections)} connections arrived with no location on them.
              </p>
            ) : null}
          </Card>

          <Card padding="none" className="overflow-hidden">
            <CardHeader
              className="p-5"
              title="Coverage holes"
              description={def.coverage}
            />
            {stats.coverage?.length ? (
              <div className="divide-y divide-gray-100 border-t border-gray-200">
                {stats.coverage.map((c) => (
                  <div key={`${c.thana}-${c.category}`} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-gray-900 truncate">
                        {c.thana} · {c.categoryLabel?.bn || c.category}
                      </p>
                      <p className="text-[10px] font-bold text-gray-400 mt-0.5">
                        নেই — no active provider left in this category here
                      </p>
                    </div>
                    <Badge tone="warning">{fmt(c.connections)} contacts</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-10 text-center">
                <p className="text-xs font-bold text-gray-400">
                  Every category people contacted still has somebody live in it.
                </p>
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* ── 5. Top providers ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader
          icon={TrendingUp} tone="emerald" title="Busiest providers"
          eyebrow={`most connections in ${days} days`}
        />
        {stats.topProviders?.length ? (
          <Card padding="none" className="overflow-hidden divide-y divide-gray-100">
            {stats.topProviders.map((p, i) => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50/60">
                <span className="w-6 text-xs font-black text-gray-300 tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-gray-900 truncate">{p.name}</p>
                  <p className="text-[10px] font-bold text-gray-400 mt-0.5">
                    {p.categoryLabel?.bn || p.category}
                    {p.thana ? ` · ${p.thana}` : ''}
                    {p.status !== 'active' ? ` · ${p.status.replace(/_/g, ' ')}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-5 shrink-0 text-right">
                  <div>
                    <p className="text-sm font-black text-gray-900 tabular-nums">{fmt(p.connections)}</p>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">conn</p>
                  </div>
                  <div>
                    <p className="text-sm font-black text-gray-900 tabular-nums">{fmt(p.people)}</p>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">people</p>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState
            icon={UserPlus}
            title="No connections yet"
            description="Nobody has called, requested or ordered from a provider in this window."
          />
        )}
      </section>

      {/* Rows pointing at a category id the registry no longer has. Surfaced
          rather than dropped — numbers that silently fail to add up are how a
          dashboard loses its reader. */}
      {stats.strayCategories?.length ? (
        <Card className="border-amber-200 bg-amber-50/50">
          <p className="text-xs font-black text-amber-900">
            Unknown category ids in the data: {stats.strayCategories.join(', ')}
          </p>
          <p className="text-[11px] font-bold text-amber-700 mt-1">
            These have providers or contacts attached but no definition in
            serviceCategories.js — they are excluded from the table above.
          </p>
        </Card>
      ) : null}
      </div>
    </PageContainer>
  );
};

export default ServiceMonitoring;
