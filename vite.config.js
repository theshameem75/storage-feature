import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const host = 'ssdlik.dev.slsblx.com'

  const sslKeyPath =
    env.SSL_KEY_PATH || path.resolve(process.cwd(), 'ssdlik.dev.slsblx.com+3-key.pem')
  const sslCertPath =
    env.SSL_CERT_PATH || path.resolve(process.cwd(), 'ssdlik.dev.slsblx.com+3.pem')

  const https = command === 'serve'
    ? {
        key: fs.readFileSync(sslKeyPath),
        cert: fs.readFileSync(sslCertPath),
      }
    : undefined

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      https,
      allowedHosts: [host, 'localhost'],
      proxy: {
        '/blocks-api': {
          target: 'https://blocksapi.dev.slsblx.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/blocks-api/, ''),
          secure: true,
          cookieDomainRewrite: host,
        },
        '/blocks-iam': {
          target: 'https://iam.dev.slsblx.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/blocks-iam/, ''),
          secure: true,
          cookieDomainRewrite: host,
        },
        '/data/v4/Directory': {
          target: 'https://blocksapi.dev.slsblx.com',
          changeOrigin: true,
          secure: true,
          cookieDomainRewrite: host,
        },
        '/data/v4/Files': {
          target: 'https://blocksapi.dev.slsblx.com',
          changeOrigin: true,
          secure: true,
          cookieDomainRewrite: host,
        },
        '/data/v4/Content': {
          target: 'https://blocksapi.dev.slsblx.com',
          changeOrigin: true,
          secure: true,
          cookieDomainRewrite: host,
        },
      },
    },
  }
})
