import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // allow MagicDNS names when served over Tailscale
    allowedHosts: ['.ts.net'],
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
});
