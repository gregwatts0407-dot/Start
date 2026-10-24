import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stillness',
    short_name: 'Stillness',
    description: 'Guided meditation for calmer days and deeper sleep.',
    start_url: '/home',
    display: 'standalone',
    background_color: '#faf8f4',
    theme_color: '#16213a',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
