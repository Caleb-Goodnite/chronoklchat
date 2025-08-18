import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  optimizeDeps: {
    // Ensure monaco-editor is pre-bundled
    include: ['monaco-editor']
  }
});
