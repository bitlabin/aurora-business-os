/** Normalization used for search and duplicate candidates (CRM-001 dedupe foundation). */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
