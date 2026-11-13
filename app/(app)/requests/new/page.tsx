import { redirect } from 'next/navigation';
import { submitRequestAction } from '@/app/actions';
import { RequestForm } from '@/components/RequestForm';
import { categoryDefs } from '@/lib/categories';
import { now } from '@/lib/clock';
import { todayWib } from '@/lib/dates';
import { EMPTY_DEFAULTS } from '@/lib/requestForm';
import { getDb, requireUser } from '@/lib/session';
import { can } from '@/lib/workflow';

export const metadata = { title: 'Request baru' };

export default async function NewRequestPage() {
  const user = await requireUser();
  if (!can.submitRequest(user)) redirect('/requests?err=' + encodeURIComponent('Akunmu belum terdaftar sebagai PIC brand atau Traffic.'));
  const db = await getDb();
  const isPic = user.roles.includes('pic');
  // Admin/Traffic/Head yang juga PIC tetap boleh mengajukan atas nama PIC lain.
  const canChoosePic = user.roles.some((r) => ['admin', 'superadmin', 'traffic', 'head', 'hocp'].includes(r));
  const leadTimes: Record<string, number> = {};
  for (const k of db.master.kategori.filter((x) => x.active)) leadTimes[k.kategori] = Math.max(leadTimes[k.kategori] || 0, k.leadTimeMin);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="page-head">
        <div>
          <h1>Request konten baru</h1>
          <p>Satu form untuk semua brand. Setelah dikirim, kamu dapat ID tiket lewat WhatsApp dan Traffic akan mengecek brief.</p>
        </div>
      </div>
      <div className="card">
        <RequestForm
          action={submitRequestAction}
          brands={db.master.brands.filter((b) => b.active).map((b) => ({ name: b.name, grup: b.grup }))}
          pics={db.master.people
            .filter((p) => p.active && p.roles.includes('pic'))
            .map((p) => ({ name: p.name, grup: p.grup, brands: p.brands }))}
          choosePic={!isPic || canChoosePic}
          currentUser={user.name}
          defaults={isPic ? { ...EMPTY_DEFAULTS, picName: user.name } : EMPTY_DEFAULTS}
          today={todayWib(now())}
          submitLabel="Kirim request"
          leadTimes={leadTimes}
          categories={categoryDefs(db.master).map(({ name, subTypes, fields }) => ({ name, subTypes, fields }))}
        />
      </div>
    </div>
  );
}
