export const STORAGE_KEY = 'influenceflow-crm-v1';

export const CREATOR_STATUSES = [
  { value: 'no_reply', label: 'No Reply' },
  { value: 'replied', label: 'Replied' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'signed', label: 'Signed' },
  { value: 'rejected', label: 'Rejected' },
];

export const BRAND_STATUSES = [
  { value: 'no_reply', label: 'No Reply' },
  { value: 'replied', label: 'Replied' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'signed', label: 'Signed' },
  { value: 'rejected', label: 'Rejected' },
];

export const CAMPAIGN_STATUSES = [
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const RELATIONSHIP_TYPES = [
  { value: 'external', label: 'External Creator' },
  { value: 'past_sponsor', label: 'Past Sponsor' },
  { value: 'existing_partner', label: 'Existing Partner' },
  { value: 'agency', label: 'My Agency Creator' },
];

export const PLATFORMS = [
  'YouTube',
  'TikTok',
  'Instagram',
  'Twitch',
  'Twitter/X',
  'LinkedIn',
  'Other',
];

export const NAV_ITEMS = [
  { section: 'Overview', items: [
    { route: '/', label: 'Dashboard', icon: '📊' },
    { route: '/quick-log', label: 'Quick Log Sponsorship', icon: '⚡' },
  ]},
  { section: 'Pipeline', items: [
    { route: '/creators-contacted', label: 'Creators Contacted', icon: '👤' },
    { route: '/brands-contacted', label: 'Brands Contacted', icon: '🏢' },
  ]},
  { section: 'Signed', items: [
    { route: '/signed-creators', label: 'Signed Creators', icon: '⭐' },
    { route: '/signed-brands', label: 'Signed Brands', icon: '🤝' },
  ]},
  { section: 'Deals', items: [
    { route: '/campaigns', label: 'Campaigns', icon: '🎯' },
  ]},
];

export function statusBadgeClass(status) {
  const map = {
    no_reply: 'badge-default',
    replied: 'badge-info',
    negotiating: 'badge-warning',
    signed: 'badge-success',
    active: 'badge-success',
    completed: 'badge-accent',
    cancelled: 'badge-danger',
    rejected: 'badge-danger',
  };
  return map[status] || 'badge-default';
}

export function labelFor(list, value) {
  return list.find((x) => x.value === value)?.label || value;
}

export function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatMoney(n) {
  if (n == null || n === '') return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n));
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function uid() {
  return crypto.randomUUID();
}

export function normalizeName(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
