import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * One search field. There were five, differing in height, background, focus
 * ring and whether they offered a clear button at all.
 *
 * Renders as a <form> when `onSubmit` is given so Enter submits (the
 * subscriptions table searches on submit, not per keystroke); otherwise a
 * plain wrapper for the filter-as-you-type screens.
 */
const SearchInput = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search…',
  className = '',
  autoFocus = false,
}) => {
  const Wrapper = onSubmit ? 'form' : 'div';
  const wrapperProps = onSubmit ? { onSubmit } : {};

  return (
    <Wrapper className={`relative flex-1 min-w-[200px] ${className}`} {...wrapperProps}>
      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-10 pr-9 text-sm font-bold text-gray-800 placeholder:text-gray-400 outline-none focus:bg-white focus:border-[#ba0036]/40 transition-all"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <X size={15} />
        </button>
      ) : null}
    </Wrapper>
  );
};

export default SearchInput;
