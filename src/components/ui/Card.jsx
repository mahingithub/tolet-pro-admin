import React from 'react';

/**
 * The console's one surface.
 *
 * Panels used to be written four different ways — `rounded-2xl border shadow-sm`,
 * `rounded-[2rem] shadow-[0_4px_20px_rgba(0,0,0,0.02)]`, a bordered card with no
 * shadow, and a shadow with no border — which is why two panels sitting side by
 * side could have visibly different corners. One radius, one border, one shadow.
 */

const PADDING = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export const Card = ({
  padding = 'md',
  hover = false,
  className = '',
  as: Tag = 'div',
  children,
  ...rest
}) => (
  <Tag
    className={[
      'bg-white rounded-2xl border border-gray-200 shadow-sm',
      PADDING[padding] ?? PADDING.md,
      hover ? 'hover:shadow-md hover:border-gray-300 transition-all' : '',
      className,
    ].filter(Boolean).join(' ')}
    {...rest}
  >
    {children}
  </Tag>
);

/**
 * Title row inside a Card. `action` is the right-aligned slot (a button, a
 * count, a legend) so every panel puts its controls in the same place.
 */
export const CardHeader = ({ title, description, action, className = '' }) => (
  <div className={`flex items-start justify-between gap-4 ${className}`}>
    <div className="min-w-0">
      <h3 className="text-sm font-black text-gray-900">{title}</h3>
      {description ? (
        <p className="text-[11px] font-bold text-gray-400 mt-1 leading-snug">{description}</p>
      ) : null}
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>
);

/**
 * A titled band between cards — icon chip + title + eyebrow. Used to break a
 * long page into labelled regions without another level of card nesting.
 */
export const SectionHeader = ({ icon: Icon, title, eyebrow, tone = 'brand', action }) => {
  const tones = {
    brand: 'bg-[#ba0036]/10 text-[#ba0036]',
    indigo: 'bg-indigo-50 text-indigo-500',
    emerald: 'bg-emerald-50 text-emerald-500',
    amber: 'bg-amber-50 text-amber-600',
    gray: 'bg-gray-100 text-gray-500',
  };
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        {Icon ? (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tones[tone] || tones.brand}`}>
            <Icon size={20} />
          </div>
        ) : null}
        <div>
          <h2 className="text-lg font-black text-gray-900">{title}</h2>
          {eyebrow ? (
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{eyebrow}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
};

export default Card;
