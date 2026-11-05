import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// VITE_SINGLEFILE=1 inlines everything in one HTML file (used for the shareable demo build).
const singleFile = process.env.VITE_SINGLEFILE === '1';

export default defineConfig({
  plugins: [react(), ...(singleFile ? [viteSingleFile()] : [])],
  build: {
    rollupOptions: {
      // Vendor chunks cache well across deploys. The single-file build inlines dynamic imports,
      // which is incompatible with manualChunks.
      output: singleFile
        ? {}
        : {
            manualChunks(id: string) {
              if (!id.includes('node_modules')) return;
              if (/[\\/]node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|recharts-scale|decimal\.js-light)[\\/]/.test(id)) return 'recharts';
              if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run|@tanstack)[\\/]/.test(id)) return 'react';
            },
          },
    },
  },
  server: {
    // `npm run dev` proxies the API to `wrangler dev` (port 8787)
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  test: {
    include: ['shared/**/*.test.ts', 'worker/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
