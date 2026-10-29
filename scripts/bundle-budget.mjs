// Fails CI if the JavaScript sent on first load (or any lazy chunk) grows past budget.
// Run after `npm run build`. Numbers are gzipped kilobytes.
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET = { initialKb: 190, chunkKb: 65 };
const dir = 'dist/assets';
const html = readFileSync('dist/index.html', 'utf8');
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
let initial = 0;
const over = [];
for (const f of files) {
  const kb = gzipSync(readFileSync(`${dir}/${f}`)).length / 1024;
  if (html.includes(f)) initial += kb;
  else if (kb > BUDGET.chunkKb) over.push(`${f} is ${kb.toFixed(1)}KB (budget ${BUDGET.chunkKb}KB)`);
}
console.log(`Initial JavaScript: ${initial.toFixed(1)}KB gzipped (budget ${BUDGET.initialKb}KB)`);
if (initial > BUDGET.initialKb) over.push(`initial JavaScript is ${initial.toFixed(1)}KB`);
if (over.length) {
  console.error(`Over budget:\n- ${over.join('\n- ')}`);
  process.exit(1);
}
console.log('Within budget.');
