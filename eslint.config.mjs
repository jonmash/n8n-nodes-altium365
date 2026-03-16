import pluginJs from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import n8nNodesBase from 'eslint-plugin-n8n-nodes-base';

export default [
	{
		ignores: ['dist/**', 'node_modules/**', '*.js'],
	},
	pluginJs.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
				project: './tsconfig.json',
			},
		},
		plugins: {
			'@typescript-eslint': tseslint,
			'n8n-nodes-base': n8nNodesBase,
		},
		rules: {
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options': 'error',
			'n8n-nodes-base/node-param-options-type-unsorted-items': 'warn',
		},
	},
];
