import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: {
    // The CLI (migrations) prefers a direct / session-mode connection: transaction poolers such as Supabase's
    // port 6543 cannot run migrations. The app itself always connects with DATABASE_URL (src/server/db.ts).
    // `prisma generate` must work without a database (CI, first install).
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
