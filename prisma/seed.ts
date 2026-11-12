import 'dotenv/config';
import { ALL_FEATURES, MODULE_MAP } from '../src/core/registry';
import { db } from '../src/server/db';

/** Mirrors the feature registry into the `features` table (idempotent). Run: npm run db:seed */
async function main() {
  const prisma = db();
  for (const f of ALL_FEATURES) {
    const data = { moduleId: f.moduleId, name: f.name, category: MODULE_MAP[f.moduleId].category, status: f.status, description: f.description, dependencies: f.deps ?? [] };
    await prisma.feature.upsert({ where: { id: f.id }, create: { id: f.id, ...data }, update: data });
  }
  const removed = await prisma.feature.deleteMany({ where: { id: { notIn: ALL_FEATURES.map((f) => f.id) } } });
  console.log(`features: ${ALL_FEATURES.length} upserted, ${removed.count} removed`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
