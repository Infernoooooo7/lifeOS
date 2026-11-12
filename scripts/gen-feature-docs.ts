import { writeFileSync } from 'node:fs';
import { MODULES, STATUS_LABEL, featureCounts, type FeatureStatus } from '../src/core/registry';

/** Generates docs/FEATURES.md from the registry, so the document can never drift from the app. Run: npm run docs:features */
const counts = featureCounts();
const mark: Record<FeatureStatus, string> = { implemented: '✅', partial: '🟡', integration: '🔌', planned: '🗓️' };
const lines: string[] = [
  '# LIFEOS feature inventory',
  '',
  '> Generated from `src/core/registry.ts` by `npm run docs:features`. Do not edit by hand.',
  '',
  `**${counts.total} capabilities in ${MODULES.length} modules** — ${counts.implemented} implemented, ${counts.partial} partial, ${counts.integration} integration-dependent, ${counts.planned} planned.`,
  '',
  '| Status | Meaning |',
  '| --- | --- |',
  '| ✅ Implemented | Works today, end to end |',
  '| 🟡 Partial | Usable, with the limitation stated in the note |',
  '| 🔌 Needs integration | Built up to the point where an external account or credential is required |',
  '| 🗓️ Planned | Not built; shown in the app as planned, never as working |',
  '',
  '## Summary',
  '',
  '| Module | Category | Implemented | Partial | Integration | Planned |',
  '| --- | --- | ---: | ---: | ---: | ---: |',
];
for (const m of MODULES) {
  const c = (s: FeatureStatus) => m.features.filter((f) => f.status === s).length;
  lines.push(`| ${m.name} | ${m.category} | ${c('implemented')} | ${c('partial')} | ${c('integration')} | ${c('planned')} |`);
}
for (const m of MODULES) {
  lines.push('', `## ${m.name}`, '', `_${m.tagline}._ Module id \`${m.id}\`${m.core ? ' · always on' : m.defaultOn ? ' · on by default' : ''}${m.deps?.length ? ` · builds on ${m.deps.join(', ')}` : ''}`, '', '| | Capability | Description | Id |', '| --- | --- | --- | --- |');
  for (const f of m.features) lines.push(`| ${mark[f.status]} | ${f.name} | ${f.description}${f.note ? ` _${STATUS_LABEL[f.status]}: ${f.note}_` : ''} | \`${f.id}\` |`);
}
writeFileSync('docs/FEATURES.md', lines.join('\n') + '\n');
console.log(`docs/FEATURES.md written: ${counts.total} capabilities (${counts.implemented} implemented)`);
