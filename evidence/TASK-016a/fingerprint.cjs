const fs = require('node:fs');
const source = fs.readFileSync('frontend/js/main.js', 'utf8');

const check = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}\t${label}`);
  if (!ok) process.exitCode = 1;
};

check('24-hour fingerprint is generated from hourly temperatures', /temperature_2m/.test(source) && /24/.test(source) && /fingerprint/.test(source));
check('QX/T anchors are present', /#80419d/.test(source) && /#efff2d/.test(source) && /#fe130c/.test(source));
check('cold branch uses a long arc palette', /#0694f0|#00c0ea|#00e4c5/.test(source));
check('fallback exists when hourly data is not 24 values', /length\s*!==\s*24|length\s*!==\s*24/.test(source));

if (process.exitCode) process.exit(1);
