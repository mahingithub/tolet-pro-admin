import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, Building, DollarSign, Activity,
  ShieldAlert, ArrowUpRight, AlertCircle, Clock, Ban,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getOverviewStats } from '../services/adminService';

// Formatter for big counts. Small numbers are shown as-is; ≥100k → "K"; ≥1M → "M".
const fmtCount = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 100_000)   return `${(v / 1_000).toFixed(0)}K`;
  if (v >= 10_000)    return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString('en-IN');
};

const Overview = () => {
  const navigate = useNavigate();
  const [stats, setStats]   = useState(null);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const data = await getOverviewStats();
        if (cancelled) return;
        setStats(data);
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
      {
        id: 1,
        label: 'Total Users',
        value: stats ? fmtCount(s.totalUsers ?? 0) : '—',
        sub:   stats ? `${fmtCount(s.totalLandlords ?? 0)} landlords · ${fmtCount(s.totalTenants ?? 0)} tenants` : '',
        icon:  Users,
        color: 'text-blue-500',
        bg:    'bg-blue-50',
      },
      {
        id: 2,
        label: 'Active Properties',
        value: stats ? fmtCount(s.activeProperties ?? 0) : '—',
        sub:   stats ? `${fmtCount(s.totalProperties ?? 0)} total · ${fmtCount(s.rentedProperties ?? 0)} rented` : '',
        icon:  Building,
        color: 'text-indigo-500',
        bg:    'bg-indigo-50',
      },
      {
        id: 3,
        label: 'Monthly Revenue',
        value: stats ? (s.monthlyRevenueFormatted || '৳ 0') : '—',
        sub:   'Subscriptions + fees',
        icon:  DollarSign,
        color: 'text-emerald-500',
        bg:    'bg-emerald-50',
      },
      {
        id: 4,
        label: 'Pending Moderation',
        value: stats ? fmtCount(pendingMod) : '—',
        sub:   pendingMod > 0 ? 'Action needed' : 'All clear',
        icon:  ShieldAlert,
        color: 'text-[#ba0036]',
        bg:    'bg-[#ba0036]/10',
        urgent: pendingMod > 0,
      },
    ];
  }, [stats]);

  return (
    <div className="max-w-6xl mx-auto pt-4 pb-12 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">System Overview</h1>
        <p className="text-sm font-bold text-gray-500 mt-2">
          Welcome back, Admin. Here is what's happening across TO-LET PRO today.
        </p>
        {loading ? (
          <p className="text-xs font-bold text-gray-400 mt-2 flex items-center gap-1.5">
            <Clock size={11} /> Loading live stats…
          </p>
        ) : null}
        {error ? (
          <p className="text-xs font-bold text-red-600 mt-2 flex items-center gap-1.5" role="alert">
            <AlertCircle size={11} /> {error}
          </p>
        ) : null}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {statCards.map((stat) => (
          <div key={stat.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 group">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.bg}`}>
                <stat.icon size={20} className={stat.color} />
              </div>
              {stat.sub ? (
                <span className={`text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-widest ${stat.urgent ? 'bg-red-50 text-[#ba0036] border border-red-100' : 'bg-gray-50 text-gray-500 border border-gray-100'}`}>
                  {stat.sub}
                </span>
              ) : null}
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-1">{stat.value}</h3>
            <p className="text-xs font-bold text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue chart placeholder */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-900">Revenue Growth</h3>
              <p className="text-[11px] font-bold text-gray-400 mt-0.5 uppercase tracking-widest">Premium Subscriptions & Fees</p>
            </div>
            <button className="flex items-center gap-2 text-gray-600 hover:text-[#ba0036] hover:bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg text-xs font-black transition-all">
              Detailed Report <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="flex-1 w-full bg-gray-50 border border-dashed border-gray-200 rounded-xl flex items-center justify-center p-6 min-h-[200px]">
            <p className="text-xs font-bold text-gray-400 text-center max-w-sm">
              Revenue charting will activate once the subscription pipeline starts collecting payments.
            </p>
          </div>
        </div>

        {/* Action center */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#ba0036] to-[#d11147]"></div>
          <h3 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2 mt-2">
            <Activity size={18} className="text-[#ba0036]" /> Action Center
          </h3>
          <div className="space-y-3 flex-1">
            <div
              onClick={() => navigate('/users?tab=pending')}
              className="bg-gray-50 hover:bg-red-50 border border-gray-100 hover:border-red-100 p-4 rounded-xl cursor-pointer transition-colors group"
            >
              <div className="flex items-center gap-3 mb-1.5">
                <div className="w-7 h-7 bg-white rounded-lg border border-gray-200 flex items-center justify-center group-hover:border-red-200">
                  <AlertCircle size={14} className="text-amber-500" />
                </div>
                <h4 className="font-bold text-sm text-gray-800">
                  {stats ? `${fmtCount(stats.pendingKyc ?? 0)} pending tenant KYC` : 'Pending tenant KYC'}
                </h4>
              </div>
              <p className="text-[11px] text-gray-500 font-bold ml-10">Identity submissions awaiting your approval.</p>
            </div>

            <div
              onClick={() => navigate('/users?tab=pending-landlord')}
              className="bg-gray-50 hover:bg-red-50 border border-gray-100 hover:border-red-100 p-4 rounded-xl cursor-pointer transition-colors group"
            >
              <div className="flex items-center gap-3 mb-1.5">
                <div className="w-7 h-7 bg-white rounded-lg border border-gray-200 flex items-center justify-center group-hover:border-red-200">
                  <ShieldAlert size={14} className="text-indigo-500" />
                </div>
                <h4 className="font-bold text-sm text-gray-800">
                  {stats ? `${fmtCount(stats.pendingLandlordKyc ?? 0)} pending landlord KYC` : 'Pending landlord KYC'}
                </h4>
              </div>
              <p className="text-[11px] text-gray-500 font-bold ml-10">Address + utility bill submissions to review.</p>
            </div>

            <div
              onClick={() => navigate('/users?tab=all')}
              className="bg-gray-50 hover:bg-gray-100 border border-gray-100 p-4 rounded-xl cursor-pointer transition-colors group"
            >
              <div className="flex items-center gap-3 mb-1.5">
                <div className="w-7 h-7 bg-white rounded-lg border border-gray-200 flex items-center justify-center">
                  <Ban size={14} className="text-gray-400" />
                </div>
                <h4 className="font-bold text-sm text-gray-800">
                  {stats ? `${fmtCount(stats.bannedUsers ?? 0)} banned accounts` : 'Banned accounts'}
                </h4>
              </div>
              <p className="text-[11px] text-gray-500 font-bold ml-10">Refused all mutations until lifted.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Overview;
