# Creative Request Tracker & WA Bot

Backlog tracker untuk semua permintaan konten dari brand ke tim Creative, dari pengajuan, revisi, sampai file final, dengan notifikasi dan reminder deadline otomatis lewat WhatsApp.

- **Web app**: Next.js 16 (App Router), di-hosting di **Vercel**
- **Database**: Google Sheets [`DB_backlog`](https://docs.google.com/spreadsheets/d/1THrfMECihSohopWwCfgL91mGP5RsUl8YTBRW01VUbSE/edit)
- **Login**: Google (akun `@heymale.id`, atau email yang terdaftar di master data)
- **WhatsApp**: gateway Fonnte atau Wablas (kirim notifikasi + terima balasan ACC/REV)
- **Jadwal**: Vercel Cron untuk reminder H-2/H-1/hari H, digest pagi, dan rekap mingguan

Cakupan: 11 brand (Menswear & Womenswear), 7 PIC brand, tim creative, 5 kategori pekerjaan.

## Halaman

| Halaman | Isi |
| --- | --- |
| **Team Backlog** `/backlog` | Papan per anggota bergaya template Mural: On Hold · To Do · Ongoing (Low/Med/High) · Unplanned · Blocker · Done, sticky note per task, bar beban vs kapasitas, update terbaru. Bisa dikelompokkan per anggota, brand, atau divisi. |
| **Dashboard** `/dashboard` | 4 KPI (request masuk, % tepat waktu, rata-rata revisi, task overdue), request per brand, posisi pekerjaan per status, beban per anggota, lama per tahap (tim vs menunggu brand), daftar overdue & mepet, revisi per brand. Filter periode · grup · brand · divisi · anggota. |
| **Tracker** `/tracker` | Tabel semua task: status baku, assignee, "bola di siapa", deadline, sisa hari. Tab: terkait saya, bola di saya, overdue, URGENT, selesai. |
| **Request** `/requests` | Antrian cek brief untuk Traffic, request per status, detail brief, riwayat status, log WA. |
| **Request baru** `/requests/new` | Form pengajuan dengan field wajib per kategori (jumlah SKU untuk foto, durasi & rasio untuk video, dst.) dan deteksi URGENT otomatis. |
| **Task** `/tasks/[id]` | Aksi sesuai peran & status: assign, upload draft per versi, QC lead, review ACC/REV, upload final, tutup tiket, ubah prioritas. |
| **Panduan** `/panduan` | Alur kerja, format balasan WA, peran, 11 status, routing & SLA. |

## Alur

```
PIC brand isi form ──► ID tiket + WA ke PIC & Traffic (URGENT → Creative Head)
Traffic cek brief ──► kurang: kembali ke PIC (WA) ─┐
                 └──► lengkap: routing → task per divisi → WA ke lead (dan assignee bila otomatis)
Lead assign ──► Tim produksi upload draft v1 ──► QC lead ──► belum lolos: kembali ke produksi
                                                       └──► lolos: WA ke PIC "balas ACC/REV"
PIC balas REV (WA/web) ──► kembali ke produksi (ronde revisi dicatat; > batas → Traffic & Creative Head)
PIC balas ACC ──► assignee upload file final ──► WA ke PIC & Traffic ──► Traffic tutup tiket ──► dashboard
```

**11 status baku**: Baru · Brief Kurang · Siap Assign · Dikerjakan · QC Lead · Revisi Internal · Review Brand · Revisi Brand · ACC · Final · Selesai. Setiap perpindahan dicatat di tab `Status` (dipakai untuk "lama per tahap") dan setiap pesan WA di tab `Log_WA`.

**Routing otomatis**: brand → grup → Traffic & Creative Head; kategori → divisi & lead. Fotoshoot dipecah jadi task Foto + Styling. Desain grafis otomatis ke desainer dengan task aktif paling sedikit (lead tetap bisa mengganti). 3D/Motion langsung ke Habibi Al Huda. Semua diatur di tab `Master_Kategori`.

## Struktur Google Sheets

| Tab | Isi | Diubah oleh |
| --- | --- | --- |
| `Request` | Satu baris per request (brief lengkap, status, deadline) | Aplikasi |
| `Task` | Satu baris per task divisi (assignee, status, draft, revisi, final) | Aplikasi |
| `Status` | Log setiap perpindahan status | Aplikasi |
| `Log_WA` | Semua pesan WA keluar/masuk dan hasil kirimnya | Aplikasi |
| `Master_Grup` | Grup → Traffic, Creative Head | Admin |
| `Master_Brand` | 11 brand, kode, grup | Admin |
| `Master_PIC` | PIC brand: email login, **No WA** | Admin |
| `Master_Tim` | Tim creative: peran, divisi, lead/intern, kapasitas, **No WA**, email login | Admin |
| `Master_Kategori` | Routing kategori → divisi → lead, mode assign, lead time minimum, buffer review | Admin |
| `Master_Libur` | Tanggal libur (tidak dihitung hari kerja) | Admin |
| `Config` | Prefix tiket, hari reminder, batas revisi, eskalasi, admin | Admin |

> Aplikasi membaca kolom berdasarkan **nama header**. Urutan kolom boleh diubah, nama header jangan.
> Data yang perlu dilengkapi sebelum go-live: **No WA dan email** semua orang, serta **anggota tim creative lainnya** (sampai 38 orang) di `Master_Tim`.

## Coba lokal (mode demo)

Mode demo memakai data contoh di memori (±6 minggu aktivitas hasil simulasi) dan login dengan memilih persona, tanpa Google atau WhatsApp.

```bash
npm install
npm run demo          # http://localhost:3000
```

## Deploy ke Vercel

### 1. Service account untuk Google Sheets

1. Buka [Google Cloud Console](https://console.cloud.google.com/), buat/pilih project.
2. **APIs & Services → Library** → aktifkan **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create**. Setelah dibuat, buka tab **Keys → Add key → JSON**, lalu unduh.
4. Buka spreadsheet `DB_backlog` → **Share** → tambahkan email service account (`…@….iam.gserviceaccount.com`) sebagai **Editor**.

### 2. Login Google (OAuth)

1. **APIs & Services → OAuth consent screen**: tipe **External** (agar email admin di luar heymale.id, mis. `dodi.wahyono@worldwhiteenterprise.com`, juga bisa masuk), lalu **Publish app**. Aplikasi tetap hanya menerima email `@heymale.id`, email di `Config → ADMIN_EMAILS`, dan email yang terdaftar di `Master_PIC` / `Master_Tim`.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Authorized redirect URI: `https://<domain-vercel-kamu>/api/auth/callback/google` (tambahkan juga `http://localhost:3000/api/auth/callback/google` untuk lokal).

### 3. Import ke Vercel

1. [vercel.com/new](https://vercel.com/new) → import repo `martech-sys/Backlog` (framework otomatis terdeteksi: Next.js).
2. Isi **Environment Variables** sesuai [`.env.example`](.env.example):

| Variabel | Isi |
| --- | --- |
| `SPREADSHEET_ID` | `1THrfMECihSohopWwCfgL91mGP5RsUl8YTBRW01VUbSE` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` dari file JSON |
| `GOOGLE_PRIVATE_KEY` | `private_key` dari file JSON (tempel apa adanya) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | dari langkah 2 |
| `NEXTAUTH_SECRET` | hasil `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://<domain-vercel-kamu>` |
| `ALLOWED_DOMAINS` | `heymale.id` |
| `WA_PROVIDER`, `WA_TOKEN` | dari gateway WA (langkah 4); biarkan `WA_DRY_RUN=true` selama uji coba |
| `WEBHOOK_KEY` | string acak, untuk mengamankan webhook WA |
| `CRON_SECRET` | string acak; Vercel memakainya untuk memanggil cron |

3. **Deploy**. Cek `https://<domain>/api/health`: semua nilai harus `true` / sesuai.

### 4. WhatsApp gateway

**Fonnte** (disarankan): daftar di [fonnte.com](https://fonnte.com), hubungkan nomor khusus bot, salin **token device** ke `WA_TOKEN`. Di pengaturan device, isi **Webhook** dengan:

```
https://<domain-vercel-kamu>/api/wa/webhook?key=<WEBHOOK_KEY>
```

**Wablas**: set `WA_PROVIDER=wablas`, `WA_API_URL=https://<server>.wablas.com/api/send-message`, token di `WA_TOKEN`, dan webhook ke URL yang sama.

Setelah nomor WA di `Master_PIC`/`Master_Tim` lengkap dan uji coba aman, ubah `WA_DRY_RUN=false` lalu redeploy.

PIC membalas pesan "draft siap direview" dengan:

```
ACC CR-2610-001-1
REV CR-2610-001-1 warna background lebih terang
```

Pakai ID request (`CR-2610-001`) untuk menjawab semua task request itu yang sedang menunggu review. Hanya nomor yang terdaftar di master data yang diproses.

### 5. Jadwal otomatis (sudah diatur di `vercel.json`)

| Cron | Waktu (WIB) | Isi |
| --- | --- | --- |
| `/api/cron/reminders` | setiap hari 07.00 | Reminder H-2, H-1, hari H ke assignee; notifikasi overdue ke assignee & lead (atau PIC bila menunggu ACC); eskalasi ke Creative Head & Head of Creative Production |
| `/api/cron/digest` | Senin–Sabtu 08.00 | Digest pagi untuk Traffic per grup |
| `/api/cron/weekly` | Senin 09.00 | Rekap mingguan untuk Creative Head & Head of Creative Production |

## Peran & hak akses

Peran dibaca dari email login di master data:

| Peran | Dari | Bisa |
| --- | --- | --- |
| PIC brand | `Master_PIC` | Buat request, lengkapi brief, review ACC/REV |
| Traffic | `Master_Tim` Peran = Traffic | Buat request atas nama PIC, cek brief & konfirmasi deadline, review, tutup tiket, ubah prioritas |
| Lead divisi | `Master_Tim` Lead = Ya | Assign/ganti anggota, QC draft, kerjakan task |
| Tim creative | `Master_Tim` lainnya | Upload draft & file final untuk task miliknya |
| Creative Head / Head of Creative Production | `Master_Tim` Peran | Semua pantauan, assign, QC, ubah prioritas, tutup tiket |
| Admin | `Config` → `ADMIN_EMAILS` (saat ini `dodi.wahyono@worldwhiteenterprise.com`; boleh di luar domain kantor) | Semua, termasuk koreksi status |
| Viewer | Email `@heymale.id` lain | Lihat dashboard, backlog, tracker |

## Pengembangan

```bash
npm run lint        # typecheck
npm test            # unit test (routing, hari kerja, alur status, WA, dashboard, adapter Sheets)
npm run build
# E2E: jalankan server demo lalu uji alur lengkap lewat browser (butuh Playwright)
DEMO_MODE=true WEBHOOK_KEY=testkey CRON_SECRET=testcron npm run build
DEMO_MODE=true WEBHOOK_KEY=testkey CRON_SECRET=testcron npx next start -p 3100 &
DEMO_MODE=true npm run test:e2e
npm run setup-sheet # buat tab/header yang belum ada di spreadsheet (butuh .env.local)
```

Struktur kode:

```
app/            halaman (App Router), server actions, API (auth, webhook WA, cron, health)
components/     UI bersama + form request
lib/config.ts   skema sheet, 11 status, transisi, kategori & field form, master data awal
lib/service.ts  aksi bisnis (submit, cek brief, assign, draft, QC, review, final, tutup)
lib/routing.ts  routing brand/kategori → divisi/lead, auto-assign, URGENT, ID tiket
lib/backlog.ts  pemetaan task ke papan Team Backlog
lib/dashboard.ts perhitungan KPI dashboard
lib/scheduler.ts reminder, digest, rekap mingguan
lib/webhook.ts  balasan WA ACC/REV
lib/store/      penyimpanan: Google Sheets (produksi) & memori (demo/test)
```

## Catatan

- Lead time minimum dan buffer review di `Master_Kategori` adalah angka awal (Fotoshoot 7, Desain 3, Video 5, Moodboard 2, 3D/Motion 7 hari kerja). Sesuaikan dengan SLA tim.
- Tipe campaign (Big/Medium/Small/Always-on) adalah usulan awal; ubah di `lib/config.ts` (`CAMPAIGN_TYPES`) bila klasifikasi budget berbeda.
- Lampiran diisi berupa link Google Drive (bukan upload file langsung).
- Google Sheets cocok untuk volume tim ini (ratusan request/bulan). Bila volume tumbuh jauh, lapisan `lib/store` bisa diganti database lain tanpa mengubah halaman.
