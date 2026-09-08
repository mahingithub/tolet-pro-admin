import React, { useCallback, useEffect, useState } from 'react';
import {
  Building2, Users, Wallet, UserRound, Home, BedDouble,
  ShieldCheck, RefreshCcw, Clock, Layers, Activity,
} from 'lucide-react';
import { getUsageStats } from '../services/adminService';
import {
  PageContainer, PageHeader, Card, SectionHeader, StatCard, Badge, Button,
  LoadingState, ErrorState,
} from '../components/ui';

/**
 * Usage Tracking — how many, never who.
 * ──────────────────────────────────────────────────────────────────────────
 * Answers two product questions before an update ships:
 *   1. How many landlords actually RUN the management system, and how much
 *      property is under it.
 *   2. How many people are on each Living wallet — share vs solo.
 *
 * The endpoint behind this page (GET /api/admin/usage) returns counts and
 * nothing else: no names, no phones, no ids. There is deliberately no row to
 * click through to, because there is no per-person data in the payload to
 * show. If a drilldown is ever needed it is a separate, separately justified
 * endpoint — not a widening of this one.
 */

// Counts stay readable at every scale: exact under 10k, then K/M.
const fmt = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 100_000) return `${(v / 1_000).toFixed(0)}K`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString('en-IN');
};

// Share of a total, guarding the 0-total case that would otherwise render NaN%.
const pct = (n, total) => {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.round((Number(n) || 0) * 100 / t);
};

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

/**
 * One rung of the adoption funnel. The bar is measured against the widest
 * rung (landlord accounts), so the narrowing is visible at a glance — that
 * drop-off is the actual finding on this page.
 */
const FunnelRow = ({ label, value, total, hint, tone }) => {
  const share = pct(value, total);
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
          className={`h-full rounded-full transition-all duration-500 ${tone || 'bg-[#ba0036]'}`}
          style={{ width: `${Math.max(share, value > 0 ? 2 : 0)}%` }}
        />
      </div>
      {hint ? <p className="text-[11px] font-bold text-gray-400 mt-1.5 leading-snug">{hint}</p> : null}
    </div>
  );
};

const UsageTracking = () => {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const hydrate = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    try {
      const data = await getUsageStats();
      setStats(data);
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to load usage stats.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { hydrate(); }, [hydrate]);

  if (loading) return <LoadingState label="Loading usage…" fullHeight />;

  if (error && !stats) {
    return (
      <PageContainer>
        <ErrorState
          title="Usage stats unavailable"
          description={error}
          onRetry={() => { setLoading(true); hydrate(); }}
        />
      </PageContainer>
    );
  }

  const mgmt = stats?.management || {};
  const living = stats?.living || {};
  const def = stats?.definitions || {};
  const windowDays = stats?.activeWindowDays ?? 30;
  const mix = mgmt.buildingMix || { flat: 0, room: 0, seat: 0 };
  const mixTotal = (mix.flat || 0) + (mix.room || 0) + (mix.seat || 0);

  // Share vs solo, as a proportion of the two-mode population. Reported off
  // the raw mode counts (not living.totalUsers) so the split reads as "of the
  // wallets in use" — people on both wallets are in both bars, by design.
  const modeTotal = (living.shareUsers || 0) + (living.soloUsers || 0);

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        title="Usage Tracking"
        description="How many landlords run the management system, how much property it keeps, and how many people are on each Living wallet."
        meta={(
          <>
            <Badge tone="success" icon={ShieldCheck}>Counts only — no personal data</Badge>
            {stats?.generatedAt ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-gray-400">
                <Clock size={11} /> as of {fmtTime(stats.generatedAt)}
              </span>
            ) : null}
          </>
        )}
        actions={(
          <Button
            icon={RefreshCcw}
            iconClassName={refreshing ? 'animate-spin' : ''}
            disabled={refreshing}
            onClick={() => hydrate({ silent: true })}
          >
            Refresh
          </Button>
        )}
      />

      {error ? (
        <p className="text-xs font-bold text-red-600" role="alert">{error}</p>
      ) : null}

      {/* ── Management system ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader
          icon={Building2}
          title="Management System"
          eyebrow="Landlord side · buildings, units, tenancies"
        />

        {/* Adoption funnel */}
        <Card padding="lg">
          <div className="flex items-baseline justify-between gap-4 mb-5">
            <h3 className="text-sm font-black text-gray-900">Who is actually running it</h3>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              % of landlord accounts
            </span>
          </div>
          <div className="space-y-5">
            <FunnelRow
              label="Landlord accounts"
              value={mgmt.landlordAccounts}
              total={mgmt.landlordAccounts}
              hint="Everyone holding the landlord role — the denominator below."
              tone="bg-gray-300"
            />
            <FunnelRow
              label="Set up a building"
              value={mgmt.landlordsWithBuilding}
              total={mgmt.landlordAccounts}
              hint={def.landlordsWithBuilding}
              tone="bg-indigo-400"
            />
            <FunnelRow
              label="Running occupied tenancies"
              value={mgmt.landlordsWithTenancy}
              total={mgmt.landlordAccounts}
              hint={def.landlordsWithTenancy}
              tone="bg-[#ba0036]"
            />
            <FunnelRow
              label={`Active in the last ${windowDays} days`}
              value={mgmt.landlordsActive}
              total={mgmt.landlordAccounts}
              hint={def.landlordsActive}
              tone="bg-emerald-500"
            />
          </div>
        </Card>

        {/* What the system is keeping */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <StatCard
            icon={Building2}
            tone="brand"
            label="Buildings tracked"
            value={fmt(mgmt.buildingsTracked)}
            hint={mgmt.buildingsArchived ? `${fmt(mgmt.buildingsArchived)} archived` : 'Active buildings on the books.'}
          />
          <StatCard
            icon={Layers}
            tone="indigo"
            label="Units tracked"
            value={fmt(mgmt.unitsTracked)}
            hint="Flats and rooms inside those buildings."
          />
          <StatCard
            icon={Home}
            tone="amber"
            label="Live tenancies"
            value={fmt(mgmt.liveTenancies)}
            hint={mgmt.unlinkedRecords
              ? `${def.liveTenancies} ${fmt(mgmt.unlinkedRecords)} older empty records excluded.`
              : def.liveTenancies}
          />
          <StatCard
            icon={BedDouble}
            tone="emerald"
            label="Seats occupied"
            value={fmt(mgmt.seatsOccupied)}
            hint={def.seatsOccupied}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Tenants on the books vs tenants on the app */}
          <Card padding="lg">
            <h3 className="text-sm font-black text-gray-900 mb-1">Tenants under management</h3>
            <p className="text-[11px] font-bold text-gray-400 mb-5">{def.tenantsTracked}</p>
            <div className="flex items-end gap-6">
              <div>
                <p className="text-4xl font-black text-gray-900 leading-none">{fmt(mgmt.tenantsTracked)}</p>
                <p className="text-xs font-bold text-gray-500 mt-2">occupants tracked</p>
              </div>
              <div className="pl-6 border-l border-gray-100">
                <p className="text-2xl font-black text-emerald-600 leading-none">{fmt(mgmt.tenantsOnApp)}</p>
                <p className="text-xs font-bold text-gray-500 mt-2">
                  on the app ({pct(mgmt.tenantsOnApp, mgmt.tenantsTracked)}%)
                </p>
              </div>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden mt-5">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${pct(mgmt.tenantsOnApp, mgmt.tenantsTracked)}%` }}
              />
            </div>
            <p className="text-[11px] font-bold text-gray-400 mt-2 leading-snug">
              The rest are records their landlord typed in — the gap is who is still to be invited.
            </p>
          </Card>

          {/* How the buildings are let */}
          <Card padding="lg">
            <h3 className="text-sm font-black text-gray-900 mb-1">How buildings are let</h3>
            <p className="text-[11px] font-bold text-gray-400 mb-5">
              Decides which booking flow the landlord ever sees.
            </p>
            {mixTotal === 0 ? (
              <p className="text-xs font-bold text-gray-400">No buildings yet.</p>
            ) : (
              <div className="space-y-4">
                {[
                  { key: 'flat', label: 'Whole flat', tone: 'bg-indigo-400' },
                  { key: 'room', label: 'Single room', tone: 'bg-[#ba0036]' },
                  { key: 'seat', label: 'Hostel seat', tone: 'bg-amber-500' },
                ].map((row) => (
                  <div key={row.key}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <p className="text-sm font-black text-gray-800">{row.label}</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-black text-gray-900">{fmt(mix[row.key])}</span>
                        <span className="text-[11px] font-black text-gray-400">{pct(mix[row.key], mixTotal)}%</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${row.tone}`}
                        style={{ width: `${pct(mix[row.key], mixTotal)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* ── Living: share vs solo ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader
          icon={Wallet}
          tone="indigo"
          title="Living — Share vs Solo"
          eyebrow="Tenant side · the two wallets"
        />

        <Card padding="lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Share mode */}
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-indigo-500" />
                <p className="text-xs font-black text-indigo-600 uppercase tracking-widest">Share mode</p>
              </div>
              <p className="text-5xl font-black text-gray-900 leading-none">{fmt(living.shareUsers)}</p>
              <p className="text-xs font-bold text-gray-500 mt-2">people in a shared wallet</p>
              <div className="flex flex-wrap gap-2 mt-4">
                <Badge tone="indigo" className="bg-white">{fmt(living.households)} households</Badge>
                <Badge tone="success" className="bg-white">{fmt(living.householdsActive)} active in {windowDays}d</Badge>
              </div>
            </div>

            {/* Solo mode */}
            <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-5">
              <div className="flex items-center gap-2 mb-3">
                <UserRound size={16} className="text-amber-600" />
                <p className="text-xs font-black text-amber-600 uppercase tracking-widest">Solo mode</p>
              </div>
              <p className="text-5xl font-black text-gray-900 leading-none">{fmt(living.soloUsers)}</p>
              <p className="text-xs font-bold text-gray-500 mt-2">people with a solo খাতা</p>
              <div className="flex flex-wrap gap-2 mt-4">
                <Badge tone="warning" className="bg-white">{fmt(living.soloWithEntries)} with live entries</Badge>
                <Badge tone="success" className="bg-white">{fmt(living.soloActive)} active in {windowDays}d</Badge>
              </div>
            </div>
          </div>

          {/* The split */}
          <div className="mt-6">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Split of wallets in use</p>
              <p className="text-[11px] font-black text-gray-400">
                {pct(living.shareUsers, modeTotal)}% share · {pct(living.soloUsers, modeTotal)}% solo
              </p>
            </div>
            {modeTotal === 0 ? (
              <p className="text-xs font-bold text-gray-400">Nobody on Living yet.</p>
            ) : (
              <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-indigo-400 transition-all duration-500"
                  style={{ width: `${pct(living.shareUsers, modeTotal)}%` }}
                />
                <div
                  className="h-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${pct(living.soloUsers, modeTotal)}%` }}
                />
              </div>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <StatCard
            icon={Activity}
            tone="brand"
            label="People on Living"
            value={fmt(living.totalUsers)}
            hint="Distinct people across both wallets — the overlap is counted once."
          />
          <StatCard
            icon={Layers}
            tone="indigo"
            label="Using both wallets"
            value={fmt(living.bothModes)}
            hint={def.bothModes}
          />
          <StatCard
            icon={Users}
            tone="emerald"
            label={`Active in the last ${windowDays} days`}
            value={fmt((living.householdsActive || 0) + (living.soloActive || 0))}
            hint="Households plus solo ledgers written to inside the window."
          />
        </div>
      </section>

      {/* Privacy footnote — the reason there is nothing to click here. */}
      <p className="text-[11px] font-bold text-gray-400 leading-relaxed border-t border-gray-200 pt-4">
        This page reports counts only. The endpoint behind it returns no names, phones or ids,
        so there is nothing to open — identifying who is on a feature is a separate decision,
        not a click away from a dashboard.
      </p>
    </PageContainer>
  );
};

export default UsageTracking;
