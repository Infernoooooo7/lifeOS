import type { Metadata } from 'next';
import { AppRoot } from '@/shell/AppRoot';

export const metadata: Metadata = { title: 'Reset password' };

export default function ResetPage() {
  return <AppRoot authMode="reset" />;
}
