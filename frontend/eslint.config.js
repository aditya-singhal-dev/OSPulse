import globals from 'globals'
import react from 'eslint-plugin-react'
export default [{
  files: ['**/*.{js,jsx}'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.browser,
    parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { react },
  rules: { 'no-undef': 'error', 'no-unused-vars': 'error', 'react/jsx-uses-vars': 'error' },
}]
