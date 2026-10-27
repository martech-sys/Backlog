import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isManager = user.roles.some((r) => ['admin', 'hocp', 'head', 'viewer'].includes(r));
  // Teruskan pesan sukses/gagal (mis. setelah ganti password) ke halaman tujuan.
  const flash = new URLSearchParams(Object.entries(sp).filter(([k, v]) => (k === 'ok' || k === 'err') && v) as [string, string][]);
  const q = flash.toString() ? `?${flash}` : '';
  redirect(`${isManager ? '/dashboard' : '/backlog'}${q}`);
}
