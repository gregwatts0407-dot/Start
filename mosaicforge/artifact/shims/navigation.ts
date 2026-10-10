import { useMemo } from "react";
import { useRoute } from "../router";

/** Drop-in subset of next/navigation backed by the in-memory router. */
export function useRouter() {
  const navigate = useRoute((s) => s.navigate);
  return useMemo(
    () => ({
      push: (href: string) => navigate(href),
      replace: (href: string) => navigate(href, { replace: true }),
      back: () => navigate("/"),
      refresh: () => {},
      prefetch: () => {},
    }),
    [navigate],
  );
}

export function usePathname() {
  return useRoute((s) => s.path);
}

export function useSearchParams() {
  const search = useRoute((s) => s.search);
  return useMemo(() => new URLSearchParams(search), [search]);
}
