import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['**/.next/**', '**/next-env.d.ts', 'dist/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { files: ['**/*.ts', '**/*.tsx'], rules: { 'no-undef': 'off' } },
);
