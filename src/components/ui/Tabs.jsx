import React from 'react';

/**
 * The console's one tab strip.
 *
 * There were five: brand-filled pills in a bordered tray, free-floating pills
 * with a drop shadow, grey-filled pills with a border, a white-on-grey
 * segmented control, and an underline row. Two of them appeared on the same
 * screen. This is the tray-and-pill version, which reads clearly at small sizes
 * and has somewhere to hang a count.
 *
 * @param {{
 *   tabs: Array<{ value: string, label: string, badge?: number, icon?: React.ComponentType }>,
 *   value: string,
 *   onChange: (value: string) => void,
 * }} props
 */
const Tabs = ({ tabs, value, onChange, className = '' }) => (
  <div
    role="tablist"
    className={`inline-flex gap-1 p-1 bg-white border border-gray-200 rounded-xl shadow-sm max-w-full overflow-x-auto hide-scrollbar ${className}`}
  >
    {tabs.map((tab) => {
      const active = value === tab.value;
      const Icon = tab.icon;
      return (
        <button
          key={tab.value || 'all'}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(tab.value)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black whitespace-nowrap transition-all ${
            active
              ? 'bg-[#ba0036] text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          {Icon ? <Icon size={14} /> : null}
          {tab.label}
          {/* `!= null` not truthiness: a genuine 0 should still render when a
              caller chooses to show empty queues. */}
          {tab.badge != null ? (
            <span
              className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md text-[10px] font-black ${
                active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tab.badge}
            </span>
          ) : null}
        </button>
      );
    })}
  </div>
);

export default Tabs;
