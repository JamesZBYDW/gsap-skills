// Small pure display helpers shared across server view-models.

/** Initials from a name: "Margaret Vance" -> "MV", "Juniper Trust" -> "JT". */
export function initials(name: string): string {
  const parts = (name || '').replace(/[^A-Za-z ]/g, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** First name for greetings. */
export function firstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] ?? '';
}

/** Masked account display: "Chase ••••6042". */
export function maskedAccount(bankName: string, last4: string): string {
  return `${bankName} ••••${last4}`;
}
