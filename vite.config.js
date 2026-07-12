import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    allowedHosts: ['dbsgim.slsblx.com'],
    proxy: {
      '/blocks-api': {
        target: 'https://api.seliseblocks.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/blocks-api/, ''),
        secure: true,
        cookieDomainRewrite: 'dbsgim.slsblx.com',
      },
      '/blocks-iam': {
        target: 'https://iam.seliseblocks.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/blocks-iam/, ''),
        secure: true,
        cookieDomainRewrite: 'dbsgim.slsblx.com',
      },
    },
  },
})
