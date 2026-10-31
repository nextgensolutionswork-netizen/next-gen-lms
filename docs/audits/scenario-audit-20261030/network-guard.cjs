// Audit-only process guard: no network destinations except loopback.
const net = require('node:net');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const opts = typeof args[0] === 'object' ? (Array.isArray(args[0]) ? args[0][0] : args[0]) : null;
  const host = opts?.host || (typeof args[1] === 'string' ? args[1] : 'localhost');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error('AUDIT_NETWORK_BLOCKED: external destination');
  }
  return original.apply(this, args);
};
