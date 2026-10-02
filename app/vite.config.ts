import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // Two separate entry points: employees never download Director code.
      input: { director: `${__dirname}/index.html`, employee: `${__dirname}/employee.html` },
    },
  },
  server: { fs: { allow: ['..'] } },
});
