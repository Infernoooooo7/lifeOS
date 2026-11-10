'use client';

import { Page, type ModuleProps } from '@/shell/Page';

const stub = (id: string) => function Stub(_: ModuleProps) {
  return <Page module={id}>Loading…</Page>;
};
export const Shopping = stub('shopping');
export const Travel = stub('travel');
export const Documents = stub('files');
export const Entertainment = stub('entertainment');
export const Digital = stub('digital');
export const Admin = stub('admin');
