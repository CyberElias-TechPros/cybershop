import { requireVendor } from '@/lib/session';
import ItemForm from '../ItemForm';

export const dynamic = 'force-dynamic';

interface SP {
  id: string;
}

export default async function EditListingPage({ params }: { params: Promise<SP> }) {
  await requireVendor();
  const { id } = await params;
  const n = parseInt(id, 10);
  if (!Number.isFinite(n) || n < 1) return <div className="form-msg error">Invalid listing id.</div>;
  return <ItemForm itemId={n} />;
}
