import React from 'react';

/**
 * A headline number. Three pages had grown their own near-identical version;
 * this is the one they now share.
 *
 * `hint` is the small line under the label — use it for the definition of the
 * number, not for decoration. A number on an admin dashboard that nobody can
 * define is a number nobody should act on.
 */

export const TONES = {
  gray: 'bg-gray-50 text-gray-500',
  brand: 'bg-[#ba0036]/10 text-[#ba0036]',
  indigo: 'bg-indigo-50 text-indigo-500',
  emerald: 'bg-emerald-50 text-emerald-500',
  amber: 'bg-amber-50 text-amber-600',
  blue: 'bg-blue-50 text-blue-500',
};

const StatCard = ({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'gray',
  badge,
  urgent = false,
  onClick,
  // 'stacked' (default) is the dashboard tile. 'compact' is the same card laid
  // out horizontally, for dense rows of five or more where a stacked tile would
  // push everything below the fold.
  layout = 'stacked',
}) => {
  const interactive = typeof onClick === 'function';

  if (layout === 'compact') {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 flex items-center gap-3">
        {Icon ? (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONES[tone] || TONES.gray}`}>
            <Icon size={18} strokeWidth={2.5} />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-xl font-black text-gray-900 leading-none">{value ?? '—'}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{label}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
      } : undefined}
      className={`bg-white p-5 rounded-2xl border shadow-sm transition-all ${
        urgent ? 'border-[#ba0036]/30' : 'border-gray-200'
      } ${interactive ? 'cursor-pointer hover:shadow-md hover:border-gray-300' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        {Icon ? (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONES[tone] || TONES.gray}`}>
            <Icon size={20} />
          </div>
        ) : <span />}
        {badge ? (
          <span
            className={`text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-widest border ${
              urgent
                ? 'bg-red-50 text-[#ba0036] border-red-100'
                : 'bg-gray-50 text-gray-500 border-gray-100'
            }`}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="text-2xl font-black text-gray-900 mb-1">{value}</h3>
      <p className="text-xs font-bold text-gray-500">{label}</p>
      {hint ? <p className="text-[11px] font-bold text-gray-400 mt-2 leading-snug">{hint}</p> : null}
    </div>
  );
};

export default StatCard;
