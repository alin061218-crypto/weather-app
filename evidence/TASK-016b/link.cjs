const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dir = path.resolve(__dirname, '../../frontend/js');
const context = vm.createContext({});
const modules = new Map();
for (const file of fs.readdirSync(dir).filter(file => file.endsWith('.js'))) {
  modules.set('app/' + file.slice(0, -3), new vm.SourceTextModule(fs.readFileSync(path.join(dir, file), 'utf8'), { context, identifier: file }));
}
modules.set('three', new vm.SyntheticModule([], () => {}, { context, identifier: 'three' }));
modules.get('app/main').link(specifier => {
  assert.ok(modules.has(specifier), `unknown import ${specifier}`);
  return modules.get(specifier);
}).then(() => {
  for (const [name, module] of modules) assert.equal(module.status, 'linked', `${name}: unreachable/unlinked`);
  console.log('PASS: all static ESM imports link successfully with their real named exports');
}).catch(error => { console.error(error); process.exitCode = 1; });
