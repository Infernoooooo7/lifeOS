import type { Metadata } from 'next';
import { AppRoot } from '@/shell/AppRoot';

export const metadata: Metadata = { title: 'Workspace' };

// The whole product is one statically generated document: the client shell reads data from
// IndexedDB and navigates with the History API, so it loads and works from the offline cache.
export const dynamic = 'force-static';
export const dynamicParams = true;
export function generateStaticParams() {
  return [{ path: [] }];
}

export default function AppPage() {
  return <AppRoot />;
}
