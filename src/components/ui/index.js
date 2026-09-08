/**
 * The admin console's design system.
 *
 * Import from here, not from the individual files — one import line per page
 * keeps the surface obvious and makes it cheap to see, in a diff, when a page
 * starts hand-rolling a control that already exists.
 */

export { default as Button } from './Button.jsx';
export { default as Card, CardHeader, SectionHeader } from './Card.jsx';
export { default as PageHeader, PageContainer } from './PageHeader.jsx';
export { default as Tabs } from './Tabs.jsx';
export { default as StatCard } from './StatCard.jsx';
export { default as Badge } from './Badge.jsx';
export { default as SearchInput } from './SearchInput.jsx';
export { default as Select } from './Select.jsx';

// The pre-existing state components live under common/ and are re-exported so
// a page needs a single import for its whole UI vocabulary.
export { default as LoadingState } from '../common/LoadingState.jsx';
export { default as EmptyState } from '../common/EmptyState.jsx';
export { default as ErrorState } from '../common/ErrorState.jsx';
