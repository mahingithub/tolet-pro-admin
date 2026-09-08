import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * The console's one button.
 * ──────────────────────────────────────────────────────────────────────────
 * Before this existed there were five hand-rolled "Refresh" buttons alone, no
 * two of which agreed on padding, weight, border or hover colour — and the
 * brand hover was written as both #90002a and #a10030. Every button in the
 * admin now comes from here, so a change to the primary colour is one edit.
 *
 * Variants map to intent, not to colour, so a page never has to decide what
 * shade a destructive action is:
 *   primary     — the one affirmative action on a screen
 *   secondary   — everything neutral (refresh, cancel, filters)
 *   danger      — destructive, but reversible or confirmed (ban, revoke)
 *   dangerSolid — destructive and loud; use sparingly
 *   ghost       — tertiary, sits inside another surface
 */

const VARIANTS = {
  primary: 'bg-[#ba0036] text-white border border-transparent hover:bg-[#90002a] shadow-sm',
  secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300',
  dangerSolid: 'bg-red-600 text-white border border-transparent hover:bg-red-700 shadow-sm',
  ghost: 'bg-transparent text-gray-500 border border-transparent hover:bg-gray-100 hover:text-gray-900',
};

const SIZES = {
  sm: 'px-3 py-2 text-[11px] gap-1.5 rounded-lg',
  md: 'px-4 py-2.5 text-xs gap-2 rounded-xl',
  lg: 'px-5 py-3 text-sm gap-2 rounded-xl',
};

const ICON_SIZE = { sm: 13, md: 14, lg: 16 };

const Button = ({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  // Spins the icon in place — for refresh, where swapping in a generic spinner
  // loses the "this is the reload control" affordance.
  iconClassName = '',
  // Replaces the icon with a spinner — for submits, where the action is over
  // once it resolves.
  loading = false,
  fullWidth = false,
  className = '',
  children,
  type = 'button',
  disabled,
  ...rest
}) => {
  const iconSize = ICON_SIZE[size] || ICON_SIZE.md;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center font-black tracking-wide transition-all',
        // No `pointer-events-none` on disabled: several screens explain WHY a
        // control is locked through the native `title` tooltip, and killing
        // pointer events would silently take that explanation away.
        'disabled:opacity-40 disabled:cursor-not-allowed',
        VARIANTS[variant] || VARIANTS.secondary,
        SIZES[size] || SIZES.md,
        fullWidth ? 'w-full' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin shrink-0" />
      ) : Icon ? (
        <Icon size={iconSize} className={`shrink-0 ${iconClassName}`} />
      ) : null}
      {children}
    </button>
  );
};

export default Button;
