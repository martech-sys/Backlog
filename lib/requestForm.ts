import { CATEGORIES, type RequestRow } from './config';

export interface RequestFormDefaults {
  brand: string;
  picName: string;
  campaignName: string;
  campaignType: string;
  objective: string;
  kategori: string[];
  subJenis: Record<string, string[]>;
  details: Record<string, Record<string, string>>;
  usp: string;
  keyMessage: string;
  creativeNote: string;
  targetAudience: string;
  budget: string;
  dueDate: string;
  deliverables: string;
  supportingLink: string;
  attachments: string;
}

export const EMPTY_DEFAULTS: RequestFormDefaults = {
  brand: '',
  picName: '',
  campaignName: '',
  campaignType: '',
  objective: '',
  kategori: [],
  subJenis: {},
  details: {},
  usp: '',
  keyMessage: '',
  creativeNote: '',
  targetAudience: '',
  budget: '',
  dueDate: '',
  deliverables: '',
  supportingLink: '',
  attachments: '',
};

/** Ubah baris Request kembali menjadi nilai awal form (untuk "Lengkapi brief"). */
export function defaultsFromRequest(r: RequestRow): RequestFormDefaults {
  const kategori = r.Kategori.split(',').map((s) => s.trim()).filter(Boolean);
  const chosenSub = r['Sub-jenis'].split(',').map((s) => s.trim());
  const subJenis: Record<string, string[]> = {};
  const details: Record<string, Record<string, string>> = {};
  for (const k of kategori) {
    const def = CATEGORIES.find((c) => c.name === k);
    if (!def) continue;
    subJenis[k] = chosenSub.filter((s) => def.subTypes.includes(s));
    const line = r['Detail Kategori'].split('\n').find((l) => l.startsWith(`${k} — `)) || '';
    const body = line.slice(k.length + 3);
    details[k] = {};
    for (const part of body.split('; ')) {
      const idx = part.indexOf(': ');
      if (idx < 0) continue;
      const label = part.slice(0, idx);
      const f = def.fields.find((x) => x.label === label);
      if (f) details[k][f.key] = part.slice(idx + 2);
    }
  }
  return {
    brand: r.Brand,
    picName: r['PIC Brand'],
    campaignName: r['Campaign Name'],
    campaignType: r['Campaign Type'],
    objective: r.Objective,
    kategori,
    subJenis,
    details,
    usp: r['Product Knowledge/USP'],
    keyMessage: r['Key Message'],
    creativeNote: r['Creative Note'],
    targetAudience: r['Target Audience'],
    budget: r.Budget,
    dueDate: r['Due Date'],
    deliverables: r.Deliverables,
    supportingLink: r['Supporting Link'],
    attachments: r.Attachments,
  };
}
