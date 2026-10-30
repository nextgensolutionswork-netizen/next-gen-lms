const deny = () => { throw new Error('Audit: outbound network disabled'); };
globalThis.fetch = async () => deny();
for (const name of ['http', 'https']) { const mod = require(name); mod.request = deny; mod.get = deny; }
const net = require('net'); net.connect = deny; net.createConnection = deny;
