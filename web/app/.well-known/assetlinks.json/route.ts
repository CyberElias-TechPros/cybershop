import { assetLinksResponse } from '@/lib/android-association.mjs';
export const dynamic = 'force-dynamic';
export function GET() { return assetLinksResponse(process.env); }
