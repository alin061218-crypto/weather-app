// Test-only observation/fault injection. Never fake signal delivery.
const fs = require('node:fs');
const Database = require('better-sqlite3');
const Server = require('node:http').Server;
const fault = process.env.TASK020B_FAULT;
function trace(event, details = {}) {
    fs.appendFileSync(process.env.TASK020B_TRACE, JSON.stringify({ event, ...details }) + '\n');
}
const closeHttp = Server.prototype.close;
Server.prototype.close = function (...args) {
    trace('server.close');
    if (fault === 'server.close') throw new Error('injected server.close failure');
    return closeHttp.apply(this, args);
};
const pragma = Database.prototype.pragma;
Database.prototype.pragma = function (source, ...args) {
    if (source !== 'wal_checkpoint(TRUNCATE)') return pragma.call(this, source, ...args);
    trace('wal_checkpoint(TRUNCATE)');
    if (fault === 'checkpoint') throw new Error('injected checkpoint failure');
    const result = pragma.call(this, source, ...args);
    trace('checkpoint.result', { result });
    return result;
};
const closeDb = Database.prototype.close;
Database.prototype.close = function (...args) {
    trace('db.close');
    if (fault === 'db.close') throw new Error('injected db.close failure');
    const result = closeDb.apply(this, args);
    trace('db.closed', { open: this.open });
    return result;
};
