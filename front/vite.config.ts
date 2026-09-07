import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite's static-asset directory is `public/` by default, and this project
  // also has a *source* tree at `src/public/` (the unauthenticated route
  // tree, D25/D31). Two directories named `public` with unrelated meanings
  // is how a font ends up copied into the build output verbatim instead of
  // served as a static asset. Renaming Vite's asset dir to `static/` makes
  // `src/public/` unambiguous (design D25).
  publicDir: 'static',
})
