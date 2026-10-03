const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../../frontend/js');
const files = fs.readdirSync(dir).filter(file => file.endsWith('.js')).sort();
const allowed = {
  config: [], ui: ['config'], api: ['config'], cities: ['config', 'api'], visuals: ['config'],
  account: ['config', 'ui', 'api'], render: ['config', 'ui', 'visuals', 'cities', 'account', 'icons'],
  search: ['config', 'ui', 'api', 'cities', 'render', 'visuals', 'account'], chat: ['config', 'ui', 'cities'],
  main: files.map(file => file.slice(0, -3)), icons: [], atmosphere: ['three']
};
const graph = {};
for (const file of files) {
  const name = file.slice(0, -3), source = fs.readFileSync(path.join(dir, file), 'utf8');
  assert.ok(!/\bimport\s*\(/.test(source), `${file}: dynamic import`);
  const imports = [...source.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?['"]([^'"]+)['"]/g)].map(match => match[1]);
  for (const specifier of imports) {
    assert.ok(specifier === 'three' || /^app\/[\w-]+$/.test(specifier), `${file}: non-bare import ${specifier}`);
    const dependency = specifier.replace(/^app\//, '');
    assert.ok(allowed[name]?.includes(dependency), `${name}: disallowed dependency ${dependency}`);
    assert.ok(dependency === 'three' || files.includes(dependency + '.js'), `${name}: missing ${dependency}`);
  }
  graph[name] = imports.filter(value => value !== 'three').map(value => value.slice(4));
  console.log(`${file}: ${imports.join(', ') || '(leaf)'}`);
}
const visiting = new Set(), done = new Set();
function visit(name, chain = []) {
  assert.ok(!visiting.has(name), `cycle: ${[...chain, name].join(' -> ')}`);
  if (done.has(name)) return;
  visiting.add(name);
  for (const dependency of graph[name]) visit(dependency, [...chain, name]);
  visiting.delete(name); done.add(name);
}
files.forEach(file => visit(file.slice(0, -3)));
console.log(`PASS: ${files.length} modules form a DAG; no dynamic imports; all imports use bare identifiers and allowed dependency directions`);
