import React from 'react';

/**
 * One <select>. The role and filter dropdowns were styled four different ways;
 * this keeps their height in line with Button size="md" so a filter row lands
 * on a single baseline.
 *
 * @param {{ options: Array<{ value: string, label: string }> }} props
 */
const Select = ({ options = [], className = '', children, ...rest }) => (
  <select
    className={[
      'px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-black text-gray-700',
      'outline-none focus:border-[#ba0036]/40 transition-all cursor-pointer',
      'disabled:opacity-40 disabled:cursor-not-allowed',
      className,
    ].filter(Boolean).join(' ')}
    {...rest}
  >
    {children || options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
);

export default Select;
