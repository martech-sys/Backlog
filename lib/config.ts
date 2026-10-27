/**
 * Skema data, status, routing, dan master data awal Creative Request Tracker.
 * Sumber: dokumen "Creative Request Tracker & WA Bot Ringkasan Proyek".
 */

export const APP_NAME = 'Creative Request Tracker';
export const TIMEZONE = 'Asia/Jakarta';

export const SHEETS = {
  CONFIG: 'Config',
  GRUP: 'Master_Grup',
  BRAND: 'Master_Brand',
  PIC: 'Master_PIC',
  TIM: 'Master_Tim',
  KATEGORI: 'Master_Kategori',
  LIBUR: 'Master_Libur',
  REQUEST: 'Request',
  TASK: 'Task',
  STATUS_LOG: 'Status',
  WA_LOG: 'Log_WA',
} as const;

export type SheetName = (typeof SHEETS)[keyof typeof SHEETS];

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** 11 status baku. Baru & Brief Kurang ada di level request, sisanya di level task. */
export const STATUS = {
  BARU: 'Baru',
  BRIEF_KURANG: 'Brief Kurang',
  SIAP_ASSIGN: 'Siap Assign',
  DIKERJAKAN: 'Dikerjakan',
  QC_LEAD: 'QC Lead',
  REVISI_INTERNAL: 'Revisi Internal',
  REVIEW_BRAND: 'Review Brand',
  REVISI_BRAND: 'Revisi Brand',
  ACC: 'ACC',
  FINAL: 'Final',
  SELESAI: 'Selesai',
} as const;

export type Status = (typeof STATUS)[keyof typeof STATUS];

export const STATUS_ORDER: Status[] = [
  STATUS.BARU,
  STATUS.BRIEF_KURANG,
  STATUS.SIAP_ASSIGN,
  STATUS.DIKERJAKAN,
  STATUS.QC_LEAD,
  STATUS.REVISI_INTERNAL,
  STATUS.REVIEW_BRAND,
  STATUS.REVISI_BRAND,
  STATUS.ACC,
  STATUS.FINAL,
  STATUS.SELESAI,
];

export const TASK_STATUSES: Status[] = STATUS_ORDER.slice(2);

export const REQUEST_STATUS = {
  BARU: STATUS.BARU,
  BRIEF_KURANG: STATUS.BRIEF_KURANG,
  DIPROSES: 'Diproses',
  SELESAI: STATUS.SELESAI,
} as const;

export type RequestStatus = (typeof REQUEST_STATUS)[keyof typeof REQUEST_STATUS];

/** Perpindahan status task yang sah. Admin boleh melompati aturan ini. */
export const TRANSITIONS: Record<string, Status[]> = {
  [STATUS.SIAP_ASSIGN]: [STATUS.DIKERJAKAN],
  [STATUS.DIKERJAKAN]: [STATUS.QC_LEAD],
  [STATUS.QC_LEAD]: [STATUS.REVIEW_BRAND, STATUS.REVISI_INTERNAL],
  [STATUS.REVISI_INTERNAL]: [STATUS.QC_LEAD],
  [STATUS.REVIEW_BRAND]: [STATUS.ACC, STATUS.REVISI_BRAND],
  [STATUS.REVISI_BRAND]: [STATUS.QC_LEAD],
  [STATUS.ACC]: [STATUS.FINAL],
  [STATUS.FINAL]: [STATUS.SELESAI],
  [STATUS.SELESAI]: [],
};

export type BallRole = 'Traffic' | 'PIC Brand' | 'Lead' | 'Assignee' | '-';

/** Siapa yang sedang memegang "bola" di tiap status. */
export const BALL_OWNER: Record<string, BallRole> = {
  [STATUS.BARU]: 'Traffic',
  [STATUS.BRIEF_KURANG]: 'PIC Brand',
  [STATUS.SIAP_ASSIGN]: 'Lead',
  [STATUS.DIKERJAKAN]: 'Assignee',
  [STATUS.QC_LEAD]: 'Lead',
  [STATUS.REVISI_INTERNAL]: 'Assignee',
  [STATUS.REVIEW_BRAND]: 'PIC Brand',
  [STATUS.REVISI_BRAND]: 'Assignee',
  [STATUS.ACC]: 'Assignee',
  [STATUS.FINAL]: 'Traffic',
  [STATUS.SELESAI]: '-',
};

/** Status yang dihitung sebagai beban aktif anggota. */
export const ACTIVE_STATUSES: Status[] = [
  STATUS.DIKERJAKAN,
  STATUS.QC_LEAD,
  STATUS.REVISI_INTERNAL,
  STATUS.REVIEW_BRAND,
  STATUS.REVISI_BRAND,
  STATUS.ACC,
];

/** Status saat tim creative masih produksi: target reminder H-2, H-1, hari H. */
export const PRODUCTION_STATUSES: Status[] = [
  STATUS.SIAP_ASSIGN,
  STATUS.DIKERJAKAN,
  STATUS.REVISI_INTERNAL,
  STATUS.REVISI_BRAND,
  STATUS.ACC,
];

export const DONE_STATUSES: Status[] = [STATUS.FINAL, STATUS.SELESAI];

/** Tahap untuk grafik "Lama per tahap": dipisah di tim creative vs menunggu brand. */
export const STAGES: { name: string; side: 'tim' | 'brand'; statuses: Status[] }[] = [
  { name: 'Cek brief', side: 'tim', statuses: [STATUS.BARU] },
  { name: 'Menunggu assign', side: 'tim', statuses: [STATUS.SIAP_ASSIGN] },
  { name: 'Produksi', side: 'tim', statuses: [STATUS.DIKERJAKAN, STATUS.REVISI_INTERNAL] },
  { name: 'QC lead', side: 'tim', statuses: [STATUS.QC_LEAD] },
  { name: 'Lengkapi brief', side: 'brand', statuses: [STATUS.BRIEF_KURANG] },
  { name: 'Review brand', side: 'brand', statuses: [STATUS.REVIEW_BRAND] },
  { name: 'Revisi', side: 'tim', statuses: [STATUS.REVISI_BRAND] },
  { name: 'Upload final', side: 'tim', statuses: [STATUS.ACC] },
];

// ---------------------------------------------------------------------------
// Header sheet. Kode membaca kolom berdasarkan nama header: urutan kolom boleh
// diubah, nama header jangan.
// ---------------------------------------------------------------------------

export const CONFIG_HEADERS = [
  'Key',
  'Value',
  'Keterangan',
] as const;

export const GRUP_HEADERS = [
  'Grup',
  'Traffic',
  'Creative Head',
] as const;

export const BRAND_HEADERS = [
  'Brand',
  'Kode',
  'Grup',
  'Aktif',
] as const;

export const PIC_HEADERS = [
  'Nama',
  'Grup',
  'Email',
  'No WA',
  'Aktif',
] as const;

export const TIM_HEADERS = [
  'Nama',
  'Peran',
  'Divisi',
  'Grup',
  'Lead',
  'Intern',
  'Kapasitas',
  'No WA',
  'Email',
  'Aktif',
] as const;

export const KATEGORI_HEADERS = [
  'Kategori',
  'Sub-jenis',
  'Divisi',
  'Lead Menswear',
  'Lead Womenswear',
  'Mode Assign',
  'Assignee Default',
  'Lead Time Min (hari kerja)',
  'Buffer Review (hari kerja)',
] as const;

export const LIBUR_HEADERS = [
  'Tanggal',
  'Keterangan',
] as const;

export const REQUEST_HEADERS = [
  'Request ID',
  'Timestamp',
  'Brand',
  'Grup',
  'PIC Brand',
  'Email Requestor',
  'Campaign Name',
  'Campaign Type',
  'Kategori',
  'Sub-jenis',
  'Objective',
  'Product Knowledge/USP',
  'Key Message',
  'Creative Note',
  'Target Audience',
  'Budget',
  'Due Date',
  'Deliverables',
  'Detail Kategori',
  'Supporting Link',
  'Attachments',
  'Traffic',
  'Creative Head',
  'Lead Time Min (hari kerja)',
  'Urgent',
  'Deadline',
  'Cek Brief',
  'Catatan Traffic',
  'Status',
  'Status Sejak',
  'Brief OK Pada',
  'Selesai Pada',
] as const;

export const TASK_HEADERS = [
  'Task ID',
  'Request ID',
  'Dibuat',
  'Brand',
  'Grup',
  'PIC Brand',
  'Kategori',
  'Sub-jenis',
  'Divisi',
  'Lead',
  'Assignee',
  'Status',
  'Bola di',
  'Deadline',
  'Target Draft',
  'Urgent',
  'Versi Draft',
  'Link Draft',
  'Riwayat Draft',
  'Catatan QC',
  'Ronde Revisi',
  'Catatan Revisi',
  'Link Final',
  'Status Sejak',
  'Selesai Pada',
  'Reminder Terkirim',
] as const;

export const STATUS_LOG_HEADERS = [
  'Timestamp',
  'ID',
  'Level',
  'Dari',
  'Ke',
  'Oleh',
  'Catatan',
] as const;

export const WA_LOG_HEADERS = [
  'Timestamp',
  'Arah',
  'Nomor',
  'Nama',
  'Jenis',
  'Ref ID',
  'Pesan',
  'Hasil',
] as const;

export const HEADERS: Record<SheetName, readonly string[]> = {
  [SHEETS.CONFIG]: CONFIG_HEADERS,
  [SHEETS.GRUP]: GRUP_HEADERS,
  [SHEETS.BRAND]: BRAND_HEADERS,
  [SHEETS.PIC]: PIC_HEADERS,
  [SHEETS.TIM]: TIM_HEADERS,
  [SHEETS.KATEGORI]: KATEGORI_HEADERS,
  [SHEETS.LIBUR]: LIBUR_HEADERS,
  [SHEETS.REQUEST]: REQUEST_HEADERS,
  [SHEETS.TASK]: TASK_HEADERS,
  [SHEETS.STATUS_LOG]: STATUS_LOG_HEADERS,
  [SHEETS.WA_LOG]: WA_LOG_HEADERS,
};

type RowOf<H extends readonly string[]> = { [K in H[number]]: string } & { _row: number };

export type ConfigRow = RowOf<typeof CONFIG_HEADERS>;
export type GrupRow = RowOf<typeof GRUP_HEADERS>;
export type BrandRow = RowOf<typeof BRAND_HEADERS>;
export type PicRow = RowOf<typeof PIC_HEADERS>;
export type TimRow = RowOf<typeof TIM_HEADERS>;
export type KategoriRow = RowOf<typeof KATEGORI_HEADERS>;
export type LiburRow = RowOf<typeof LIBUR_HEADERS>;
export type RequestRow = RowOf<typeof REQUEST_HEADERS>;
export type TaskRow = RowOf<typeof TASK_HEADERS>;
export type StatusLogRow = RowOf<typeof STATUS_LOG_HEADERS>;
export type WaLogRow = RowOf<typeof WA_LOG_HEADERS>;

export type RequestField = (typeof REQUEST_HEADERS)[number];
export type TaskField = (typeof TASK_HEADERS)[number];


// ---------------------------------------------------------------------------
// Config (sheet "Config"). Rahasia (token WA, kredensial Google) ada di env Vercel.
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: [string, string, string][] = [
  ['TICKET_PREFIX', 'CR', 'Awalan ID tiket, contoh CR-2610-001'],
  ['REMINDER_DAYS', '2,1,0', 'Reminder H-2, H-1, hari H'],
  ['MAX_REVISI', '2', 'Batas ronde revisi brand sebelum Traffic & Creative Head diberi tahu'],
  ['ESCALATE_AFTER_DAYS', '1', 'Overdue sekian hari → eskalasi ke Creative Head & Head of Creative Production'],
  ['ADMIN_EMAILS', 'dodi.wahyono@worldwhiteenterprise.com', 'Email (dipisah koma) yang boleh melompati aturan alur status'],
  ['DRIVE_FOLDER_URL', '', 'Folder Google Drive untuk draft & file final'],
];

export interface AppConfig {
  ticketPrefix: string;
  reminderDays: number[];
  maxRevisi: number;
  escalateAfterDays: number;
  adminEmails: string[];
  driveFolderUrl: string;
}

// ---------------------------------------------------------------------------
// Form request: kategori dan field khusus per kategori
// ---------------------------------------------------------------------------

export const CAMPAIGN_TYPES = ['Big Campaign', 'Medium Campaign', 'Small Campaign', 'Always-on / Reguler'];

export type FieldType = 'text' | 'number' | 'select' | 'multi' | 'textarea' | 'date';

export interface CategoryField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface CategoryDef {
  name: string;
  subTypes: string[];
  fields: CategoryField[];
}

export const CATEGORIES: CategoryDef[] = [
  {
    name: 'Fotoshoot',
    subTypes: ['Katalog', 'Editorial campaign', 'Still life / esensial produk'],
    fields: [
      { key: 'jumlahSku', label: 'Jumlah SKU', type: 'number', required: true },
      { key: 'fotoPerSku', label: 'Jumlah foto per SKU', type: 'number', placeholder: 'mis. 4' },
      { key: 'lokasi', label: 'Lokasi', type: 'select', options: ['Studio', 'Outdoor', 'Studio + Outdoor'], required: true },
      { key: 'model', label: 'Butuh model', type: 'select', options: ['Ya', 'Tidak'], required: true },
      { key: 'tanggalShoot', label: 'Tanggal shoot yang diinginkan', type: 'date' },
    ],
  },
  {
    name: 'Desain grafis',
    subTypes: ['Poster', 'Banner', 'Postingan Instagram', 'Katalog web'],
    fields: [
      { key: 'ukuran', label: 'Ukuran / rasio', type: 'text', required: true, placeholder: 'mis. 1080x1350, 4:5' },
      { key: 'jumlahDesain', label: 'Jumlah desain', type: 'number', required: true },
      { key: 'copy', label: 'Copy / teks di desain', type: 'textarea' },
    ],
  },
  {
    name: 'Videografis',
    subTypes: ['Reels', 'Story', 'Katalog web'],
    fields: [
      { key: 'durasi', label: 'Durasi (detik)', type: 'number', required: true },
      { key: 'rasio', label: 'Rasio', type: 'select', options: ['9:16', '4:5', '1:1', '16:9'], required: true },
      { key: 'jumlahVideo', label: 'Jumlah video', type: 'number', required: true },
    ],
  },
  {
    name: 'Moodboard',
    subTypes: ['Visual direction'],
    fields: [
      { key: 'referensi', label: 'Referensi visual (link)', type: 'text', required: true },
      { key: 'kegunaan', label: 'Dipakai untuk', type: 'text', placeholder: 'mis. shoot campaign lebaran' },
    ],
  },
  {
    name: '3D/Motion',
    subTypes: ['Motion graphic', '3D visual produk'],
    fields: [
      { key: 'durasi', label: 'Durasi (detik)', type: 'number', required: true },
      { key: 'rasio', label: 'Rasio', type: 'select', options: ['9:16', '4:5', '1:1', '16:9'], required: true },
      { key: 'jumlah', label: 'Jumlah output', type: 'number', required: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// Master data awal (dari dokumen). Nomor WA, email, dan anggota tim lainnya
// (total 38 orang) dilengkapi langsung di sheet.
// ---------------------------------------------------------------------------

export const SEED: Partial<Record<SheetName, (string | number)[][]>> = {
  [SHEETS.CONFIG]: DEFAULT_CONFIG,
  [SHEETS.GRUP]: [
    ['Menswear', 'Evi', 'Ammar Habibullah'],
    ['Womenswear', 'Nadia Syifa', 'Abdul Malik'],
  ],
  [SHEETS.BRAND]: [
    ['Heymale', 'HM', 'Menswear', 'Ya'],
    ['Zoma', 'ZM', 'Menswear', 'Ya'],
    ['Prepp Studio', 'PS', 'Menswear', 'Ya'],
    ['Nostalgy', 'NS', 'Menswear', 'Ya'],
    ['Secondserve', 'SS', 'Menswear', 'Ya'],
    ['Heylocal', 'HL', 'Womenswear', 'Ya'],
    ['Shuwa', 'SH', 'Womenswear', 'Ya'],
    ['Zeyya', 'ZY', 'Womenswear', 'Ya'],
    ['Ladyfit', 'LF', 'Womenswear', 'Ya'],
    ['Boonaboo', 'BB', 'Womenswear', 'Ya'],
    ['Prow', 'PW', 'Womenswear', 'Ya'],
  ],
  [SHEETS.PIC]: [
    ['Dennis', 'Menswear', '', '', 'Ya'],
    ['Aliza', 'Menswear', '', '', 'Ya'],
    ['Brama', 'Menswear', 'bramantyobayu@heymale.id', '', 'Ya'],
    ['Dea', 'Womenswear', '', '', 'Ya'],
    ['Tiwi', 'Womenswear', '', '', 'Ya'],
    ['Zahra', 'Womenswear', '', '', 'Ya'],
    ['Mey', 'Womenswear', '', '', 'Ya'],
  ],
  [SHEETS.TIM]: [
    ['Ammar Habibullah', 'Creative Head', 'Management', 'Menswear', 'Tidak', 'Tidak', '', '', '', 'Ya'],
    ['Abdul Malik', 'Creative Head', 'Management', 'Womenswear', 'Tidak', 'Tidak', '', '', '', 'Ya'],
    ['Daniel Pranata', 'Head of Creative Production', 'Management', 'Semua', 'Tidak', 'Tidak', '', '', '', 'Ya'],
    ['Evi', 'Traffic', 'Traffic', 'Menswear', 'Tidak', 'Tidak', '', '', '', 'Ya'],
    ['Nadia Syifa', 'Traffic', 'Traffic', 'Womenswear', 'Tidak', 'Tidak', '', '', '', 'Ya'],
    ['Hamzah Benoti', 'Lead Foto', 'Foto', 'Womenswear', 'Ya', 'Tidak', 5, '', '', 'Ya'],
    ['Ahmad Husen', 'Lead Foto', 'Foto', 'Menswear', 'Ya', 'Tidak', 5, '', '', 'Ya'],
    ['Aulia Pramudya', 'Lead Desain', 'Desain', 'Semua', 'Ya', 'Tidak', 5, '', '', 'Ya'],
    ['Ilham Almando', 'Lead Video', 'Video', 'Semua', 'Ya', 'Tidak', 5, '', '', 'Ya'],
    ['Salsa Rosyidah', 'Lead Styling', 'Styling', 'Semua', 'Ya', 'Tidak', 5, '', '', 'Ya'],
    ['Habibi Al Huda', '3D/Motion Artist', '3D/Motion', 'Semua', 'Tidak', 'Tidak', 5, '', '', 'Ya'],
  ],
  /**
   * Routing kategori → divisi → lead. Fotoshoot dipecah jadi 2 task (Foto + Styling).
   * Mode Assign: "Lead pilih" | "Otomatis beban" (task aktif paling sedikit) | "Default".
   * Lead time & buffer adalah angka awal; sesuaikan dengan SLA tim.
   */
  [SHEETS.KATEGORI]: [
    ['Fotoshoot', 'Katalog, Editorial campaign, Still life / esensial produk', 'Foto', 'Ahmad Husen', 'Hamzah Benoti', 'Lead pilih', '', 7, 2],
    ['Fotoshoot', 'Katalog, Editorial campaign, Still life / esensial produk', 'Styling', 'Salsa Rosyidah', 'Salsa Rosyidah', 'Default', 'Salsa Rosyidah', 7, 2],
    ['Desain grafis', 'Poster, Banner, Postingan Instagram, Katalog web', 'Desain', 'Aulia Pramudya', 'Aulia Pramudya', 'Otomatis beban', '', 3, 1],
    ['Videografis', 'Reels, Story, Katalog web', 'Video', 'Ilham Almando', 'Ilham Almando', 'Lead pilih', '', 5, 2],
    ['Moodboard', 'Visual direction', 'Desain', 'Aulia Pramudya', 'Aulia Pramudya', 'Lead pilih', '', 2, 1],
    ['3D/Motion', 'Motion graphic, 3D visual produk', '3D/Motion', 'Aulia Pramudya', 'Aulia Pramudya', 'Default', 'Habibi Al Huda', 7, 2],
  ],
};
