import type { RequestRow, TaskRow } from './config';
import { formatTanggal } from './dates';
import { env } from './env';

const link = (path: string) => `${env.appUrl}${path}`;
const reqLink = (id: string) => link(`/requests/${encodeURIComponent(id)}`);
const taskLink = (id: string) => link(`/tasks/${encodeURIComponent(id)}`);
const urgentTag = (u: string) => (u === 'Ya' ? ' 🔴 *URGENT*' : '');

function taskLine(t: Pick<TaskRow, 'Task ID' | 'Brand' | 'Kategori' | 'Divisi'>): string {
  return `*${t['Task ID']}* · ${t.Brand} · ${t.Kategori} (${t.Divisi})`;
}

export const msg = {
  requestReceived: (r: RequestRow) =>
    `✅ *Request diterima*\nID tiket: *${r['Request ID']}*\nBrand: ${r.Brand}\nCampaign: ${r['Campaign Name']}\nKategori: ${r.Kategori}\nDue date: ${formatTanggal(r['Due Date'])}${urgentTag(r.Urgent)}\n\nTraffic (${r.Traffic}) akan mengecek kelengkapan brief.\nPantau: ${reqLink(r['Request ID'])}`,

  newRequestTraffic: (r: RequestRow) =>
    `📥 *Request baru masuk*${urgentTag(r.Urgent)}\n*${r['Request ID']}* · ${r.Brand}\nPIC: ${r['PIC Brand']}\nCampaign: ${r['Campaign Name']}\nKategori: ${r.Kategori}\nDue date: ${formatTanggal(r['Due Date'])}${r.Urgent === 'Ya' ? `\n⚠️ Waktu kurang dari lead time minimum (${r['Lead Time Min (hari kerja)']} hari kerja).` : ''}\n\nCek brief: ${reqLink(r['Request ID'])}`,

  urgentHead: (r: RequestRow) =>
    `🔴 *Request URGENT*\n*${r['Request ID']}* · ${r.Brand} · ${r.Kategori}\nDue date: ${formatTanggal(r['Due Date'])} (lead time minimum ${r['Lead Time Min (hari kerja)']} hari kerja)\nDetail: ${reqLink(r['Request ID'])}`,

  briefKurang: (r: RequestRow, note: string) =>
    `📝 *Brief perlu dilengkapi*\n*${r['Request ID']}* · ${r.Brand} · ${r['Campaign Name']}\nCatatan Traffic: ${note || '-'}\n\nLengkapi brief di: ${reqLink(r['Request ID'])}`,

  briefResubmitted: (r: RequestRow) =>
    `🔁 *Brief sudah dilengkapi*\n*${r['Request ID']}* · ${r.Brand}\nPIC: ${r['PIC Brand']}\nCek ulang: ${reqLink(r['Request ID'])}`,

  newTaskLead: (t: TaskRow, r: RequestRow) =>
    `🆕 *Task baru di divisi ${t.Divisi}*${urgentTag(t.Urgent)}\n${taskLine(t)}\nCampaign: ${r['Campaign Name']}\nDeadline: ${formatTanggal(t.Deadline)} · target draft ${formatTanggal(t['Target Draft'])}\n${t.Assignee ? `Auto-assign ke *${t.Assignee}* (bisa diganti).` : 'Silakan pilih anggota.'}\n${taskLink(t['Task ID'])}`,

  taskAssigned: (t: TaskRow, r: RequestRow) =>
    `🎯 *Tugas baru untukmu*${urgentTag(t.Urgent)}\n${taskLine(t)}\nCampaign: ${r['Campaign Name']}\nSub-jenis: ${t['Sub-jenis'] || '-'}\nDeliverables: ${r.Deliverables || '-'}\nTarget draft: ${formatTanggal(t['Target Draft'])}\nDeadline: ${formatTanggal(t.Deadline)}\n\nBrief & upload draft: ${taskLink(t['Task ID'])}`,

  draftForQc: (t: TaskRow) =>
    `🔍 *Draft menunggu QC*\n${taskLine(t)}\nOleh: ${t.Assignee} · versi ${t['Versi Draft']}\nDraft: ${t['Link Draft']}\nQC: ${taskLink(t['Task ID'])}`,

  qcFailed: (t: TaskRow, note: string) =>
    `↩️ *Draft belum lolos QC*\n${taskLine(t)}\nCatatan ${t.Lead}: ${note || '-'}\nUpload versi baru: ${taskLink(t['Task ID'])}`,

  reviewToPic: (t: TaskRow, r: RequestRow) =>
    `👀 *Draft siap direview*\n${taskLine(t)}\nCampaign: ${r['Campaign Name']}\nDraft v${t['Versi Draft']}: ${t['Link Draft']}\n\nBalas pesan ini dengan:\n• *ACC ${t['Task ID']}* bila disetujui\n• *REV ${t['Task ID']} <catatan revisi>* bila perlu revisi\n\nAtau lewat web: ${taskLink(t['Task ID'])}`,

  revisionToTeam: (t: TaskRow, note: string, ronde: number) =>
    `✏️ *Revisi dari brand (ronde ${ronde})*\n${taskLine(t)}\nCatatan PIC (${t['PIC Brand']}): ${note || '-'}\nDeadline: ${formatTanggal(t.Deadline)}\n${taskLink(t['Task ID'])}`,

  revisionLimit: (t: TaskRow, ronde: number, max: number) =>
    `⚠️ *Revisi melewati batas*\n${taskLine(t)}\nSudah ${ronde} ronde revisi (batas ${max}). Mohon dicek bersama PIC ${t['PIC Brand']}.\n${taskLink(t['Task ID'])}`,

  accToAssignee: (t: TaskRow) =>
    `🎉 *Draft di-ACC brand*\n${taskLine(t)}\nSilakan upload file final ke Drive dan isi link-nya: ${taskLink(t['Task ID'])}`,

  finalToPic: (t: TaskRow) => `📦 *File final siap*\n${taskLine(t)}\nFile final: ${t['Link Final']}\nTerima kasih!`,

  finalToTraffic: (t: TaskRow) =>
    `📦 *File final diupload*\n${taskLine(t)}\nOleh: ${t.Assignee}\nTutup tiket: ${taskLink(t['Task ID'])}`,

  requestDone: (r: RequestRow) =>
    `🏁 *Tiket selesai*\n*${r['Request ID']}* · ${r.Brand} · ${r['Campaign Name']}\nSemua task sudah final. Detail: ${reqLink(r['Request ID'])}`,

  priorityChanged: (t: TaskRow, by: string) =>
    `📌 *Prioritas/deadline diubah*\n${taskLine(t)}\nDeadline baru: ${formatTanggal(t.Deadline)}${urgentTag(t.Urgent)}\nDiubah oleh: ${by}\n${taskLink(t['Task ID'])}`,

  reminder: (t: TaskRow, daysLeft: number) =>
    `⏰ *Reminder ${daysLeft === 0 ? 'HARI H' : `H-${daysLeft}`}*\n${taskLine(t)}\nStatus: ${t.Status}\nDeadline: ${formatTanggal(t.Deadline)}\n${taskLink(t['Task ID'])}`,

  overdue: (t: TaskRow, daysLate: number) =>
    `🚨 *Task overdue ${daysLate} hari*\n${taskLine(t)}\nAssignee: ${t.Assignee || '-'} · Status: ${t.Status}\nDeadline: ${formatTanggal(t.Deadline)}\n${taskLink(t['Task ID'])}`,

  escalation: (items: { t: TaskRow; late: number }[]) =>
    `🚨 *Eskalasi overdue* (${items.length} task)\n` +
    items
      .slice(0, 15)
      .map(({ t, late }) => `• ${t['Task ID']} · ${t.Brand} · ${t.Divisi} · ${t.Assignee || 'belum assign'} · lewat ${late} hari · ${t.Status}`)
      .join('\n') +
    (items.length > 15 ? `\n…dan ${items.length - 15} lainnya` : '') +
    `\n\nDashboard: ${link('/dashboard')}`,

  digest: (p: {
    grup: string;
    date: string;
    newRequests: RequestRow[];
    briefKurang: number;
    urgent: number;
    dueToday: TaskRow[];
    overdue: TaskRow[];
    waitingBrand: number;
  }) =>
    `☀️ *Digest pagi ${p.grup}* · ${formatTanggal(p.date)}\n` +
    `• Menunggu cek brief: *${p.newRequests.length}*\n` +
    `• Brief kurang (di PIC): ${p.briefKurang}\n` +
    `• URGENT aktif: ${p.urgent}\n` +
    `• Deadline hari ini: *${p.dueToday.length}*\n` +
    `• Overdue: *${p.overdue.length}*\n` +
    `• Menunggu ACC brand: ${p.waitingBrand}\n` +
    (p.overdue.length
      ? `\nOverdue:\n${p.overdue
          .slice(0, 10)
          .map((t) => `• ${t['Task ID']} · ${t.Brand} · ${t.Assignee || 'belum assign'} · ${t.Status}`)
          .join('\n')}\n`
      : '') +
    (p.dueToday.length
      ? `\nDeadline hari ini:\n${p.dueToday
          .slice(0, 10)
          .map((t) => `• ${t['Task ID']} · ${t.Brand} · ${t.Assignee || 'belum assign'} · ${t.Status}`)
          .join('\n')}\n`
      : '') +
    `\nTracker: ${link('/tracker')}`,

  weekly: (p: {
    scope: string;
    from: string;
    to: string;
    requests: number;
    done: number;
    onTimePct: number | null;
    avgRevisi: number | null;
    overdue: number;
    topBrands: { name: string; count: number }[];
    busiest: { name: string; count: number }[];
  }) =>
    `📊 *Rekap mingguan ${p.scope}*\n${formatTanggal(p.from, false)} – ${formatTanggal(p.to, false)}\n\n` +
    `• Request masuk: *${p.requests}*\n` +
    `• Task selesai: *${p.done}*\n` +
    `• Tepat waktu: *${p.onTimePct === null ? '-' : `${p.onTimePct}%`}*\n` +
    `• Rata-rata revisi: ${p.avgRevisi === null ? '-' : p.avgRevisi.toFixed(1)} ronde/task\n` +
    `• Overdue saat ini: *${p.overdue}*\n` +
    (p.topBrands.length ? `\nBrand teratas: ${p.topBrands.map((b) => `${b.name} (${b.count})`).join(', ')}` : '') +
    (p.busiest.length ? `\nBeban tertinggi: ${p.busiest.map((b) => `${b.name} (${b.count})`).join(', ')}` : '') +
    `\n\nDashboard: ${link('/dashboard')}`,

  waReplyResult: (lines: string[]) => lines.join('\n'),

  waHelp: () =>
    `Format balasan:\n• *ACC <ID task>* — setujui draft\n• *REV <ID task> <catatan>* — minta revisi\n\nContoh: REV CR-2610-001-1 warna background lebih terang`,
};
