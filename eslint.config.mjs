import nextConfig from 'eslint-config-next';

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'scratch/**',
      '.gemini/**',
      '.audit-build-check/**',
      'staging-runtime/**',
      '.next-audit/**',
      '.next-build-check/**',
      'docs/**',
    ],
  },
  ...nextConfig,
  {
    plugins: {
      ...nextConfig[0].plugins,
      ...(nextConfig[1]?.plugins || {}),
    },
    rules: {
      'react/no-unescaped-entities': 'off',
      '@next/next/no-img-element': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'no-use-before-define': 'warn',
      '@typescript-eslint/no-use-before-define': 'warn',
    },
  },
];
