import { HEADERS } from '../config';
import { env } from '../env';
import { MemoryStore } from './memory';
import { SheetsStore } from './sheets';
import type { Store } from './types';

type Holder = { store?: Promise<Store> };
const g = globalThis as unknown as { __creativeStore?: Holder };
const holder: Holder = (g.__creativeStore ||= {});

async function createStore(): Promise<Store> {
  if (env.demoMode) {
    const { demoSeedMaster, seedDemoAccounts, seedDemoActivity } = await import('../demo');
    const store = new MemoryStore(HEADERS, demoSeedMaster());
    await seedDemoAccounts(store);
    await seedDemoActivity(store);
    return store;
  }
  if (!env.serviceAccountEmail || !env.serviceAccountKey) {
    throw new Error(
      'Kredensial Google belum diatur: isi GOOGLE_SERVICE_ACCOUNT_JSON (seluruh isi file JSON service account). Lihat README langkah 1.',
    );
  }
  return new SheetsStore(env.spreadsheetId, env.serviceAccountEmail, env.serviceAccountKey);
}

export function getStore(): Promise<Store> {
  if (!holder.store) {
    holder.store = createStore().catch((e) => {
      holder.store = undefined;
      throw e;
    });
  }
  return holder.store;
}

/** Khusus test: pasang store tertentu. */
export function setStore(store: Store | undefined): void {
  holder.store = store ? Promise.resolve(store) : undefined;
}

export type { Store, Row, Cell } from './types';
