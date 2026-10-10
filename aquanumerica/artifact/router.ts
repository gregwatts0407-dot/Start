/** Tiny in-memory router for the standalone (artifact) build: "/" or "/paint/<id>". */
type Listener = () => void;
const listeners = new Set<Listener>();

function initial(): string {
  try {
    const token = location.hash.replace(/^#/, "");
    if (/^[a-z0-9-]+$/.test(token)) return `/paint/${token}`;
  } catch {
    /* ignore */
  }
  return "/";
}

let current = initial();

export function getPath() {
  return current;
}

export function navigate(path: string) {
  if (path === current) return;
  current = path;
  try {
    // Only bare tokens survive in an artifact link, so mirror the canvas id.
    const id = path.startsWith("/paint/") ? path.slice(7) : "";
    history.replaceState(null, "", id ? `#${id}` : location.pathname + location.search);
  } catch {
    /* ignore */
  }
  window.scrollTo(0, 0);
  listeners.forEach((l) => l());
}

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
