import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat.recommended,
    ],
    plugins: {
      import: importPlugin,
    },
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // D25 -- the public/authenticated import boundary is structural, not
      // a review convention: `src/public/**` must never be able to reach
      // `src/app/**`. Both trees may still import `src/shared/**` freely.
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/public',
              from: './src/app',
              message:
                'src/public/** is the unauthenticated tree and must never import from src/app/** (design D25/D31).',
            },
          ],
        },
      ],

      // D26 -- `Date` is banned globally with zero exemptions. The codebase
      // must contain zero `new Date(...)` / `Date.now()` / `Date.parse()`
      // calls; every plain date is a branded `PlainDate` string produced by
      // `shared/date/`'s two constructors.
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message:
            'Date is banned (design D26). Use shared/date/ (parsePlainDate, todayAR) instead -- there is no instant to be off-by-one on a plain date.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Date.now() is banned (design D26). Use shared/date/todayAR() instead.',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='parse']",
          message: 'Date.parse() is banned (design D26). Use shared/date/parsePlainDate() instead.',
        },
        {
          selector: "CallExpression[callee.property.name='toISOString']",
          message:
            '.toISOString() is banned (design D26). No timestamp is ever rendered in this app; a PlainDate is already the wire-format string.',
        },
      ],

      // No HTML-from-server rendering anywhere -- one of the two structural
      // mitigations (alongside D37's no-third-party-runtime-resource rule)
      // that keeps D29's XSS tripwire from firing.
      'react/no-danger': 'error',

      // D32 -- JSX contains no bare Spanish sentence; every label reads
      // from `shared/copy/**` so the glossary scan (1.22/9.1) can audit it.
      // `·` is allowed as a separator glyph, not copy.
      'react/jsx-no-literals': [
        'error',
        // `ignoreProps: true` -- the rule bans bare *copy* in JSX children
        // (design D32); it must not also demand that every className, id,
        // href or aria attribute be pulled into a constants file.
        { noStrings: true, ignoreProps: true, allowedStrings: ['·'] },
      ],
    },
  },
)
