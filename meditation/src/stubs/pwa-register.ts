// Stand-in for virtual:pwa-register in the artifact build (no service worker there).
export function registerSW(): () => Promise<void> {
  return async () => undefined;
}
