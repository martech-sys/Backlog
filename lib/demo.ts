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

      const brand = pick(master.brands);
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
        const slow = rand() < 0.25 ? 2.2 : 1;
        let draft = 0;
        let ok = await step((10 + rand() * 50) * slow, () => svc.submitDraft(store, user(assignee), id, `https://drive.google.com/demo/${id}/v${++draft}`));
        if (!ok) continue;
        let finished = false;
        for (let round = 0; round < 6 && ok; round++) {
          const pass = rand() < 0.8;
          ok = await step(1 + rand() * 6, () => svc.qcDecision(store, user(task.Lead), id, pass, pass ? '' : 'Crop dan warna perlu dirapikan.'));
          if (!ok) break;
          if (!pass) {
            ok = await step(4 + rand() * 12, () => svc.submitDraft(store, user(assignee), id, `https://drive.google.com/demo/${id}/v${++draft}`));
            continue;
          }
          const acc = rand() < 0.6 || round >= 3;
          ok = await step((3 + rand() * 30) * slow, () =>
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
        await step(1 + rand() * 8, () => svc.closeTask(store, user(task.Grup === 'Womenswear' ? 'Nadia Syifa' : 'Evi'), id));
      }
    }
  } finally {
    setClock(null);
  }

}

/** Persona untuk halaman login demo. */
export function demoPersonas(): { name: string; email: string; label: string }[] {
  const seed = demoSeedMaster();
  const tim = seed[SHEETS.TIM].map((r) => ({ name: String(r[0]), email: String(r[8]), label: String(r[1]) }));
  const pic = seed[SHEETS.PIC].map((r) => ({ name: String(r[0]), email: String(r[2]), label: `PIC brand ${r[1]}` }));
  return [...tim.filter((p) => p.name === 'Admin Demo').map((p) => ({ ...p, label: 'Admin (semua akses)' })), ...pic, ...tim.filter((p) => p.name !== 'Admin Demo')];
}
