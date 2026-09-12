import React from 'react';

/**
 * Standard empty-state card. Pass a Lucide icon component as `icon`.
 *
 * @param {{
 *   icon: React.ComponentType<{ size?: number, className?: string }>,
 *   title: string,
 *   description?: string,
 *   action?: React.ReactNode,
 *   tone?: 'neutral' | 'success'
 * }} props
 */
const EmptyState = ({ icon: Icon, title, description, action, tone = 'neutral' }) => (
  // Same surface as ui/Card — an empty panel should have the same corners and
  // border as the populated one it replaces, or the layout appears to shift
  // when data arrives.
  <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
    {/* `icon` reads as optional and was not guarded: rendering <Icon /> when
        none was passed threw "Element type is invalid" and took the WHOLE
        console down to a blank page — an empty list is the one state where
        that is most likely and least excusable. */}
    {Icon ? (
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
          tone === 'success' ? 'bg-green-50 text-green-500' : 'bg-gray-50 text-gray-400'
        }`}
      >
        <Icon size={30} />
      </div>
    ) : null}
    <h3 className="text-xl font-black text-gray-900">{title}</h3>
    {description && (
      <p className="text-gray-500 font-bold mt-2 text-sm max-w-md mx-auto">{description}</p>
    )}
    {action && <div className="mt-6">{action}</div>}
  </div>
);

export default EmptyState;
