// Writes the dependency table in docs/LICENSES.md from the installed packages. Run: npm run licenses
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const row = (name, dev) => {
  const p = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));
  const repo = typeof p.repository === 'string' ? p.repository : (p.repository?.url ?? '');
  const url = repo.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://').replace(/^github:/, 'https://github.com/') || p.homepage || '';
  return `| ${name} | ${p.version} | ${typeof p.license === 'string' ? p.license : JSON.stringify(p.license ?? 'see package')} | ${dev ? 'build / test only' : 'shipped'} | ${url} |`;
};
const table = ['| Package | Version | Licence | Use | Source |', '| --- | --- | --- | --- | --- |', ...Object.keys(pkg.dependencies).sort().map((n) => row(n, false)), ...Object.keys(pkg.devDependencies).sort().map((n) => row(n, true))].join('\n');
const path = 'docs/LICENSES.md';
const doc = readFileSync(path, 'utf8');
const start = '<!-- deps:start -->';
const end = '<!-- deps:end -->';
writeFileSync(path, doc.slice(0, doc.indexOf(start) + start.length) + '\n' + table + '\n' + doc.slice(doc.indexOf(end)));
console.log('docs/LICENSES.md updated');
