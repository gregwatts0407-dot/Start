/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Link previews need absolute image URLs. Set SITE_URL (e.g.
 * https://you.github.io/stillpoint/) at build time; without it the tags fall
 * back to relative paths, which most apps still resolve.
 */
function siteUrl(): Plugin {
  let url = process.env.SITE_URL ?? '';
  if (url && !url.endsWith('/')) url += '/';
  return {
    name: 'site-url',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', url || './'),
  };
}

export default defineConfig({
  // Relative asset paths, so the same build works at a domain root or in a
  // sub-folder such as GitHub Pages' /<repo>/.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    siteUrl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Stillpoint',
        short_name: 'Stillpoint',
        description: 'A calm meditation timer, breathing guide and ambient soundscapes.',
        lang: 'en-AU',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5f2ec',
        theme_color: '#f5f2ec',
        categories: ['health', 'lifestyle'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // The link-preview image is only fetched by other sites, never offline.
        globIgnores: ['og-image.png'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
