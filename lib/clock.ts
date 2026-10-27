/** Jam sistem yang bisa diganti saat seeding data demo dan pengujian. */
let override: Date | null = null;

export function now(): Date {
  return override ? new Date(override) : new Date();
}

export function setClock(d: Date | null): void {
  override = d;
}
