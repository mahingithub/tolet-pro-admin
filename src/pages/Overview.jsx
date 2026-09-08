import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, Building, DollarSign, Activity,
  ShieldAlert, AlertCircle, Clock, Ban, Store,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getOverviewStats, getSellInterest } from '../services/adminService';
import {
  PageContainer, PageHeader, Card, SectionHeader, StatCard, Badge,
} from '../components/ui';

// Formatter for big counts. Small numbers are shown as-is; ≥100k → "K"; ≥1M → "M".
const fmtCount = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 100_000)   return `${(v / 1_000).toFixed(0)}K`;
  if (v >= 10_000)    return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString('en-IN');
};

// Short "12 Jul" style date for the recent-interest follow-up list.
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

/**
 * A queue shortcut in the Action Center.
 *
 * A real <button>, not a clickable <div> — these three were the only way to
 * reach the KYC queues from the dashboard and none of them could be tabbed to
 * or activated from the keyboard.
 */
const ActionRow = ({ icon: Icon, iconClass, title, description, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full text-left bg-gray-50 hover:bg-gray-100 border border-gray-100 hover:border-gray-200 p-4 rounded-xl transition-colors group focus:outline-none focus:ring-2 focus:ring-[#ba0036]/30"
  >
    <div className="flex items-center gap-3 mb-1.5">
      <div className="w-7 h-7 bg-white rounded-lg border border-gray-200 flex items-center justify-center shrink-0 group-hover:border-gray-300">
        <Icon size={14} className={iconClass} />
      </div>
      <h4 className="font-bold text-sm text-gray-800">{title}</h4>
    </div>
    <p className="text-[11px] text-gray-500 font-bold ml-10">{description}</p>
  </button>
);

const Overview = () => {
  const navigate = useNavigate();
  const [stats, setStats]   = useState(null);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(true);
  const [sellInterest, setSellInterest] = useState(null); // { stats, recent }

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        // Sell-interest is best-effort: a failure there must not blank the
        // whole overview, so it's caught independently.
        const [data, si] = await Promise.all([
          getOverviewStats(),
          getSellInterest().catch(() => null),
        ]);
        if (cancelled) return;
        setStats(data);
        setSellInterest(si);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load admin overview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    hydrate();
    const interval = setInterval(hydrate, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const statCards = useMemo(() => {
    const s = stats || {};
    const pendingMod = s.pendingModeration ?? 0;
    return [
      // The breakdowns go in `hint`, not `badge`: as uppercase chips they wrapped
      // to three cramped lines and pushed the number they describe out of line
      // with the other tiles.
      {
        id: 1,
        label: 'Total Users',
        value: stats ? fmtCount(s.totalUsers ?? 0) : '—',
        hint:  stats ? `${fmtCount(s.totalLandlords ?? 0)} landlords · ${fmtCount(s.totalTenants ?? 0)} tenants` : '',
        icon:  Users,
        tone:  'blue',
      },
      {
        id: 2,
        label: 'Active Properties',
        value: stats ? fmtCount(s.activeProperties ?? 0) : '—',
        hint:  stats ? `${fmtCount(s.totalProperties ?? 0)} total · ${fmtCount(s.rentedProperties ?? 0)} rented` : '',
        icon:  Building,
        tone:  'emerald',
      },
      {
        id: 3,
        label: 'Monthly Revenue',
        value: stats ? (s.monthlyRevenueFormatted || '৳ 0') : '—',
        hint:  'Subscriptions + fees',
        icon:  DollarSign,
        tone:  'indigo',
      },
      {
        id: 4,
        label: 'Pending Moderation',
        value: stats ? fmtCount(pendingMod) : '—',
        badge: pendingMod > 0 ? 'Action needed' : 'All clear',
        icon:  ShieldAlert,
        tone:  'brand',
        urgent: pendingMod > 0,
      },
    ];
  }, [stats]);

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        title="System Overview"
        description="Welcome back, Admin. Here is what's happening across TO-LET PRO today."
        meta={(
          <>
            {loading ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-400">
                <Clock size={11} /> Loading live stats…
              </span>
            ) : null}
            {error ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-600" role="alert">
                <AlertCircle size={11} /> {error}
              </span>
            ) : null}
          </>
        )}
      />

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {statCards.map((stat) => (
          <StatCard
            key={stat.id}
            icon={stat.icon}
            tone={stat.tone}
            label={stat.label}
            value={stat.value}
            hint={stat.hint}
            badge={stat.badge}
            urgent={stat.urgent}
          />
        ))}
      </div>

      {/* Interested in Selling — demand gauge (Coming Soon lead capture) */}
      {(() => {
        const si = sellInterest?.stats || {
          total: stats?.sellInterestTotal ?? 0,
          registered: stats?.sellInterestRegistered ?? 0,
          guests: stats?.sellInterestGuests ?? 0,
          last7d: 0,
        };
        const recent = sellInterest?.recent || [];
        return (
          <Card padding="lg">
            <SectionHeader
              icon={Store}
              title="Interested in Selling"
              eyebrow={'"Sell my property" · Coming Soon demand'}
              action={<Badge tone="warning">{fmtCount(si.last7d ?? 0)} this week</Badge>}
            />

            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 mt-5">
              {/* Headline count + breakdown */}
              <div>
                <p className="text-5xl font-black text-gray-900 leading-none">{fmtCount(si.total ?? 0)}</p>
                <p className="text-xs font-bold text-gray-500 mt-2">people interested</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Badge tone="info">{fmtCount(si.registered ?? 0)} registered</Badge>
                  <Badge>{fmtCount(si.guests ?? 0)} guest</Badge>
                </div>
              </div>

              {/* Recent follow-up list */}
              <div className="lg:border-l lg:border-gray-100 lg:pl-6">
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">Recent follow-ups</p>
                {recent.length === 0 ? (
                  <p className="text-xs font-bold text-gray-400">No interest recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {recent.slice(0, 8).map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{r.name || 'Guest'}</p>
                          <p className="text-[11px] font-bold text-gray-400 truncate">
                            {r.phone || (r.userId ? 'Registered user' : 'Anonymous')}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold text-gray-400 shrink-0">{fmtDate(r.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue chart placeholder */}
        <Card padding="lg" className="lg:col-span-2 flex flex-col">
          {/* The "Detailed Report" button that used to sit here had no handler —
              a control that looks live and does nothing is worse than no
              control, so it's gone until there's a report to open. */}
          <SectionHeader
            icon={DollarSign}
            tone="emerald"
            title="Revenue Growth"
            eyebrow="Premium subscriptions & fees"
          />
          <div className="flex-1 w-full bg-gray-50 border border-dashed border-gray-200 rounded-xl flex items-center justify-center p-6 min-h-[200px] mt-5">
            <p className="text-xs font-bold text-gray-400 text-center max-w-sm">
              Revenue charting will activate once the subscription pipeline starts collecting payments.
            </p>
          </div>
        </Card>

        {/* Action center */}
        <Card padding="lg" className="flex flex-col">
          <SectionHeader icon={Activity} title="Action Center" eyebrow="Needs a decision" />
          <div className="space-y-3 flex-1 mt-5">
            <ActionRow
              icon={AlertCircle}
              iconClass="text-amber-500"
              title={stats ? `${fmtCount(stats.pendingKyc ?? 0)} pending tenant KYC` : 'Pending tenant KYC'}
              description="Identity submissions awaiting your approval."
              onClick={() => navigate('/users?tab=pending')}
            />
            <ActionRow
              icon={ShieldAlert}
              iconClass="text-indigo-500"
              title={stats ? `${fmtCount(stats.pendingLandlordKyc ?? 0)} pending landlord KYC` : 'Pending landlord KYC'}
              description="Address + utility bill submissions to review."
              onClick={() => navigate('/users?tab=pending-landlord')}
            />
            <ActionRow
              icon={Ban}
              iconClass="text-gray-400"
              title={stats ? `${fmtCount(stats.bannedUsers ?? 0)} banned accounts` : 'Banned accounts'}
              description="Refused all mutations until lifted."
              onClick={() => navigate('/users?tab=all')}
            />
          </div>
        </Card>
      </div>
    </PageContainer>
  );
};

export default Overview;
