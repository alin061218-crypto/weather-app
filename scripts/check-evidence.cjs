const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'evidence');
const pattern = /(main\.js\?v=[0-9a-f]|style\.css\?v=[0-9a-f])/i;
const hits = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(?:cjs|ps1|js)$/i.test(entry.name)) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        if (pattern.test(line) && !(/TASK-016b[\\/]importmap\.cjs$/.test(file) && /v=00000000/.test(line))) hits.push(`${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`);
      });
    }
  }
}
walk(root);
if (hits.length) { console.error(hits.join('\n')); process.exit(1); }
console.log('PASS: no hard-coded asset version strings in evidence scripts (00000000 negative fixture excluded)');
