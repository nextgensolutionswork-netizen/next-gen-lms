// Test setup to provide AUTH_COOKIE_SECRET and NODE_ENV for all tests
Object.assign(process.env, {
  NODE_ENV: 'test',
  AUTH_COOKIE_SECRET: 'test-secret-123',
});
console.log('setupAuth: setting AUTH_COOKIE_SECRET');