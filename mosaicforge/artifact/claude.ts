/**
 * Access to the Artifact runtime (`window.claude.use`). Every capability may
 * be absent: outside the claude.ai viewer, for signed-out viewers, etc.
 */
type Use = (name: string) => Promise<unknown>;

export function useCapability<T>(name: string, timeoutMs = 12000): Promise<T | null> {
  const c = (typeof window !== "undefined" ? (window as unknown as { claude?: { use?: Use } }).claude : undefined) ?? undefined;
  if (!c?.use) return Promise.resolve(null);
  return Promise.race([
    c.use(name).then((v) => (v ?? null) as T | null, () => null),
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
}
