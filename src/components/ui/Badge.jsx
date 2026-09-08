import React from 'react';

/**
 * Status pill. Every page had its own colour map for what is essentially the
 * same vocabulary (open / pending / verified / banned), so the same state could
 * be amber on one screen and yellow on the next.
 */

const TONES = {
  neutral: 'bg-gray-100 text-gray-600 border-gray-200',
  brand: 'bg-[#ba0036]/10 text-[#ba0036] border-[#ba0036]/20',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  warning: 'bg-amber-50 text-amber-700 border-amber-100',
  danger: 'bg-red-50 text-red-700 border-red-100',
  info: 'bg-blue-50 text-blue-700 border-blue-100',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
};

const SIZES = {
  sm: 'px-2 py-0.5 text-[9px] gap-1',
  md: 'px-2.5 py-1 text-[10px] gap-1.5',
};

const Badge = ({ tone = 'neutral', size = 'md', icon: Icon, className = '', children }) => (
  <span
    className={[
      'inline-flex items-center font-black uppercase tracking-widest rounded-lg border whitespace-nowrap',
      TONES[tone] || TONES.neutral,
      SIZES[size] || SIZES.md,
      className,
    ].filter(Boolean).join(' ')}
  >
    {Icon ? <Icon size={size === 'sm' ? 10 : 11} className="shrink-0" /> : null}
    {children}
  </span>
);

export default Badge;
