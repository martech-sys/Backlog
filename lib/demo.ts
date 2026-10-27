/**
 * Data demo (DEMO_MODE=true): master data dari dokumen + anggota contoh, lalu
 * simulasi ±6 minggu aktivitas memakai fungsi-fungsi service yang asli.
 * Tidak pernah dipakai saat terhubung ke Google Sheets.
 */
import { CATEGORIES, SEED, SHEETS } from './config';
import { setClock } from './clock';
import { addWorkingDays, todayWib } from './dates';
import { loadDb } from './db';
import { findPerson } from './master';
import * as svc from './service';
import type { Cell, Store } from './store';
import { userFromPerson } from './users';

export const DEMO_DOMAIN = 'demo.local';
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
export const demoEmail = (name: string) => `${slug(name)}@${DEMO_DOMAIN}`;

const EXTRA_MEMBERS: Cell[][] = [
  ['Admin Demo', 'Admin', 'Management', 'Semua', 'Tidak', 'Tidak', ''],
  ['Desainer A', 'Graphic Designer', 'Desain', 'Semua', 'Tidak', 'Tidak', 4],
  ['Desainer B', 'Graphic Designer', 'Desain', 'Semua', 'Tidak', 'Tidak', 4],
  ['Desainer C', 'Graphic Designer', 'Desain', 'Semua', 'Tidak', 'Tidak', 4],
  ['Intern Desain', 'Intern Desain', 'Desain', 'Semua', 'Tidak', 'Ya', 2],
  ['Fotografer A', 'Photographer', 'Foto', 'Menswear', 'Tidak', 'Tidak', 3],
  ['Fotografer B', 'Photographer', 'Foto', 'Womenswear', 'Tidak', 'Tidak', 3],
  ['Photo Editor A', 'Photo Editor', 'Foto', 'Semua', 'Tidak', 'Tidak', 4],
  ['Videografer A', 'Videographer', 'Video', 'Semua', 'Tidak', 'Tidak', 3],
  ['Videografer B', 'Videographer', 'Video', 'Semua', 'Tidak', 'Tidak', 3],
  ['Assistant Studio A', 'Assistant Studio', 'Styling', 'Semua', 'Tidak', 'Tidak', 3],
];

export function demoSeedMaster(): Record<string, Cell[][]> {
  const seed: Record<string, Cell[][]> = {};
  for (const [k, v] of Object.entries(SEED)) seed[k] = (v || []).map((r) => [...r]);

  let n = 0;
  const phone = () => `62812000${String(++n).padStart(4, '0')}`;
  // Master_Tim: Nama, Peran, Divisi, Grup, Lead, Intern, Kapasitas, No WA, Email, Aktif
  seed[SHEETS.TIM] = [...seed[SHEETS.TIM], ...EXTRA_MEMBERS.map((r) => [...r, '', '', 'Ya'])].map((r) => {
    const row = [...r];
    row[7] = phone();
    row[8] = demoEmail(String(row[0]));
    return row;
  });
  // Master_PIC: Nama, Grup, Email, No WA, Aktif
  seed[SHEETS.PIC] = seed[SHEETS.PIC].map((r) => [r[0], r[1], demoEmail(String(r[0])), phone(), 'Ya']);
  seed[SHEETS.CONFIG] = seed[SHEETS.CONFIG].map((r) => (r[0] === 'ADMIN_EMAILS' ? [r[0], demoEmail('Admin Demo'), r[2]] : r));
  return seed;
}

/** PRNG deterministik agar data demo selalu sama. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAMPAIGNS = [
  'Payday Sale',
  'New Arrival Basic Tee',
  'Ramadan Collection',
  'Back to Office',
  'Weekend Flash Sale',
  'Denim Week',
  'Holiday Gift Guide',
  'Collab Drop',
  'Restock Bestseller',
  'Year End Sale',
];

export async function seedDemoActivity(store: Store): Promise<void> {
  const rand = mulberry32(20261027);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const realNow = Date.now();
  const H = 60 * 60 * 1000;

  const db0 = await loadDb(store);
  const master = db0.master;
  const user = (name: string) => userFromPerson(findPerson(master, name)!);
  const at = (ms: number) => setClock(new Date(ms));

  try {
    const start = realNow - 45 * 24 * H;
    const OLD = 40;
    const RECENT = 18;
    for (let i = 0; i < OLD + RECENT; i++) {
      // 40 request tersebar 45–8 hari lalu, 18 request di 7 hari terakhir (masih berjalan)
      let t =
        i < OLD
          ? start + (i / OLD) * 37 * 24 * H + rand() * 6 * H
          : realNow - 7 * 24 * H + ((i - OLD) / RECENT) * 7 * 24 * H + rand() * 3 * H;
      const created = new Date(t);
      const hourAdj = 9 - ((created.getUTCHours() + 7) % 24); // geser ke ±09:00 WIB
      t += hourAdj * H;
      if (t > realNow) break;

      // Brand besar lebih sering request (pola volume per brand)
      const brand = rand() < 0.35 ? pick(master.brands.filter((b) => ['Heymale', 'Heylocal', 'Shuwa'].includes(b.name))) : pick(master.brands);
      const grup = master.grups.find((g) => g.name === brand.grup)!;
      const pic = pick(master.people.filter((p) => p.roles.includes('pic') && p.grup === brand.grup));
      const kategori = rand() < 0.25 ? [pick(CATEGORIES).name, pick(CATEGORIES).name] : [pick(CATEGORIES).name];
      const uniq = [...new Set(kategori)];
      const today = todayWib(new Date(t));
      const due = addWorkingDays(today, 2 + Math.floor(rand() * 10), master.holidays);

      at(t);
      const res = await svc.submitRequest(store, user(pic.name), {
        brand: brand.name,
        campaignName: `${pick(CAMPAIGNS)} ${brand.name}`,
        campaignType: pick(['Big Campaign', 'Medium Campaign', 'Small Campaign', 'Always-on / Reguler']),
        objective: 'Meningkatkan awareness dan penjualan koleksi terbaru.',
        kategori: uniq,
        subJenis: Object.fromEntries(uniq.map((k) => [k, [CATEGORIES.find((c) => c.name === k)!.subTypes[0]]])),
        details: Object.fromEntries(
          uniq.map((k) => [
            k,
            Object.fromEntries(
              CATEGORIES.find((c) => c.name === k)!.fields.map((f) => [f.key, f.type === 'number' ? '3' : f.options?.[0] || 'Contoh']),
            ),
          ]),
        ),
        usp: 'Bahan katun combed 30s, adem dan tidak mudah melar.',
        keyMessage: 'Nyaman dipakai seharian.',
        creativeNote: 'Clean, natural light, tone hangat.',
        targetAudience: 'Pria/wanita 20–30 tahun, urban.',
        budget: String((1 + Math.floor(rand() * 20)) * 500000),
        dueDate: due,
        deliverables: 'Sesuai brief',
        supportingLink: '',
        attachments: '',
      });
      if (!res.ok || !res.id) continue;
      const rid = res.id;

      // Cek brief
      t += (2 + rand() * 20) * H;
      if (t > realNow) continue;
      if (rand() < 0.15) {
        at(t);
        await svc.cekBrief(store, user(grup.traffic), { requestId: rid, decision: 'Kurang', note: 'Mohon lengkapi jumlah SKU dan referensi visual.' });
        t += (6 + rand() * 30) * H;
        if (t > realNow) continue;
        at(t);
        const r = (await loadDb(store)).requests.find((x) => x['Request ID'] === rid)!;
        await svc.updateBrief(store, user(pic.name), rid, {
          brand: r.Brand,
          campaignName: r['Campaign Name'],
          campaignType: r['Campaign Type'],
          objective: r.Objective,
          kategori: uniq,
          subJenis: Object.fromEntries(uniq.map((k) => [k, [CATEGORIES.find((c) => c.name === k)!.subTypes[0]]])),
          details: Object.fromEntries(uniq.map((k) => [k, Object.fromEntries(CATEGORIES.find((c) => c.name === k)!.fields.map((f) => [f.key, f.type === 'number' ? '4' : f.options?.[0] || 'Lengkap']))])),
          usp: r['Product Knowledge/USP'],
          keyMessage: r['Key Message'],
          creativeNote: r['Creative Note'],
          targetAudience: r['Target Audience'],
          budget: r.Budget,
          dueDate: r['Due Date'] < todayWib(new Date(t)) ? addWorkingDays(todayWib(new Date(t)), 3, master.holidays) : r['Due Date'],
          deliverables: r.Deliverables,
          supportingLink: '',
          attachments: '',
        });
        t += (1 + rand() * 6) * H;
        if (t > realNow) continue;
      }
      at(t);
      const curReq = (await loadDb(store)).requests.find((x) => x['Request ID'] === rid)!;
      const deadline = curReq.Deadline < todayWib(new Date(t)) ? addWorkingDays(todayWib(new Date(t)), 2, master.holidays) : curReq.Deadline;
      await svc.cekBrief(store, user(grup.traffic), { requestId: rid, decision: 'Lengkap', note: '', deadline });

      // Produksi per task
      const tasks = (await loadDb(store)).tasks.filter((x) => x['Request ID'] === rid);
      for (const task of tasks) {
        let tt = t;
        const id = task['Task ID'];
        const step = async (hours: number, fn: () => Promise<unknown>) => {
          tt += hours * H;
          if (tt > realNow) return false;
          at(tt);
          await fn();
          return true;
        };
        if (!task.Assignee) {
          const members = master.people.filter((p) => p.active && p.divisi === task.Divisi && !p.isLead);
          const who = members.length ? pick(members).name : task.Lead;
          if (!(await step(1 + rand() * 8, () => svc.assignTask(store, user(task.Lead), id, who)))) continue;
        }
        const assignee = (await loadDb(store)).tasks.find((x) => x['Task ID'] === id)!.Assignee;
        // Pola untuk insight: video produksinya lebih lama, brand Womenswear lebih lama review,
        // beberapa brand brief-nya sering direvisi, hasil intern lebih sering belum lolos QC.
        const slow = (rand() < 0.25 ? 2.2 : 1) * (task.Divisi === 'Video' ? 1.8 : 1);
        const slowReview = task.Grup === 'Womenswear' ? 1.8 : 1;
        const accRate = ['Prow', 'Zeyya', 'Secondserve'].includes(task.Brand) ? 0.35 : 0.7;
        const qcRate = /intern/i.test(assignee) ? 0.55 : 0.85;
        let draft = 0;
        let ok = await step((10 + rand() * 50) * slow, () => svc.submitDraft(store, user(assignee), id, `https://drive.google.com/demo/${id}/v${++draft}`));
        if (!ok) continue;
        let finished = false;
        for (let round = 0; round < 6 && ok; round++) {
          const pass = rand() < qcRate;
          ok = await step(1 + rand() * 6, () => svc.qcDecision(store, user(task.Lead), id, pass, pass ? '' : 'Crop dan warna perlu dirapikan.'));
          if (!ok) break;
          if (!pass) {
            ok = await step(4 + rand() * 12, () => svc.submitDraft(store, user(assignee), id, `https://drive.google.com/demo/${id}/v${++draft}`));
            continue;
          }
          const acc = rand() < accRate || round >= 3;
          ok = await step((3 + rand() * 30) * slowReview, () =>
            svc.brandReview(store, user(task['PIC Brand']), id, acc ? 'ACC' : 'REV', acc ? '' : pick(['Logo diperbesar', 'Warna lebih terang', 'Ganti copy headline', 'Crop lebih dekat ke produk']), rand() < 0.6 ? 'WA' : 'web'),
          );
          if (!ok) break;
          if (!acc) {
            ok = await step(5 + rand() * 20, () => svc.submitDraft(store, user(assignee), id, `https://drive.google.com/demo/${id}/v${++draft}`));
            continue;
          }
          finished = true;
          break;
        }
        if (!ok || !finished) continue;
        if (!(await step(2 + rand() * 10, () => svc.submitFinal(store, user(assignee), id, `https://drive.google.com/demo/${id}/final`)))) continue;
        await step(1 + rand() * 8, () => svc.closeTask(store, user(master.grups.find((g) => g.name === task.Grup)?.traffic || task.Lead), id));
      }
    }
    await showcase(store, realNow);
  } finally {
    setClock(null);
  }

}

/**
 * Request "etalase" di 1,5 hari terakhir yang sengaja berhenti di tiap tahap, supaya
 * semua status, kolom papan, dan jenis notifikasi terlihat.
 */
async function showcase(store: Store, realNow: number): Promise<void> {
  const H = 60 * 60 * 1000;
  const master = (await loadDb(store)).master;
  const user = (name: string) => userFromPerson(findPerson(master, name)!);
  const trafficOf = (brand: string) => master.grups.find((g) => g.name === master.brands.find((b) => b.name === brand)?.grup)?.traffic || 'Evi';
  const picOf = (brand: string) => {
    const grup = master.brands.find((b) => b.name === brand)?.grup;
    return master.people.find((p) => p.roles.includes('pic') && p.grup === grup)!.name;
  };
  const input = (brand: string, kategori: string, campaign: string, dueDays: number): svc.RequestInput => {
    const def = CATEGORIES.find((c) => c.name === kategori)!;
    const today = todayWib(new Date(realNow));
    return {
      brand,
      campaignName: `${campaign} ${brand}`,
      campaignType: 'Medium Campaign',
      objective: 'Mendorong penjualan koleksi baru di marketplace dan Instagram.',
      kategori: [kategori],
      subJenis: { [kategori]: [def.subTypes[0]] },
      details: { [kategori]: Object.fromEntries(def.fields.map((f) => [f.key, f.type === 'number' ? '4' : f.options?.[0] || 'Sesuai referensi'])) },
      usp: 'Bahan premium, potongan regular fit.',
      keyMessage: 'Tampil rapi tanpa ribet.',
      creativeNote: 'Natural light, warna earth tone.',
      targetAudience: 'Usia 20–30, urban.',
      budget: '5000000',
      dueDate: addWorkingDays(today, dueDays, master.holidays),
      deliverables: 'Sesuai kebutuhan campaign',
      supportingLink: '',
      attachments: '',
    };
  };

  type Step = 'baru' | 'kurang' | 'siap' | 'qc' | 'revisiInternal' | 'review' | 'revisiBrand' | 'acc' | 'final' | 'urgent';
  const plan: [Step, string, string, string, number][] = [
    ['baru', 'Heymale', 'Desain grafis', 'Flash Sale 11.11', 6],
    ['kurang', 'Shuwa', 'Videografis', 'Launching Hijab Series', 8],
    ['siap', 'Nostalgy', 'Fotoshoot', 'Lookbook Vintage', 9],
    ['qc', 'Zoma', 'Desain grafis', 'Promo Gajian', 5],
    ['revisiInternal', 'Heylocal', 'Moodboard', 'Campaign Akhir Tahun', 6],
    ['review', 'Prepp Studio', 'Videografis', 'Back to Campus', 7],
    ['revisiBrand', 'Prow', 'Desain grafis', 'Activewear Drop', 5],
    ['acc', 'Ladyfit', '3D/Motion', 'Produk 360°', 10],
    ['final', 'Boonaboo', 'Desain grafis', 'Kids Holiday Sale', 4],
    ['urgent', 'Heymale', 'Fotoshoot', 'Katalog Restock Mendadak', 3],
  ];

  let base = realNow - 36 * H;
  for (const [stage, brand, kategori, campaign, dueDays] of plan) {
    let t = base;
    base += 2.5 * H;
    const tick = (h = 1) => {
      t += h * H;
      setClock(new Date(Math.min(t, realNow - 5 * 60 * 1000)));
    };
    tick(0);
    const pic = picOf(brand);
    const traffic = trafficOf(brand);
    const r = await svc.submitRequest(store, user(pic), input(brand, kategori, campaign, dueDays));
    if (!r.ok || !r.id || stage === 'baru') continue;
    tick();
    if (stage === 'kurang') {
      await svc.cekBrief(store, user(traffic), { requestId: r.id, decision: 'Kurang', note: 'Mohon lampirkan referensi video dan durasi per platform.' });
      continue;
    }
    await svc.cekBrief(store, user(traffic), { requestId: r.id, decision: 'Lengkap', note: '' });
    const tasks = (await loadDb(store)).tasks.filter((x) => x['Request ID'] === r.id);
    const task = tasks[0];
    const id = task['Task ID'];
    if (stage === 'siap' || stage === 'urgent') continue; // Foto belum di-assign lead
    let assignee = task.Assignee;
    if (!assignee) {
      tick(0.5);
      assignee = master.people.find((p) => p.active && p.divisi === task.Divisi && !p.isLead)?.name || task.Lead;
      await svc.assignTask(store, user(task.Lead), id, assignee);
    }
    tick(3);
    await svc.submitDraft(store, user(assignee), id, `https://drive.google.com/demo/${id}/v1`);
    if (stage === 'qc') continue;
    tick();
    if (stage === 'revisiInternal') {
      await svc.qcDecision(store, user(task.Lead), id, false, 'Komposisi terlalu ramai, kurangi elemen.');
      continue;
    }
    await svc.qcDecision(store, user(task.Lead), id, true, '');
    if (stage === 'review') continue;
    tick(2);
    if (stage === 'revisiBrand') {
      await svc.brandReview(store, user(pic), id, 'REV', 'Warna kurang kontras, logo diperbesar.', 'WA');
      continue;
    }
    await svc.brandReview(store, user(pic), id, 'ACC', '', 'WA');
    if (stage === 'acc') continue;
    tick();
    await svc.submitFinal(store, user(assignee), id, `https://drive.google.com/demo/${id}/final`);
  }
}

export const DEMO_PASSWORD = 'demo1234';

/** Akun login demo untuk semua persona (password demo1234). Admin Demo = Superadmin. */
export async function seedDemoAccounts(store: Store): Promise<void> {
  const { hashPassword } = await import('./accounts');
  // Biaya hash rendah khusus demo agar server cepat siap; produksi memakai biaya default.
  const hash = await hashPassword(DEMO_PASSWORD, 1024);
  await store.append(
    SHEETS.USERS,
    demoPersonas().map((p) => ({
      Email: p.email,
      Nama: p.name,
      Akses: p.name === 'Admin Demo' ? 'Superadmin' : 'User',
      'Password Hash': hash,
      Aktif: 'Ya',
      'Wajib Ganti Password': 'Tidak',
      Dibuat: '',
      'Dibuat Oleh': 'Demo',
      'Login Terakhir': '',
    })),
  );
}

/** Persona untuk halaman login demo. */
export function demoPersonas(): { name: string; email: string; label: string }[] {
  const seed = demoSeedMaster();
  const tim = seed[SHEETS.TIM].map((r) => ({ name: String(r[0]), email: String(r[8]), label: String(r[1]) }));
  const pic = seed[SHEETS.PIC].map((r) => ({ name: String(r[0]), email: String(r[2]), label: `PIC brand ${r[1]}` }));
  return [...tim.filter((p) => p.name === 'Admin Demo').map((p) => ({ ...p, label: 'Admin (semua akses)' })), ...pic, ...tim.filter((p) => p.name !== 'Admin Demo')];
}
