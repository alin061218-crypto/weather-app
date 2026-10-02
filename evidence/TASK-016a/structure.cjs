const fs = require('node:fs');
const icons = fs.readFileSync('frontend/js/icons.js', 'utf8');
const main = fs.readFileSync('frontend/js/main.js', 'utf8');
const html = fs.readFileSync('frontend/index.html', 'utf8');
const atmosphere = fs.readFileSync('frontend/js/atmosphere.js', 'utf8');
const css = fs.readFileSync('frontend/css/style.css', 'utf8');

const check = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}\t${label}`);
  if (!ok) process.exitCode = 1;
};

check('WMO map explicitly lists all 28 codes', /WMO_ICON_MAP/.test(icons) && (icons.match(/\b(?:0|1|2|3|45|48|51|53|55|56|57|61|63|65|66|67|71|73|75|77|80|81|82|85|86|95|96|99)\b/g) || []).length >= 28);
check('WMO 61 uses light rain', /61\s*:\s*'rainLight'/.test(icons));
check('cloud paths are closed', (icons.match(/<path d="[^"]*[zZ]"/g) || []).length >= 4);
check('24h chart spans the weather view', /\.chart-section[\s\S]{0,100}grid-column:\s*1\s*\/\s*-1/.test(css));
check('24h chart is before daily in markup', html.indexOf('chart-section') < html.indexOf('daily-section'));
check('fingerprint renderer exists', /renderTemperatureFingerprint|temperature-fingerprint/.test(main));
check('fingerprint uses fixed standard anchors', /#efff2d/.test(main) && /#80419d/.test(main) && /#fe130c/.test(main));
check('chart axes use secondary token and 12px', /--ink-secondary/.test(main) && /12px system-ui/.test(main));
check('chart tips are not clipped and axes use tabular numerals', /\.chart-wrap[\s\S]{0,220}overflow:\s*visible/.test(css) && /font-variant-numeric:\s*tabular-nums/.test(css));
check('reduced motion is handled in atmosphere', /prefers-reduced-motion/.test(atmosphere));
check('storm particle count is below 200', !/storm\s*\?\s*2[0-9][0-9]/.test(atmosphere));
const skeletonList = html.match(/<div class="skeleton-list"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
check('skeleton list mirrors seven forecast rows', (skeletonList.match(/<span>/g) || []).length === 7);
check('static search message has no interactive hover affordance', /search-message/.test(main) && !/\.advice-chip:hover/.test(css));

if (process.exitCode) process.exit(1);
