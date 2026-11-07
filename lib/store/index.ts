import { runSimulation } from '../clock';
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
    // Simulasi terisolasi: jam sendiri dan tidak ada WA yang benar-benar dikirim.
    await runSimulation(() => seedDemoActivity(store));
    return store;
  }
  if (!env.serviceAccountEmail || !env.serviceAccountKey) {
    throw new Error(
      'Kredensial Google belum diatur: isi GOOGLE_SERVICE_ACCOUNT_JSON (seluruh isi file JSON service account). Lihat README langkah 1.',
    );
  }
  const store = new SheetsStore(env.spreadsheetId, env.serviceAccountEmail, env.serviceAccountKey);
  // Tambah tab/kolom baru dari versi aplikasi terbaru (sekali per instance server; data lama tidak diubah).
  try {
    const changes = await store.ensureSheets(HEADERS);
    if (changes.length) console.info('[schema] diperbarui:', changes.join(' | '));
  } catch (e) {
    console.warn('[schema] gagal memeriksa skema sheet:', (e as Error).message);
  }
  return store;
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
