import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Jam sistem yang bisa diganti saat seeding data contoh dan pengujian.
 * Di dalam `runSimulation`, penggantian jam hanya berlaku untuk alur itu sendiri
 * (tidak memengaruhi request lain yang berjalan bersamaan di server).
 */
interface SimContext {
  clock: Date | null;
}

const als = new AsyncLocalStorage<SimContext>();
let globalOverride: Date | null = null;

export function now(): Date {
  const ctx = als.getStore();
  const t = ctx ? ctx.clock : globalOverride;
  return t ? new Date(t) : new Date();
}

export function setClock(d: Date | null): void {
  const ctx = als.getStore();
  if (ctx) ctx.clock = d;
  else globalOverride = d;
}

/** Jalankan simulasi terisolasi: jam sendiri dan WA tidak pernah benar-benar dikirim. */
export function runSimulation<T>(fn: () => Promise<T>): Promise<T> {
  return als.run({ clock: null }, fn);
}

export function inSimulation(): boolean {
  return !!als.getStore();
}
