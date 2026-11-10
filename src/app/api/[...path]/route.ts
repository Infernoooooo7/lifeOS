import { handle } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
