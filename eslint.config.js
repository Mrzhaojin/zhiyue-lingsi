import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'docs/archive']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // 分层边界：表现层不得直接依赖存储/认证实现，所有浏览器存储走 lib/storage
  {
    files: ['src/pages/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/data/db/store', '**/data/db/persist', '**/data/db/bootstrap'],
              message: '表现层不要直接依赖存储实现；请通过 src/data 暴露的接口访问数据。',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "Identifier[name='localStorage']",
          message: '请使用 src/lib/storage 的封装，统一处理配额与失败提示。',
        },
        {
          selector: "Identifier[name='sessionStorage']",
          message: '请使用 src/lib/storage 的封装。',
        },
      ],
    },
  },
  // 数据层与认证层统一走 logger，禁止裸 console
  {
    files: ['src/data/**/*.ts', 'src/modules/auth/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
    },
  },
])