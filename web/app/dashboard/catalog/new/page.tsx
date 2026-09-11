import { requireVendor } from '@/lib/session';
import ItemForm from '../ItemForm';

export const dynamic = 'force-dynamic';

export default async function NewListingPage() {
  await requireVendor();
  return <ItemForm />;
}
