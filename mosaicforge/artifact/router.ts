/**
 * Tiny in-memory router for the standalone build. The Artifact frame keeps
 * no query strings in its URL, so routes live in state instead.
 */
import { create } from "zustand";

interface RouterState {
  path: string;
  search: string;
  navigate: (href: string, opts?: { replace?: boolean }) => void;
}

function parse(href: string) {
  const [beforeHash, hash = ""] = href.split("#");
  const [path = "/", search = ""] = beforeHash.split("?");
  return { path: path || "/", search, hash };
}

export const useRoute = create<RouterState>()((set) => ({
  path: "/",
  search: "",
  navigate: (href) => {
    const { path, search, hash } = parse(href);
    set({ path, search });
    // Scroll after the new route renders.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = hash ? document.getElementById(hash) : null;
        if (el) el.scrollIntoView({ behavior: "smooth" });
        else window.scrollTo(0, 0);
      }),
    );
  },
}));
