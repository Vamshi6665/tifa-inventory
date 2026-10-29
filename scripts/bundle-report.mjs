// Summarise what each built JS chunk contains (from source maps). Run after a build.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const dir = 'dist/assets';
const html = readFileSync('dist/index.html', 'utf8');
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
const rows = [];
for (const f of files) {
  const code = readFileSync(`${dir}/${f}`);
  const gz = gzipSync(code).length;
  let top = [];
  try {
    const map = JSON.parse(readFileSync(`${dir}/${f}.map`, 'utf8'));
    const by = new Map();
    map.sources.forEach((s, i) => {
      const pkg = s.includes('node_modules') ? s.split('node_modules/').pop().split('/').slice(0, s.split('node_modules/').pop().startsWith('@') ? 2 : 1).join('/') : 'app:' + s.replace(/^.*src\//, '').split('/').slice(0, 2).join('/');
      by.set(pkg, (by.get(pkg) ?? 0) + (map.sourcesContent?.[i]?.length ?? 0));
    });
    top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${Math.round(v / 1024)}k`);
  } catch {}
  rows.push({ f, kb: Math.round(statSync(`${dir}/${f}`).size / 1024), gz: Math.round(gz / 1024), initial: html.includes(f), top });
}
rows.sort((a, b) => b.kb - a.kb);
for (const r of rows.slice(0, 14)) console.log(`${r.initial ? 'INITIAL' : '  lazy '} ${String(r.kb).padStart(4)}KB (${String(r.gz).padStart(3)}KB gz) ${r.f.padEnd(34)} ${r.top.join(', ')}`);
const initial = rows.filter((r) => r.initial);
console.log(`\nInitial JS: ${initial.reduce((n, r) => n + r.gz, 0)}KB gzipped across ${initial.length} files`);
