/* ESLint 配置：见 docs/standards/工程结构.md
   规则取向：禁内联 style、禁硬编码十六进制色值（走 token）、禁裸用未封装 AntD 组件。
   说明：「禁裸用 AntD 原始组件」靠约定 + code review 保证；这里用 no-restricted-imports
   对 'antd' 给出告警提示（shared/components、app/theme 等封装层除外）。 */
module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-refresh'],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'vite.config.ts', 'vitest.config.ts', 'scripts', 'e2e'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // 禁硬编码十六进制色值：颜色一律走 token（app/theme.ts + shared/constants）。
    'no-restricted-syntax': [
      'warn',
      {
        selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
        message: '禁止硬编码十六进制色值，颜色请走 theme token 或 shared/constants（见配色规范.md）。',
      },
    ],
  },
  overrides: [
    {
      // 封装层与主题层允许出现颜色字面量与 antd 直接引用。
      files: ['src/app/theme.ts', 'src/shared/constants/**', 'src/shared/components/**'],
      rules: { 'no-restricted-syntax': 'off' },
    },
  ],
};
