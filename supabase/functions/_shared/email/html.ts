export const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const escapeAttribute = escapeHtml;

export const isEmailAddress = (value: unknown) => (
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
);

export const normalizeSingleLine = (value: unknown, fallback = '') => (
  String(value ?? fallback).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
);

export const formatPhilippineDateTime = (value: unknown, includeTime = true) => {
  if (!value) return 'Not available';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return normalizeSingleLine(value);

  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date);
};
