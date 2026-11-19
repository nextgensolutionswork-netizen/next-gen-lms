import nextConfig from 'eslint-config-next';

for (const cfg of nextConfig) {
  if (cfg.rules) {
    if (cfg.rules['react/no-unescaped-entities']) {
      cfg.rules['react/no-unescaped-entities'] = 'off';
    }
    for (const key of Object.keys(cfg.rules)) {
      if (key.startsWith('react-hooks/')) {
        cfg.rules[key] = 'warn';
      }
    }
  }
}

const customConfig = [
  {
    ignores: [
      '**/.next/**',
      '**/.next*/**',
      '**/.audit-build-check/**',
      '**/staging-runtime/**',
      '**/node_modules/**',
      '**/tests/**',
      '**/scratch/**',
      '**/coverage/**',
      '**/dist/**',
      '**/.system_generated/**',
      '**/scripts/**',
      'eslint.config.mjs',
    ],
  },
  ...nextConfig,
];

export default customConfig;
