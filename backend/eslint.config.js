import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'tmp/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Giữ AWS SDK trong adapter storage và tách service khỏi Express.
    files: ['src/**/*.ts'],
    ignores: ['src/storage/s3-object-storage.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@aws-sdk/*', '@smithy/*'], message: 'Chỉ storage/s3-object-storage.ts được dùng AWS SDK.' }] },
      ],
    },
  },
  {
    files: ['src/modules/**/*.controller.ts', 'src/modules/**/*.routes.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@prisma/client', importNames: ['PrismaClient'], message: 'Chỉ repository được dùng PrismaClient.' }],
          patterns: [{ group: ['@aws-sdk/*', '@smithy/*'], message: 'Chỉ storage/s3-object-storage.ts được dùng AWS SDK.' }],
        },
      ],
    },
  },
  {
    files: [
      'src/modules/**/*.service.ts',
      'src/cleanup/cleanup.service.ts',
      'src/cleanup/cleanup.worker.ts',
      'src/storage/object-storage.ts',
      'src/storage/in-memory-object-storage.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'express', message: 'Service không được import Express.' },
            { name: '@prisma/client', importNames: ['PrismaClient'], message: 'Chỉ repository được dùng PrismaClient.' },
          ],
          patterns: [{ group: ['@aws-sdk/*', '@smithy/*'], message: 'Chỉ storage/s3-object-storage.ts được dùng AWS SDK.' }],
        },
      ],
    },
  },
);
