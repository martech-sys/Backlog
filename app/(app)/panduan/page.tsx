import { BOARD_COLORS } from '@/lib/backlog';
import { BALL_OWNER, STATUS_ORDER } from '@/lib/config';
import { getDb, requireUser } from '@/lib/session';
import { StatusBadge } from '@/components/ui';

export const metadata = { title: 'Panduan' };

const ROLES = [
  {
    role: 'PIC brand',
    who: 'Dennis, Aliza, Brama (Menswear); Dea, Tiwi, Zahra, Mey (Womenswear)',
    tasks: 'Isi form request; lengkapi brief bila diminta; review draft lalu balas ACC atau REV (di web atau WhatsApp).',
    wa: 'Request diterima + ID tiket; brief perlu dilengkapi; draft siap direview; file final siap.',
  },
  {
    role: 'Traffic',
    who: 'Evi (Menswear), Nadia Syifa (Womenswear)',
    tasks: 'Cek kelengkapan brief dan konfirmasi deadline; pantau tiket grupnya; tutup tiket setelah file final.',
    wa: 'Request baru; request URGENT; task overdue; digest pagi.',
  },
  {
    role: 'Lead divisi',
    who: 'Hamzah Benoti & Ahmad Husen (foto), Aulia Pramudya (desain, moodboard, 3D), Ilham Almando (video), Salsa Rosyidah (styling)',
    tasks: 'Assign anggota (desain dipilih otomatis, bisa diganti); QC draft sebelum dikirim ke brand.',
    wa: 'Task baru di divisinya; draft menunggu QC; task anggota overdue.',
  },
  {
    role: 'Tim creative',
    who: 'Photographer, photo editor, designer, videographer, stylist, assistant studio, intern',
    tasks: 'Kerjakan task; upload link draft per versi; kerjakan revisi; upload link file final.',
    wa: 'Tugas baru; reminder H-2, H-1, hari H; catatan revisi masuk.',
  },
  {
    role: 'Creative Head & Head of Creative Production',
    who: 'Ammar Habibullah, Abdul Malik, Daniel Pranata',
    tasks: 'Pantau dashboard; ubah prioritas/deadline bila bentrok.',
    wa: 'Eskalasi overdue; rekap mingguan.',
  },
];

export default async function PanduanPage() {
  await requireUser();
  const db = await getDb();
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <h1>Panduan</h1>
          <p>Alur dari form sampai final: siapa mengerjakan apa di tiap tahap.</p>
        </div>
      </div>

      <h2 className="section-title">
        <span className="num">1</span> Alur kerja
      </h2>
      <div className="frame">
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          <li>
            <b>PIC brand</b> mengisi form request → sistem membuat <b>ID tiket</b> dan mengabari PIC & Traffic lewat WA.
          </li>
          <li>
            <b>Traffic</b> mengecek brief. Kurang → kembali ke PIC. Lengkap → sistem memecah request jadi task per divisi (routing otomatis).
          </li>
          <li>
            <b>Lead divisi</b> memilih anggota (desain grafis dipilih otomatis ke desainer dengan beban paling ringan).
          </li>
          <li>
            <b>Tim creative</b> mengerjakan dan meng-upload link draft → <b>QC lead</b>. Belum lolos → kembali ke produksi.
          </li>
          <li>
            Lolos QC → <b>PIC brand</b> review dan balas <b>ACC</b> atau <b>REV</b>. REV → kembali ke produksi (revisi tercatat per ronde).
          </li>
          <li>
            ACC → assignee upload <b>file final</b> ke Drive → <b>Traffic</b> menutup tiket → masuk dashboard.
          </li>
        </ol>
      </div>

      <h2 className="section-title">
        <span className="num">2</span> Balas lewat WhatsApp
      </h2>
      <div className="frame">
        <p style={{ marginTop: 0 }}>Saat draft siap direview, PIC menerima pesan WA dan cukup membalas:</p>
        <pre className="pre" style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 4 }}>
          {`ACC CR-2610-001-1\nREV CR-2610-001-1 warna background lebih terang, logo diperbesar`}
        </pre>
        <p className="muted">Pakai ID request (mis. CR-2610-001) untuk menjawab semua task request itu yang sedang menunggu review sekaligus.</p>
      </div>

      <h2 className="section-title">
        <span className="num">3</span> Peran
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Peran</th>
              <th>Orang</th>
              <th>Tugas di sistem</th>
              <th>Notifikasi WA</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((r) => (
              <tr key={r.role}>
                <td className="title">{r.role}</td>
                <td>{r.who}</td>
                <td>{r.tasks}</td>
                <td>{r.wa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">
        <span className="num">4</span> 11 status baku
      </h2>
      <div className="frame">
        <div className="row" style={{ gap: 10 }}>
          {STATUS_ORDER.map((s, i) => (
            <span key={s} className="row" style={{ gap: 4 }}>
              <span className="subtle">{i + 1}.</span> <StatusBadge status={s} />
              <span className="subtle">bola di {BALL_OWNER[s]}</span>
            </span>
          ))}
        </div>
      </div>

      <h2 className="section-title">
        <span className="num">5</span> Routing & SLA
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Divisi</th>
              <th>Lead Menswear</th>
              <th>Lead Womenswear</th>
              <th>Assign</th>
              <th>Lead time min</th>
              <th>Buffer review</th>
            </tr>
          </thead>
          <tbody>
            {db.master.kategori.map((k, i) => (
              <tr key={i}>
                <td>
                  <span className="badge" style={{ background: BOARD_COLORS[i % 10], color: '#fff' }}>
                    {k.kategori}
                  </span>
                </td>
                <td>{k.divisi}</td>
                <td>{k.leadMenswear}</td>
                <td>{k.leadWomenswear}</td>
                <td>
                  {k.modeAssign}
                  {k.assigneeDefault ? ` → ${k.assigneeDefault}` : ''}
                </td>
                <td>{k.leadTimeMin} hari kerja</td>
                <td>{k.bufferReview} hari kerja</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="subtle">Ubah routing, SLA, tim, dan nomor WA langsung di Google Sheets (tab Master_*). Perubahan langsung terbaca aplikasi.</p>
    </div>
  );
}
