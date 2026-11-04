import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { updateBriefAction } from '@/app/actions';
import { RequestForm } from '@/components/RequestForm';
import { REQUEST_STATUS } from '@/lib/config';
import { now } from '@/lib/clock';
import { todayWib } from '@/lib/dates';
import { findRequest } from '@/lib/db';
import { defaultsFromRequest } from '@/lib/requestForm';
import { getDb, requireUser } from '@/lib/session';
import { can } from '@/lib/workflow';

export const metadata = { title: 'Lengkapi brief' };

export default async function EditBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = decodeURIComponent((await params).id);
  const db = await getDb();
  const r = findRequest(db, id);
  if (!r) notFound();
  const editable = r.Status === REQUEST_STATUS.BRIEF_KURANG || r.Status === REQUEST_STATUS.BARU;
  if (!can.editBrief(user, r) || !editable) {
    redirect(`/requests/${encodeURIComponent(id)}?err=${encodeURIComponent('Brief ini tidak bisa diubah lagi.')}`);
  }
  const leadTimes: Record<string, number> = {};
  for (const k of db.master.kategori) leadTimes[k.kategori] = Math.max(leadTimes[k.kategori] || 0, k.leadTimeMin);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <Link href={`/requests/${encodeURIComponent(id)}`} className="subtle">
            ← {id}
          </Link>
          <h1>{r.Status === REQUEST_STATUS.BRIEF_KURANG ? 'Lengkapi brief' : 'Edit brief'}</h1>
          {r['Catatan Traffic'] ? <p>Catatan Traffic: {r['Catatan Traffic']}</p> : null}
        </div>
      </div>
      <div className="card">
        <RequestForm
          action={updateBriefAction.bind(null, id)}
          brands={db.master.brands.map((b) => ({ name: b.name, grup: b.grup }))}
          pics={[]}
          choosePic={false}
          currentUser={r['PIC Brand']}
          defaults={defaultsFromRequest(r)}
          lockBrand
          today={todayWib(now())}
          submitLabel={r.Status === REQUEST_STATUS.BRIEF_KURANG ? 'Kirim ulang ke Traffic' : 'Simpan perubahan'}
          leadTimes={leadTimes}
        />
      </div>
    </div>
  );
}
