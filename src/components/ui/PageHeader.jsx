import React from 'react';

/**
 * Page chrome — one title size, one subtitle style, one place for actions.
 *
 * Titles used to alternate between text-2xl and text-3xl, half of them with an
 * inline icon and half without, and the subtitle was text-gray-400 on some
 * pages and text-gray-500 on others. Navigating the console felt like moving
 * between two products. The icon is gone from the h1 on purpose: the sidebar
 * already says which page you are on, and the repetition just added noise.
 */

const WIDTHS = {
  // Most pages: cards and lists, comfortable to read.
  default: 'max-w-6xl',
  // Narrow forms (account settings) — a full-width form is hard to scan.
  narrow: 'max-w-2xl',
  // Wide data surfaces: the subscriptions table and the support inbox, both of
  // which lose columns at 6xl.
  wide: 'max-w-[1400px]',
};

export const PageContainer = ({ width = 'default', className = '', children }) => (
  <div className={`${WIDTHS[width] || WIDTHS.default} mx-auto pt-4 pb-12 ${className}`}>
    {children}
  </div>
);

/**
 * @param {{
 *   title: string,
 *   description?: React.ReactNode,
 *   actions?: React.ReactNode,   // right-aligned controls (refresh, primary CTA)
 *   meta?: React.ReactNode,      // chips/timestamps under the description
 * }} props
 */
const PageHeader = ({ title, description, actions, meta }) => (
  <div className="flex items-start justify-between gap-4 flex-wrap">
    <div className="min-w-0">
      <h1 className="text-3xl font-black text-gray-900 tracking-tight">{title}</h1>
      {description ? (
        <p className="text-sm font-bold text-gray-500 mt-2 max-w-2xl">{description}</p>
      ) : null}
      {meta ? <div className="flex items-center gap-3 mt-3 flex-wrap">{meta}</div> : null}
    </div>
    {/* `ml-auto` keeps the actions right-aligned even after they wrap onto
        their own row on a narrow viewport — without it they jump to the left
        edge and stop reading as page controls. */}
    {actions ? <div className="flex items-center gap-2 shrink-0 ml-auto">{actions}</div> : null}
  </div>
);

export default PageHeader;
