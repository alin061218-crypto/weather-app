const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.resolve(__dirname, '../../frontend/js/icons.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const clearNight = source.match(/clearNight\(\)\s*\{([\s\S]*?)\n\s*\},/);
assert.ok(clearNight, 'clearNight() must be present');
const body = clearNight[1];
const pathMatch = body.match(/<path\s+d="([^"]+)"\s+fill="currentColor"[^>]*\/>/);
assert.ok(pathMatch, 'clearNight() must contain a filled crescent path');
const strokeMatch = source.match(/function wsvg\(body\)\s*\{[\s\S]*?stroke-width="([\d.]+)"/);
assert.ok(strokeMatch, 'wsvg stroke-width must be explicit');

function tokenize(d) {
  return [...d.matchAll(/[AaLlMmZz]|-?(?:\d+(?:\.\d*)?|\.\d+)/g)].map(match => match[0]);
}

function parseCrescent(d, innerRadiusOverride) {
  const tokens = tokenize(d);
  let index = 0;
  let command = '';
  let x = 0;
  let y = 0;
  const arcs = [];
  const nextNumber = () => Number(tokens[index++]);
  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) command = tokens[index++];
    const relative = command === command.toLowerCase();
    switch (command.toUpperCase()) {
      case 'M': {
        const nx = nextNumber(), ny = nextNumber();
        x = relative ? x + nx : nx;
        y = relative ? y + ny : ny;
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L': {
        const nx = nextNumber(), ny = nextNumber();
        x = relative ? x + nx : nx;
        y = relative ? y + ny : ny;
        command = '';
        break;
      }
      case 'A': {
        const rx = nextNumber();
        const ry = nextNumber();
        const rotation = nextNumber();
        const largeArc = nextNumber();
        const sweep = nextNumber();
        const nx = nextNumber(), ny = nextNumber();
        const endX = relative ? x + nx : nx;
        const endY = relative ? y + ny : ny;
        arcs.push({ startX: x, startY: y, endX, endY, rx, ry, rotation, largeArc, sweep });
        x = endX;
        y = endY;
        command = '';
        break;
      }
      case 'Z':
        index = tokens.length;
        break;
      default:
        throw new Error(`Unsupported path command: ${command}`);
    }
  }
  assert.equal(arcs.length, 2, `expected two crescent arcs, got ${arcs.length}`);
  if (innerRadiusOverride !== undefined) arcs[1].rx = arcs[1].ry = innerRadiusOverride;
  return arcs;
}

// SVG's endpoint-to-center conversion. It lets the evidence derive the offset
// between the two arc centers instead of trusting a hand-written thickness.
function arcCenter(arc) {
  const phi = (arc.rotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
  const dx = (arc.startX - arc.endX) / 2;
  const dy = (arc.startY - arc.endY) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  let rx = Math.abs(arc.rx), ry = Math.abs(arc.ry);
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { const scale = Math.sqrt(lambda); rx *= scale; ry *= scale; }
  const sign = arc.largeArc === arc.sweep ? -1 : 1;
  const numerator = Math.max(0, (rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p));
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coefficient = denominator === 0 ? 0 : sign * Math.sqrt(numerator / denominator);
  const cxp = coefficient * ((rx * y1p) / ry);
  const cyp = coefficient * (-(ry * x1p) / rx);
  return {
    x: cosPhi * cxp - sinPhi * cyp + (arc.startX + arc.endX) / 2,
    y: sinPhi * cxp + cosPhi * cyp + (arc.startY + arc.endY) / 2,
    radius: (rx + ry) / 2
  };
}

function measure(innerRadiusOverride) {
  const [outer, inner] = parseCrescent(pathMatch[1], innerRadiusOverride);
  const outerCenter = arcCenter(outer);
  const innerCenter = arcCenter(inner);
  const centerOffset = Math.hypot(outerCenter.x - innerCenter.x, outerCenter.y - innerCenter.y);
  const thickness = outerCenter.radius - innerCenter.radius + centerOffset;
  return { outerRadius: outerCenter.radius, innerRadius: innerCenter.radius, centerOffset, thickness, strokeWidth: Number(strokeMatch[1]) };
}

const measurement = measure(process.argv.includes('--inner-radius=5') ? 5 : undefined);
const minimum = 2.5 * measurement.strokeWidth;
const maximum = 4.2;
assert.ok(measurement.thickness >= minimum, `crescent thickness ${measurement.thickness.toFixed(3)} must be >= 2.5 × stroke-width (${minimum.toFixed(3)})`);
assert.ok(measurement.thickness <= maximum, `crescent thickness ${measurement.thickness.toFixed(3)} must stay <= ${maximum.toFixed(3)} to avoid a heavy crescent`);

const star = body.match(/<path\s+d="(M15\.5[^"<]+)"\s+fill="currentColor"\s+stroke="none"/);
assert.ok(star, 'clearNight() must keep one deliberate star mark');
const starCenter = star[1].match(/^M([\d.]+)\s+([\d.]+)/);
assert.ok(starCenter, 'star mark must expose its center');
const starExtent = 1.65;
assert.ok(Number(starCenter[1]) - starExtent >= 0 && Number(starCenter[1]) + starExtent <= 24, 'star mark must stay inside the 24px grid');
assert.ok(Number(starCenter[2]) - starExtent >= 0 && Number(starCenter[2]) + starExtent <= 24, 'star mark must stay inside the 24px grid');

console.log(JSON.stringify({ ...measurement, minimum, maximum }, null, 2));
console.log('PASS: clearNight crescent geometry and star bounds are within the 24px contract');
