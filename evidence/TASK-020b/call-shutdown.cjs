// Expose the real function only inside this test child; do not add a test API.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../../server.js');
const service = new Module(filename, module);
service.filename = filename;
service.paths = Module._nodeModulePaths(path.dirname(filename));
service._compile(fs.readFileSync(filename, 'utf8') + '\nmodule.exports = { shutdown };\n', filename);
process.on('message', message => {
    if (message.command === 'shutdown') service.exports.shutdown(message.reason);
});
