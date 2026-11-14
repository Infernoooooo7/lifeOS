import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

const globalForPrisma = globalThis as unknown as { __lifeosPrisma?: PrismaClient };

function create(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Small pool: serverless instances each hold their own pool.
  // A long-lived server keeps warm connections for a minute (each new TLS connection costs a few round trips);
  // DB_IDLE_MS lowers this on serverless hosts so sleeping instances do not hold a pooler's connections.
  const adapter = new PrismaPg({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idleTimeoutMillis: Number(process.env.DB_IDLE_MS ?? 60_000),
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

/** Lazily created so that importing this module never requires a database (build, unit tests). */
export function db(): PrismaClient {
  if (!globalForPrisma.__lifeosPrisma) globalForPrisma.__lifeosPrisma = create();
  return globalForPrisma.__lifeosPrisma;
}

export type Db = PrismaClient;
