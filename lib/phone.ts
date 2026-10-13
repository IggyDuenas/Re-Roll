/** Normalize user input to E.164. 10 digits (or 11 starting with 1) are assumed to be US/Canada. */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw || raw.length > 32) return null;
  if (/[^\d\s().+-]/.test(raw)) return null;
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  let e164: string;
  if (hasPlus) e164 = `+${digits}`;
  else if (digits.length === 10) e164 = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith('1')) e164 = `+${digits}`;
  else return null;
  // E.164: + country code (no leading 0) + up to 14 more digits; NANP numbers get a stricter check.
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  if (e164.startsWith('+1') && !/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(e164)) return null;
  return e164;
}

export function maskPhone(e164: string): string {
  return e164.length > 4 ? `${'•'.repeat(Math.max(e164.length - 4, 0))}${e164.slice(-4)}` : e164;
}
