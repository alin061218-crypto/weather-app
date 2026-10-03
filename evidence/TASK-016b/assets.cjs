const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
// Compile the actual production injection/guard section, without starting the service.
const filename = path.join(root, 'server.js');
const source = fs.readFileSync(filename, 'utf8').split('const HALF_HOUR_MS =')[0];
const server = new Module(filename, module);
server.filename = filename;
server.paths = Module._nodeModulePaths(root);
server._compile(source + '\nmodule.exports = { renderIndex, checkAssetVersions };', filename);
module.exports = { ...server.exports, root };
