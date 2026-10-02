const fs = require('node:fs');

const css = fs.readFileSync('frontend/css/style.css', 'utf8');
const expect = (label, condition) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}\t${label}`);
  if (!condition) process.exitCode = 1;
};

expect('stats do not use auto-fit', !/\.stats-scroll[\s\S]{0,250}auto-fit/.test(css));
expect('compact stats use four columns', /\.stats-scroll[\s\S]{0,250}repeat\(4, minmax\(0,\s*1fr\)\)/.test(css));
expect('wide stats use eight columns', /\.stats-scroll[\s\S]{0,250}repeat\(8, minmax\(0,\s*1fr\)\)/.test(css));
expect('stats have no top or left outer border', !/\.stats-scroll\s*\{[\s\S]{0,250}border-(?:top|left)\s*:/.test(css));
expect('stat chips have no right or bottom border', !/\.stat-chip[\s\S]{0,250}border-(?:right|bottom)\s*:/.test(css));
expect('stat hover rule removed', !/\.stat-chip:hover/.test(css));
expect('only later stat chips have left separators', /\.stat-chip\s*\+\s*\.stat-chip\s*\{[\s\S]{0,120}border-left\s*:/.test(css));

if (process.exitCode) process.exit(1);
